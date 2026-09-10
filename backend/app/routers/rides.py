from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..database import get_session, get_write_session
from ..events import ride_deleted, ride_saved
from ..models import Booking, CarType, Ride
from ..schemas import BookingCreate, BookingRead, RideCreate, RideRead, RideUpdate
from ..services import (
    corporate_car_label,
    ensure_car_available,
    resolve_corporate_car,
    to_ride_read_dict,
)

router = APIRouter(prefix="/api/rides", tags=["rides"])

SessionDep = Annotated[Session, Depends(get_session)]
# Every mutation is check-then-write (free seats, car availability, ownership),
# so it runs under the write lock from the first statement (database.begin_write).
WriteSessionDep = Annotated[Session, Depends(get_write_session)]
UserName = Annotated[str | None, Header(alias="X-User-Name")]


def _norm(name: str) -> str:
    return " ".join(name.split()).casefold()


def _require_user(user: str | None) -> str:
    if not user or not user.strip():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Set your name first (X-User-Name header)")
    return user.strip()


def _get_ride_or_404(session: Session, ride_id: int) -> Ride:
    ride = session.get(Ride, ride_id)
    if ride is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    return ride


@router.get("", response_model=list[RideRead])
def list_rides(
    session: SessionDep,
    ride_date: date | None = Query(default=None, alias="date"),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
):
    """List rides for a single day (`date`) or an inclusive range (`from`/`to`).

    Without parameters the current week (Mon-Sun) is returned.
    """
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
    if date_to < date_from:
        raise HTTPException(422, "`to` must not be before `from`")
    if (date_to - date_from).days > 92:
        raise HTTPException(422, "Range may not exceed 92 days")

    stmt = (
        select(Ride)
        .where(Ride.ride_date >= date_from, Ride.ride_date <= date_to)
        # Bookings are fetched in one extra query for the whole list rather
        # than lazily once per ride; every tab reloads this on reconnect.
        .options(selectinload(Ride.bookings))  # type: ignore[arg-type]
        .order_by(Ride.ride_date, Ride.departure_time, Ride.id)
    )
    return [to_ride_read_dict(r) for r in session.exec(stmt).all()]


@router.post("", response_model=RideRead, status_code=status.HTTP_201_CREATED)
def create_ride(payload: RideCreate, session: WriteSessionDep):
    data = payload.model_dump()
    if payload.car_type == CarType.corporate:
        car = resolve_corporate_car(session, payload.corporate_car_id)  # type: ignore[arg-type]
        ensure_car_available(
            session, car.id, payload.ride_date, payload.departure_time, payload.return_time
        )
        data["car_name"] = corporate_car_label(car)
        if payload.seats > car.passenger_seats:
            raise HTTPException(
                422,
                f"{car.name} only has {car.passenger_seats} passenger seats",
            )
    ride = Ride(**data)
    session.add(ride)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=True)
    return to_ride_read_dict(ride)


@router.get("/{ride_id}", response_model=RideRead)
def get_ride(ride_id: int, session: SessionDep):
    return to_ride_read_dict(_get_ride_or_404(session, ride_id))


@router.patch("/{ride_id}", response_model=RideRead)
def update_ride(ride_id: int, payload: RideUpdate, session: WriteSessionDep, user: UserName = None):
    user = _require_user(user)
    ride = _get_ride_or_404(session, ride_id)
    if _norm(ride.driver_name) != _norm(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver can edit this ride")

    merged = ride.model_dump()
    merged.update(payload.model_dump(exclude_unset=True))
    # Re-run the creation rules on the merged state.
    validated = RideCreate.model_validate(
        {k: merged[k] for k in RideCreate.model_fields}
    )
    data = validated.model_dump()
    if validated.car_type == CarType.corporate:
        car = resolve_corporate_car(session, validated.corporate_car_id)  # type: ignore[arg-type]
        ensure_car_available(
            session,
            car.id,
            validated.ride_date,
            validated.departure_time,
            validated.return_time,
            exclude_ride_id=ride.id,
        )
        data["car_name"] = corporate_car_label(car)
        if validated.seats > car.passenger_seats:
            raise HTTPException(
                422,
                f"{car.name} only has {car.passenger_seats} passenger seats",
            )
    if validated.seats < len(ride.bookings):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{len(ride.bookings)} passengers already joined; seats cannot go below that",
        )
    for key, value in data.items():
        setattr(ride, key, value)
    session.add(ride)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    return to_ride_read_dict(ride)


@router.delete("/{ride_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ride(ride_id: int, session: WriteSessionDep, user: UserName = None):
    user = _require_user(user)
    ride = _get_ride_or_404(session, ride_id)
    if _norm(ride.driver_name) != _norm(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver can cancel this ride")
    ride_id, ride_date = ride.id, ride.ride_date
    session.delete(ride)
    session.commit()
    ride_deleted(ride_id, ride_date)


def _is_passenger(ride: Ride, name: str) -> bool:
    return any(_norm(b.passenger_name) == _norm(name) for b in ride.bookings)


def _may_manage_seats(ride: Ride, actor: str) -> bool:
    """Who may put other people in this car or take them out.

    The driver always can. Passengers can too, but only while the driver has
    switched `passengers_manage` on for the ride; each passenger can always
    leave on their own (that is not "managing", see `leave_ride`).
    """
    if _norm(actor) == _norm(ride.driver_name):
        return True
    return ride.passengers_manage and _is_passenger(ride, actor)


@router.post("/{ride_id}/bookings", response_model=RideRead, status_code=status.HTTP_201_CREATED)
def join_ride(ride_id: int, payload: BookingCreate, session: WriteSessionDep, user: UserName = None):
    """Put `passenger_name` in the car.

    Without `X-User-Name` this is a self-join: the passenger is the actor. With
    it, someone else can be added, but only by the driver or, when the driver
    allows it (`passengers_manage`), by a passenger already in the car.
    """
    ride = _get_ride_or_404(session, ride_id)
    name = payload.passenger_name
    actor = user.strip() if user and user.strip() else name
    if _norm(actor) != _norm(name) and not _may_manage_seats(ride, actor):
        if ride.passengers_manage:
            detail = "Only the driver or a passenger in this car can add someone"
        else:
            detail = "Only the driver can add other passengers to this car"
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail)
    if _norm(name) == _norm(ride.driver_name):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{name} is the driver of this ride")
    if _is_passenger(ride, name):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{name} already joined this ride")
    if len(ride.bookings) >= ride.seats:
        raise HTTPException(status.HTTP_409_CONFLICT, "No free seats left")
    session.add(Booking(ride_id=ride.id, passenger_name=name))
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    return to_ride_read_dict(ride)


@router.get("/{ride_id}/bookings", response_model=list[BookingRead])
def list_bookings(ride_id: int, session: SessionDep):
    return _get_ride_or_404(session, ride_id).bookings


@router.delete("/{ride_id}/bookings/{booking_id}", response_model=RideRead)
def leave_ride(ride_id: int, booking_id: int, session: WriteSessionDep, user: UserName = None):
    user = _require_user(user)
    ride = _get_ride_or_404(session, ride_id)
    booking = next((b for b in ride.bookings if b.id == booking_id), None)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if _norm(booking.passenger_name) != _norm(user) and not _may_manage_seats(ride, user):
        detail = (
            "Only the passenger, the driver or another passenger in this car can remove this booking"
            if ride.passengers_manage
            else "Only the passenger or the driver can remove this booking"
        )
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail)
    session.delete(booking)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    return to_ride_read_dict(ride)
