import csv
import io
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlmodel import Session, col, func, select

from .. import audit
from ..admin import require_admin
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..events import cars_changed
from ..models import CarType, CorporateCar, Ride
from ..schemas import CorporateCarCreate, CorporateCarRead, CorporateCarUpdate
from ..services import corporate_car_label, corporate_usage, relabel_rides_for_car

router = APIRouter(prefix="/api/cars", tags=["cars"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]


def _get_car_or_404(session: Session, car_id: int) -> CorporateCar:
    car = session.get(CorporateCar, car_id)
    if car is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Corporate car not found")
    return car


def _ensure_plate_free(session: Session, plate: str, exclude_id: int | None = None) -> None:
    """The `plate` column is unique; check first so the client gets a message, not a 500."""
    stmt = select(CorporateCar).where(CorporateCar.plate == plate)
    existing = session.exec(stmt).first()
    if existing is not None and existing.id != exclude_id:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{plate} is already in the pool ({existing.name})")


def _ensure_seats_fit_existing_rides(session: Session, car: CorporateCar, seats: int) -> None:
    """Rides are validated against the car's seat count at creation time.

    Shrinking a car afterwards would leave rides that offer more seats than the
    car has, so refuse it and let the admin fix the ride first.
    """
    stmt = (
        select(Ride)
        .where(
            Ride.corporate_car_id == car.id,
            Ride.car_type == CarType.corporate,
            Ride.seats > seats,
        )
        .order_by(col(Ride.seats).desc())
    )
    worst = session.exec(stmt).first()
    if worst is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{worst.driver_name}'s ride on {worst.ride_date} already offers {worst.seats} "
            f"seats in this car; lower that ride first",
        )


@router.get("/corporate", response_model=list[CorporateCarRead])
def list_corporate_cars(session: SessionDep, creds: CredsDep, include_inactive: bool = Query(default=False)):
    """The active pool, as used by the ride form. `include_inactive=true`
    returns retired cars too and is admin-only."""
    if include_inactive:
        require_admin(session, creds)
    else:
        require_user(session, creds)
    stmt = select(CorporateCar)
    if not include_inactive:
        stmt = stmt.where(col(CorporateCar.active).is_(True))
    return session.exec(stmt.order_by(col(CorporateCar.active).desc(), CorporateCar.name)).all()


@router.get("/corporate/usage")
def corporate_car_usage(session: SessionDep, creds: CredsDep, days: int = Query(default=90, ge=7, le=730)):
    """Admin-only: how the pool cars were used over the last `days` days, per
    car and in total, with the rides as history (services.corporate_usage)."""
    require_admin(session, creds)
    return corporate_usage(session, days)


USAGE_CSV_COLUMNS = [
    ("date", "ride_date"),
    ("departure", "departure_time"),
    ("return", "return_time"),
    ("car", "car_name"),
    ("driver", "driver_name"),
    ("from", "origin"),
    ("to", "destination"),
    ("passengers", "passengers"),
    ("seats", "seats"),
    ("km", "distance_km"),
]


@router.get("/corporate/usage.csv")
def corporate_car_usage_csv(session: SessionDep, creds: CredsDep, days: int = Query(default=90, ge=7, le=730)):
    """Admin-only: the company-car rides of the last `days` days as a
    spreadsheet, one row per ride. Starts with a UTF-8 byte order mark,
    which is how Excel knows to read č and ć as such."""
    require_admin(session, creds)
    usage = corporate_usage(session, days, history_limit=None)
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow([header for header, _ in USAGE_CSV_COLUMNS])
    for ride in usage["history"]:
        writer.writerow(["" if ride[key] is None else str(ride[key]) for _, key in USAGE_CSV_COLUMNS])
    filename = f"karpul-company-cars-{usage['from']}-to-{usage['to']}.csv"
    return Response(
        "\ufeff" + out.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/corporate", response_model=CorporateCarRead, status_code=status.HTTP_201_CREATED)
def create_corporate_car(payload: CorporateCarCreate, session: WriteSessionDep, creds: CredsDep):
    admin = require_admin(session, creds)
    _ensure_plate_free(session, payload.plate)
    car = CorporateCar(**payload.model_dump())
    session.add(car)
    audit.record(session, admin, "car_added", corporate_car_label(car))
    session.commit()
    session.refresh(car)
    cars_changed()
    return car


@router.patch("/corporate/{car_id}", response_model=CorporateCarRead)
def update_corporate_car(car_id: int, payload: CorporateCarUpdate, session: WriteSessionDep, creds: CredsDep):
    admin = require_admin(session, creds)
    car = _get_car_or_404(session, car_id)
    data = payload.model_dump(exclude_unset=True)
    label = corporate_car_label(car)
    changes = audit.diff(car, data)
    if "plate" in data:
        _ensure_plate_free(session, data["plate"], exclude_id=car.id)
    if "passenger_seats" in data:
        _ensure_seats_fit_existing_rides(session, car, data["passenger_seats"])
    for key, value in data.items():
        setattr(car, key, value)
    session.add(car)
    # `Ride.car_name` is a denormalised "<Name> (<PLATE>)" label, so a rename has
    # to travel to the rides already booked in this car or the board keeps
    # showing the old one. Same transaction as the car edit: the label and the
    # car never disagree.
    if "name" in data or "plate" in data:
        relabel_rides_for_car(session, car)
    if changes:
        audit.record(session, admin, "car_edited", label, changes=changes)
    session.commit()
    session.refresh(car)
    # One coarse event rather than one per relabelled ride: the client reloads
    # both the pool and the board, which is also what it does after its own edits.
    cars_changed()
    return car


@router.delete("/corporate/{car_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_corporate_car(car_id: int, session: WriteSessionDep, creds: CredsDep):
    """Hard delete, allowed only while no ride references the car.

    Rides keep `corporate_car_id` as a foreign key, so deleting a used car would
    orphan ride history. Retiring it (`active=false`) is the way to take a sold
    car out of circulation.
    """
    admin = require_admin(session, creds)
    car = _get_car_or_404(session, car_id)
    used = session.exec(
        select(func.count()).select_from(Ride).where(Ride.corporate_car_id == car.id)
    ).one()
    if used:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{car.name} is used by {used} ride(s); retire it instead of deleting it",
        )
    audit.record(session, admin, "car_removed", corporate_car_label(car))
    session.delete(car)
    session.commit()
    cars_changed()
