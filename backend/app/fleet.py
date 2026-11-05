"""The fleet and the office's figures: what the admins keep about the shared
cars beyond their rides, and the rules they can change without a deploy.

- **Settings** (`Setting`, `DEFAULTS`): the shared-car share (rides a week, a
  day, hours in a row) and the own-car allowance (which fuel it is reckoned
  in, the monthly cap). `setting()` reads one with its default.
- **The fuel price** (`FuelPrice`, `price_on`): Serbia caps the retail price
  of Evrodizel and BMB 95 every Friday; the newest row on or before a day is
  that day's price. `FUEL_REFERENCE` is the official figure the app ships
  with, seeded into an empty table (`seed_fuel_prices`); an admin adds each
  new week's from the *Costs* tab.
- **Out of service** (`CarBlock`, `block_on`): a car nobody can book on
  those days. `services.ensure_car_available` refuses a ride on one.
- **Paperwork and upkeep** (`due_items`, `send_fleet_reminders`): the
  registration, the insurance, the next service by day or km, and summer
  tyres in the winter season. The admins are pushed 30, 7 and 1 days ahead,
  on the day, and as a service comes within `SERVICE_SOON_KM`.
- **Odometer gaps** (`odometer_gaps`): km between one ride's return and the
  next ride's pickup reading that nobody logged.
- **The month summary** (`month_summary`): who drove how far in which car,
  and what the own-car km come to under the Serbian allowance rule.
"""

from __future__ import annotations

import logging
from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from sqlmodel import Session, col, select

from .models import (
    CarBlock,
    CarCost,
    CarType,
    CorporateCar,
    FleetNotice,
    FuelPrice,
    Ride,
    Setting,
    User,
)
from .offices import ride_km

log = logging.getLogger("karpul.fleet")

# --- Settings ----------------------------------------------------------------

DEFAULTS: dict[str, int | str] = {
    # The shared-car share (services.over_shared_car_share).
    "share_per_week": 1,
    "share_per_day": 1,
    "share_max_hours": 24,
    # The own-car allowance (month_summary): the fuel whose price it is
    # reckoned in, and the monthly amount above which it is taxed.
    "allowance_fuel": "petrol",
    "allowance_cap": 10121,
}
LIMITS: dict[str, tuple[int, int]] = {
    "share_per_week": (1, 7),
    "share_per_day": (1, 3),
    "share_max_hours": (1, 72),
    "allowance_cap": (0, 1_000_000),
}
FUELS = ("petrol", "diesel")


def setting(session: Session, key: str) -> Any:
    """The value of `key`, or its default when no admin changed it."""
    row = session.get(Setting, key)
    default = DEFAULTS[key]
    if row is None:
        return default
    if isinstance(default, int):
        try:
            return int(row.value)
        except ValueError:
            return default
    return row.value


def all_settings(session: Session) -> dict[str, Any]:
    return {key: setting(session, key) for key in DEFAULTS}


def put_setting(session: Session, key: str, value: int | str) -> None:
    row = session.get(Setting, key)
    if row is None:
        session.add(Setting(key=key, value=str(value)))
    else:
        row.value = str(value)
        session.add(row)


# --- The fuel price ----------------------------------------------------------

# The Serbian allowance for using one's own car on company business, free of
# income tax: 30 % of the price of a litre of fuel for every kilometre, up to
# a monthly amount set each February (10,121 dinars from 1 Feb 2026 to 31 Jan
# 2027; `allowance_cap`).
ALLOWANCE_SHARE = 0.30

# The official price the app starts with: the highest retail prices set by the
# Ministry of Internal and Foreign Trade under the decree limiting oil
# derivative prices (Uredba o ograničenju visine cena derivata nafte),
# announced on Friday 30 October 2026 and in force until the next Friday's.
FUEL_REFERENCE: list[dict[str, Any]] = [
    {
        "valid_from": date(2026, 10, 30),
        "diesel": 236.0,
        "petrol": 207.0,
        "source": "Ministarstvo unutrašnje i spoljne trgovine: najviše maloprodajne cene, 30.10.2026.",
    },
]


def seed_fuel_prices(session: Session) -> int:
    """Put `FUEL_REFERENCE` in a table that has no price yet; commits."""
    if session.exec(select(FuelPrice)).first() is not None:
        return 0
    for row in FUEL_REFERENCE:
        session.add(FuelPrice(**row))
    session.commit()
    return len(FUEL_REFERENCE)


def prices(session: Session) -> list[FuelPrice]:
    """Every price, newest first."""
    return list(session.exec(select(FuelPrice).order_by(col(FuelPrice.valid_from).desc())))


def price_on(session: Session, day: date, fuel: str) -> float | None:
    """A litre of `fuel` on `day`: the newest price from on or before it,
    else the oldest one known (a ride from before the first price is
    reckoned in the first price, not left out)."""
    row = session.exec(
        select(FuelPrice).where(FuelPrice.valid_from <= day).order_by(col(FuelPrice.valid_from).desc())
    ).first()
    if row is None:
        row = session.exec(select(FuelPrice).order_by(FuelPrice.valid_from)).first()
    if row is None:
        return None
    return row.diesel if fuel == "diesel" else row.petrol


# --- Out of service ----------------------------------------------------------

def covers(block: CarBlock, day: date) -> bool:
    return block.start_date <= day and (block.end_date is None or day <= block.end_date)


def block_on(session: Session, car_id: int, day: date) -> CarBlock | None:
    """The block that keeps `car_id` off the road on `day`, if any."""
    stmt = select(CarBlock).where(CarBlock.car_id == car_id, CarBlock.start_date <= day)
    return next((b for b in session.exec(stmt) if covers(b, day)), None)


def blocks_from(session: Session, day: date, car_id: int | None = None) -> list[CarBlock]:
    """The blocks still running on or after `day`, soonest first."""
    stmt = select(CarBlock).where((col(CarBlock.end_date).is_(None)) | (col(CarBlock.end_date) >= day))
    if car_id is not None:
        stmt = stmt.where(CarBlock.car_id == car_id)
    return list(session.exec(stmt.order_by(CarBlock.start_date, CarBlock.id)))


def rides_in_block(session: Session, block: CarBlock, today: date) -> list[Ride]:
    """The rides already booked in the car on the block's days, from today on."""
    stmt = select(Ride).where(
        Ride.corporate_car_id == block.car_id,
        Ride.car_type == CarType.corporate,
        Ride.ride_date >= max(block.start_date, today),
    )
    if block.end_date is not None:
        stmt = stmt.where(Ride.ride_date <= block.end_date)
    return list(session.exec(stmt.order_by(Ride.ride_date, Ride.departure_time, Ride.id)))


# --- The garage's standing list ---------------------------------------------


def plate_standing(session: Session, plate: str) -> bool:
    """Whether the Beograd garage lets `plate` in for good (`GaragePlate`)."""
    from .models import GaragePlate

    return bool(plate) and session.exec(select(GaragePlate).where(GaragePlate.plate == plate)).first() is not None


# --- Paperwork and upkeep ----------------------------------------------------

DUE_SOON_DAYS = 30
REMIND_DAYS = (30, 7, 1, 0)
SERVICE_SOON_KM = 1000
SERVICE_REMIND_KM = (1000, 0)
TYRES = ("", "summer", "winter", "all_season")


def winter_season(day: date) -> bool:
    """1 November to 1 April: in Serbia a car must be fit for winter roads."""
    return day.month >= 11 or day.month < 4 or (day.month == 4 and day.day == 1)


def next_winter(day: date) -> date:
    return date(day.year, 11, 1)


@dataclass
class Due:
    kind: str  # registration | insurance | service | tyres
    level: str  # overdue | soon | ok
    on: date | None = None
    days_left: int | None = None
    km_left: int | None = None

    def as_dict(self) -> dict[str, Any]:
        return {"kind": self.kind, "level": self.level, "on": self.on, "days_left": self.days_left, "km_left": self.km_left}


def _date_level(days_left: int) -> str:
    return "overdue" if days_left < 0 else "soon" if days_left <= DUE_SOON_DAYS else "ok"


def due_items(car: CorporateCar, odometer: int | None, today: date) -> list[Due]:
    """What the car has coming, most pressing first: each date the admins
    set, the service by km against `odometer` (the car's state, a guess
    included), and summer tyres in or just before the winter season."""
    items: list[Due] = []
    for kind, on in (("registration", car.registration_until), ("insurance", car.insurance_until)):
        if on is not None:
            left = (on - today).days
            items.append(Due(kind, _date_level(left), on=on, days_left=left))
    if car.service_due_on is not None or car.service_due_km is not None:
        left_days = (car.service_due_on - today).days if car.service_due_on is not None else None
        left_km = car.service_due_km - odometer if car.service_due_km is not None and odometer is not None else None
        levels = []
        if left_days is not None:
            levels.append(_date_level(left_days))
        if left_km is not None:
            levels.append("overdue" if left_km < 0 else "soon" if left_km <= SERVICE_SOON_KM else "ok")
        level = "overdue" if "overdue" in levels else "soon" if "soon" in levels else "ok"
        items.append(Due("service", level, on=car.service_due_on, days_left=left_days, km_left=left_km))
    if car.tyres == "summer":
        if winter_season(today):
            items.append(Due("tyres", "overdue"))
        elif (next_winter(today) - today).days <= DUE_SOON_DAYS:
            left = (next_winter(today) - today).days
            items.append(Due("tyres", "soon", on=next_winter(today), days_left=left))
    order = {"overdue": 0, "soon": 1, "ok": 2}
    return sorted(items, key=lambda d: (order[d.level], d.days_left if d.days_left is not None else -1))


def _reminder_keys(item: Due, car: CorporateCar, today: date) -> list[str]:
    """The steps of `item` that are due by today, each a FleetNotice key."""
    keys: list[str] = []
    if item.kind == "tyres":
        if item.level == "overdue":
            season = today.year if today.month >= 11 else today.year - 1
            keys.append(f"tyres:{season}")
        return keys
    if item.days_left is not None and item.on is not None:
        for step in REMIND_DAYS:
            if item.days_left <= step:
                keys.append(f"{item.kind}:{item.on}:{step}")
    if item.kind == "service" and item.km_left is not None and car.service_due_km is not None:
        for step in SERVICE_REMIND_KM:
            if item.km_left <= step:
                keys.append(f"service_km:{car.service_due_km}:{step}")
    return keys


def send_fleet_reminders(session: Session, today: date | None = None) -> int:
    """Push the admins each step of each car's paperwork and upkeep once
    (`FleetNotice`); only the newest step that came due goes out, so a date
    set two days ahead is one push, not four. Returns how many went. The
    caller commits."""
    from .admin import admin_ids
    from .carstate import car_states
    from .push import notify
    from .services import corporate_car_label

    today = today or date.today()
    sent = 0
    admins = None
    for state in car_states(session):
        car: CorporateCar = state["car"]
        known = {n.key for n in session.exec(select(FleetNotice).where(FleetNotice.car_id == car.id))}
        for item in due_items(car, state["odometer"]["value"], today):
            fresh = [k for k in _reminder_keys(item, car, today) if k not in known]
            if not fresh:
                continue
            for key in fresh:
                session.add(FleetNotice(car_id=car.id, key=key))  # type: ignore[arg-type]
            if admins is None:
                admins = admin_ids(session)
            notify(
                session,
                admins,
                f"fleet_{item.kind}",
                url="/",
                body="",
                car=corporate_car_label(car),
                days=item.days_left,
                km=item.km_left,
            )
            sent += 1
    return sent


# --- Odometer gaps -----------------------------------------------------------


def odometer_gaps(rides: list[Ride]) -> dict[int, int]:
    """For each ride whose pickup reading does not carry on from the car's
    last return: the km in between (more: driven and not logged; fewer: a
    reading went back). `rides` are shared-car rides with their legs, any
    order; rides with no reading are skipped, as is the first one per car."""
    gaps: dict[int, int] = {}
    last_end: dict[int, int] = {}
    for ride in sorted(rides, key=lambda r: (r.ride_date, r.departure_time, r.id or 0)):
        if not ride.legs or ride.corporate_car_id is None:
            continue
        legs = sorted(ride.legs, key=lambda leg: (leg.start_km, leg.id or 0))
        start = legs[0].start_km
        end = legs[-1].end_km
        before = last_end.get(ride.corporate_car_id)
        if before is not None and start != before:
            gaps[ride.id] = start - before  # type: ignore[index]
        if end is not None:
            last_end[ride.corporate_car_id] = end
    return gaps


def shared_rides_until(session: Session, until: date) -> list[Ride]:
    """Every shared-car ride up to `until` with odometer readings, for the gaps."""
    from sqlalchemy.orm import selectinload

    stmt = (
        select(Ride)
        .where(Ride.car_type == CarType.corporate, Ride.ride_date <= until)
        .options(selectinload(Ride.legs))  # type: ignore[arg-type]
    )
    return [r for r in session.exec(stmt) if r.legs]


# --- Costs -------------------------------------------------------------------

COST_KINDS = ("fuel", "charging", "toll", "parking", "wash", "service", "other")


def costs_between(session: Session, start: date, end: date) -> list[CarCost]:
    stmt = select(CarCost).where(CarCost.day >= start, CarCost.day <= end)
    return list(session.exec(stmt.order_by(col(CarCost.day).desc(), col(CarCost.id).desc())))


def logged_km(rides: list[Ride]) -> dict[int, int]:
    """The km each car's odometer shows driven over `rides` (closed legs only)."""
    km: dict[int, int] = {}
    for ride in rides:
        if ride.corporate_car_id is None:
            continue
        for leg in ride.legs:
            if leg.end_km is not None:
                km[ride.corporate_car_id] = km.get(ride.corporate_car_id, 0) + leg.end_km - leg.start_km
    return km


def fleet_overview(session: Session, start: date, end: date) -> dict[str, Any]:
    """Per pool car over `start`..`end`: what was spent by kind, the km its
    odometer logged, the km nobody logged between rides, and dinars a km."""
    cars = list(session.exec(select(CorporateCar).order_by(col(CorporateCar.active).desc(), CorporateCar.name)))
    costs = costs_between(session, start, end)
    rides = shared_rides_until(session, end)
    in_window = [r for r in rides if r.ride_date >= start]
    km = logged_km(in_window)
    gaps = odometer_gaps(rides)
    out = []
    for car in cars:
        mine = [c for c in costs if c.car_id == car.id]
        by_kind: dict[str, float] = {}
        for c in mine:
            by_kind[c.kind] = round(by_kind.get(c.kind, 0) + c.amount, 2)
        total = round(sum(c.amount for c in mine), 2)
        driven = km.get(car.id, 0)  # type: ignore[arg-type]
        unlogged = sum(gaps.get(r.id, 0) for r in in_window if r.corporate_car_id == car.id and gaps.get(r.id, 0) > 0)  # type: ignore[arg-type]
        if not mine and not driven and not car.active:
            continue
        out.append(
            {
                "car_id": car.id,
                "car": car.name,
                "plate": car.plate,
                "total": total,
                "by_kind": by_kind,
                "km": driven,
                "unlogged_km": unlogged,
                "per_km": round(total / driven, 2) if driven else None,
            }
        )
    return {"from": start, "to": end, "cars": out}


# --- The month summary -------------------------------------------------------


def month_bounds(month: str) -> tuple[date, date]:
    """`YYYY-MM` to its first and last day; ValueError when it is not one."""
    year, mon = (int(x) for x in month.split("-"))
    return date(year, mon, 1), date(year, mon, monthrange(year, mon)[1])


def _who(user_id: int | None, name: str) -> tuple[Any, ...]:
    from .services import norm_name

    return ("id", user_id) if user_id is not None else ("name", norm_name(name))


def month_summary(session: Session, month: str, today: date | None = None) -> dict[str, Any]:
    """Who went how far in `month` (up to today), per person:

    - shared car: rides they booked and the km they drove (the odometer's
      stretches at the wheel where there are any, else the ride's length),
    - own car: rides they drove and their km, which the allowance is
      reckoned on (`ALLOWANCE_SHARE` of a litre of `allowance_fuel` at that
      day's official price, a km), with whether it passes `allowance_cap`,
    - as a passenger: rides and the one-way km.

    Pending rides and ones nobody drove (`needs_driver`) are left out."""
    from sqlalchemy.orm import selectinload

    start, end = month_bounds(month)
    today = today or date.today()
    last = min(end, today)
    fuel = setting(session, "allowance_fuel")
    cap = setting(session, "allowance_cap")
    rides = []
    if last >= start:
        stmt = (
            select(Ride)
            .where(Ride.ride_date >= start, Ride.ride_date <= last)
            .options(selectinload(Ride.bookings), selectinload(Ride.legs))  # type: ignore[arg-type]
            .order_by(Ride.ride_date, Ride.departure_time, Ride.id)
        )
        rides = [r for r in session.exec(stmt) if r.approval != "pending" and not r.needs_driver]
    users = {u.id: u for u in session.exec(select(User))}
    people: dict[tuple[Any, ...], dict[str, Any]] = {}

    def row(user_id: int | None, name: str) -> dict[str, Any]:
        key = _who(user_id, name)
        if key not in people:
            user = users.get(user_id) if user_id is not None else None
            people[key] = {
                "user_id": user_id,
                "name": user.display_name if user else name,
                "department": user.department if user else "",
                "shared_rides": 0,
                "shared_km": 0.0,
                "own_rides": 0,
                "own_km": 0.0,
                "passenger_rides": 0,
                "passenger_km": 0.0,
                "allowance": 0.0,
            }
        return people[key]

    for ride in rides:
        length = ride_km(ride.origin, ride.destination, ride.distance_km, ride.return_time is not None)
        if ride.car_type == CarType.corporate:
            driver = row(ride.driver_id, ride.driver_name)
            driver["shared_rides"] += 1
            closed = [leg for leg in ride.legs if leg.end_km is not None]
            if closed:
                for leg in closed:
                    at_wheel = row(leg.driver_id, leg.driver_name)
                    at_wheel["shared_km"] += leg.end_km - leg.start_km  # type: ignore[operator]
            elif length is not None:
                driver["shared_km"] += length
        else:
            driver = row(ride.driver_id, ride.driver_name)
            driver["own_rides"] += 1
            if length is not None:
                driver["own_km"] += length
                price = price_on(session, ride.ride_date, fuel)
                if price is not None:
                    driver["allowance"] += length * ALLOWANCE_SHARE * price
        one_way = ride.distance_km or 0
        for booking in ride.bookings:
            passenger = row(booking.passenger_id, booking.passenger_name)
            passenger["passenger_rides"] += 1
            passenger["passenger_km"] += one_way

    out = []
    for p in people.values():
        for key in ("shared_km", "own_km", "passenger_km"):
            p[key] = round(p[key], 1)
        p["allowance"] = round(p["allowance"])
        p["over_cap"] = bool(cap) and p["allowance"] > cap
        out.append(p)
    out.sort(key=lambda p: (p["department"].lower() or "￿", p["name"].lower()))
    price = price_on(session, last if last >= start else start, fuel)
    return {
        "month": month,
        "from": start,
        "to": end,
        "fuel": fuel,
        "fuel_price": price,
        "allowance_share": ALLOWANCE_SHARE,
        "allowance_cap": cap,
        "people": out,
    }


def fuel_cost(session: Session, litres: float, day: date | None = None) -> float | None:
    """What `litres` of the allowance fuel cost at the official price."""
    price = price_on(session, day or date.today(), setting(session, "allowance_fuel"))
    return round(litres * price) if price is not None else None


_last_fleet_check: date | None = None


def daily_fleet_check(session: Session, now: datetime | None = None) -> int:
    """`send_fleet_reminders` once a day per process, from 8 in the morning
    (a push at 3 a.m. is a push nobody reads). The reminder loop calls it
    every tick."""
    global _last_fleet_check
    now = now or datetime.now()
    if now.hour < 8 or _last_fleet_check == now.date():
        return 0
    _last_fleet_check = now.date()
    return send_fleet_reminders(session, now.date())


def reset_daily_check() -> None:
    """For tests."""
    global _last_fleet_check
    _last_fleet_check = None

