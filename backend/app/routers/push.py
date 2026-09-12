"""`/api/push`: the browser's side of the notifications (see app/push.py)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session, get_write_session
from ..models import PushSubscription
from ..push import vapid
from ..services import norm_name, user_from_header

router = APIRouter(prefix="/api/push", tags=["push"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]
UserName = Annotated[str | None, Header(alias="X-User-Name")]


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=100)


class SubscriptionIn(BaseModel):
    """What `PushSubscription.toJSON()` gives in the browser, plus the app language."""

    endpoint: str = Field(min_length=1, max_length=1000)
    keys: PushKeys
    locale: str = Field(default="en", max_length=8)


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
def subscribe(payload: SubscriptionIn, session: WriteSessionDep, user: UserName = None):
    """Register this browser for the name it is using; the same endpoint sent
    again (after a name change, say) is updated in place."""
    if vapid() is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Push notifications are not configured on this server")
    user = user_from_header(user)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Set your name first (X-User-Name header)")
    if not payload.endpoint.startswith("https://"):
        raise HTTPException(422, "endpoint must be an https URL")
    locale = payload.locale if payload.locale in ("en", "sr") else "en"
    sub = session.exec(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)).first()
    if sub is None:
        sub = PushSubscription(endpoint=payload.endpoint, p256dh=payload.keys.p256dh, auth=payload.keys.auth, user_name=norm_name(user), locale=locale)
    else:
        sub.p256dh, sub.auth, sub.user_name, sub.locale = payload.keys.p256dh, payload.keys.auth, norm_name(user), locale
    session.add(sub)
    session.commit()
    return {"ok": True}


@router.delete("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(payload: EndpointIn, session: WriteSessionDep):
    sub = session.exec(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)).first()
    if sub is not None:
        session.delete(sub)
        session.commit()
