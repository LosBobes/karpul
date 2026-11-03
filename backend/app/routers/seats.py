"""The seats and the pickup points: getting in, moving, getting out, and a new
place on the route. A seat freed goes to the queue (`promote_waitlist`); a
seat taken ends the passenger's wait elsewhere that day."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from .. import audit, geo, notices
from ..access import get_ride_or_404, is_driver, may_manage_seats, may_run, on_behalf
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..events import request_saved, ride_saved
from ..models import Booking, Ride, RideRequest, User
from ..push import notify
from ..ride_edits import proposal_of, settle, tell_applied
from ..ride_removal import remove_rides
from ..schemas import BookingCreate, BookingRead, BookingUpdate, NewStop, Point, RideRead, StopCreate
from ..services import (
    account_for_name,
    add_stop,
    is_person,
    leave_waitlists_that_day,
    norm_name,
    pickup_or_422,
    promote_waitlist,
    to_ride_read_dict,
)

router = APIRouter(prefix="/api/rides", tags=["rides"])

SessionDep = Annotated[Session, Depends(get_session)]
# Every mutation is check-then-write (free seats, car availability, ownership),
# so it runs under the write lock from the first statement (database.begin_write).
WriteSessionDep = Annotated[Session, Depends(get_write_session)]


def answer_requests(session: Session, user_id: int | None, ride: Ride) -> list[RideRequest]:
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


def seated(session: Session, ride: Ride, user_id: int | None) -> list[Ride]:
    """After someone gets a seat in `ride`: they stop waiting for the other
    cars that day. Returns the rides whose queue changed."""
    if user_id is None:
        return []
    return [r for r in leave_waitlists_that_day(session, user_id, ride.ride_date) if r.id != ride.id]


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
    ride = get_ride_or_404(session, ride_id)
    if ride.unconfirmed and not may_run(user, ride):
        raise HTTPException(status.HTTP_409_CONFLICT, "The driver has not confirmed this ride yet")
    name = payload.passenger_name
    if norm_name(name) == user.name_key:
        passenger: User | None = user
    else:
        if not may_manage_seats(ride, user):
            if ride.passengers_manage:
                detail = "Only the driver or a passenger in this car can add someone"
            else:
                detail = "Only the driver can add other passengers to this car"
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail)
        passenger = account_for_name(session, name)
    if passenger is not None:
        name = passenger.display_name
    if (passenger is not None and is_driver(passenger, ride)) or norm_name(name) == norm_name(ride.driver_name):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{name} is the driver of this ride")
    if any(
        (passenger is not None and is_person(passenger, b.passenger_id, b.passenger_name))
        or norm_name(b.passenger_name) == norm_name(name)
        for b in ride.bookings
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{name} already joined this ride")
    if len(ride.bookings) >= ride.seats:
        raise HTTPException(status.HTTP_409_CONFLICT, "No free seats left")
    added = _new_stop(session, ride, user, payload.pickup, payload.new_stop)
    pickup = added if added is not None else pickup_or_422(ride, payload.pickup)
    passenger_id = passenger.id if passenger is not None else None
    added_by = user.id if passenger is not user else None
    ride.bookings.append(
        Booking(ride_id=ride.id, passenger_id=passenger_id, passenger_name=name, pickup=pickup, added_by_id=added_by)  # type: ignore[arg-type]
    )
    queues = seated(session, ride, passenger_id)
    answered = answer_requests(session, passenger_id, ride)
    if passenger is not user and on_behalf(user, ride):
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
    if not is_driver(user, ride):
        notify(session, [ride.driver_id], "got_in", ride, name=name)
        if added:
            notify(session, [ride.driver_id], "stop_added", ride, name=name, place=added)
    return to_ride_read_dict(ride)


@router.get("/{ride_id}/bookings", response_model=list[BookingRead])
def list_bookings(ride_id: int, session: SessionDep, creds: CredsDep):
    require_user(session, creds)
    return get_ride_or_404(session, ride_id).bookings


@router.patch("/{ride_id}/bookings/{booking_id}", response_model=RideRead)
def move_booking(
    ride_id: int, booking_id: int, payload: BookingUpdate, session: WriteSessionDep, creds: CredsDep
):
    """Change where a passenger gets in. The passenger themself, or whoever may
    manage the seats, can do it."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    booking = next((b for b in ride.bookings if b.id == booking_id), None)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if not is_person(user, booking.passenger_id, booking.passenger_name) and not may_manage_seats(ride, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the passenger or the driver can change this booking")
    added = _new_stop(session, ride, user, payload.pickup, payload.new_stop)
    booking.pickup = added if added is not None else pickup_or_422(ride, payload.pickup)
    session.add(booking)
    session.add(ride)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    if added and not is_driver(user, ride):
        notify(session, [ride.driver_id], "stop_added", ride, name=booking.passenger_name, place=added)
    return to_ride_read_dict(ride)


@router.post("/{ride_id}/stops", response_model=RideRead, status_code=status.HTTP_201_CREATED)
def create_stop(ride_id: int, payload: StopCreate, session: WriteSessionDep, creds: CredsDep):
    """The driver (or an admin) puts another pickup point on the route, before
    the origin or after it, without opening the whole edit form."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    if not may_run(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver or an admin can edit this ride")
    before = (ride.stops_before, ride.stops)
    add_stop(ride, payload.stop, payload.before, payload.index)
    if (ride.stops_before, ride.stops) == before:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{payload.stop} is already on this ride's route")
    _pin_new_place(session, ride, payload.stop, payload.point)
    if on_behalf(user, ride):
        audit.record(session, user, "ride_edited", ride.driver_name, ride=ride, changes=[("stops", None, payload.stop)])
    session.add(ride)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    if not is_driver(user, ride):
        notify(session, [ride.driver_id], "ride_changed", ride, driver=user.display_name)
    return to_ride_read_dict(ride)


def _new_stop(session: Session, ride: Ride, user: User, pickup: str, where: NewStop | None) -> str | None:
    """A passenger getting in (or moving) at a place that is not on the route
    yet adds it there, unless the driver switched that off; None when they did
    not ask for a new place. The pin they gave goes with it; a place already
    on the route keeps its own (only whoever runs the ride moves a pin)."""
    if where is None:
        return None
    route = (ride.stops_before, ride.stops)
    place = add_stop(ride, pickup, where.before, where.index)
    # A place already on the route is just a pickup, switch or no switch.
    if (ride.stops_before, ride.stops) != route:
        if not ride.passengers_add_stops and not may_run(user, ride):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "The driver does not take new pickup points on this ride")
        _pin_new_place(session, ride, place, where.point)
    return place


def _pin_new_place(session: Session, ride: Ride, place: str, point: Point | None) -> None:
    """A new place on the route: its pin, when one was given, else the pin
    everyone knows it by (an office, the car's home), and remembered."""
    if point is None:
        known = geo.known_point(session, place, ride.corporate_car)
        if known is not None:
            point = Point(**known)
    if point is None:
        return
    geo.pin(ride, place, point)
    geo.learn(session, [place], geo.folded({place: point}))


@router.delete("/{ride_id}/bookings/{booking_id}", response_model=RideRead)
def leave_ride(ride_id: int, booking_id: int, session: WriteSessionDep, creds: CredsDep):
    """Take a seat out of the car. The seat goes to the first in the queue,
    if anyone is waiting."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    booking = next((b for b in ride.bookings if b.id == booking_id), None)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    themself = is_person(user, booking.passenger_id, booking.passenger_name)
    if not themself and not may_manage_seats(ride, user):
        detail = (
            "Only the passenger, the driver or another passenger in this car can remove this booking"
            if ride.passengers_manage
            else "Only the passenger or the driver can remove this booking"
        )
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail)
    passenger, passenger_id = booking.passenger_name, booking.passenger_id
    told: tuple[int | None, int | None] = (None, None)
    if not themself:
        # Someone else's seat: a line in the thread for the whole car, and a
        # notice that waits in the app for the passenger and whoever put them in.
        told = notices.seat_taken(session, ride, booking, user)
        if on_behalf(user, ride):
            audit.record(session, user, "seat_removed", ride.driver_name, ride=ride, changes=[("passenger", passenger, None)])
    ride.bookings.remove(booking)
    session.delete(booking)
    # The driver's ask may have waited only on this passenger. Should it no
    # longer fit (the shared car taken since), it stays asked: leaving the car
    # never fails on it.
    # A suggestion goes with the passenger who made it.
    suggestion = proposal_of(ride)
    if suggestion is not None and suggestion.get("suggested") and suggestion.get("by_id") == passenger_id:
        ride.proposal = ""
    asked = ride.proposal
    try:
        settled = settle(session, ride)
    except HTTPException:
        ride.proposal, settled = asked, None
    if ride.needs_driver and not any(b.passenger_id is not None for b in ride.bookings):
        # The driver cancelled and nobody is left to ask: the car is free.
        # The answer still describes the ride, so the frontend can drop it.
        answer = to_ride_read_dict(ride)
        remove_rides(session, None, [ride], tell_driver=False)
        if not themself:
            _tell_taken_out(session, ride, user, passenger, told)
        return answer
    new_stops: list[Booking] = []
    promoted = promote_waitlist(session, ride, new_stops)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    if settled is not None:
        notify(session, [ride.driver_id], "change_agreed", ride)
        tell_applied(session, ride, settled)
    if themself:
        notify(session, [ride.driver_id], "got_out", ride, name=passenger)
    else:
        _tell_taken_out(session, ride, user, passenger, told)
    if promoted:
        notify(session, [b.passenger_id for b in promoted], "seat_freed", ride, driver=ride.driver_name)
    # The queue's new places reach the route without the driver doing anything.
    for b in new_stops:
        notify(session, [ride.driver_id], "stop_added", ride, name=b.passenger_name, place=b.pickup)
    return to_ride_read_dict(ride)


def _tell_taken_out(session: Session, ride: Ride, by: User, passenger: str, told: tuple[int | None, int | None]) -> None:
    """After the commit: the passenger and whoever put them in hear who took
    the seat away, by push (never muted) and in the app."""
    told_passenger, adder = told
    if told_passenger is not None:
        notify(session, [told_passenger], "taken_out", ride, by=by.display_name)
    if adder is not None:
        notify(session, [adder], "guest_taken_out", ride, by=by.display_name, name=passenger)
    notices.published([told_passenger, adder])
