"""Reminders: a push shortly before a ride leaves, and one to note the
odometer once a shared car should be back.

`send_due_reminders` is the whole rule, run once a minute by `reminder_loop`
from the app's lifespan while push is configured.

*Leaving soon.* Each person chooses how long before departure they want it
(`User.remind_before`, one of LEAD_CHOICES), so one ride's reminders go out
at different minutes: a ride going today is looked at once it leaves within
the longest lead, and every person in it whose own lead has come and who has
not been told (`ReminderSent`) gets theirs. The ride's `reminder_sent` flag
is set once everyone has had one or the ride has left, so a ride never gets
a late reminder, and a ride is never looked at again after that.

*Note the odometer.* A shared car's kilometres (`DriveLeg`) are only right if
someone notes the reading when the car is back, and nothing else asks. Once
a shared-car ride's return time is KM_GRACE_MIN behind and its odometer is
still open (or was never started), the driver (and whoever is at the wheel,
if a passenger took it) is asked once, `Ride.km_reminder_sent`.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from .models import CarType, ReminderSent, Ride, User
from .push import notify, vapid

log = logging.getLogger("karpul.reminders")

# The leads a person may pick, in minutes, and the one an account starts with.
LEAD_CHOICES = (15, 30, 60)
DEFAULT_LEAD = 30
# How long after a shared car's return time the odometer is asked for.
KM_GRACE_MIN = 20
CHECK_EVERY_S = 60


def lead_of(user: User) -> int:
    """The person's lead, held to the choices (an old row may say anything)."""
    return user.remind_before if user.remind_before in LEAD_CHOICES else DEFAULT_LEAD


def _people(session: Session, ride: Ride) -> dict[int, User]:
    ids = {uid for uid in [ride.driver_id] + [b.passenger_id for b in ride.bookings] if uid is not None}
    if not ids:
        return {}
    return {u.id: u for u in session.exec(select(User).where(User.id.in_(ids)))}  # type: ignore[union-attr,misc]


def send_departure_reminders(session: Session, now: datetime) -> int:
    """Push "leaving in N min" to everyone whose lead has come; returns how
    many rides had someone told this tick."""
    today: date = now.date()
    latest = (now + timedelta(minutes=max(LEAD_CHOICES))).time()
    stmt = (
        select(Ride)
        .where(Ride.ride_date == today, Ride.reminder_sent.is_(False))  # type: ignore[attr-defined]
        .options(selectinload(Ride.bookings))  # type: ignore[arg-type]
    )
    rides_told = 0
    for ride in session.exec(stmt):
        if ride.departure_time > latest:
            continue
        leaves = datetime.combine(today, ride.departure_time)
        if leaves < now:
            # Left already: nobody gets a late reminder, and the ride is done with.
            ride.reminder_sent = True
            session.add(ride)
            continue
        people = _people(session, ride)
        told = {
            row.user_id
            for row in session.exec(select(ReminderSent).where(ReminderSent.ride_id == ride.id))
        }
        minutes = max(int((leaves - now).total_seconds() // 60), 1)
        due = [u for u in people.values() if u.id not in told and leaves - timedelta(minutes=lead_of(u)) <= now]
        if due:
            notify(session, [u.id for u in due], "leaving_soon", ride, minutes=minutes)
            for u in due:
                session.add(ReminderSent(ride_id=ride.id, user_id=u.id))  # type: ignore[arg-type]
                told.add(u.id)
            rides_told += 1
        if told >= set(people):
            ride.reminder_sent = True
            session.add(ride)
    return rides_told


def send_km_reminders(session: Session, now: datetime) -> int:
    """Ask for the odometer of every shared car that should be back by now
    and whose kilometres are not closed; returns how many rides were asked."""
    today: date = now.date()
    stmt = (
        select(Ride)
        .where(
            Ride.ride_date == today,
            Ride.car_type == CarType.corporate,
            Ride.km_reminder_sent.is_(False),  # type: ignore[attr-defined]
            Ride.return_time.is_not(None),  # type: ignore[union-attr]
        )
        .options(selectinload(Ride.legs), selectinload(Ride.corporate_car))  # type: ignore[arg-type]
    )
    asked = 0
    for ride in session.exec(stmt):
        if ride.approval == "pending":
            continue
        back = datetime.combine(today, ride.return_time)  # type: ignore[arg-type]
        if back + timedelta(minutes=KM_GRACE_MIN) > now:
            continue
        closed = bool(ride.legs) and ride.legs[-1].end_km is not None
        if not closed:
            at_wheel = ride.legs[-1].driver_id if ride.legs else None
            car = ride.corporate_car.name if ride.corporate_car is not None else ride.car_name
            notify(session, [ride.driver_id, at_wheel], "note_km", ride, car=car)
            asked += 1
        ride.km_reminder_sent = True
        session.add(ride)
    return asked


def send_due_reminders(session: Session, now: datetime | None = None) -> int:
    """Both reminders, once; returns how many rides had a departure reminder
    go out this tick. Commits."""
    now = now or datetime.now()
    told = send_departure_reminders(session, now)
    send_km_reminders(session, now)
    session.commit()
    return told


async def reminder_loop() -> None:
    """Runs for the life of the process; each tick is one short write on a worker thread."""
    from .database import engine

    def tick() -> None:
        with Session(engine) as session:
            send_due_reminders(session)

    while True:
        try:
            if vapid() is not None:
                await asyncio.to_thread(tick)
        except Exception as exc:  # noqa: BLE001 - keep the loop alive whatever happened
            log.warning("reminder tick failed: %s", exc)
        await asyncio.sleep(CHECK_EVERY_S)
