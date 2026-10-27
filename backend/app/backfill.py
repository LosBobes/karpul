"""One-time backfill: the shared Mazda's paper log, August to December 2026.

    docker compose exec -T app python -m app.backfill           # dry run: prints what it would do
    docker compose exec -T app python -m app.backfill --apply   # writes it

(`make backfill` / `make backfill APPLY=1` from a laptop.) Safe to run twice:
a day that already has a ride by the same driver in that car is skipped.

The log is cleaned up by hand below rather than parsed: its dates mix
`8/26/2026` with `03.09.2026`, two return dates say 2027 for a same-day trip,
and names are typed without diacritics and with stray capitals. The cleaned
rows follow the log line for line. What the log does not say is filled in:

- A ride is one day: a booking over several days becomes one ride per day.
- No times in the log means 08:00 to 18:00 (the airport run has its own).
- "BG-NS-BG" is Beograd to Novi Sad, "BG-NIS-BG" Beograd to Niš.
- The driver is the account whose name matches with diacritics ignored
  ("Milan Blazic" is "Milan Blažić"); with no such account the ride carries the
  name alone, as a ride from before accounts does.

Days before today are history and are written as the log has them, overlaps
included (on 9 and 18 September the log has the car out twice). From today on
the car's usual double-booking check applies, and a clash is skipped and
reported instead of overbooking it.
"""

import argparse
import sys
import unicodedata
from dataclasses import dataclass
from datetime import date, time, timedelta

from fastapi import HTTPException
from sqlmodel import Session, select

from .database import begin_write, engine
from .models import CarType, CorporateCar, Ride, User
from .services import corporate_car_label, ensure_car_available, norm_name

DAY_START = time(8, 0)
DAY_END = time(18, 0)
BG, NS, NIS = "Beograd", "Novi Sad", "Niš"


@dataclass(frozen=True)
class Entry:
    driver: str
    first: date
    last: date
    origin: str = BG
    destination: str = NS
    departure: time = DAY_START
    back: time = DAY_END


def d(month: int, day: int) -> date:
    return date(2026, month, day)


def one(month: int, day: int, driver: str, **kw) -> Entry:
    return Entry(driver, d(month, day), d(month, day), **kw)


LOG: list[Entry] = [
    # September (the first two are late August, filed under it)
    one(8, 26, "Nikola Drobac"),
    one(8, 27, "Petar Simic"),
    one(9, 3, "Nikola Stevic"),
    one(9, 8, "Marina Obrenovic"),
    one(9, 4, "Milos Jelaca"),
    Entry("Milan Blazic", d(9, 9), d(9, 10), destination=NIS),
    one(9, 9, "Nikola Drobac"),
    Entry("Pavle Cicmil", d(9, 15), d(9, 16)),
    one(9, 18, "Pavle Cicmil"),
    Entry("Nevenka Stojanovic", d(9, 18), d(9, 24)),
    one(9, 25, "Milos Jelaca"),
    Entry("Marko Markovic", d(9, 29), d(9, 30)),
    one(9, 30, "Nikola Drobac", origin="Office", destination="Aerodrom", departure=time(19, 30), back=time(21, 0)),
    # October
    one(10, 1, "Petar Simic"),  # the log's return date says 2027
    one(10, 2, "Zeljko Kojic"),
    Entry("Marko Markovic", d(10, 5), d(10, 6)),
    one(10, 7, "Milan Kolacek"),
    one(10, 9, "Milan Katanic"),
    one(10, 12, "Milan Kolacek"),  # the log's return date says 2027
    one(10, 13, "Milos Dodic"),
    one(10, 14, "Milan Blazic"),
    one(10, 15, "Milan Blazic"),
    one(10, 16, "Milan Blazic"),
    one(10, 17, "Sandra Kozomara"),
    one(10, 19, "Milos Bilbija"),
    one(10, 20, "Milos Bilbija"),
    *(one(10, day, "Milan Blazic") for day in range(21, 31)),
    # November
    one(11, 3, "Marko Markovic"),
    one(11, 4, "Milos Dodic"),
    one(11, 10, "Marko Markovic"),
    one(11, 17, "Pavle Cicmil"),
    one(11, 18, "Pavle Cicmil"),
    # December
    one(12, 8, "Marko Markovic"),
    one(12, 15, "Marko Markovic"),
    one(12, 29, "Marko Markovic"),
]


def fold(name: str) -> str:
    """`norm_name` with the diacritics dropped: "Blažić" and "Blazic" are one name here."""
    plain = unicodedata.normalize("NFKD", norm_name(name).replace("đ", "dj"))
    return "".join(c for c in plain if not unicodedata.combining(c))


def days(entry: Entry) -> list[date]:
    return [entry.first + timedelta(n) for n in range((entry.last - entry.first).days + 1)]


def the_mazda(session: Session) -> CorporateCar:
    cars = [c for c in session.exec(select(CorporateCar)) if "mazda" in c.name.casefold()]
    if len(cars) != 1:
        raise SystemExit(f"Expected one Mazda in the shared cars, found {len(cars)}: {[c.name for c in cars]}")
    return cars[0]


def backfill(session: Session, today: date) -> dict[str, list[str]]:
    """Add the log's rides to `session` (the caller commits) and say what happened, in lines."""
    car = the_mazda(session)
    by_name: dict[str, list[User]] = {}
    for user in session.exec(select(User)):
        by_name.setdefault(fold(user.display_name), []).append(user)

    report: dict[str, list[str]] = {"added": [], "already there": [], "skipped, car taken": [], "no account": []}
    for entry in LOG:
        matches = by_name.get(fold(entry.driver), [])
        user = matches[0] if len(matches) == 1 else None
        name = user.display_name if user else entry.driver
        if user is None and entry.driver not in report["no account"]:
            report["no account"].append(entry.driver)
        for day in days(entry):
            line = f"{day} {entry.departure:%H:%M}-{entry.back:%H:%M} {entry.origin} → {entry.destination}, {name}"
            same_day = session.exec(select(Ride).where(Ride.corporate_car_id == car.id, Ride.ride_date == day)).all()
            if any((user and r.driver_id == user.id) or fold(r.driver_name) == fold(name) for r in same_day):
                report["already there"].append(line)
                continue
            if day >= today:
                try:
                    ensure_car_available(session, car.id, day, entry.departure, entry.back)
                except HTTPException as clash:
                    report["skipped, car taken"].append(f"{line}: {clash.detail}")
                    continue
            session.add(
                Ride(
                    ride_date=day,
                    car_type=CarType.corporate,
                    car_name=corporate_car_label(car),
                    corporate_car_id=car.id,
                    driver_id=user.id if user else None,
                    driver_name=name,
                    origin=entry.origin,
                    destination=entry.destination,
                    departure_time=entry.departure,
                    return_time=entry.back,
                    seats=car.passenger_seats,
                    # A day already gone needs no reminder.
                    reminder_sent=day < today,
                )
            )
            session.flush()
            report["added"].append(line)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Add the shared Mazda's 2026 log as rides.")
    parser.add_argument("--apply", action="store_true", help="write the rides (without it, a dry run)")
    args = parser.parse_args()

    with Session(engine) as session:
        begin_write(session)
        report = backfill(session, date.today())
        for heading, lines in report.items():
            print(f"{heading}: {len(lines)}")
            for line in lines:
                print(f"  {line}")
        if args.apply:
            session.commit()
            print("Written.")
        else:
            session.rollback()
            print("Dry run, nothing written. Run again with --apply to write it.")


if __name__ == "__main__":
    sys.exit(main())
