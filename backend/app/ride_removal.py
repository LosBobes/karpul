"""A ride going: who is told, what reopens, and when a cancelled shared car
is handed to its passengers instead (`hands_over`, `Ride.needs_driver`)."""

from datetime import date, datetime

from sqlmodel import Session, select

from . import audit
from .access import driver_unless_actor, is_driver, on_behalf
from .events import request_saved, ride_deleted
from .models import CarType, Ride, RideRequest, User
from .push import notify


def hands_over(user: User, ride: Ride) -> bool:
    """A driver cancelling a shared car that still has somewhere to go and
    people in it does not take the car away from them: the ride stays,
    `needs_driver`, and the passengers are asked whether one of them drives
    (`take_over`). An admin's removal, an own car, a ride waiting for approval
    (it holds no car) or one with nobody to ask is removed as before. The
    frontend's twin is `handsOver` in lib/me.ts."""
    return (
        is_driver(user, ride)
        and ride.car_type == CarType.corporate
        and ride.approval != "pending"
        and any(b.passenger_id is not None for b in ride.bookings)
        and datetime.combine(ride.ride_date, ride.departure_time) > datetime.now()
    )


def cars_with_seats(session: Session, ride: Ride) -> list[Ride]:
    """The other cars that day with a seat free, the ones leaving nearest the
    removed ride's time first: what a passenger left without a ride is told."""
    stmt = select(Ride).where(Ride.ride_date == ride.ride_date, Ride.id != ride.id, Ride.approval != "pending")
    others = [r for r in session.exec(stmt) if len(r.bookings) < r.seats]
    others.sort(key=lambda r: abs(datetime.combine(r.ride_date, r.departure_time) - datetime.combine(ride.ride_date, ride.departure_time)))
    return others


def remove_rides(
    session: Session, user: User | None, doomed: list[Ride], action: str = "ride_removed", tell_driver: bool = True
) -> None:
    """Delete `doomed` as `user`: the passengers (and a driver who is not
    `user`) are told, the requests they answered are open again, and every
    tab hears. A passenger whose ride goes is pointed at the other cars with
    seats that day, when there are any (the push opens the nearest one): a
    cancellation the evening before is when a seat elsewhere matters. With no
    `user` it is a ride nobody took over (`needs_driver`, reminders.py) going
    at departure, and the passengers are told that. Commits."""
    gone = []
    reopened: list[RideRequest] = []
    for r in doomed:
        passengers = [b.passenger_id for b in r.bookings]
        alternatives = cars_with_seats(session, r) if passengers and r.ride_date >= date.today() else []
        if passengers:
            said = {"driver": user.display_name} if user is not None else {}
            notify(
                session,
                passengers,
                "ride_removed" if user is not None else "no_driver",
                r,
                alternatives=len(alternatives),
                url=f"/ride/{alternatives[0].id}" if alternatives else "/",
                **said,
            )
        if tell_driver and user is not None:
            notify(session, driver_unless_actor(user, r), "ride_removed", r, driver=user.display_name, url="/")
        for request in session.exec(select(RideRequest).where(RideRequest.ride_id == r.id)):
            request.ride_id = None
            session.add(request)
            reopened.append(request)
        if user is not None and on_behalf(user, r):
            audit.record(session, user, action, r.driver_name, ride=r)
        gone.append((r.id, r.ride_date))
        session.delete(r)
    session.commit()
    for rid, rdate in gone:
        ride_deleted(rid, rdate)  # type: ignore[arg-type]
    for request in reopened:
        session.refresh(request)
        request_saved(request)
