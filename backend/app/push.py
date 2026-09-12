"""Push notifications: who asked for them, and telling them what happened.

A browser that turns notifications on sends its push subscription with the
name it is using (`POST /api/push/subscriptions`, routers/push.py); it is
stored against the normalised name, so "someone got into Ana's car" reaches
every browser that calls itself Ana. Nothing is sent unless
KARPUL_VAPID_PRIVATE_KEY is set (`python -m app.vapid` prints one); without it
the endpoints answer that push is off and the app hides the switch.

Sending happens off the request: the route handler collects the matching
subscriptions inside its own transaction and hands them to a small thread
pool (`notify`), so a slow push service never holds up a booking. A push
service that answers 404 or 410 has dropped the subscription, and it is
deleted here on the next opportunity. The texts are per subscription
language (the browser sends its app language when it subscribes), because
the server only ever knows English otherwise.
"""

from __future__ import annotations

import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, time
from typing import Any

import httpx
from sqlmodel import Session, select

from .models import PushSubscription, Ride
from .services import norm_name
from .webpush import Vapid, encrypt

log = logging.getLogger("karpul.push")

DEFAULT_SUBJECT = "https://www.karpul.dev"
PUSH_TTL_S = 6 * 3600

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="push")


def vapid() -> Vapid | None:
    """The server's VAPID identity, or None when push is switched off. Read per
    call, not at import: tests and a restarted container set it late."""
    private = os.getenv("KARPUL_VAPID_PRIVATE_KEY", "").strip()
    if not private:
        return None
    subject = os.getenv("KARPUL_VAPID_SUBJECT", "").strip() or DEFAULT_SUBJECT
    try:
        return Vapid.from_raw(private, subject)
    except ValueError:
        log.error("KARPUL_VAPID_PRIVATE_KEY is not a base64url P-256 private key; push is off")
        return None


@dataclass(frozen=True)
class Target:
    endpoint: str
    p256dh: str
    auth: str
    locale: str


def targets_for(session: Session, names: list[str]) -> list[Target]:
    wanted = {norm_name(n) for n in names if n and n.strip()}
    if not wanted:
        return []
    stmt = select(PushSubscription).where(PushSubscription.user_name.in_(wanted))  # type: ignore[attr-defined]
    return [Target(s.endpoint, s.p256dh, s.auth, s.locale) for s in session.exec(stmt)]


# --- Wording ----------------------------------------------------------------

TEXTS: dict[str, dict[str, Any]] = {
    "en": {
        "got_in": lambda name: f"{name} got in your car",
        "got_out": lambda name: f"{name} got out of your car",
        "taken_out": lambda driver: f"{driver} took you out of the car",
        "ride_removed": lambda driver: f"{driver} removed the ride",
        "ride_changed": lambda driver: f"{driver} changed the ride",
        "leaving_soon": lambda minutes: f"Leaving in {minutes} min",
        "when": lambda day, hhmm, origin, destination: f"{day} {hhmm}, {origin} to {destination}",
    },
    "sr": {
        "got_in": lambda name: f"{name} je ušao/la u tvoj auto",
        "got_out": lambda name: f"{name} je izašao/la iz tvog auta",
        "taken_out": lambda driver: f"{driver} te je uklonio/la iz auta",
        "ride_removed": lambda driver: f"{driver} je uklonio/la vožnju",
        "ride_changed": lambda driver: f"{driver} je izmenio/la vožnju",
        "leaving_soon": lambda minutes: f"Polazak za {minutes} min",
        "when": lambda day, hhmm, origin, destination: f"{day} {hhmm}, {origin} do {destination}",
    },
}


def _texts(locale: str) -> dict[str, Any]:
    return TEXTS.get(locale, TEXTS["en"])


def _when(t: dict[str, Any], ride_date: date, departure: time, origin: str, destination: str) -> str:
    return t["when"](ride_date.strftime("%a %d %b"), departure.strftime("%H:%M"), origin, destination)


def ride_message(kind: str, ride: Ride, locale: str, **args: Any) -> dict[str, str]:
    """One notification, in the subscriber's language, deep-linking to the ride."""
    t = _texts(locale)
    title = t[kind](**args) if args else t[kind]()
    return {
        "title": title,
        "body": _when(t, ride.ride_date, ride.departure_time, ride.origin, ride.destination),
        "url": f"/ride/{ride.id}",
        "tag": f"ride-{ride.id}-{kind}",
    }


# --- Sending ----------------------------------------------------------------


def deliver(target: Target, message: dict[str, str], identity: Vapid) -> int:
    """POST one encrypted message to the push service; returns the status code.
    Module-level so tests can replace it."""
    body = encrypt(json.dumps(message).encode("utf-8"), target.p256dh, target.auth)
    headers = {
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": str(PUSH_TTL_S),
        "Urgency": "normal",
        "Authorization": identity.authorization(target.endpoint),
    }
    response = httpx.post(target.endpoint, content=body, headers=headers, timeout=10)
    return response.status_code


def forget(endpoints: list[str]) -> None:
    """Drop subscriptions the push service no longer knows. Runs on the push
    thread with its own session; module-level so tests can replace it."""
    from .database import engine

    with Session(engine) as session:
        for endpoint in endpoints:
            sub = session.exec(select(PushSubscription).where(PushSubscription.endpoint == endpoint)).first()
            if sub is not None:
                session.delete(sub)
        session.commit()


def deliver_all(targets: list[Target], make_message, identity: Vapid) -> list[str]:
    """Send to every target; returns the endpoints that turned out to be dead."""
    dead: list[str] = []
    for target in targets:
        try:
            status = deliver(target, make_message(target.locale), identity)
        except Exception as exc:  # noqa: BLE001 - one bad endpoint must not stop the rest
            log.warning("push to %s failed: %s", target.endpoint[:40], exc)
            continue
        if status in (404, 410):
            dead.append(target.endpoint)
        elif status >= 400:
            log.warning("push service answered %s for %s", status, target.endpoint[:40])
    if dead:
        try:
            forget(dead)
        except Exception as exc:  # noqa: BLE001
            log.warning("could not forget dead subscriptions: %s", exc)
    return dead


def notify(session: Session, names: list[str], kind: str, ride: Ride, **args: Any) -> int:
    """Queue `kind` about `ride` for every browser subscribed under `names`.

    Returns how many subscriptions were found. Call it before the session is
    closed; the ride's fields are copied so the send can outlive the request.
    """
    identity = vapid()
    if identity is None:
        return 0
    targets = targets_for(session, names)
    if not targets:
        return 0
    snapshot = Ride.model_validate(ride.model_dump())
    _executor.submit(deliver_all, targets, lambda locale: ride_message(kind, snapshot, locale, **args), identity)
    return len(targets)
