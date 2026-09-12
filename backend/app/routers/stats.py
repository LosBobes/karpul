"""`/api/stats` and `/api/calendar`: a person's figures, history and calendar feed."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlmodel import Session

from ..calendar import person_ics
from ..database import get_session
from ..services import person_stats

router = APIRouter(tags=["stats"])

SessionDep = Annotated[Session, Depends(get_session)]


def _name_or_422(name: str) -> str:
    name = " ".join(name.split())
    if not name:
        raise HTTPException(422, "name must not be empty")
    return name


@router.get("/api/stats/me")
def my_stats(session: SessionDep, name: str = Query(min_length=1, max_length=80)):
    """Rides driven and ridden, people carried, km shared: this month and all time, plus the past rides."""
    return person_stats(session, _name_or_422(name))


@router.get("/api/calendar/{name}.ics")
def calendar_feed(name: str, session: SessionDep):
    """A subscribable calendar of everything `name` drives or rides in."""
    return Response(
        person_ics(session, _name_or_422(name)),
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "no-cache"},
    )
