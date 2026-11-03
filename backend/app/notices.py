"""Telling people they lost a seat, in ways that do not depend on push.

A push reaches only the browsers someone switched notifications on in, and a
colleague put in a car by name has no account to push at all. So when someone
else takes a passenger out of a car, or the ride itself goes:

- the thread gets a line saying who took whom out (`RideMessage.removed_name`),
  so everyone in the car can see it;
- the passenger (with an account) and whoever had put them in get a
  `SeatNotice`, which the app shows on top of the board until it is seen
  (`routers/notices.py`), whether or not a push went out too.

The pushes themselves (`taken_out`, `guest_taken_out`) stay with the routes;
they cannot be muted (push.ALWAYS_SENT).
"""

from sqlmodel import Session

from .events import notices_changed
from .models import Booking, Ride, RideMessage, SeatNotice, User


def _notice(session: Session, user_id: int, ride: Ride, kind: str, passenger: str, yours: bool, by: str) -> None:
    session.add(
        SeatNotice(
            user_id=user_id,
            ride_id=ride.id,
            ride_date=ride.ride_date,
            departure_time=ride.departure_time,
            origin=ride.origin,
            destination=ride.destination,
            kind=kind,
            passenger_name=passenger,
            yours=yours,
            by_name=by,
        )
    )


def who_to_tell(booking: Booking, by: User | None) -> tuple[int | None, int | None]:
    """The passenger's account and the account that put them in, each None
    when there is none or it is the one who did it."""
    actor = by.id if by is not None else None
    passenger = booking.passenger_id if booking.passenger_id != actor else None
    adder = booking.added_by_id
    if adder in (actor, booking.passenger_id):
        adder = None
    return passenger, adder


def seat_taken(session: Session, ride: Ride, booking: Booking, by: User) -> tuple[int | None, int | None]:
    """`by` took `booking` out of `ride` (not their own seat): the thread line
    and the notices, in the caller's transaction. Returns who to push, as
    `who_to_tell` does; `published` after the commit tells the open tabs."""
    passenger, adder = who_to_tell(booking, by)
    session.add(
        RideMessage(
            ride_id=ride.id,  # type: ignore[arg-type]
            author_id=by.id,
            author_name=by.display_name,
            body=f"Took {booking.passenger_name} out of the car",
            removed_name=booking.passenger_name,
        )
    )
    if passenger is not None:
        _notice(session, passenger, ride, "taken_out", booking.passenger_name, True, by.display_name)
    if adder is not None:
        _notice(session, adder, ride, "taken_out", booking.passenger_name, False, by.display_name)
    return passenger, adder


def ride_gone(session: Session, ride: Ride, by: User) -> list[int]:
    """`by` removed `ride`: a notice for everyone who loses a seat in it (and
    whoever put a colleague in it). Returns the accounts told."""
    told: list[int] = []
    for booking in ride.bookings:
        passenger, adder = who_to_tell(booking, by)
        if passenger is not None:
            _notice(session, passenger, ride, "ride_removed", booking.passenger_name, True, by.display_name)
            told.append(passenger)
        if adder is not None:
            _notice(session, adder, ride, "ride_removed", booking.passenger_name, False, by.display_name)
            told.append(adder)
    return told


def published(user_ids: list[int | None]) -> None:
    """After the commit: each account's open tabs fetch their notices again."""
    for uid in {u for u in user_ids if u is not None}:
        notices_changed(uid)
