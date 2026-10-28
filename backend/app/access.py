"""Who may do what to a ride: the checks every ride router shares.

The driver runs their ride, and so does an admin, who schedules the company
cars for people and fixes what they got wrong (`may_run`). The seat list has
its own rule (`may_manage_seats`). Each is a plain function on the row and the
account, so the routers (`routers/rides.py`, `routers/odometer.py`,
`routers/waitlist.py`, `routers/thread.py`) read the same way; the frontend's
twins are `runs()` in lib/me.ts and `canManage` in CarDetail.tsx.
"""

from fastapi import HTTPException, status
from sqlmodel import Session

from .admin import is_admin
from .models import Booking, Ride, User
from .services import is_person


def get_ride_or_404(session: Session, ride_id: int) -> Ride:
    ride = session.get(Ride, ride_id)
    if ride is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    return ride


def is_driver(user: User, ride: Ride) -> bool:
    """A driver who cancelled a shared car into `needs_driver` gave the ride
    up: the name stays on it until someone takes over, the say does not."""
    return not ride.needs_driver and is_person(user, ride.driver_id, ride.driver_name)


def may_run(user: User, ride: Ride) -> bool:
    """Who may edit or remove a ride: its driver, or an admin."""
    return is_driver(user, ride) or is_admin(user)


def on_behalf(user: User, ride: Ride) -> bool:
    """An admin acting on a ride that is not theirs: what the admin's log records."""
    return not is_driver(user, ride) and is_admin(user)


def driver_unless_actor(user: User, ride: Ride) -> list[int | None]:
    """The driver, to be told what an admin did to their ride; nobody when the
    driver did it themself."""
    return [] if is_driver(user, ride) else [ride.driver_id]


def booking_of(ride: Ride, user: User) -> Booking | None:
    return next((b for b in ride.bookings if is_person(user, b.passenger_id, b.passenger_name)), None)


def may_manage_seats(ride: Ride, user: User) -> bool:
    """Who may put other people in this car or take them out.

    The driver always can, and so can an admin. Passengers can too, but only
    while the driver has switched `passengers_manage` on for the ride; each
    passenger can always leave on their own (that is not "managing").
    """
    if may_run(user, ride):
        return True
    return ride.passengers_manage and booking_of(ride, user) is not None
