from datetime import date, timedelta
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..calendar import ride_ics
from ..database import get_session, get_write_session
from ..events import ride_deleted, ride_saved
from ..models import Booking, CarType, Ride
from ..push import notify
from ..schemas import BookingCreate, BookingRead, BookingUpdate, RideCreate, RideRead, RideUpdate
from ..services import (
    corporate_car_label,
    drop_orphaned_pickups,
    ensure_car_available,
    norm_name,
    pickup_or_422,
    resolve_corporate_car,
    ride_to_create_dict,
    stops_to_text,
    to_ride_read_dict,
    user_from_header,
    weekly_dates,
)

router = APIRouter(prefix="/api/rides", tags=["rides"])

SessionDep = Annotated[Session, Depends(get_session)]
# Every mutation is check-then-write (free seats, car availability, ownership),
# so it runs under the write lock from the first statement (database.begin_write).
WriteSessionDep = Annotated[Session, Depends(get_write_session)]
UserName = Annotated[str | None, Header(alias="X-User-Name")]

_norm = norm_name


def _require_user(user: str | None) -> str:
    user = user_from_header(user)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Set your name first (X-User-Name header)")
    return user


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


def _prepare(session: Session, validated: RideCreate | RideUpdate, exclude_ride_id: int | None = None) -> dict:
    """The column values for a validated ride, with the corporate-car rules applied."""
    data = validated.model_dump(exclude={"repeat_until"})
    data["stops"] = stops_to_text(validated.stops)  # type: ignore[arg-type]
    if validated.car_type == CarType.corporate:
        car = resolve_corporate_car(session, validated.corporate_car_id)  # type: ignore[arg-type]
        ensure_car_available(
            session,
            car.id,
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


@router.post("", response_model=RideRead, status_code=status.HTTP_201_CREATED)
def create_ride(payload: RideCreate, session: WriteSessionDep):
    """Add a ride. With `repeat_until` one ride per week is added, all or
    nothing: a clash of the company car on any of the weeks fails the whole
    request and says which day. The first ride is returned; the rest reach
    every tab (this one included) over the live socket.
    """
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
        ride = Ride(**data, series_id=series_id)
        session.add(ride)
        # Flush so the next occurrence's availability check sees this one.
        session.flush()
        rides.append(ride)
    session.commit()
    for ride in rides:
        session.refresh(ride)
        ride_saved(ride, created=True)
    return to_ride_read_dict(rides[0])


@router.get("/{ride_id}", response_model=RideRead)
def get_ride(ride_id: int, session: SessionDep):
    return to_ride_read_dict(_get_ride_or_404(session, ride_id))


@router.get("/{ride_id}/calendar.ics", include_in_schema=True)
def ride_calendar(ride_id: int, session: SessionDep):
    """The ride as a calendar file, for "Add to calendar"."""
    ride = _get_ride_or_404(session, ride_id)
    return Response(
        ride_ics(ride),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="karpul-ride-{ride.id}.ics"'},
    )


@router.patch("/{ride_id}", response_model=RideRead)
def update_ride(ride_id: int, payload: RideUpdate, session: WriteSessionDep, user: UserName = None):
    user = _require_user(user)
    ride = _get_ride_or_404(session, ride_id)
    if _norm(ride.driver_name) != _norm(user):
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
    session.add(ride)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    if moved and ride.bookings:
        notify(session, [b.passenger_name for b in ride.bookings], "ride_changed", ride, driver=ride.driver_name)
    return to_ride_read_dict(ride)


@router.delete("/{ride_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ride(
    ride_id: int,
    session: WriteSessionDep,
    user: UserName = None,
    scope: Literal["one", "following"] = Query(default="one"),
):
    """Remove a ride; `scope=following` also removes the later rides of the
    same weekly series (the earlier ones, already gone or not, stay)."""
    user = _require_user(user)
    ride = _get_ride_or_404(session, ride_id)
    if _norm(ride.driver_name) != _norm(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver can cancel this ride")
    doomed = [ride]
    if scope == "following" and ride.series_id:
        stmt = select(Ride).where(Ride.series_id == ride.series_id, Ride.ride_date > ride.ride_date, Ride.id != ride.id)
        doomed += [r for r in session.exec(stmt) if _norm(r.driver_name) == _norm(user)]
    gone = []
    for r in doomed:
        passengers = [b.passenger_name for b in r.bookings]
        if passengers:
            notify(session, passengers, "ride_removed", r, driver=r.driver_name)
        gone.append((r.id, r.ride_date))
        session.delete(r)
    session.commit()
    for rid, rdate in gone:
        ride_deleted(rid, rdate)


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
    `pickup` is where they get in: the origin by default, or one of the stops.
    """
    ride = _get_ride_or_404(session, ride_id)
    name = payload.passenger_name
    actor = user_from_header(user) or name
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
    pickup = pickup_or_422(ride, payload.pickup)
    session.add(Booking(ride_id=ride.id, passenger_name=name, pickup=pickup))
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    if _norm(actor) != _norm(ride.driver_name):
        notify(session, [ride.driver_name], "got_in", ride, name=name)
    return to_ride_read_dict(ride)


@router.get("/{ride_id}/bookings", response_model=list[BookingRead])
def list_bookings(ride_id: int, session: SessionDep):
    return _get_ride_or_404(session, ride_id).bookings


@router.patch("/{ride_id}/bookings/{booking_id}", response_model=RideRead)
def move_booking(
    ride_id: int, booking_id: int, payload: BookingUpdate, session: WriteSessionDep, user: UserName = None
):
    """Change where a passenger gets in. The passenger themself, or whoever may
    manage the seats, can do it."""
    user = _require_user(user)
    ride = _get_ride_or_404(session, ride_id)
    booking = next((b for b in ride.bookings if b.id == booking_id), None)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if _norm(booking.passenger_name) != _norm(user) and not _may_manage_seats(ride, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the passenger or the driver can change this booking")
    booking.pickup = pickup_or_422(ride, payload.pickup)
    session.add(booking)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    return to_ride_read_dict(ride)


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
    passenger = booking.passenger_name
    session.delete(booking)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    if _norm(user) == _norm(passenger):
        notify(session, [ride.driver_name], "got_out", ride, name=passenger)
    else:
        notify(session, [passenger], "taken_out", ride, driver=ride.driver_name)
    return to_ride_read_dict(ride)
