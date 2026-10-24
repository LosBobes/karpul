from datetime import date, timedelta
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import selectinload
from sqlmodel import Session, col, select

from ..auth import CredsDep, require_user
from ..calendar import ride_ics
from ..database import get_session, get_write_session
from ..events import request_saved, ride_deleted, ride_saved
from ..models import Booking, CarType, Ride, RideMessage, RideRequest, User, WaitlistEntry
from ..push import notify
from ..schemas import (
    BookingCreate,
    BookingRead,
    BookingUpdate,
    MessageIn,
    MessageRead,
    RideCreate,
    RideRead,
    RideUpdate,
    WaitlistJoin,
)
from ..services import (
    account_for_name,
    board_extras,
    corporate_car_label,
    drop_orphaned_pickups,
    ensure_car_available,
    is_person,
    leave_waitlists_that_day,
    norm_name,
    pickup_or_422,
    promote_waitlist,
    resolve_corporate_car,
    ride_to_create_dict,
    stops_to_text,
    to_ride_read_dict,
    weekly_dates,
)

router = APIRouter(prefix="/api/rides", tags=["rides"])

SessionDep = Annotated[Session, Depends(get_session)]
# Every mutation is check-then-write (free seats, car availability, ownership),
# so it runs under the write lock from the first statement (database.begin_write).
WriteSessionDep = Annotated[Session, Depends(get_write_session)]

# How much of a ride's thread GET returns: the latest messages, oldest first.
MESSAGES_SHOWN = 200
# How much of a message the push notification quotes.
MESSAGE_PREVIEW = 80


def _get_ride_or_404(session: Session, ride_id: int) -> Ride:
    ride = session.get(Ride, ride_id)
    if ride is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    return ride


def _is_driver(user: User, ride: Ride) -> bool:
    return is_person(user, ride.driver_id, ride.driver_name)


def _booking_of(ride: Ride, user: User) -> Booking | None:
    return next((b for b in ride.bookings if is_person(user, b.passenger_id, b.passenger_name)), None)


def _may_manage_seats(ride: Ride, user: User) -> bool:
    """Who may put other people in this car or take them out.

    The driver always can. Passengers can too, but only while the driver has
    switched `passengers_manage` on for the ride; each passenger can always
    leave on their own (that is not "managing", see `leave_ride`).
    """
    if _is_driver(user, ride):
        return True
    return ride.passengers_manage and _booking_of(ride, user) is not None


def _answer_requests(session: Session, user_id: int | None, ride: Ride) -> list[RideRequest]:
    """A seat answers the passenger's open requests for that day."""
    if user_id is None:
        return []
    open_requests = session.exec(
        select(RideRequest).where(
            RideRequest.user_id == user_id,
            RideRequest.request_date == ride.ride_date,
            col(RideRequest.ride_id).is_(None),
        )
    ).all()
    for request in open_requests:
        request.ride_id = ride.id
        session.add(request)
    return list(open_requests)


def _seated(session: Session, ride: Ride, user_id: int | None) -> list[Ride]:
    """After someone gets a seat in `ride`: they stop waiting for the other
    cars that day. Returns the rides whose queue changed."""
    if user_id is None:
        return []
    return [r for r in leave_waitlists_that_day(session, user_id, ride.ride_date) if r.id != ride.id]


@router.get("", response_model=list[RideRead])
def list_rides(
    session: SessionDep,
    creds: CredsDep,
    ride_date: date | None = Query(default=None, alias="date"),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
):
    """List rides for a single day (`date`) or an inclusive range (`from`/`to`).

    Without parameters the current week (Mon-Sun) is returned.
    """
    require_user(session, creds)
    if ride_date is not None:
        date_from = date_to = ride_date
    elif date_from is None and date_to is None:
        today = date.today()
        date_from = today - timedelta(days=today.weekday())
        date_to = date_from + timedelta(days=6)
    elif date_from is None:
        date_from = date_to
    elif date_to is None:
        date_to = date_from
    if date_to < date_from:  # type: ignore[operator]
        raise HTTPException(422, "`to` must not be before `from`")
    if (date_to - date_from).days > 92:  # type: ignore[operator]
        raise HTTPException(422, "Range may not exceed 92 days")

    stmt = (
        select(Ride)
        .where(Ride.ride_date >= date_from, Ride.ride_date <= date_to)
        # Bookings and queues are fetched in one extra query each for the whole
        # list rather than lazily once per ride; every tab reloads this on reconnect.
        .options(selectinload(Ride.bookings), selectinload(Ride.waitlist))  # type: ignore[arg-type]
        .order_by(Ride.ride_date, Ride.departure_time, Ride.id)
    )
    rides = session.exec(stmt).all()
    extras = board_extras(session, list(rides))
    return [to_ride_read_dict(r, extras) for r in rides]


def _prepare(session: Session, validated: RideCreate | RideUpdate, exclude_ride_id: int | None = None) -> dict:
    """The column values for a validated ride, with the corporate-car rules applied."""
    data = validated.model_dump(exclude={"repeat_until", "request_id"})
    data["stops"] = stops_to_text(validated.stops)  # type: ignore[arg-type]
    if validated.car_type == CarType.corporate:
        car = resolve_corporate_car(session, validated.corporate_car_id)  # type: ignore[arg-type]
        ensure_car_available(
            session,
            car.id,  # type: ignore[arg-type]
            validated.ride_date,  # type: ignore[arg-type]
            validated.departure_time,  # type: ignore[arg-type]
            validated.return_time,
            exclude_ride_id=exclude_ride_id,
        )
        data["car_name"] = corporate_car_label(car)
        if validated.seats > car.passenger_seats:  # type: ignore[operator]
            raise HTTPException(
                422,
                f"{car.name} only has {car.passenger_seats} passenger seats",
            )
    return data


def _request_to_answer(session: Session, payload: RideCreate, user: User) -> RideRequest | None:
    if payload.request_id is None:
        return None
    request = session.get(RideRequest, payload.request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride request not found")
    if request.ride_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Someone already answered that request")
    if request.user_id == user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "That is your own request")
    if payload.ride_date != request.request_date:
        raise HTTPException(422, "The ride has to be on the requested day")
    if payload.seats < 1:
        raise HTTPException(422, "Offer at least one seat to take the person who asked")
    return request


@router.post("", response_model=RideRead, status_code=status.HTTP_201_CREATED)
def create_ride(payload: RideCreate, session: WriteSessionDep, creds: CredsDep):
    """Add a ride, driven by the signed-in account: `driver_name` is
    overwritten with its name, the way `car_name` is for a company car.

    With `repeat_until` one ride per week is added, all or nothing: a clash of
    the company car on any of the weeks fails the whole request and says which
    day. With `request_id` the ride answers someone's request and they are put
    in the (first) car. The first ride is returned; the rest reach every tab
    (this one included) over the live socket.
    """
    user = require_user(session, creds)
    payload = payload.model_copy(update={"driver_name": user.display_name})
    request = _request_to_answer(session, payload, user)
    dates = weekly_dates(payload.ride_date, payload.repeat_until)
    series_id = uuid4().hex if len(dates) > 1 else None
    rides: list[Ride] = []
    for ride_date in dates:
        occurrence = payload.model_copy(update={"ride_date": ride_date})
        try:
            data = _prepare(session, occurrence)
        except HTTPException as exc:
            if exc.status_code == 409 and len(dates) > 1:
                raise HTTPException(409, f"{exc.detail} ({ride_date.isoformat()})") from exc
            raise
        ride = Ride(**data, driver_id=user.id, series_id=series_id)
        session.add(ride)
        # Flush so the next occurrence's availability check sees this one.
        session.flush()
        rides.append(ride)
    queues: list[Ride] = []
    if request is not None:
        first = rides[0]
        first.bookings.append(Booking(ride_id=first.id, passenger_id=request.user_id, passenger_name=request.name))  # type: ignore[arg-type]
        request.ride_id = first.id
        session.add(request)
        queues = _seated(session, first, request.user_id)
    session.commit()
    for ride in rides + queues:
        session.refresh(ride)
        ride_saved(ride, created=ride in rides)
    if request is not None:
        session.refresh(request)
        request_saved(request)
        notify(session, [request.user_id], "request_answered", rides[0], driver=user.display_name)
    return to_ride_read_dict(rides[0])


@router.get("/{ride_id}", response_model=RideRead)
def get_ride(ride_id: int, session: SessionDep, creds: CredsDep):
    require_user(session, creds)
    return to_ride_read_dict(_get_ride_or_404(session, ride_id))


@router.get("/{ride_id}/calendar.ics", include_in_schema=True)
def ride_calendar(ride_id: int, session: SessionDep, creds: CredsDep):
    """The ride as a calendar file, for "Add to calendar"."""
    require_user(session, creds)
    ride = _get_ride_or_404(session, ride_id)
    return Response(
        ride_ics(ride),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="karpul-ride-{ride.id}.ics"'},
    )


@router.patch("/{ride_id}", response_model=RideRead)
def update_ride(ride_id: int, payload: RideUpdate, session: WriteSessionDep, creds: CredsDep):
    user = require_user(session, creds)
    ride = _get_ride_or_404(session, ride_id)
    if not _is_driver(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver can edit this ride")

    merged = ride_to_create_dict(ride)
    merged.update(payload.model_dump(exclude_unset=True))
    # Re-run the creation rules on the merged state.
    validated = RideCreate.model_validate(
        {k: merged[k] for k in RideCreate.model_fields if k in merged}
    )
    data = _prepare(session, validated, exclude_ride_id=ride.id)
    if validated.seats < len(ride.bookings):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{len(ride.bookings)} passengers already joined; seats cannot go below that",
        )
    # The passengers are told when the plan itself moves, not about a note.
    moved = any(
        getattr(ride, key) != data[key] for key in ("ride_date", "departure_time", "return_time", "origin", "destination")
    )
    for key, value in data.items():
        setattr(ride, key, value)
    drop_orphaned_pickups(ride)
    # More seats than before: the queue moves up into them.
    promoted = promote_waitlist(session, ride)
    session.add(ride)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    if moved:
        told = [b.passenger_id for b in ride.bookings if b not in promoted]
        if told:
            notify(session, told, "ride_changed", ride, driver=ride.driver_name)
    if promoted:
        notify(session, [b.passenger_id for b in promoted], "seat_freed", ride, driver=ride.driver_name)
    return to_ride_read_dict(ride)


@router.delete("/{ride_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ride(
    ride_id: int,
    session: WriteSessionDep,
    creds: CredsDep,
    scope: Literal["one", "following"] = Query(default="one"),
):
    """Remove a ride; `scope=following` also removes the later rides of the
    same weekly series (the earlier ones, already gone or not, stay). A
    request the ride answered is open again."""
    user = require_user(session, creds)
    ride = _get_ride_or_404(session, ride_id)
    if not _is_driver(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver can cancel this ride")
    doomed = [ride]
    if scope == "following" and ride.series_id:
        stmt = select(Ride).where(Ride.series_id == ride.series_id, Ride.ride_date > ride.ride_date, Ride.id != ride.id)
        doomed += [r for r in session.exec(stmt) if _is_driver(user, r)]
    gone = []
    reopened: list[RideRequest] = []
    for r in doomed:
        passengers = [b.passenger_id for b in r.bookings]
        if passengers:
            notify(session, passengers, "ride_removed", r, driver=r.driver_name)
        for request in session.exec(select(RideRequest).where(RideRequest.ride_id == r.id)):
            request.ride_id = None
            session.add(request)
            reopened.append(request)
        gone.append((r.id, r.ride_date))
        session.delete(r)
    session.commit()
    for rid, rdate in gone:
        ride_deleted(rid, rdate)  # type: ignore[arg-type]
    for request in reopened:
        session.refresh(request)
        request_saved(request)


@router.post("/{ride_id}/bookings", response_model=RideRead, status_code=status.HTTP_201_CREATED)
def join_ride(ride_id: int, payload: BookingCreate, session: WriteSessionDep, creds: CredsDep):
    """Put `passenger_name` in the car.

    Getting in yourself is the plain case. Someone else can be added by name,
    but only by the driver or, when the driver allows it (`passengers_manage`),
    by a passenger already in the car; a name that belongs to an account gets
    that account's seat, any other is a seat by name until that colleague
    registers. `pickup` is where they get in: the origin by default, or one of
    the stops. A seat also ends the passenger's wait for the other cars that
    day and answers their request for it.
    """
    user = require_user(session, creds)
    ride = _get_ride_or_404(session, ride_id)
    name = payload.passenger_name
    if norm_name(name) == user.name_key:
        passenger: User | None = user
    else:
        if not _may_manage_seats(ride, user):
            if ride.passengers_manage:
                detail = "Only the driver or a passenger in this car can add someone"
            else:
                detail = "Only the driver can add other passengers to this car"
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail)
        passenger = account_for_name(session, name)
    if passenger is not None:
        name = passenger.display_name
    if (passenger is not None and _is_driver(passenger, ride)) or norm_name(name) == norm_name(ride.driver_name):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{name} is the driver of this ride")
    if any(
        (passenger is not None and is_person(passenger, b.passenger_id, b.passenger_name))
        or norm_name(b.passenger_name) == norm_name(name)
        for b in ride.bookings
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{name} already joined this ride")
    if len(ride.bookings) >= ride.seats:
        raise HTTPException(status.HTTP_409_CONFLICT, "No free seats left")
    pickup = pickup_or_422(ride, payload.pickup)
    passenger_id = passenger.id if passenger is not None else None
    ride.bookings.append(Booking(ride_id=ride.id, passenger_id=passenger_id, passenger_name=name, pickup=pickup))  # type: ignore[arg-type]
    queues = _seated(session, ride, passenger_id)
    answered = _answer_requests(session, passenger_id, ride)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    for other in queues:
        session.refresh(other)
        ride_saved(other, created=False)
    for request in answered:
        session.refresh(request)
        request_saved(request)
    if not _is_driver(user, ride):
        notify(session, [ride.driver_id], "got_in", ride, name=name)
    return to_ride_read_dict(ride)


@router.get("/{ride_id}/bookings", response_model=list[BookingRead])
def list_bookings(ride_id: int, session: SessionDep, creds: CredsDep):
    require_user(session, creds)
    return _get_ride_or_404(session, ride_id).bookings


@router.patch("/{ride_id}/bookings/{booking_id}", response_model=RideRead)
def move_booking(
    ride_id: int, booking_id: int, payload: BookingUpdate, session: WriteSessionDep, creds: CredsDep
):
    """Change where a passenger gets in. The passenger themself, or whoever may
    manage the seats, can do it."""
    user = require_user(session, creds)
    ride = _get_ride_or_404(session, ride_id)
    booking = next((b for b in ride.bookings if b.id == booking_id), None)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if not is_person(user, booking.passenger_id, booking.passenger_name) and not _may_manage_seats(ride, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the passenger or the driver can change this booking")
    booking.pickup = pickup_or_422(ride, payload.pickup)
    session.add(booking)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    return to_ride_read_dict(ride)


@router.delete("/{ride_id}/bookings/{booking_id}", response_model=RideRead)
def leave_ride(ride_id: int, booking_id: int, session: WriteSessionDep, creds: CredsDep):
    """Take a seat out of the car. The seat goes to the first in the queue,
    if anyone is waiting."""
    user = require_user(session, creds)
    ride = _get_ride_or_404(session, ride_id)
    booking = next((b for b in ride.bookings if b.id == booking_id), None)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    themself = is_person(user, booking.passenger_id, booking.passenger_name)
    if not themself and not _may_manage_seats(ride, user):
        detail = (
            "Only the passenger, the driver or another passenger in this car can remove this booking"
            if ride.passengers_manage
            else "Only the passenger or the driver can remove this booking"
        )
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail)
    passenger, passenger_id = booking.passenger_name, booking.passenger_id
    ride.bookings.remove(booking)
    session.delete(booking)
    promoted = promote_waitlist(session, ride)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    if themself:
        notify(session, [ride.driver_id], "got_out", ride, name=passenger)
    else:
        notify(session, [passenger_id], "taken_out", ride, driver=ride.driver_name)
    if promoted:
        notify(session, [b.passenger_id for b in promoted], "seat_freed", ride, driver=ride.driver_name)
    return to_ride_read_dict(ride)


# --- waiting for a seat -------------------------------------------------------


@router.post("/{ride_id}/waitlist", response_model=RideRead, status_code=status.HTTP_201_CREATED)
def join_waitlist(ride_id: int, payload: WaitlistJoin, session: WriteSessionDep, creds: CredsDep):
    """Queue for a seat in a full car. Only for yourself: the first seat that
    frees up is yours without asking, so it is not something to sign anyone
    else up for."""
    user = require_user(session, creds)
    ride = _get_ride_or_404(session, ride_id)
    if _is_driver(user, ride):
        raise HTTPException(status.HTTP_409_CONFLICT, "You drive this ride")
    if _booking_of(ride, user) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "You are already in this car")
    if any(e.user_id == user.id for e in ride.waitlist):
        raise HTTPException(status.HTTP_409_CONFLICT, "You are already waiting for this car")
    if len(ride.bookings) < ride.seats:
        raise HTTPException(status.HTTP_409_CONFLICT, "There are free seats; get in instead")
    pickup = pickup_or_422(ride, payload.pickup)
    ride.waitlist.append(WaitlistEntry(ride_id=ride.id, user_id=user.id, name=user.display_name, pickup=pickup))  # type: ignore[arg-type]
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    return to_ride_read_dict(ride)


@router.delete("/{ride_id}/waitlist/{entry_id}", response_model=RideRead)
def leave_waitlist(ride_id: int, entry_id: int, session: WriteSessionDep, creds: CredsDep):
    """Stop waiting; the driver may also take someone off the queue."""
    user = require_user(session, creds)
    ride = _get_ride_or_404(session, ride_id)
    entry = next((e for e in ride.waitlist if e.id == entry_id), None)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not on the waiting list")
    if entry.user_id != user.id and not _is_driver(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the person waiting or the driver can do that")
    ride.waitlist.remove(entry)
    session.delete(entry)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    return to_ride_read_dict(ride)


# --- the ride's thread --------------------------------------------------------


@router.get("/{ride_id}/messages", response_model=list[MessageRead])
def list_messages(ride_id: int, session: SessionDep, creds: CredsDep):
    """The ride's thread, oldest first (the latest MESSAGES_SHOWN of it)."""
    require_user(session, creds)
    _get_ride_or_404(session, ride_id)
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
    ride = _get_ride_or_404(session, ride_id)
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
    ride = _get_ride_or_404(session, ride_id)
    message = session.get(RideMessage, message_id)
    if message is None or message.ride_id != ride.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    if message.author_id != user.id and not _is_driver(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the author or the driver can remove this message")
    session.delete(message)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
