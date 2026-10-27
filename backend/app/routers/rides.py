from datetime import date, timedelta
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import selectinload
from sqlmodel import Session, col, select

from .. import audit
from ..admin import admin_ids, is_admin, require_admin
from ..auth import CredsDep, require_user
from ..calendar import ride_ics
from ..database import get_session, get_write_session
from ..events import request_saved, ride_deleted, ride_saved
from ..models import Booking, CarType, DriveLeg, Ride, RideMessage, RideRequest, User, WaitlistEntry
from ..push import notify
from ..schemas import (
    BookingCreate,
    BookingRead,
    BookingUpdate,
    LegEnd,
    LegStart,
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
    over_shared_car_share,
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


def _may_run(user: User, ride: Ride) -> bool:
    """Who may edit or remove a ride: its driver, or an admin (who schedules
    the company cars for people and fixes what they got wrong)."""
    return _is_driver(user, ride) or is_admin(user)


def _on_behalf(user: User, ride: Ride) -> bool:
    """An admin acting on a ride that is not theirs: what the admin's log records."""
    return not _is_driver(user, ride) and is_admin(user)


def _driver_unless_actor(user: User, ride: Ride) -> list[int | None]:
    """The driver, to be told what an admin did to their ride; nobody when the
    driver did it themself."""
    return [] if _is_driver(user, ride) else [ride.driver_id]


def _booking_of(ride: Ride, user: User) -> Booking | None:
    return next((b for b in ride.bookings if is_person(user, b.passenger_id, b.passenger_name)), None)


def _may_manage_seats(ride: Ride, user: User) -> bool:
    """Who may put other people in this car or take them out.

    The driver always can, and so can an admin. Passengers can too, but only while the driver has
    switched `passengers_manage` on for the ride; each passenger can always
    leave on their own (that is not "managing", see `leave_ride`).
    """
    if _may_run(user, ride):
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
        .options(selectinload(Ride.bookings), selectinload(Ride.waitlist), selectinload(Ride.legs))  # type: ignore[arg-type]
        .order_by(Ride.ride_date, Ride.departure_time, Ride.id)
    )
    rides = session.exec(stmt).all()
    extras = board_extras(session, list(rides))
    return [to_ride_read_dict(r, extras) for r in rides]


def _prepare(session: Session, validated: RideCreate | RideUpdate, exclude_ride_id: int | None = None) -> dict:
    """The column values for a validated ride, with the corporate-car rules applied."""
    data = validated.model_dump(exclude={"repeat_until", "request_id", "driver_id", "request_approval"})
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


def _approval_for(session: Session, actor: User, driver: User, payload: RideCreate, exclude_ride_id: int | None = None) -> str:
    """The shared cars are rationed per driver (services.shared_car_use). A
    ride within the share is "", one past it is a 409 naming the reason,
    unless the driver asked for approval ("pending") or an admin is the one
    adding it ("approved": the admin's word is the approval). Own cars are
    never rationed."""
    if payload.car_type != CarType.corporate:
        return ""
    reason = over_shared_car_share(
        session, driver.id, payload.ride_date, payload.departure_time, payload.return_time, exclude_ride_id  # type: ignore[arg-type]
    )
    if reason is None:
        return ""
    if is_admin(actor):
        return "approved"
    if payload.request_approval:
        return "pending"
    raise HTTPException(status.HTTP_409_CONFLICT, reason)


@router.post("", response_model=RideRead, status_code=status.HTTP_201_CREATED)
def create_ride(payload: RideCreate, session: WriteSessionDep, creds: CredsDep):
    """Add a ride, driven by the signed-in account: `driver_name` is
    overwritten with its name, the way `car_name` is for a company car. An
    admin may name another account in `driver_id` to add the ride for them
    (scheduling a company car for a colleague); that account then drives it,
    owns it like any ride of its own, and is told.

    With `repeat_until` one ride per week is added, all or nothing: a clash of
    the company car on any of the weeks fails the whole request and says which
    day. With `request_id` the ride answers someone's request and they are put
    in the (first) car. The first ride is returned; the rest reach every tab
    (this one included) over the live socket.
    """
    user = require_user(session, creds)
    driver = user
    if payload.driver_id is not None and payload.driver_id != user.id:
        if not is_admin(user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an admin can add a ride for someone else")
        found = session.get(User, payload.driver_id)
        if found is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
        driver = found
    payload = payload.model_copy(update={"driver_name": driver.display_name})
    request = _request_to_answer(session, payload, driver)
    dates = weekly_dates(payload.ride_date, payload.repeat_until)
    series_id = uuid4().hex if len(dates) > 1 else None
    rides: list[Ride] = []
    for ride_date in dates:
        occurrence = payload.model_copy(update={"ride_date": ride_date})
        try:
            data = _prepare(session, occurrence)
            approval = _approval_for(session, user, driver, occurrence)
        except HTTPException as exc:
            if exc.status_code == 409 and len(dates) > 1:
                raise HTTPException(409, f"{exc.detail} ({ride_date.isoformat()})") from exc
            raise
        ride = Ride(**data, driver_id=driver.id, series_id=series_id, approval=approval)
        session.add(ride)
        # Flush so the next occurrence's availability check sees this one.
        session.flush()
        rides.append(ride)
    if driver is not user:
        weeks = [("weeks", None, len(rides))] if len(rides) > 1 else []
        audit.record(session, user, "ride_added", driver.display_name, ride=rides[0], changes=weeks)
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
        notify(session, [request.user_id], "request_answered", rides[0], driver=driver.display_name)
    if driver is not user:
        notify(session, [driver.id], "ride_assigned", rides[0], name=user.display_name)
    if any(r.approval == "pending" for r in rides):
        notify(session, admin_ids(session), "approval_requested", rides[0], name=driver.display_name)
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
    if not _may_run(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver or an admin can edit this ride")

    merged = ride_to_create_dict(ride)
    merged.update(payload.model_dump(exclude_unset=True))
    # Re-run the creation rules on the merged state.
    validated = RideCreate.model_validate(
        {k: merged[k] for k in RideCreate.model_fields if k in merged}
    )
    data = _prepare(session, validated, exclude_ride_id=ride.id)
    # Moving an unapproved ride into a week (or onto a day) that already has
    # the driver's shared car, or stretching it into their next one, is the
    # same ask as adding one there; a pending ride stays pending wherever it
    # goes, an approved one stays approved.
    if data["car_type"] != CarType.corporate:
        data["approval"] = ""
    elif ride.approval == "" and any(
        data[key] != getattr(ride, key) for key in ("ride_date", "car_type", "departure_time", "return_time")
    ):
        driver = session.get(User, ride.driver_id) if ride.driver_id is not None else None
        if driver is not None:
            data["approval"] = _approval_for(session, user, driver, validated, exclude_ride_id=ride.id)
    if validated.seats < len(ride.bookings):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{len(ride.bookings)} passengers already joined; seats cannot go below that",
        )
    # The passengers are told when the plan itself moves, not about a note.
    moved = any(
        getattr(ride, key) != data[key] for key in ("ride_date", "departure_time", "return_time", "origin", "destination")
    )
    changes = audit.diff(ride, data, skip=("corporate_car_id", "driver_name")) if _on_behalf(user, ride) else []
    for key, value in data.items():
        setattr(ride, key, value)
    if changes:
        audit.record(session, user, "ride_edited", ride.driver_name, ride=ride, changes=changes)
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
            notify(session, told, "ride_changed", ride, driver=user.display_name)
    # Any edit an admin makes to someone's ride is news to its driver.
    if not _is_driver(user, ride):
        notify(session, [ride.driver_id], "ride_changed", ride, driver=user.display_name)
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
    if not _may_run(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver or an admin can cancel this ride")
    doomed = [ride]
    if scope == "following" and ride.series_id:
        stmt = select(Ride).where(Ride.series_id == ride.series_id, Ride.ride_date > ride.ride_date, Ride.id != ride.id)
        doomed += [r for r in session.exec(stmt) if _may_run(user, r)]
    _remove_rides(session, user, doomed)


def _remove_rides(session: Session, user: User, doomed: list[Ride], action: str = "ride_removed", tell_driver: bool = True) -> None:
    """Delete `doomed` as `user`: the passengers (and a driver who is not
    `user`) are told, the requests they answered are open again, and every
    tab hears. Commits."""
    gone = []
    reopened: list[RideRequest] = []
    for r in doomed:
        told = [b.passenger_id for b in r.bookings] + (_driver_unless_actor(user, r) if tell_driver else [])
        if told:
            notify(session, told, "ride_removed", r, driver=user.display_name)
        for request in session.exec(select(RideRequest).where(RideRequest.ride_id == r.id)):
            request.ride_id = None
            session.add(request)
            reopened.append(request)
        if _on_behalf(user, r):
            audit.record(session, user, action, r.driver_name, ride=r)
        gone.append((r.id, r.ride_date))
        session.delete(r)
    session.commit()
    for rid, rdate in gone:
        ride_deleted(rid, rdate)  # type: ignore[arg-type]
    for request in reopened:
        session.refresh(request)
        request_saved(request)


@router.post("/{ride_id}/approve", response_model=RideRead)
def approve_ride(ride_id: int, session: WriteSessionDep, creds: CredsDep):
    """Admin-only: let a shared-car ride past the driver's share through.
    A pending ride holds no slot, so someone may have taken the car since it
    was asked for: the car must still be free then, or it is the usual 409."""
    admin = require_admin(session, creds)
    ride = _get_ride_or_404(session, ride_id)
    if ride.approval != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This ride is not waiting for approval")
    if ride.corporate_car_id is not None:
        ensure_car_available(
            session, ride.corporate_car_id, ride.ride_date, ride.departure_time, ride.return_time, exclude_ride_id=ride.id
        )
    ride.approval = "approved"
    session.add(ride)
    audit.record(session, admin, "ride_approved", ride.driver_name, ride=ride)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    notify(session, [ride.driver_id], "ride_approved", ride, name=admin.display_name)
    return to_ride_read_dict(ride)


@router.post("/{ride_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_ride(ride_id: int, session: WriteSessionDep, creds: CredsDep):
    """Admin-only: refuse a shared-car ride waiting for approval. The ride
    goes, as if cancelled; the driver is told it was declined."""
    admin = require_admin(session, creds)
    ride = _get_ride_or_404(session, ride_id)
    if ride.approval != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This ride is not waiting for approval")
    notify(session, [ride.driver_id], "ride_declined", ride, name=admin.display_name)
    _remove_rides(session, admin, [ride], action="ride_declined", tell_driver=False)


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
    if passenger is not user and _on_behalf(user, ride):
        audit.record(session, user, "seat_added", ride.driver_name, ride=ride, changes=[("passenger", None, name)])
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
    if not themself and _on_behalf(user, ride):
        audit.record(session, user, "seat_removed", ride.driver_name, ride=ride, changes=[("passenger", passenger, None)])
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


# --- the odometer -------------------------------------------------------------
#
# A shared car's kilometres are noted stretch by stretch (DriveLeg): the reading
# when someone takes the wheel, and when they hand it on or bring the car back,
# so the office knows who drove it and how far. Legs follow each other with no
# gap: a handover ends one stretch at the reading the next one starts from.


def _open_leg(ride: Ride) -> DriveLeg | None:
    return ride.legs[-1] if ride.legs and ride.legs[-1].end_km is None else None


def _odometer_ride(session: Session, ride_id: int) -> Ride:
    """The ride, if its odometer can be noted at all: a shared car, let
    through, on its day or after."""
    ride = _get_ride_or_404(session, ride_id)
    if ride.car_type != CarType.corporate:
        raise HTTPException(status.HTTP_409_CONFLICT, "Kilometres are only kept for the shared cars")
    if ride.approval == "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "An admin has to approve this ride first")
    if ride.ride_date > date.today():
        raise HTTPException(status.HTTP_409_CONFLICT, "The odometer is noted from the day of the ride")
    return ride


def _may_note_km(user: User, ride: Ride) -> bool:
    """The ride's driver, an admin, or whoever is at the wheel right now."""
    leg = _open_leg(ride)
    return _may_run(user, ride) or (leg is not None and is_person(user, leg.driver_id, leg.driver_name))


def _note_km_or_403(user: User, ride: Ride) -> None:
    if not _may_note_km(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver, whoever is at the wheel or an admin can note the odometer")


def _km_at_least(km: int, floor: int) -> None:
    if km < floor:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"The odometer cannot read less than {floor} km here")


def _saved(session: Session, ride: Ride) -> dict:
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    return to_ride_read_dict(ride)


@router.post("/{ride_id}/legs", response_model=RideRead, status_code=status.HTTP_201_CREATED)
def take_wheel(ride_id: int, payload: LegStart, session: WriteSessionDep, creds: CredsDep):
    """Someone takes the wheel at `km`: the ride's driver (`booking_id` None)
    or a passenger in the car. The first time it is the reading the car was
    picked up at; while someone is driving it is a handover, which ends their
    stretch at the same reading."""
    user = require_user(session, creds)
    ride = _odometer_ride(session, ride_id)
    current = _open_leg(ride)
    if current is None:
        if ride.legs:
            raise HTTPException(status.HTTP_409_CONFLICT, "The car is already back; undo that to carry on")
        if not _may_run(user, ride):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver or an admin can note the odometer at the start")
    else:
        _note_km_or_403(user, ride)
        _km_at_least(payload.km, current.start_km)
    if payload.booking_id is None:
        driver_id, driver_name = ride.driver_id, ride.driver_name
    else:
        booking = next((b for b in ride.bookings if b.id == payload.booking_id), None)
        if booking is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
        driver_id, driver_name = booking.passenger_id, booking.passenger_name
    if current is not None:
        if (current.driver_id is not None and current.driver_id == driver_id) or (
            current.driver_id is None and driver_id is None and norm_name(current.driver_name) == norm_name(driver_name)
        ):
            raise HTTPException(status.HTTP_409_CONFLICT, f"{driver_name} is already at the wheel")
        current.end_km = payload.km
        session.add(current)
    ride.legs.append(DriveLeg(ride_id=ride.id, driver_id=driver_id, driver_name=driver_name, start_km=payload.km))  # type: ignore[arg-type]
    return _saved(session, ride)


@router.post("/{ride_id}/legs/end", response_model=RideRead)
def bring_back(ride_id: int, payload: LegEnd, session: WriteSessionDep, creds: CredsDep):
    """The car is back: the reading that ends the current stretch."""
    user = require_user(session, creds)
    ride = _odometer_ride(session, ride_id)
    current = _open_leg(ride)
    if current is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nobody is at the wheel of this car")
    _note_km_or_403(user, ride)
    _km_at_least(payload.km, current.start_km)
    current.end_km = payload.km
    session.add(current)
    return _saved(session, ride)


@router.delete("/{ride_id}/legs/last", response_model=RideRead)
def undo_leg(ride_id: int, session: WriteSessionDep, creds: CredsDep):
    """Take back the last thing noted, for a typo or the wrong person: a car
    noted as back is out again, else the newest stretch goes and the one before
    it (a handover) is being driven again."""
    user = require_user(session, creds)
    ride = _get_ride_or_404(session, ride_id)
    if not _may_run(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver or an admin can undo the odometer")
    if not ride.legs:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nothing has been noted on the odometer")
    last = ride.legs[-1]
    if last.end_km is not None:
        last.end_km = None
        session.add(last)
    else:
        ride.legs.remove(last)
        session.delete(last)
        if ride.legs:
            ride.legs[-1].end_km = None
            session.add(ride.legs[-1])
    return _saved(session, ride)


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
