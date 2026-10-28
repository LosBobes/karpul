"""Push notifications: who asked for them, and telling them what happened.

A browser that turns notifications on sends its push subscription while
signed in (`POST /api/push/subscriptions`, routers/push.py); it is stored
against the account, so "someone got into Ana's car" reaches every browser
Ana has switched notifications on in. Nothing is sent unless
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

from .models import PushSubscription, Ride, User
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


# What a person can switch off, kind by kind (`User.push_muted`, the
# Notifications sheet). Every `kind` notify() sends belongs to exactly one.
CATEGORIES: dict[str, tuple[str, ...]] = {
    "seats": ("got_in", "got_out", "taken_out", "seat_freed"),
    "changes": ("ride_changed", "ride_removed", "ride_assigned"),
    "reminders": ("leaving_soon", "note_km"),
    "messages": ("message",),
    "requests": ("request_answered",),
    "approvals": ("approval_requested", "ride_approved", "ride_declined"),
    "cars": ("car_issue",),
}
CATEGORY_OF = {kind: category for category, kinds in CATEGORIES.items() for kind in kinds}


def muted(user: User) -> list[str]:
    return [c for c in user.push_muted.split(",") if c in CATEGORIES]


def targets_for(session: Session, user_ids: list[int | None], kind: str | None = None) -> list[Target]:
    wanted = {uid for uid in user_ids if uid is not None}
    category = CATEGORY_OF.get(kind or "")
    if category is not None and wanted:
        people = session.exec(select(User).where(User.id.in_(wanted))).all()  # type: ignore[union-attr]
        wanted -= {u.id for u in people if category in muted(u)}
    if not wanted:
        return []
    stmt = select(PushSubscription).where(PushSubscription.user_id.in_(wanted))  # type: ignore[union-attr]
    return [Target(s.endpoint, s.p256dh, s.auth, s.locale) for s in session.exec(stmt)]


# --- Wording ----------------------------------------------------------------

TEXTS: dict[str, dict[str, Any]] = {
    "en": {
        "got_in": lambda name: f"{name} got in your car",
        "got_out": lambda name: f"{name} got out of your car",
        "taken_out": lambda driver: f"{driver} took you out of the car",
        "ride_removed": lambda driver, alternatives=0: f"{driver} removed the ride"
        + ("" if not alternatives else f". {alternatives} other car{'s' if alternatives > 1 else ''} with free seats that day"),
        "ride_changed": lambda driver: f"{driver} changed the ride",
        "leaving_soon": lambda minutes: f"Leaving in {minutes} min",
        "note_km": lambda car: f"{car} back? Note the odometer",
        "car_issue": lambda name, car: f"{name} reports a problem with {car}",
        "seat_freed": lambda driver: f"A seat freed up: you're in {driver}'s car",
        "message": lambda name, text: f"{name}: {text}",
        "request_answered": lambda driver: f"{driver} offers you a ride",
        "ride_assigned": lambda name: f"{name} put you down to drive",
        "approval_requested": lambda name: f"{name} asks for another shared car",
        "ride_approved": lambda name: f"{name} approved your shared car",
        "ride_declined": lambda name: f"{name} declined your shared car",
        "when": lambda day, hhmm, origin, destination: f"{day} {hhmm}, {origin} to {destination}",
    },
    "sr": {
        "got_in": lambda name: f"{name} je ušao/la u tvoj auto",
        "got_out": lambda name: f"{name} je izašao/la iz tvog auta",
        "taken_out": lambda driver: f"{driver} te je uklonio/la iz auta",
        "ride_removed": lambda driver, alternatives=0: f"{driver} je uklonio/la vožnju"
        + ("" if not alternatives else f". Tog dana ima mesta u još {_sr_cars(alternatives)}"),
        "ride_changed": lambda driver: f"{driver} je izmenio/la vožnju",
        "leaving_soon": lambda minutes: f"Polazak za {minutes} min",
        "note_km": lambda car: f"{car} je vraćen? Upiši kilometražu",
        "car_issue": lambda name, car: f"{name} prijavljuje problem sa autom {car}",
        "seat_freed": lambda driver: f"Oslobodilo se mesto: u autu si, vozi {driver}",
        "message": lambda name, text: f"{name}: {text}",
        "request_answered": lambda driver: f"{driver} ti nudi prevoz",
        "ride_assigned": lambda name: f"{name} te je upisao/la kao vozača",
        "approval_requested": lambda name: f"{name} traži još jedan zajednički auto",
        "ride_approved": lambda name: f"{name} je odobrio/la tvoj zajednički auto",
        "ride_declined": lambda name: f"{name} je odbio/la tvoj zajednički auto",
        "when": lambda day, hhmm, origin, destination: f"{day} {hhmm}, {origin} do {destination}",
    },
}


def _sr_cars(n: int) -> str:
    """Serbian "N cars" in the locative, after "u" ("in N cars")."""
    if n == 1:
        return "jednom autu"
    return f"{n} auta"


def _texts(locale: str) -> dict[str, Any]:
    return TEXTS.get(locale, TEXTS["en"])


def _when(t: dict[str, Any], ride_date: date, departure: time, origin: str, destination: str) -> str:
    return t["when"](ride_date.strftime("%a %d %b"), departure.strftime("%H:%M"), origin, destination)


def ride_message(
    kind: str, ride: Ride | None, locale: str, *, url: str | None = None, body: str | None = None, **args: Any
) -> dict[str, str]:
    """One notification, in the subscriber's language, deep-linking to the
    ride (or to `url`: a removed ride's link would only say it is gone). With
    no ride (a car report) the body is `body` and the link is the app."""
    t = _texts(locale)
    title = t[kind](**args) if args else t[kind]()
    if ride is None:
        return {"title": title, "body": body or "", "url": url or "/", "tag": f"{kind}-{hash(body) & 0xFFFF}"}
    return {
        "title": title,
        "body": body if body is not None else _when(t, ride.ride_date, ride.departure_time, ride.origin, ride.destination),
        "url": url or f"/ride/{ride.id}",
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


def notify(
    session: Session,
    user_ids: list[int | None],
    kind: str,
    ride: Ride | None = None,
    *,
    url: str | None = None,
    body: str | None = None,
    **args: Any,
) -> int:
    """Queue `kind` about `ride` for every browser of the accounts in `user_ids`
    (None, a seat with no account behind it, is skipped, and so is anyone who
    switched that kind's category off). `url` replaces the link to the ride
    and `body` its "when and where" line; a notification about no ride at all
    (a car report) gives both.

    Returns how many subscriptions were found. Call it before the session is
    closed; the ride's fields are copied so the send can outlive the request.
    """
    identity = vapid()
    if identity is None:
        return 0
    targets = targets_for(session, user_ids, kind)
    if not targets:
        return 0
    snapshot = Ride.model_validate(ride.model_dump()) if ride is not None else None
    _executor.submit(
        deliver_all, targets, lambda locale: ride_message(kind, snapshot, locale, url=url, body=body, **args), identity
    )
    return len(targets)
