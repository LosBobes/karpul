"""One-time push: the people who should look at the shared Mazda's backfilled log.

The paper log (app/backfill.py) became rides with guesses in them: no times
meant 08:00 to 18:00, nobody noted the odometer, and a driver whose name did
not match an account exactly carries the name alone. So, once, after the
backfill has run and while push is on, the best placed people are told:

- **Their own rides** (`log_yours`): an account that drives log rides still
  needing something, a coming one still on the guessed times or one already
  driven with no odometer reading. The link opens the soonest coming one,
  else the latest driven.
- **Rides that may be theirs** (`log_claim`): for each name on the log with
  no account, the account whose name is most like it (`name_likeness`, at
  least `SIMILAR_NAME`; a tie tells everyone tied), unless they sit in that
  ride. The link opens one of those rides, where *This is me* waits.

Each person gets one push per reason, never one per ride. It is marked
applied in `DataMigration` as `MARKER` only once it has been sent: with
push off, or before the backfill itself has run, a later start tries again.
By hand, a dry run listing who would be told:

    docker compose exec -T app python -m app.backfill_notice
"""

import logging
import sys
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from . import backfill
from .database import begin_write, engine
from .models import DataMigration, Ride, User
from .push import notify, vapid
from .services import SIMILAR_NAME, is_person, name_likeness

log = logging.getLogger("karpul.backfill")

MARKER = "mazda-log-2026-notice"


@dataclass
class Notice:
    user: User
    kind: str  # "log_yours" or "log_claim"
    rides: list[Ride] = field(default_factory=list)
    name: str = ""  # the log's name, for a claim

    def link(self, today: date) -> Ride:
        """The ride the push opens: the soonest coming one, else the latest gone."""
        coming = [r for r in self.rides if r.ride_date >= today]
        if coming:
            return min(coming, key=lambda r: (r.ride_date, r.departure_time, r.id))
        return max(self.rides, key=lambda r: (r.ride_date, r.departure_time, r.id))


def log_rides(session: Session) -> list[tuple[backfill.Entry, Ride]]:
    """The rides the backfill wrote and that are still there, each with its log
    line: the Mazda on a logged day, driven under that line's name (or a name
    like it, after a claim renamed it)."""
    try:
        car = backfill.the_mazda(session)
    except backfill.NoMazda:
        return []
    found: dict[int, tuple[backfill.Entry, Ride]] = {}
    for entry in backfill.LOG:
        for day in backfill.days(entry):
            stmt = select(Ride).where(Ride.corporate_car_id == car.id, Ride.ride_date == day)
            for ride in session.exec(stmt):
                if ride.id not in found and name_likeness(ride.driver_name, entry.driver) >= SIMILAR_NAME:
                    found[ride.id] = (entry, ride)
    return list(found.values())


def needs_a_look(entry: backfill.Entry, ride: Ride, today: date) -> bool:
    """Still holds a guess: a coming ride on the log's own times, or one driven
    with nothing on its odometer."""
    if ride.needs_driver:
        return False
    if ride.ride_date >= today:
        return (ride.departure_time, ride.return_time) == (entry.departure, entry.back)
    return not ride.legs


def candidates(session: Session, today: date) -> list[Notice]:
    rides = log_rides(session)
    people = session.exec(select(User)).all()
    by_id = {u.id: u for u in people}

    yours: dict[int, Notice] = {}
    for entry, ride in rides:
        user = by_id.get(ride.driver_id) if ride.driver_id is not None else None
        if user is not None and needs_a_look(entry, ride, today):
            yours.setdefault(user.id, Notice(user, "log_yours")).rides.append(ride)

    unclaimed: dict[str, list[Ride]] = {}
    for _, ride in rides:
        if ride.driver_id is None:
            unclaimed.setdefault(ride.driver_name, []).append(ride)
    claims: list[Notice] = []
    for name, its_rides in unclaimed.items():
        scored = [(name_likeness(name, u.display_name), u) for u in people]
        best = max((score for score, _ in scored), default=0.0)
        if best < SIMILAR_NAME:
            continue
        for score, user in scored:
            if score != best:
                continue
            theirs = [r for r in its_rides if not any(is_person(user, b.passenger_id, b.passenger_name) for b in r.bookings)]
            if theirs:
                claims.append(Notice(user, "log_claim", theirs, name))
    return [*yours.values(), *claims]


def describe(notices: list[Notice], today: date) -> list[str]:
    out = []
    for n in notices:
        what = f"{len(n.rides)} ride(s) to check" if n.kind == "log_yours" else f"may be {n.name!r}, {len(n.rides)} ride(s)"
        out.append(f"{n.user.display_name}: {what}, opens {n.link(today).ride_date}")
    return out


def send(session: Session, notices: list[Notice], today: date) -> int:
    reached = 0
    for n in notices:
        args = {"n": len(n.rides)} if n.kind == "log_yours" else {"name": n.name, "n": len(n.rides)}
        reached += notify(session, [n.user.id], n.kind, n.link(today), **args)
    return reached


def run_once(target: Engine, today: date | None = None) -> list[tuple[str, str]] | None:
    """Tell the candidates unless they have been already. Nothing happens, and
    nothing is marked, while push is off or the log is not backfilled yet.
    Returns who was told and why, (name, kind), or None when nothing ran."""
    if vapid() is None:
        return None
    today = today or date.today()
    with Session(target) as session:
        begin_write(session)
        if session.get(DataMigration, MARKER) is not None or session.get(DataMigration, backfill.MARKER) is None:
            return None
        notices = candidates(session, today)
        reached = send(session, notices, today)
        told = [(n.user.display_name, n.kind) for n in notices]
        lines = describe(notices, today)
        session.add(DataMigration(name=MARKER))
        session.commit()
    log.info("Told %d people about the shared-car log (%d browsers):\n%s", len(told), reached, "\n".join(lines))
    return told


def main() -> None:
    with Session(engine) as session:
        notices = candidates(session, date.today())
        print("\n".join(describe(notices, date.today())) or "Nobody to tell.")
        print("Dry run. The app sends these once by itself on start, while push is on.")


if __name__ == "__main__":
    sys.exit(main())
