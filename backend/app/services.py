"""Business rules shared by routers."""

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from urllib.parse import unquote

from fastapi import HTTPException, status
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from .models import Booking, CarType, CorporateCar, Ride


def user_from_header(value: str | None) -> str | None:
    """`X-User-Name` as the app sends it: percent-encoded, because an HTTP
    header cannot carry a ć or a š as such (fetch refuses anything past
    Latin-1). A plain name comes through unchanged."""
    if value is None:
        return None
    return unquote(value).strip() or None


def norm_name(name: str) -> str:
    """Whitespace-collapsed, casefolded: how two names are compared everywhere
    (the frontend mirrors it as `sameName` in lib/dates.ts)."""
    return " ".join(name.split()).casefold()


def stops_from_text(text: str) -> list[str]:
    """`Ride.stops` is one pickup point per line; the API shows a list."""
    return [line for line in text.split("\n") if line]


def stops_to_text(stops: list[str]) -> str:
    return "\n".join(stops)


def to_ride_read_dict(ride: Ride) -> dict:
    data = ride.model_dump()
    data["stops"] = stops_from_text(ride.stops)
    data["bookings"] = ride.bookings
    data["free_seats"] = max(ride.seats - len(ride.bookings), 0)
    return data


def ride_to_create_dict(ride: Ride) -> dict:
    """The stored ride as a `RideCreate` payload, for PATCH to merge onto."""
    data = ride.model_dump()
    data["stops"] = stops_from_text(ride.stops)
    return data


def weekly_dates(first: date, until: date | None) -> list[date]:
    """`first`, then every seventh day up to and including `until`."""
    if until is None:
        return [first]
    out = []
    d = first
    while d <= until:
        out.append(d)
        d += timedelta(days=7)
    return out


def pickup_or_422(ride: Ride, pickup: str) -> str:
    """"" is the origin; anything else has to be one of the ride's stops."""
    if not pickup or norm_name(pickup) == norm_name(ride.origin):
        return ""
    for stop in stops_from_text(ride.stops):
        if norm_name(stop) == norm_name(pickup):
            return stop
    raise HTTPException(422, "Pickup must be the ride's origin or one of its stops")


def drop_orphaned_pickups(ride: Ride) -> None:
    """After the driver edits the stops, a passenger waiting at a stop that no
    longer exists is moved back to the origin."""
    stops = {norm_name(s) for s in stops_from_text(ride.stops)}
    for b in ride.bookings:
        if b.pickup and norm_name(b.pickup) not in stops:
            b.pickup = ""


def _overlaps(a_start: time, a_end: time | None, b_start: time, b_end: time | None) -> bool:
    """Two rides on the same day overlap if their [departure, return) windows intersect.

    The windows are half-open on purpose: the same car may be handed over back to
    back within a day, so a ride returning at 12:00 does not block one leaving at
    12:00. A ride without a return time has no handover point and is treated as
    occupying the car until end of day.
    """
    a_end = a_end or time.max
    b_end = b_end or time.max
    return a_start < b_end and b_start < a_end


def corporate_car_label(car: CorporateCar) -> str:
    """How a pool car is written on a ride row: `Mazda 6e (BG-123-XY)`."""
    return f"{car.name} ({car.plate})"


def relabel_rides_for_car(session: Session, car: CorporateCar) -> int:
    """Push a renamed / re-plated car out to the rides that already reference it.

    `Ride.car_name` is a denormalised label, so without this an admin rename
    leaves the board showing the old name and plate on every existing ride.
    Returns the number of rides touched; the caller commits.
    """
    label = corporate_car_label(car)
    stmt = select(Ride).where(
        Ride.corporate_car_id == car.id,
        Ride.car_type == CarType.corporate,
        Ride.car_name != label,
    )
    stale = list(session.exec(stmt))
    for ride in stale:
        ride.car_name = label
        session.add(ride)
    return len(stale)


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


# --- History and figures ---------------------------------------------------


def _rides_between(session: Session, start: date, end: date) -> list[Ride]:
    stmt = (
        select(Ride)
        .where(Ride.ride_date >= start, Ride.ride_date <= end)
        .options(selectinload(Ride.bookings))  # type: ignore[arg-type]
        .order_by(Ride.ride_date, Ride.departure_time, Ride.id)
    )
    return list(session.exec(stmt).all())


def _working_days(start: date, end: date) -> int:
    n = 0
    d = start
    while d <= end:
        if d.weekday() < 5:
            n += 1
        d += timedelta(days=1)
    return n


def person_stats(session: Session, name: str, today: date | None = None) -> dict:
    """What `name` has shared: rides driven and ridden, people carried and the
    kilometres driven together, this month and all time, plus the past rides.

    "km shared" is the one-way distance of every ride the person was in,
    driver or passenger (the drivers set the distance; rides without one count
    as 0). A return ride is not doubled: the figure is a floor, not a claim.
    """
    today = today or date.today()
    who = norm_name(name)
    start = date(2000, 1, 1)
    rides = [
        r
        for r in _rides_between(session, start, today)
        if norm_name(r.driver_name) == who or any(norm_name(b.passenger_name) == who for b in r.bookings)
    ]
    month_start = today.replace(day=1)

    def bucket(subset: list[Ride]) -> dict:
        driven = [r for r in subset if norm_name(r.driver_name) == who]
        ridden = [r for r in subset if norm_name(r.driver_name) != who]
        return {
            "rides_driven": len(driven),
            "rides_ridden": len(ridden),
            "people_carried": sum(len(r.bookings) for r in driven),
            "km_shared": round(sum(r.distance_km or 0 for r in subset), 1),
        }

    history = [
        {
            "id": r.id,
            "ride_date": r.ride_date,
            "departure_time": r.departure_time,
            "driver_name": r.driver_name,
            "car_name": r.car_name,
            "origin": r.origin,
            "destination": r.destination,
            "role": "driver" if norm_name(r.driver_name) == who else "passenger",
            "passengers": len(r.bookings),
            "distance_km": r.distance_km,
        }
        for r in reversed(rides)
    ]
    return {"month": bucket([r for r in rides if r.ride_date >= month_start]), "all": bucket(rides), "history": history[:100]}


def corporate_usage(session: Session, days: int, today: date | None = None) -> dict:
    """How the pool cars were used over the last `days` days (today included):
    per car the rides, the days it went out, the drivers and passengers, the
    kilometres, when it last went out, what is booked ahead, and its use rate
    (days out over working days in the window). Plus the recent rides as history.
    """
    today = today or date.today()
    start = today - timedelta(days=days - 1)
    working = max(_working_days(start, today), 1)
    cars = list(session.exec(select(CorporateCar).order_by(CorporateCar.name)).all())
    past = [r for r in _rides_between(session, start, today) if r.car_type == CarType.corporate]
    ahead = [
        r
        for r in _rides_between(session, today + timedelta(days=1), today + timedelta(days=92))
        if r.car_type == CarType.corporate
    ]
    by_car: dict[int | None, list[Ride]] = defaultdict(list)
    for r in past:
        by_car[r.corporate_car_id].append(r)
    ahead_by_car: dict[int | None, int] = defaultdict(int)
    for r in ahead:
        ahead_by_car[r.corporate_car_id] += 1

    rows = []
    for car in cars:
        rides = by_car.get(car.id, [])
        days_used = len({r.ride_date for r in rides})
        rows.append(
            {
                "car": {"id": car.id, "name": car.name, "plate": car.plate, "passenger_seats": car.passenger_seats, "active": car.active},
                "rides": len(rides),
                "days_used": days_used,
                "use_rate": round(days_used / working, 3),
                "drivers": len({norm_name(r.driver_name) for r in rides}),
                "passengers": sum(len(r.bookings) for r in rides),
                "seats_offered": sum(r.seats for r in rides),
                "km": round(sum(r.distance_km or 0 for r in rides), 1),
                "last_used": max((r.ride_date for r in rides), default=None),
                "upcoming": ahead_by_car.get(car.id, 0),
            }
        )
    history = [
        {
            "id": r.id,
            "ride_date": r.ride_date,
            "departure_time": r.departure_time,
            "return_time": r.return_time,
            "car_id": r.corporate_car_id,
            "car_name": r.car_name,
            "driver_name": r.driver_name,
            "origin": r.origin,
            "destination": r.destination,
            "passengers": len(r.bookings),
            "seats": r.seats,
            "distance_km": r.distance_km,
        }
        for r in reversed(past)
    ]
    return {
        "from": start,
        "to": today,
        "working_days": working,
        "cars": rows,
        "totals": {
            "rides": len(past),
            "passengers": sum(len(r.bookings) for r in past),
            "km": round(sum(r.distance_km or 0 for r in past), 1),
            "days_used": len({r.ride_date for r in past}),
        },
        "history": history[:200],
    }
