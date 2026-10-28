"""`/api/rides/{id}/legs`: a shared car's odometer, stretch by stretch (DriveLeg)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from ..access import get_ride_or_404, may_run
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..events import ride_saved
from ..models import CarType, DriveLeg, Ride, User
from ..schemas import CarReportIn, LegEnd, LegStart, RideRead
from ..services import is_person, norm_name, to_ride_read_dict
from .cars import file_report, report_filed

router = APIRouter(prefix="/api/rides", tags=["rides"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]


# --- the odometer -------------------------------------------------------------"""
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
    ride = get_ride_or_404(session, ride_id)
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
    return may_run(user, ride) or (leg is not None and is_person(user, leg.driver_id, leg.driver_name))


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
        if not may_run(user, ride):
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
    """The car is back: the reading that ends the current stretch, and how
    the car was left (a `CarReport` with the reading, the battery, whether it
    is clean and what is wrong, which is the car's state from now on)."""
    user = require_user(session, creds)
    ride = _odometer_ride(session, ride_id)
    current = _open_leg(ride)
    if current is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nobody is at the wheel of this car")
    _note_km_or_403(user, ride)
    _km_at_least(payload.km, current.start_km)
    current.end_km = payload.km
    session.add(current)
    car = ride.corporate_car
    report = None
    if car is not None:
        report = file_report(session, user, car, CarReportIn(odometer_km=payload.km, soc=payload.soc, clean=payload.clean, issues=payload.issues), ride_id=ride.id)
    out = _saved(session, ride)
    if report is not None and car is not None:
        report_filed(session, user, car, report)
    return out


@router.delete("/{ride_id}/legs/last", response_model=RideRead)
def undo_leg(ride_id: int, session: WriteSessionDep, creds: CredsDep):
    """Take back the last thing noted, for a typo or the wrong person: a car
    noted as back is out again, else the newest stretch goes and the one before
    it (a handover) is being driven again."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    if not may_run(user, ride):
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
