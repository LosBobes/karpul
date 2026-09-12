"""Rides as iCalendar: one `.ics` per ride ("Add to calendar") and a feed per
person that a phone's calendar app can subscribe to.

Times are written as floating local times (no TZID, no Z): a commute leaves
at 07:30 wherever the calendar is read, and the server has no idea of the
user's zone anyway. Lines are folded at 75 octets and text is escaped as
RFC 5545 asks.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from .models import Ride
from .services import norm_name, stops_from_text

PRODID = "-//Karpul//Karpul rides//EN"


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> str:
    out = []
    raw = line.encode("utf-8")
    while len(raw) > 75:
        cut = 75
        # Do not split a multi-byte character.
        while cut > 0 and (raw[cut] & 0xC0) == 0x80:
            cut -= 1
        out.append(raw[:cut].decode("utf-8"))
        raw = b" " + raw[cut:]
    out.append(raw.decode("utf-8"))
    return "\r\n".join(out)


def _dt(d: date, t) -> str:
    return datetime.combine(d, t).strftime("%Y%m%dT%H%M%S")


def ride_event(ride: Ride, now: datetime | None = None) -> list[str]:
    now = now or datetime.utcnow()
    end = ride.return_time or (datetime.combine(ride.ride_date, ride.departure_time) + timedelta(hours=1)).time()
    if ride.return_time is None and end < ride.departure_time:
        # A departure after 23:00 with no return: end the event at midnight.
        end = datetime.strptime("23:59:59", "%H:%M:%S").time()
    people = ", ".join(b.passenger_name for b in ride.bookings) or "nobody yet"
    stops = stops_from_text(ride.stops)
    description = f"Driver: {ride.driver_name}\nCar: {ride.car_name}\nPassengers: {people}"
    if stops:
        description += "\nPickup points: " + ", ".join(stops)
    if ride.chip_in:
        description += f"\nChip in: {ride.chip_in}"
    if ride.notes:
        description += f"\n{ride.notes}"
    return [
        "BEGIN:VEVENT",
        f"UID:karpul-ride-{ride.id}@karpul",
        f"DTSTAMP:{now.strftime('%Y%m%dT%H%M%SZ')}",
        f"DTSTART:{_dt(ride.ride_date, ride.departure_time)}",
        f"DTEND:{_dt(ride.ride_date, end)}",
        f"SUMMARY:{_escape(f'Karpul: {ride.origin} to {ride.destination} ({ride.driver_name})')}",
        f"LOCATION:{_escape(ride.origin)}",
        f"DESCRIPTION:{_escape(description)}",
        f"URL:/ride/{ride.id}",
        "END:VEVENT",
    ]


def _calendar(name: str, events: list[list[str]]) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape(name)}",
    ]
    for ev in events:
        lines += ev
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"


def ride_ics(ride: Ride) -> str:
    return _calendar("Karpul", [ride_event(ride)])


def person_ics(session: Session, name: str, today: date | None = None) -> str:
    """Every ride `name` drives or rides in, from a week back to a year ahead."""
    today = today or date.today()
    who = norm_name(name)
    stmt = (
        select(Ride)
        .where(Ride.ride_date >= today - timedelta(days=7), Ride.ride_date <= today + timedelta(days=365))
        .options(selectinload(Ride.bookings))  # type: ignore[arg-type]
        .order_by(Ride.ride_date, Ride.departure_time, Ride.id)
    )
    rides = [
        r
        for r in session.exec(stmt)
        if norm_name(r.driver_name) == who or any(norm_name(b.passenger_name) == who for b in r.bookings)
    ]
    return _calendar(f"Karpul: {name}", [ride_event(r) for r in rides])
