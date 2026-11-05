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

from .models import PushSubscription, Ride, RideRequest, User
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
    "seats": ("got_in", "got_out", "taken_out", "guest_taken_out", "seat_freed"),
    "changes": ("change_asked", "change_agreed", "change_declined", "time_suggested", "suggestion_accepted", "suggestion_declined", "running_late", "ride_changed", "ride_removed", "ride_assigned", "stop_added", "driver_needed", "driver_found", "no_driver", "car_blocked"),
    "reminders": ("leaving_soon", "note_km", "log_yours", "log_claim"),
    "messages": ("message",),
    "requests": ("request_made", "request_answered"),
    "approvals": ("approval_requested", "ride_approved", "ride_declined", "garage_plate", "plate_registered", "approval_waiting"),
    "cars": ("car_issue", "fleet_registration", "fleet_insurance", "fleet_service", "fleet_tyres"),
}
CATEGORY_OF = {kind: category for category, kinds in CATEGORIES.items() for kind in kinds}
# Losing a seat someone counted on cannot be switched off: muting "seats"
# silences the rest of that category, never these.
ALWAYS_SENT = frozenset({"taken_out", "guest_taken_out", "ride_removed", "car_blocked"})


def muted(user: User) -> list[str]:
    return [c for c in user.push_muted.split(",") if c in CATEGORIES]


def targets_for(session: Session, user_ids: list[int | None], kind: str | None = None) -> list[Target]:
    wanted = {uid for uid in user_ids if uid is not None}
    category = CATEGORY_OF.get(kind or "")
    if category is not None and wanted and kind not in ALWAYS_SENT:
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
        "taken_out": lambda by: f"{by} took you out of the car",
        "guest_taken_out": lambda by, name: f"{by} took {name} out of the car",
        "ride_removed": lambda driver, alternatives=0: f"{driver} removed the ride"
        + ("" if not alternatives else f". {alternatives} other car{'s' if alternatives > 1 else ''} with free seats that day"),
        "ride_changed": lambda driver: f"{driver} changed the ride",
        "change_asked": lambda driver: f"{driver} wants to change the ride. Do you agree?",
        "change_agreed": lambda: "Your passengers agreed: the ride is changed",
        "change_declined": lambda name: f"{name} did not agree to the change; the ride stays as it was",
        "time_suggested": lambda name: f"{name} suggests another time for your ride",
        "suggestion_accepted": lambda name: f"{name} took your suggested time",
        "suggestion_declined": lambda name: f"{name} keeps the time as it was",
        "driver_needed": lambda driver: f"{driver} can't drive. Will you take the car?",
        "driver_found": lambda name: f"{name} drives now",
        "no_driver": lambda alternatives=0: "Nobody took over the ride, it is off"
        + ("" if not alternatives else f". {alternatives} other car{'s' if alternatives > 1 else ''} with free seats that day"),
        "stop_added": lambda name, place: f"{name} gets in at {place}, a new pickup point",
        "leaving_soon": lambda minutes: f"Leaving in {minutes} min",
        "note_km": lambda car: f"{car} back? Note the odometer",
        "log_yours": lambda n: (
            "Your ride from the shared Mazda's paper log: check the times and note the odometer"
            if n == 1
            else f"{n} of your rides from the shared Mazda's paper log: check the times and note the odometer"
        ),
        "log_claim": lambda name, n: f"Are you {name}? The shared Mazda's log has {n} ride{'s' if n > 1 else ''} "
        "under that name. Tap This is me",
        "car_issue": lambda name, car: f"{name} reports a problem with {car}",
        "seat_freed": lambda driver: f"A seat freed up: you're in {driver}'s car",
        "message": lambda name, text: f"{name}: {text}",
        "request_answered": lambda driver: f"{driver} offers you a ride",
        "request_made": lambda name: f"{name} is looking for a ride you drive",
        "running_late": lambda driver, minutes: f"{driver} is running {minutes} min late",
        "ride_assigned": lambda name: f"{name} put you down to drive",
        "approval_requested": lambda name: f"{name} asks for another shared car",
        "ride_approved": lambda name: f"{name} approved your shared car",
        "ride_declined": lambda name: f"{name} declined your shared car",
        "garage_plate": lambda name, plate: f"{name} comes to the Beograd office in {plate}: add it to the garage list",
        "plate_registered": lambda name, plate: f"{plate} is on the garage list ({name})",
        "approval_waiting": lambda name: f"{name}'s shared car still waits for an approval and leaves soon",
        "car_blocked": lambda car, reason="": f"{car} is out of service on the day of your ride" + (f": {reason}" if reason else ""),
        "fleet_registration": lambda car, days=None, km=None: f"{car}: the registration " + _en_due(days),
        "fleet_insurance": lambda car, days=None, km=None: f"{car}: the insurance " + _en_due(days),
        "fleet_service": lambda car, days=None, km=None: f"{car}: the service is due "
        + (f"in {km} km" if km is not None and km > 0 and (days is None or days > 0) else "now" if (km is not None and km <= 0) or (days is not None and days <= 0) else f"in {days} days"),
        "fleet_tyres": lambda car, days=None, km=None: f"{car} still has summer tyres in the winter season",
        "when": lambda day, hhmm, origin, destination: f"{day} {hhmm}, {origin} to {destination}",
        # Not strftime: its names follow the server's locale, not the reader's.
        "day": lambda d: f"{('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')[d.weekday()]} {d.day:02d} "
        f"{('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')[d.month - 1]}",
    },
    "sr": {
        "got_in": lambda name: f"{name} je ušao/la u tvoj auto",
        "got_out": lambda name: f"{name} je izašao/la iz tvog auta",
        "taken_out": lambda by: f"{by} te je uklonio/la iz auta",
        "guest_taken_out": lambda by, name: f"{by} je uklonio/la iz auta putnika koga si dodao/la: {name}",
        "ride_removed": lambda driver, alternatives=0: f"{driver} je uklonio/la vožnju"
        + ("" if not alternatives else f". Tog dana ima mesta u još {_sr_cars(alternatives)}"),
        "ride_changed": lambda driver: f"{driver} je izmenio/la vožnju",
        "change_asked": lambda driver: f"{driver} želi da izmeni vožnju. Da li se slažeš?",
        "change_agreed": lambda: "Putnici su se složili: vožnja je izmenjena",
        "change_declined": lambda name: f"{name} se ne slaže sa izmenom; vožnja ostaje kakva je bila",
        "time_suggested": lambda name: f"{name} predlaže drugo vreme za tvoju vožnju",
        "suggestion_accepted": lambda name: f"{name} je prihvatio/la predloženo vreme",
        "suggestion_declined": lambda name: f"{name} zadržava vreme kakvo je bilo",
        "driver_needed": lambda driver: f"{driver} ne može da vozi. Hoćeš li ti da preuzmeš auto?",
        "driver_found": lambda name: f"Sada vozi {name}",
        "no_driver": lambda alternatives=0: "Niko nije preuzeo vožnju, otkazana je"
        + ("" if not alternatives else f". Tog dana ima mesta u još {_sr_cars(alternatives)}"),
        "stop_added": lambda name, place: f"{name} ulazi kod: {place}, novo mesto ulaska",
        "leaving_soon": lambda minutes: f"Polazak za {minutes} min",
        "note_km": lambda car: f"{car} je vraćen? Upiši kilometražu",
        "log_yours": lambda n: (
            "Tvoja vožnja iz papirnog dnevnika zajedničke Mazde: proveri vreme i upiši kilometražu"
            if n == 1
            else f"Tvoje vožnje iz papirnog dnevnika zajedničke Mazde ({n}): proveri vreme i upiši kilometražu"
        ),
        "log_claim": lambda name, n: f"Da li si ti {name}? U dnevniku zajedničke Mazde pod tim imenom je "
        f"{_sr_rides(n)}. Dodirni Ovo sam ja",
        "car_issue": lambda name, car: f"{name} prijavljuje problem sa autom {car}",
        "seat_freed": lambda driver: f"Oslobodilo se mesto: u autu si, vozi {driver}",
        "message": lambda name, text: f"{name}: {text}",
        "request_answered": lambda driver: f"{driver} ti nudi prevoz",
        "request_made": lambda name: f"{name} traži prevoz na putu koji voziš",
        "running_late": lambda driver, minutes: f"{driver} kasni {minutes} min",
        "ride_assigned": lambda name: f"{name} te je upisao/la kao vozača",
        "approval_requested": lambda name: f"{name} traži još jedan zajednički auto",
        "ride_approved": lambda name: f"{name} je odobrio/la tvoj zajednički auto",
        "ride_declined": lambda name: f"{name} je odbio/la tvoj zajednički auto",
        "garage_plate": lambda name, plate: f"{name} dolazi u kancelariju u Beogradu autom {plate}: dodaj ga na spisak za garažu",
        "plate_registered": lambda name, plate: f"{plate} je na spisku za garažu ({name})",
        "approval_waiting": lambda name: f"Zajednički auto koji traži {name} još čeka odobrenje, a polazi uskoro",
        "car_blocked": lambda car, reason="": f"{car} je van upotrebe na dan tvoje vožnje" + (f": {reason}" if reason else ""),
        "fleet_registration": lambda car, days=None, km=None: f"{car}: registracija " + _sr_due(days),
        "fleet_insurance": lambda car, days=None, km=None: f"{car}: osiguranje " + _sr_due(days, "je isteklo"),
        "fleet_service": lambda car, days=None, km=None: f"{car}: servis je "
        + (f"za {km} km" if km is not None and km > 0 and (days is None or days > 0) else "na redu sada" if (km is not None and km <= 0) or (days is not None and days <= 0) else f"za {_sr_days(days)}"),
        "fleet_tyres": lambda car, days=None, km=None: f"{car} još ima letnje gume u zimskom periodu",
        "when": lambda day, hhmm, origin, destination: f"{day} {hhmm}, {origin} do {destination}",
        "day": lambda d: f"{('pon', 'uto', 'sre', 'čet', 'pet', 'sub', 'ned')[d.weekday()]} {d.day}. "
        f"{('jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec')[d.month - 1]}",
    },
}


def _en_due(days: int | None) -> str:
    if days is None:
        return "is due"
    if days < 0:
        return "has run out"
    if days == 0:
        return "runs out today"
    return f"runs out in {days} day{'s' if days != 1 else ''}"


def _sr_days(n: int) -> str:
    """Serbian "N days" after "za": one, a few, many."""
    if n % 10 == 1 and n % 100 != 11:
        return f"{n} dan"
    return f"{n} dana"


def _sr_due(days: int | None, ran_out: str = "je istekla") -> str:
    if days is None:
        return "ističe"
    if days < 0:
        return ran_out
    if days == 0:
        return "ističe danas"
    return f"ističe za {_sr_days(days)}"


def _sr_cars(n: int) -> str:
    """Serbian "N cars" in the locative, after "u" ("in N cars")."""
    if n == 1:
        return "jednom autu"
    return f"{n} auta"


def _sr_rides(n: int) -> str:
    """Serbian "N rides" after "je": one, a few, many."""
    if n % 10 == 1 and n % 100 != 11:
        return f"{n} vožnja"
    if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14):
        return f"{n} vožnje"
    return f"{n} vožnji"


def _texts(locale: str) -> dict[str, Any]:
    return TEXTS.get(locale, TEXTS["en"])


def _when(t: dict[str, Any], ride_date: date, departure: time, origin: str, destination: str) -> str:
    return t["when"](t["day"](ride_date), departure.strftime("%H:%M"), origin, destination)


def ride_message(
    kind: str,
    ride: Ride | None,
    locale: str,
    *,
    url: str | None = None,
    body: str | None = None,
    request: RideRequest | None = None,
    **args: Any,
) -> dict[str, str]:
    """One notification, in the subscriber's language, deep-linking to the
    ride (or to `url`: a removed ride's link would only say it is gone). With
    no ride the body is `body` (a car report), or the "when and where" of a
    ride `request`, and the link is the app."""
    t = _texts(locale)
    title = t[kind](**args) if args else t[kind]()
    if ride is None and request is not None:
        return {
            "title": title,
            "body": _when(t, request.request_date, request.departure_time, request.origin, request.destination),
            "url": url or "/",
            "tag": f"request-{request.id}-{kind}",
        }
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
    request: RideRequest | None = None,
    **args: Any,
) -> int:
    """Queue `kind` about `ride` for every browser of the accounts in `user_ids`
    (None, a seat with no account behind it, is skipped, and so is anyone who
    switched that kind's category off). `url` replaces the link to the ride
    and `body` its "when and where" line; a notification about no ride at all
    gives both (a car report), or the ride `request` it is about.

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
    asked = RideRequest.model_validate(request.model_dump()) if request is not None else None
    _executor.submit(
        deliver_all,
        targets,
        lambda locale: ride_message(kind, snapshot, locale, url=url, body=body, request=asked, **args),
        identity,
    )
    return len(targets)
