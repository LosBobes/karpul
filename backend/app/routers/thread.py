"""`/api/rides/{id}/messages`: the ride's thread, and `/late`, the driver's
one-tap "running late" that is written in it."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from ..access import get_ride_or_404, is_driver
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..events import ride_saved
from ..models import RideMessage
from ..push import notify
from ..schemas import LateIn, MessageIn, MessageRead

router = APIRouter(prefix="/api/rides", tags=["rides"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]

# How much of a ride's thread GET returns: the latest messages, oldest first.
MESSAGES_SHOWN = 200
# How much of a message the push notification quotes.
MESSAGE_PREVIEW = 80


# --- the ride's thread --------------------------------------------------------


@router.get("/{ride_id}/messages", response_model=list[MessageRead])
def list_messages(ride_id: int, session: SessionDep, creds: CredsDep):
    """The ride's thread, oldest first (the latest MESSAGES_SHOWN of it)."""
    require_user(session, creds)
    get_ride_or_404(session, ride_id)
    latest = session.exec(
        select(RideMessage)
        .where(RideMessage.ride_id == ride_id)
        .order_by(col(RideMessage.id).desc())
        .limit(MESSAGES_SHOWN)
    ).all()
    return list(reversed(latest))


@router.post("/{ride_id}/messages", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
def post_message(ride_id: int, payload: MessageIn, session: WriteSessionDep, creds: CredsDep):
    """Write in the ride's thread. Anyone signed in may (a question before
    getting in is the point); the driver and the passengers are told, except
    whoever wrote it. The ride goes out over the socket with its new
    `message_count`, which is how open threads know to fetch again."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    message = RideMessage(ride_id=ride.id, author_id=user.id, author_name=user.display_name, body=payload.body)  # type: ignore[arg-type]
    session.add(message)
    session.commit()
    session.refresh(message)
    session.refresh(ride)
    ride_saved(ride, created=False)
    people = [ride.driver_id] + [b.passenger_id for b in ride.bookings]
    told = [uid for uid in people if uid is not None and uid != user.id]
    preview = payload.body.replace("\n", " ")
    if len(preview) > MESSAGE_PREVIEW:
        preview = preview[: MESSAGE_PREVIEW - 1].rstrip() + "…"
    notify(session, told, "message", ride, name=user.display_name, text=preview)
    return message


@router.delete("/{ride_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(ride_id: int, message_id: int, session: WriteSessionDep, creds: CredsDep):
    """Take a message back; the driver may remove any message on their ride."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    message = session.get(RideMessage, message_id)
    if message is None or message.ride_id != ride.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    if message.author_id != user.id and not is_driver(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the author or the driver can remove this message")
    session.delete(message)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)


@router.post("/{ride_id}/late", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
def running_late(ride_id: int, payload: LateIn, session: WriteSessionDep, creds: CredsDep):
    """The driver's one tap on the day: "running N min late". It is a line in
    the thread like any other (the app writes it in each reader's language
    from `late_minutes`), and the passengers are pushed `running_late`. The
    times on the ride stay as they are: it is a heads-up, not an edit."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    if not is_driver(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver can say the ride is running late")
    if ride.ride_date != date.today():
        raise HTTPException(status.HTTP_409_CONFLICT, "A ride can only run late on its own day")
    minutes = payload.minutes
    message = RideMessage(
        ride_id=ride.id,  # type: ignore[arg-type]
        author_id=user.id,
        author_name=user.display_name,
        body=f"Running {minutes} min late",
        late_minutes=minutes,
    )
    session.add(message)
    session.commit()
    session.refresh(message)
    session.refresh(ride)
    ride_saved(ride, created=False)
    told = [b.passenger_id for b in ride.bookings if b.passenger_id != user.id]
    notify(session, told, "running_late", ride, driver=user.display_name, minutes=minutes)
    return message
