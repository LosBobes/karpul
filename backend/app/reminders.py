"""Departure reminders: a push to the driver and the passengers shortly
before a ride leaves.

`send_due_reminders` is the whole rule, run once a minute by `reminder_loop`
from the app's lifespan while push is configured. A ride is due when it goes
today and leaves within the next REMIND_BEFORE_MIN minutes; the ride's
`reminder_sent` flag makes sure it is sent once, and the flag is set even
when nobody has subscribed, so that a ride never gets a late reminder when
someone subscribes afterwards.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from .models import Ride
from .push import notify, vapid

log = logging.getLogger("karpul.reminders")

REMIND_BEFORE_MIN = 30
CHECK_EVERY_S = 60


def send_due_reminders(session: Session, now: datetime | None = None) -> int:
    """Push "leaving in N min" for every ride due now; returns how many rides."""
    now = now or datetime.now()
    today: date = now.date()
    latest = (now + timedelta(minutes=REMIND_BEFORE_MIN)).time()
    stmt = (
        select(Ride)
        .where(Ride.ride_date == today, Ride.reminder_sent.is_(False))  # type: ignore[attr-defined]
        .options(selectinload(Ride.bookings))  # type: ignore[arg-type]
    )
    sent = 0
    for ride in session.exec(stmt):
        if ride.departure_time > latest or ride.departure_time < now.time():
            continue
        minutes = max(int((datetime.combine(today, ride.departure_time) - now).total_seconds() // 60), 1)
        names = [ride.driver_name] + [b.passenger_name for b in ride.bookings]
        notify(session, names, "leaving_soon", ride, minutes=minutes)
        ride.reminder_sent = True
        session.add(ride)
        sent += 1
    session.commit()
    return sent


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
