"""Throttling the doors: sign-in, registration and password reset.

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
registrations = Limiter(10, 60 * 60)
# Reset-link attempts (a wrong or dead token), per address.
reset_attempts = Limiter(20, 15 * 60)

ALL = (login_failures_by_account, login_failures_by_ip, registrations, reset_attempts)


def reset_all() -> None:
    """For tests: every counter back to zero."""
    for limiter in ALL:
        limiter.clear()
