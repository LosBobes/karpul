"""Business rules shared by routers."""

from datetime import date, time

from fastapi import HTTPException, status
from sqlmodel import Session, select

from .models import CarType, CorporateCar, Ride


def to_ride_read_dict(ride: Ride) -> dict:
    data = ride.model_dump()
    data["bookings"] = ride.bookings
    data["free_seats"] = max(ride.seats - len(ride.bookings), 0)
    return data


def _overlaps(a_start: time, a_end: time | None, b_start: time, b_end: time | None) -> bool:
    """Two rides on the same day overlap if their [departure, return] windows intersect.

    A ride without a return time is treated as occupying the car until end of day.
    """
    a_end = a_end or time.max
    b_end = b_end or time.max
    return a_start <= b_end and b_start <= a_end


def resolve_corporate_car(session: Session, car_id: int) -> CorporateCar:
    car = session.get(CorporateCar, car_id)
    if car is None or not car.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Corporate car not found")
    return car


def ensure_car_available(
    session: Session,
    car_id: int,
    ride_date: date,
    departure: time,
    return_time: time | None,
    exclude_ride_id: int | None = None,
) -> None:
    stmt = select(Ride).where(
        Ride.corporate_car_id == car_id,
        Ride.ride_date == ride_date,
        Ride.car_type == CarType.corporate,
    )
    for other in session.exec(stmt):
        if other.id == exclude_ride_id:
            continue
        if _overlaps(departure, return_time, other.departure_time, other.return_time):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"That corporate car is already booked by {other.driver_name} "
                f"from {other.departure_time:%H:%M}"
                + (f" to {other.return_time:%H:%M}" if other.return_time else "")
                + " that day",
            )
