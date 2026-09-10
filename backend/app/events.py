"""In-process fan-out of board changes to connected WebSocket clients.

Karpul runs as one uvicorn worker (see the Dockerfile), so a plain in-memory
hub is enough: every mutation in the routers calls `hub.publish(...)` after its
commit, and every open `/api/ws` connection gets the event.

The routers are ordinary sync `def` handlers, which FastAPI runs on a worker
thread, while the WebSocket connections live on the event loop. Publishing
therefore never touches a socket directly: each subscriber owns an
`asyncio.Queue` plus the loop it was created on, and `publish` hands the event
over with `call_soon_threadsafe`. The connection's own task drains the queue
and does the sending, so one slow or broken client cannot stall a request.

Event shapes (JSON):

    {"type": "ride.created" | "ride.updated", "ride": <RideRead>}
    {"type": "ride.deleted", "ride_id": 12, "ride_date": "2026-09-10"}
    {"type": "cars.changed"}      # pool edited; rides may have been relabelled
    {"type": "ping"}              # keepalive, sent when nothing else happened

If the app is ever run with several workers this hub has to be replaced by a
shared channel (Redis pub/sub or similar) — events published in one worker
would otherwise only reach the clients connected to that worker.
"""

from __future__ import annotations

import asyncio
import itertools
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

from .models import Ride
from .schemas import RideRead
from .services import to_ride_read_dict

Event = dict[str, Any]


@dataclass
class Subscription:
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue[Event] = field(default_factory=asyncio.Queue)


class Hub:
    def __init__(self) -> None:
        self._subs: dict[int, Subscription] = {}
        self._ids = itertools.count()
        self._lock = threading.Lock()

    @property
    def connections(self) -> int:
        with self._lock:
            return len(self._subs)

    @contextmanager
    def subscribe(self) -> Iterator[Subscription]:
        """Register the calling task; must be entered from inside the event loop."""
        sub = Subscription(loop=asyncio.get_running_loop())
        with self._lock:
            key = next(self._ids)
            self._subs[key] = sub
        try:
            yield sub
        finally:
            with self._lock:
                self._subs.pop(key, None)

    def publish(self, event: Event) -> None:
        """Queue `event` for every connection. Safe to call from any thread."""
        with self._lock:
            subs = list(self._subs.values())
        for sub in subs:
            try:
                sub.loop.call_soon_threadsafe(sub.queue.put_nowait, event)
            except RuntimeError:
                # The loop is closed (shutdown race); the subscriber is going away anyway.
                pass


hub = Hub()


def ride_payload(ride: Ride) -> dict[str, Any]:
    """The same shape the REST endpoints return, made JSON-safe for the socket."""
    return RideRead.model_validate(to_ride_read_dict(ride)).model_dump(mode="json")


def ride_saved(ride: Ride, *, created: bool) -> None:
    hub.publish({"type": "ride.created" if created else "ride.updated", "ride": ride_payload(ride)})


def ride_deleted(ride_id: int, ride_date: Any) -> None:
    hub.publish({"type": "ride.deleted", "ride_id": ride_id, "ride_date": str(ride_date)})


def cars_changed() -> None:
    hub.publish({"type": "cars.changed"})
