"""`/api/stats` and `/api/calendar`: your figures, history and calendar feed."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlmodel import Session, select

from ..auth import CredsDep, require_user
from ..calendar import person_ics
from ..database import get_session
from ..models import User
from ..services import person_stats

router = APIRouter(tags=["stats"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/api/stats/me")
def my_stats(session: SessionDep, creds: CredsDep):
    """Rides driven and ridden, people carried, km shared: this month and all
    time, plus the past rides. Always the signed-in account's own."""
    return person_stats(session, require_user(session, creds))


@router.get("/api/calendar/{token}.ics")
def calendar_feed(token: str, session: SessionDep):
    """A subscribable calendar of everything one person drives or rides in.

    A calendar app cannot sign in, so the secret in the address is the
    credential (`User.calendar_token`, shown in *Your rides* and rotated from
    there); an unknown one is a plain 404.
    """
    user = session.exec(select(User).where(User.calendar_token == token)).first() if token else None
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Calendar not found")
    return Response(
        person_ics(session, user),
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "no-cache"},
    )
