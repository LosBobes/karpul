"""The state of each shared car: the last reading of its odometer, its
battery, whether it is clean and what is wrong with it, and a guess where
the last driver did not fill it in.

Two things say where a car stands: the odometer legs people note on their
rides (`DriveLeg`) and the reports they write about the car (`CarReport`,
with a return or on their own). The newest of each kind is the fact; what
has happened to the car since is the guess. A ride the car went on after
the last reading, with no reading of its own, is assumed to have been
driven its length (`offices.ride_km`: the known road between the offices,
or the driver's distance, doubled for a return), and the battery is assumed
to have gone down by SOC_PER_KM for every such kilometre. A guessed figure
is marked `estimated`, so the screen can say "about".
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.orm import selectinload
from sqlmodel import Session, col, select

from .models import CarReport, CarType, CorporateCar, Ride
from .offices import ride_km

# Battery used per kilometre, in percent: the Mazda 6e's 68.8 kWh go about
# 420 km on the motorway in practice (WLTP says 479), so a 90 km leg costs
# a little over a fifth of the battery.
SOC_PER_KM = 0.24
# How many of a car's reports the state carries, newest first.
RECENT_REPORTS = 5


@dataclass
class Fact:
    """One thing known about the car, with where it comes from."""

    value: Any
    at: datetime | None = None
    by: str | None = None
    estimated: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {"value": self.value, "at": self.at, "by": self.by, "estimated": self.estimated}


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _over(ride: Ride, now: datetime) -> bool:
    """Has the ride been driven: a past day, or today past its return (past
    its departure when it has none: the car is at the far end by then)."""
    if ride.ride_date < now.date():
        return True
    if ride.ride_date > now.date():
        return False
    return (ride.return_time if ride.return_time is not None else ride.departure_time) < now.time()


def _km_since(rides: list[Ride], after_ride: Ride | None, after_day: date | None, now: datetime) -> float:
    """Kilometres the car has done, by the rides' own say, on the rides since
    the last reading: the ones after `after_day` (and, that day, after
    `after_ride`), already over, with no closed odometer of their own."""
    total = 0.0
    for r in rides:
        if r.approval == "pending" or not _over(r, now):
            continue
        if after_day is not None:
            if r.ride_date < after_day:
                continue
            if r.ride_date == after_day:
                if after_ride is None:
                    continue
                if r.id == after_ride.id or r.departure_time <= after_ride.departure_time:
                    continue
        if r.legs and r.legs[-1].end_km is not None:
            # Its own reading is in the odometer already (or is the reading).
            continue
        total += ride_km(r.origin, r.destination, r.distance_km, r.return_time is not None) or 0
    return total


def car_state(car: CorporateCar, rides: list[Ride], reports: list[CarReport], now: datetime) -> dict[str, Any]:
    """`rides` are this car's shared-car rides with their legs, `reports`
    this car's reports newest first."""
    # The odometer: the last closed leg, or the last report that read it,
    # whichever was written later.
    last_leg = None
    last_leg_ride = None
    for r in rides:
        for leg in r.legs:
            if leg.end_km is not None and (last_leg is None or _utc(leg.created_at) >= _utc(last_leg.created_at)):
                last_leg, last_leg_ride = leg, r
    last_read = next((p for p in reports if p.odometer_km is not None), None)
    odometer = Fact(None)
    after_ride: Ride | None = None
    after_day: date | None = None
    if last_leg is not None and (last_read is None or _utc(last_leg.created_at) >= _utc(last_read.created_at)):
        odometer = Fact(last_leg.end_km, _utc(last_leg.created_at), last_leg.driver_name)
        after_ride, after_day = last_leg_ride, last_leg_ride.ride_date  # type: ignore[union-attr]
    elif last_read is not None:
        odometer = Fact(last_read.odometer_km, _utc(last_read.created_at), last_read.user_name)
        after_ride = next((r for r in rides if r.id == last_read.ride_id), None)
        after_day = after_ride.ride_date if after_ride is not None else _utc(last_read.created_at).date()
    guessed_km = _km_since(rides, after_ride, after_day, now) if odometer.value is not None else 0.0
    if guessed_km > 0:
        odometer = Fact(round(odometer.value + guessed_km), odometer.at, odometer.by, estimated=True)

    # The battery: the last report that read it, worn down by the kilometres since.
    soc = Fact(None)
    last_soc = next((p for p in reports if p.soc is not None), None)
    if last_soc is not None:
        soc = Fact(last_soc.soc, _utc(last_soc.created_at), last_soc.user_name)
        soc_ride = next((r for r in rides if r.id == last_soc.ride_id), None)
        since = _km_since(rides, soc_ride, soc_ride.ride_date if soc_ride else _utc(last_soc.created_at).date(), now)
        if last_soc.odometer_km is not None and odometer.value is not None and odometer.value > last_soc.odometer_km:
            since = max(since, odometer.value - last_soc.odometer_km)
        if since > 0:
            soc = Fact(max(0, round(last_soc.soc - since * SOC_PER_KM)), soc.at, soc.by, estimated=True)

    clean = Fact(None)
    said = next((p for p in reports if p.clean is not None), None)
    if said is not None:
        clean = Fact(said.clean, _utc(said.created_at), said.user_name)
    issues = Fact("")
    said = next((p for p in reports if p.issues is not None), None)
    if said is not None:
        issues = Fact(said.issues, _utc(said.created_at), said.user_name)

    return {
        "car": car,
        "odometer": odometer.as_dict(),
        "soc": soc.as_dict(),
        "clean": clean.as_dict(),
        "issues": issues.as_dict(),
        "recent": reports[:RECENT_REPORTS],
    }


def car_states(session: Session, now: datetime | None = None) -> list[dict[str, Any]]:
    """Every active pool car's state, in the pool's order."""
    now = now or datetime.now()
    cars = list(session.exec(select(CorporateCar).where(col(CorporateCar.active).is_(True)).order_by(CorporateCar.name)))
    rides = list(
        session.exec(
            select(Ride)
            .where(Ride.car_type == CarType.corporate, Ride.ride_date <= now.date())
            .options(selectinload(Ride.legs))  # type: ignore[arg-type]
            .order_by(Ride.ride_date, Ride.departure_time, Ride.id)
        )
    )
    reports = list(session.exec(select(CarReport).order_by(col(CarReport.created_at).desc(), col(CarReport.id).desc())))
    return [
        car_state(
            car,
            [r for r in rides if r.corporate_car_id == car.id],
            [p for p in reports if p.car_id == car.id],
            now,
        )
        for car in cars
    ]

