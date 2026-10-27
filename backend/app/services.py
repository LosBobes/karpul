"""Business rules shared by routers."""

import secrets
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import object_session, selectinload
from sqlmodel import Session, func, or_, select

from .models import Booking, CarType, CorporateCar, PushSubscription, Ride, RideMessage, RideRequest, User, WaitlistEntry


def new_calendar_token() -> str:
    return secrets.token_urlsafe(24)


def norm_name(name: str) -> str:
    """Whitespace-collapsed, casefolded: how two names are compared everywhere
    (the frontend mirrors it as `sameName` in lib/dates.ts)."""
    return " ".join(name.split()).casefold()


def fold_name(name: str) -> str:
    """`norm_name` with the diacritics dropped: "Blažić" and "Blazic" are one
    name here (the frontend mirrors it in `similarName`, lib/dates.ts)."""
    plain = unicodedata.normalize("NFKD", norm_name(name).replace("đ", "dj"))
    return "".join(c for c in plain if not unicodedata.combining(c))


def _edit_distance(a: str, b: str) -> int:
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, cb in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (ca != cb))
    return row[-1]


# How alike two folded names must be, 1 - edits / longer length, to count as
# one person typed two ways ("Nikola Stevic" and "Nikola Stević", "Pavle
# Cicmil" and "Pavle Čičmil", a dropped letter). Two colleagues who share only
# a first name stay well below it.
SIMILAR_NAME = 0.8


def similar_names(a: str, b: str) -> bool:
    """Could these two names be the same person? Diacritics, case, spacing and
    the order of the words aside, they may differ by about one letter in five
    (`SIMILAR_NAME`). Mirrored by `similarName` in lib/dates.ts; keep both in step."""
    fa, fb = fold_name(a), fold_name(b)
    if not fa or not fb:
        return False
    variants = (fb, " ".join(sorted(fb.split())))
    fa_sorted = " ".join(sorted(fa.split()))
    for x in (fa, fa_sorted):
        for y in variants:
            if 1 - _edit_distance(x, y) / max(len(x), len(y)) >= SIMILAR_NAME:
                return True
    return False


def stops_from_text(text: str) -> list[str]:
    """`Ride.stops` is one pickup point per line; the API shows a list."""
    return [line for line in text.split("\n") if line]


def stops_to_text(stops: list[str]) -> str:
    return "\n".join(stops)


def is_person(user: User, person_id: int | None, name: str) -> bool:
    """Is this row (a driver, a passenger) `user`? By account where the row has
    one; a row from before accounts that was never linked has only its name,
    compared the way names always were."""
    if person_id is not None:
        return person_id == user.id
    return norm_name(name) == user.name_key


def account_for_name(session: Session, name: str) -> User | None:
    return session.exec(select(User).where(User.name_key == norm_name(name))).first()


@dataclass
class BoardExtras:
    """What a `RideRead` adds to the row, fetched once for a whole list:
    the drivers' mobile numbers and how many messages each ride has."""

    phones: dict[int, str] = field(default_factory=dict)
    message_counts: dict[int, int] = field(default_factory=dict)


def board_extras(session: Session, rides: list[Ride]) -> BoardExtras:
    """Two queries for any number of rides. A driver without an account or
    without a number is absent from `phones`."""
    extras = BoardExtras()
    driver_ids = {r.driver_id for r in rides if r.driver_id is not None}
    if driver_ids:
        rows = session.exec(
            select(User.id, User.phone).where(User.id.in_(driver_ids), User.phone.is_not(None))  # type: ignore[union-attr]
        ).all()
        extras.phones = {uid: phone for uid, phone in rows}
    ride_ids = [r.id for r in rides]
    if ride_ids:
        rows = session.exec(
            select(RideMessage.ride_id, func.count())
            .where(RideMessage.ride_id.in_(ride_ids))  # type: ignore[attr-defined]
            .group_by(RideMessage.ride_id)
        ).all()
        extras.message_counts = {rid: n for rid, n in rows}
    return extras


def to_ride_read_dict(ride: Ride, extras: BoardExtras | None = None) -> dict:
    """`extras` is `board_extras` for a whole list; without it they are looked
    up for this ride alone on the ride's own session."""
    if extras is None:
        session = object_session(ride)
        extras = board_extras(session, [ride]) if session is not None else BoardExtras()  # type: ignore[arg-type]
    data = ride.model_dump()
    data["stops"] = stops_from_text(ride.stops)
    data["driver_phone"] = extras.phones.get(ride.driver_id) if ride.driver_id is not None else None
    data["bookings"] = ride.bookings
    data["waitlist"] = ride.waitlist
    data["message_count"] = extras.message_counts.get(ride.id, 0)  # type: ignore[arg-type]
    data["free_seats"] = max(ride.seats - len(ride.bookings), 0)
    data["legs"] = ride.legs
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


def rename_person(session: Session, user: User, new_name: str) -> list[Ride]:
    """Carry a renamed account's new name onto every row that shows it.

    Rides, seats, waiting places, messages and requests point at the account
    (`driver_id`, `passenger_id`, ...), so who is who never depends on the
    name; but each also keeps the name as it is shown on the board, and those
    have to follow or colleagues would see the old one. Returns the rides
    whose rows changed, so the caller can publish them after committing.
    """
    touched: dict[int, Ride] = {}

    def touch(ride_id: int) -> None:
        ride = session.get(Ride, ride_id)
        if ride is not None:
            touched[ride_id] = ride

    for ride in session.exec(select(Ride).where(Ride.driver_id == user.id)).all():
        if ride.driver_name != new_name:
            ride.driver_name = new_name
            session.add(ride)
            touch(ride.id)  # type: ignore[arg-type]
    for booking in session.exec(select(Booking).where(Booking.passenger_id == user.id)).all():
        if booking.passenger_name != new_name:
            booking.passenger_name = new_name
            session.add(booking)
            touch(booking.ride_id)
    for entry in session.exec(select(WaitlistEntry).where(WaitlistEntry.user_id == user.id)).all():
        if entry.name != new_name:
            entry.name = new_name
            session.add(entry)
            touch(entry.ride_id)
    for message in session.exec(select(RideMessage).where(RideMessage.author_id == user.id)).all():
        message.author_name = new_name
        session.add(message)
    for request in session.exec(select(RideRequest).where(RideRequest.user_id == user.id)).all():
        request.name = new_name
        session.add(request)
    for sub in session.exec(select(PushSubscription).where(PushSubscription.user_id == user.id)).all():
        sub.user_name = norm_name(new_name)
        session.add(sub)
    return list(touched.values())


def claim_rows(session: Session, user: User) -> list[Ride]:
    """A new account takes over the rows that already go by its name and
    belong to nobody: rides and seats from before accounts, or a seat a driver
    gave this colleague by name before they registered. `User.name_key` is
    unique, so nobody else can answer to that name. Returns the rides touched."""
    touched: dict[int, Ride] = {}
    for ride in session.exec(select(Ride).where(Ride.driver_id.is_(None))).all():  # type: ignore[union-attr]
        if norm_name(ride.driver_name) == user.name_key:
            ride.driver_id = user.id
            session.add(ride)
            touched[ride.id] = ride  # type: ignore[index]
    for booking in session.exec(select(Booking).where(Booking.passenger_id.is_(None))).all():  # type: ignore[union-attr]
        if norm_name(booking.passenger_name) == user.name_key:
            booking.passenger_id = user.id
            session.add(booking)
            ride = session.get(Ride, booking.ride_id)
            if ride is not None:
                touched[ride.id] = ride  # type: ignore[index]
    return list(touched.values())


def claim_driver_rides(session: Session, user: User, name: str) -> list[Ride]:
    """Make `user` the driver of every ride that goes by `name` and belongs to
    no account (the shared car's paper log, a ride from before accounts), with
    their stretches at the wheel, under the account's own name. A ride they sit
    in as a passenger is left alone: nobody drives their own seat. Returns the
    rides it changed."""
    key = norm_name(name)
    claimed = []
    for ride in session.exec(select(Ride).where(Ride.driver_id.is_(None))).all():  # type: ignore[union-attr]
        if norm_name(ride.driver_name) != key or any(is_person(user, b.passenger_id, b.passenger_name) for b in ride.bookings):
            continue
        ride.driver_id = user.id
        ride.driver_name = user.display_name
        for leg in ride.legs:
            if leg.driver_id is None and norm_name(leg.driver_name) == key:
                leg.driver_id = user.id
                leg.driver_name = user.display_name
                session.add(leg)
        session.add(ride)
        claimed.append(ride)
    return claimed


def seated_elsewhere(session: Session, user_id: int, ride_date: date, exclude_ride_id: int | None) -> bool:
    """Is this person already driving, or sitting in, another car that day?"""
    driving = session.exec(
        select(Ride.id).where(Ride.ride_date == ride_date, Ride.driver_id == user_id, Ride.id != exclude_ride_id)
    ).first()
    if driving is not None:
        return True
    riding = session.exec(
        select(Booking.id)
        .join(Ride, Ride.id == Booking.ride_id)  # type: ignore[arg-type]
        .where(Ride.ride_date == ride_date, Booking.passenger_id == user_id, Ride.id != exclude_ride_id)
    ).first()
    return riding is not None


def leave_waitlists_that_day(session: Session, user_id: int, ride_date: date) -> list[Ride]:
    """Someone who got a seat stops waiting for one in the cars that day.
    Returns the rides whose queue changed."""
    entries = session.exec(
        select(WaitlistEntry)
        .join(Ride, Ride.id == WaitlistEntry.ride_id)  # type: ignore[arg-type]
        .where(WaitlistEntry.user_id == user_id, Ride.ride_date == ride_date)
    ).all()
    rides = []
    for entry in entries:
        ride = entry.ride
        ride.waitlist.remove(entry)
        session.delete(entry)
        rides.append(ride)
    return rides


def promote_waitlist(session: Session, ride: Ride) -> list[Booking]:
    """Fill the ride's free seats from its queue, first come first served.

    Someone at the head of the queue who meanwhile drives, or sits in, this
    ride or another car that day has found their way and is dropped instead.
    A pickup point the driver has since removed falls back to the origin.
    Returns the new bookings (flushed, so they have ids); the caller commits
    and tells the people in them.
    """
    promoted: list[Booking] = []
    stops = {norm_name(s): s for s in stops_from_text(ride.stops)}
    while ride.waitlist and len(ride.bookings) < ride.seats:
        entry = ride.waitlist[0]
        ride.waitlist.remove(entry)
        session.delete(entry)
        if entry.user_id == ride.driver_id or any(b.passenger_id == entry.user_id for b in ride.bookings):
            continue
        if seated_elsewhere(session, entry.user_id, ride.ride_date, ride.id):
            continue
        booking = Booking(
            ride_id=ride.id,  # type: ignore[arg-type]
            passenger_id=entry.user_id,
            passenger_name=entry.name,
            pickup=stops.get(norm_name(entry.pickup), "") if entry.pickup else "",
        )
        ride.bookings.append(booking)
        promoted.append(booking)
    session.flush()
    return promoted


def resolve_corporate_car(session: Session, car_id: int) -> CorporateCar:
    car = session.get(CorporateCar, car_id)
    if car is None or not car.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Corporate car not found")
    return car


# A shared car is rationed per driver: this many rides a week (Mon to Sun) and
# a day, pending and approved ones counted. Past that an admin has to approve.
SHARED_CAR_PER_WEEK = 1
SHARED_CAR_PER_DAY = 1
LIMIT_WEEK = "You already have a shared car this week. An admin can approve another"
LIMIT_DAY = "You already have a shared car that day. An admin can approve another"
# Nor may a driver's shared-car rides join up into one stretch longer than this
# (a ride left with no return holds the car to midnight, and the next day's
# ride from 00:00 carries straight on). Rides are same-day, so one ride alone
# is at most 24 hours: it takes two that meet.
SHARED_CAR_MAX_STRETCH = timedelta(hours=24)
LIMIT_STRETCH = "That keeps a shared car with you for more than 24 hours in a row. An admin can approve it"


def shared_car_use(session: Session, driver_id: int, day: date, exclude_ride_id: int | None = None) -> tuple[int, int]:
    """How many shared-car rides the driver already has in `day`'s week and on
    `day` itself, whatever their approval."""
    monday = day - timedelta(days=day.weekday())
    stmt = select(Ride.ride_date).where(
        Ride.driver_id == driver_id,
        Ride.car_type == CarType.corporate,
        Ride.ride_date >= monday,
        Ride.ride_date <= monday + timedelta(days=6),
    )
    if exclude_ride_id is not None:
        stmt = stmt.where(Ride.id != exclude_ride_id)
    dates = list(session.exec(stmt))
    return len(dates), sum(1 for d in dates if d == day)


def _span(day: date, departure: time, return_time: time | None) -> tuple[datetime, datetime]:
    """When a ride holds its car: from departure to its return, or to midnight
    without one (as `ensure_car_available` reads it)."""
    start = datetime.combine(day, departure)
    end = datetime.combine(day, return_time) if return_time else datetime.combine(day + timedelta(days=1), time())
    return start, end


def shared_car_stretch(
    session: Session, driver_id: int, day: date, departure: time, return_time: time | None, exclude_ride_id: int | None = None
) -> timedelta:
    """How long the driver would have a shared car without a break, counting
    this ride and every shared-car ride of theirs that meets or overlaps it,
    one after another, whatever its approval and whichever car it is in.

    The day either side is all it needs to look at: a chain reaching further
    covers a whole neighbouring day, which is already past 24 hours.
    """
    stmt = select(Ride).where(
        Ride.driver_id == driver_id,
        Ride.car_type == CarType.corporate,
        Ride.ride_date >= day - timedelta(days=1),
        Ride.ride_date <= day + timedelta(days=1),
    )
    if exclude_ride_id is not None:
        stmt = stmt.where(Ride.id != exclude_ride_id)
    others = sorted(_span(r.ride_date, r.departure_time, r.return_time) for r in session.exec(stmt))
    start, end = _span(day, departure, return_time)
    grown = True
    while grown:
        grown = False
        for a, b in others:
            if a <= end and start <= b and (a < start or b > end):
                start, end, grown = min(start, a), max(end, b), True
    return end - start


def over_shared_car_share(
    session: Session,
    driver_id: int,
    day: date,
    departure: time,
    return_time: time | None,
    exclude_ride_id: int | None = None,
) -> str | None:
    """The reason a shared-car ride on `day` is past the driver's share, or
    None while it is within it. The day's text wins, being the nearer one."""
    week, same_day = shared_car_use(session, driver_id, day, exclude_ride_id)
    if same_day >= SHARED_CAR_PER_DAY:
        return LIMIT_DAY
    if week >= SHARED_CAR_PER_WEEK:
        return LIMIT_WEEK
    if shared_car_stretch(session, driver_id, day, departure, return_time, exclude_ride_id) > SHARED_CAR_MAX_STRETCH:
        return LIMIT_STRETCH
    return None


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
        # A ride waiting for an admin holds nothing yet: the slot is free until
        # it is approved, and approving checks it again (routers/rides.approve_ride).
        if other.id == exclude_ride_id or other.approval == "pending":
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


def rides_of(session: Session, user: User, start: date, end: date) -> list[Ride]:
    """Every ride `user` drives or sits in between `start` and `end`, in board order."""
    seated = select(Booking.ride_id).where(Booking.passenger_id == user.id)
    stmt = (
        select(Ride)
        .where(
            Ride.ride_date >= start,
            Ride.ride_date <= end,
            or_(Ride.driver_id == user.id, Ride.id.in_(seated)),  # type: ignore[union-attr,arg-type]
        )
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


def person_stats(session: Session, user: User, today: date | None = None) -> dict:
    """What `user` has shared: rides driven and ridden, people carried and the
    kilometres driven together, this month and all time, plus the past rides.

    "km shared" is the one-way distance of every ride the person was in,
    driver or passenger (the drivers set the distance; rides without one count
    as 0). A return ride is not doubled: the figure is a floor, not a claim.
    """
    today = today or date.today()
    rides = rides_of(session, user, date(2000, 1, 1), today)
    month_start = today.replace(day=1)

    def bucket(subset: list[Ride]) -> dict:
        driven = [r for r in subset if r.driver_id == user.id]
        ridden = [r for r in subset if r.driver_id != user.id]
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
            "role": "driver" if r.driver_id == user.id else "passenger",
            "passengers": len(r.bookings),
            "distance_km": r.distance_km,
        }
        for r in reversed(rides)
    ]
    return {"month": bucket([r for r in rides if r.ride_date >= month_start]), "all": bucket(rides), "history": history[:100]}


def corporate_usage(session: Session, days: int, today: date | None = None, history_limit: int | None = 200) -> dict:
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
                "drivers": len({r.driver_id or norm_name(r.driver_name) for r in rides}),
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
        "history": history[:history_limit] if history_limit is not None else history,
    }
