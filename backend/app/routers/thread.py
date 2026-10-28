"""`/api/rides/{id}/messages`: the ride's thread."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from ..access import get_ride_or_404, is_driver
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..events import ride_saved
from ..models import RideMessage
from ..push import notify
from ..schemas import MessageIn, MessageRead

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
