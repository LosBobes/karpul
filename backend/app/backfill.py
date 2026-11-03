"""One-time backfill: the shared Mazda's paper log, August to December 2026.

It runs by itself on the app's start (`run_once`, from the lifespan in
main.py) and records `MARKER` in `DataMigration`, so it is applied once and
never again, even if its rides are later edited or removed. By hand:

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
  name alone, as a ride from before accounts does. Registering under that
  exact name claims it; a colleague whose account spells it another way
  claims it from the ride (`POST /api/rides/{id}/claim`, names alike only).

Days before today are history and are written as the log has them, overlaps
included (on 9 and 18 September the log has the car out twice). From today on
the car's usual double-booking check applies, and a clash is skipped and
reported instead of overbooking it.
"""

import argparse
import logging
import sys
from dataclasses import dataclass
from datetime import date, time, timedelta

from fastapi import HTTPException
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from .database import begin_write, engine
from .models import CarType, CorporateCar, DataMigration, Ride, User
from .services import corporate_car_label, ensure_car_available, fold_name

log = logging.getLogger("karpul.backfill")

MARKER = "mazda-log-2026"
# The coming log rides already written before `Ride.unconfirmed` existed get it once.
HOLD_MARKER = "mazda-log-2026-unconfirmed"
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


fold = fold_name


def days(entry: Entry) -> list[date]:
    return [entry.first + timedelta(n) for n in range((entry.last - entry.first).days + 1)]


class NoMazda(Exception):
    """The pool has no one Mazda to put the log's rides in."""


def the_mazda(session: Session) -> CorporateCar:
    cars = [c for c in session.exec(select(CorporateCar)) if "mazda" in c.name.casefold()]
    if len(cars) != 1:
        raise NoMazda(f"Expected one Mazda in the shared cars, found {len(cars)}: {[c.name for c in cars]}")
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
                    # The log says who booked the car, not that they take
                    # anyone: nobody gets in until the driver confirms it.
                    unconfirmed=day >= today,
                )
            )
            session.flush()
            report["added"].append(line)
    return report


def hold_unconfirmed(session: Session, today: date) -> list[Ride]:
    """The coming log rides nobody has looked at yet (still on the log's own
    times, as `backfill_notice.needs_a_look` tells), marked `unconfirmed`.
    Whoever already sits in one stays; nobody new gets in until the driver
    confirms it. Returns the rides marked; the caller commits."""
    from .backfill_notice import log_rides, needs_a_look

    held = []
    for entry, ride in log_rides(session):
        if ride.ride_date >= today and not ride.unconfirmed and needs_a_look(entry, ride, today):
            ride.unconfirmed = True
            session.add(ride)
            held.append(ride)
    return held


def hold_once(target: Engine, today: date | None = None) -> list[Ride] | None:
    """`hold_unconfirmed`, once (`HOLD_MARKER`), after the backfill has run.
    Returns the rides marked, or None when it had run already or the
    backfill has not (a later start tries again)."""
    with Session(target) as session:
        begin_write(session)
        if session.get(DataMigration, HOLD_MARKER) is not None or session.get(DataMigration, MARKER) is None:
            return None
        held = hold_unconfirmed(session, today or date.today())
        session.add(DataMigration(name=HOLD_MARKER))
        session.commit()
        for ride in held:
            session.refresh(ride)
    log.info("Coming shared-car log rides held until their drivers confirm them: %d", len(held))
    return held


def report_lines(report: dict[str, list[str]]) -> list[str]:
    out = []
    for heading, lines in report.items():
        out.append(f"{heading}: {len(lines)}")
        out.extend(f"  {line}" for line in lines)
    return out


def run_once(target: Engine, today: date | None = None) -> dict[str, list[str]] | None:
    """Apply the backfill unless it has been already, and mark it applied, in
    one transaction. With no single Mazda in the pool (a fresh database, the
    end-to-end test) nothing is written or marked, so a later start tries
    again. Returns the report, or None when nothing ran."""
    with Session(target) as session:
        begin_write(session)
        if session.get(DataMigration, MARKER) is not None:
            return None
        try:
            report = backfill(session, today or date.today())
        except NoMazda as e:
            log.warning("Shared-car log not backfilled yet: %s", e)
            return None
        session.add(DataMigration(name=MARKER))
        session.commit()
    log.info("Shared-car log backfilled:\n%s", "\n".join(report_lines(report)))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Add the shared Mazda's 2026 log as rides.")
    parser.add_argument("--apply", action="store_true", help="write the rides (without it, a dry run)")
    args = parser.parse_args()

    with Session(engine) as session:
        begin_write(session)
        try:
            report = backfill(session, date.today())
        except NoMazda as e:
            raise SystemExit(str(e)) from e
        print("\n".join(report_lines(report)))
        if args.apply:
            if session.get(DataMigration, MARKER) is None:
                session.add(DataMigration(name=MARKER))
            session.commit()
            print("Written.")
        else:
            session.rollback()
            print("Dry run, nothing written. Run again with --apply to write it.")


if __name__ == "__main__":
    sys.exit(main())
