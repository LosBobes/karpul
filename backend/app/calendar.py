"""Rides as iCalendar: one `.ics` per ride ("Add to calendar") and a feed per
person that a phone's calendar app can subscribe to.

Times are written as floating local times (no TZID, no Z): a commute leaves
at 07:30 wherever the calendar is read, and the server has no idea of the
user's zone anyway. Lines are folded at 75 octets and text is escaped as
RFC 5545 asks.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlmodel import Session

from .models import Ride, User
from .services import all_stops, rides_of

PRODID = "-//Karpul//Karpul rides//EN"


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", r"\;").replace(",", "\\,").replace("\n", "\\n")


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
    stops = all_stops(ride)
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


def person_ics(session: Session, user: User, today: date | None = None) -> str:
    """Every ride `user` drives or rides in, from a week back to a year ahead."""
    today = today or date.today()
    rides = rides_of(session, user, today - timedelta(days=7), today + timedelta(days=365))
    return _calendar(f"Karpul: {user.display_name}", [ride_event(r) for r in rides])
