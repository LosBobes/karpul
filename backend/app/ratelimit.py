"""Throttling the doors (sign-in, registration and password reset) and the
writes that reach other people (a thread line, a ride request, a car report:
each one pushes someone).

Karpul is one uvicorn worker (see `app/events.py`), so the counters live in
this process. Each `Limiter` remembers, per key, when the attempts it was told
about happened, and refuses once `limit` of them fall inside `window_s`
seconds. Only failures are recorded for a sign-in, so a person who types their
password right is never slowed down by a colleague behind the same office NAT
who did not.

The client address is what uvicorn reports, which is the real one only when it
trusts the proxy's `X-Forwarded-For`; production sets `FORWARDED_ALLOW_IPS`
for that (docker-compose.prod.yml). The per-account counter is the one that
matters against guessing a password, and it does not depend on that.
"""

from __future__ import annotations

import math
import os
import threading
import time
from collections import deque

from fastapi import HTTPException, Request, status


class Limiter:
    def __init__(self, limit: int, window_s: float) -> None:
        self.limit = limit
        self.window_s = window_s
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _live(self, key: str, now: float) -> deque[float]:
        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] <= now - self.window_s:
            hits.popleft()
        return hits

    def check(self, *keys: str) -> None:
        """429 if any of `keys` has used up its attempts; records nothing."""
        now = time.monotonic()
        with self._lock:
            waits = []
            for key in keys:
                hits = self._live(key, now)
                if len(hits) >= self.limit:
                    waits.append(hits[0] + self.window_s - now)
            # Forget keys that went quiet, so the table does not grow for good.
            for key in [k for k, v in self._hits.items() if not v]:
                del self._hits[key]
        if waits:
            minutes = max(1, math.ceil(max(waits) / 60))
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Too many attempts; try again in {minutes} min",
                headers={"Retry-After": str(minutes * 60)},
            )

    def hit(self, *keys: str) -> None:
        now = time.monotonic()
        with self._lock:
            for key in keys:
                self._live(key, now).append(now)

    def forget(self, *keys: str) -> None:
        with self._lock:
            for key in keys:
                self._hits.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


# Wrong passwords: 10 per account and 30 per address in a quarter of an hour.
login_failures_by_account = Limiter(10, 15 * 60)
login_failures_by_ip = Limiter(30, 15 * 60)
# New accounts: 10 an hour from one address is a whole team signing up at once.
# The end-to-end tests register more than that from one address in a minute,
# so the figure is an environment knob (frontend/playwright.config.ts).
registrations = Limiter(int(os.getenv("KARPUL_REGISTRATIONS_PER_HOUR", "10")), 60 * 60)
# Reset-link attempts (a wrong or dead token), per address.
reset_attempts = Limiter(20, 15 * 60)

# Place searches and pin lookups (app/geo.py), per account: typing a place asks
# once per pause, so this is a lot of typing; it keeps one browser from
# spending the public geocoder's patience for everyone.
place_lookups = Limiter(60, 60)

# The writes that tell other people, per account. Each figure is far past what
# a person does by hand and well short of a phone full of pushes from a stuck
# client or a bored colleague.
WRITES = {
    # A chat: 20 lines a minute is typing fast.
    "message": Limiter(20, 60),
    # "Running late" pushes every passenger; a few taps a day is the most.
    "late": Limiter(6, 60 * 60),
    # A new ride (a weekly series is one); admins are not held to it, they
    # may be entering a whole paper log.
    "ride": Limiter(40, 60 * 60),
    # A request pushes every driver who drives that way; past the 14 open
    # requests one person may have at all (routers/requests.py).
    "request": Limiter(20, 60 * 60),
    # A report with a problem pushes every admin.
    "car_report": Limiter(20, 60 * 60),
}

# And a ceiling on every write at all, per signed-in browser (the bearer
# token, so it needs no database lookup): `main.throttle_writes`. The doors
# above keep their own counts. The end-to-end tests may raise it.
writes_by_token = Limiter(int(os.getenv("KARPUL_WRITES_PER_MINUTE", "300")), 60)


def spend(kind: str, user_id: int | None) -> None:
    """429 once `user_id` has used up `kind` (WRITES), else count this one."""
    limiter = WRITES[kind]
    key = str(user_id)
    limiter.check(key)
    limiter.hit(key)


ALL = (login_failures_by_account, login_failures_by_ip, registrations, reset_attempts, place_lookups, writes_by_token, *WRITES.values())


def reset_all() -> None:
    """For tests: every counter back to zero."""
    for limiter in ALL:
        limiter.clear()
