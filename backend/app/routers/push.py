"""`/api/push`: the browser's side of the notifications (see app/push.py)."""

import time
from typing import Annotated, Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from .. import push as push_module
from ..admin import require_admin
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..models import PushSubscription
from ..push import CATEGORIES, muted, vapid
from ..reminders import lead_of

router = APIRouter(prefix="/api/push", tags=["push"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=100)


class SubscriptionIn(BaseModel):
    """What `PushSubscription.toJSON()` gives in the browser, plus the app language."""

    endpoint: str = Field(min_length=1, max_length=1000)
    keys: PushKeys
    locale: str = Field(default="en", max_length=8)


Category = Literal["seats", "changes", "reminders", "messages", "requests", "approvals", "cars"]


class Preferences(BaseModel):
    """The kinds of push the signed-in person switched off, and how long
    before departure they want the reminder (app/reminders.py LEAD_CHOICES)."""

    muted: list[Category] = []
    remind_before: Literal[15, 30, 60] = 30


class EndpointIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=1000)


@router.get("/config")
def push_config():
    """Whether push is on, and the key the browser subscribes with."""
    identity = vapid()
    if identity is None:
        return {"enabled": False, "public_key": None}
    return {"enabled": True, "public_key": identity.public_key_b64}


@router.post("/subscriptions", status_code=status.HTTP_201_CREATED)
def subscribe(payload: SubscriptionIn, session: WriteSessionDep, creds: CredsDep):
    """Register this browser for the signed-in account; the same endpoint
    sent again is updated in place (and moves to whoever is signed in now)."""
    if vapid() is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Push notifications are not configured on this server")
    user = require_user(session, creds)
    if not payload.endpoint.startswith("https://"):
        raise HTTPException(422, "endpoint must be an https URL")
    locale = payload.locale if payload.locale in ("en", "sr") else "en"
    sub = session.exec(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)).first()
    if sub is None:
        sub = PushSubscription(endpoint=payload.endpoint, p256dh=payload.keys.p256dh, auth=payload.keys.auth, user_id=user.id, user_name=user.name_key, locale=locale)
    else:
        sub.p256dh, sub.auth, sub.locale = payload.keys.p256dh, payload.keys.auth, locale
        sub.user_id, sub.user_name = user.id, user.name_key
    session.add(sub)
    session.commit()
    return {"ok": True}


@router.delete("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(payload: EndpointIn, session: WriteSessionDep):
    sub = session.exec(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)).first()
    if sub is not None:
        session.delete(sub)
        session.commit()


@router.get("/preferences", response_model=Preferences)
def get_preferences(session: SessionDep, creds: CredsDep):
    user = require_user(session, creds)
    return Preferences(muted=muted(user), remind_before=lead_of(user))


@router.put("/preferences", response_model=Preferences)
def set_preferences(payload: Preferences, session: WriteSessionDep, creds: CredsDep):
    """Switch kinds of push off (or back on) for this account, in every browser."""
    user = require_user(session, creds)
    user.push_muted = ",".join(c for c in CATEGORIES if c in payload.muted)
    user.remind_before = payload.remind_before
    session.add(user)
    session.commit()
    return Preferences(muted=muted(user), remind_before=lead_of(user))


class TestIn(BaseModel):
    """This browser's endpoint, if it has one, so the answer can point it out."""

    endpoint: str | None = Field(default=None, max_length=1000)


class TestDevice(BaseModel):
    host: str
    locale: str
    this_device: bool
    status: int | None = None
    error: str | None = None
    removed: bool = False
    ms: int


class TestOut(BaseModel):
    enabled: bool
    devices: list[TestDevice] = []


@router.post("/test", response_model=TestOut)
def send_test(payload: TestIn, session: WriteSessionDep, creds: CredsDep):
    """An admin's tester: send a notification to every browser filed under
    their own account, now and in this request, and say what each push
    service answered. Muted categories do not apply. An endpoint the push
    service has dropped (404/410) is deleted, as `notify` would."""
    admin = require_admin(session, creds)
    identity = vapid()
    if identity is None:
        return TestOut(enabled=False)
    subs = session.exec(select(PushSubscription).where(PushSubscription.user_id == admin.id)).all()
    devices: list[TestDevice] = []
    for sub in subs:
        target = push_module.Target(sub.endpoint, sub.p256dh, sub.auth, sub.locale)
        started = time.monotonic()
        code: int | None = None
        error: str | None = None
        try:
            code = push_module.deliver(target, push_module.test_message(sub.locale), identity)
        except Exception as exc:  # noqa: BLE001 - reported back, not raised
            error = f"{type(exc).__name__}: {exc}"[:200]
        removed = code in (404, 410)
        if removed:
            session.delete(sub)
        devices.append(
            TestDevice(
                host=urlsplit(sub.endpoint).hostname or "?",
                locale=sub.locale,
                this_device=payload.endpoint is not None and sub.endpoint == payload.endpoint,
                status=code,
                error=error,
                removed=removed,
                ms=round((time.monotonic() - started) * 1000),
            )
        )
    session.commit()
    return TestOut(enabled=True, devices=devices)
