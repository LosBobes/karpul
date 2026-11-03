"""A driver's held change and a passenger's suggested time (`Ride.proposal`).

`PATCH /api/rides/{id}` (rides.py) is where a driver's change becomes an ask;
here each passenger answers it, a passenger suggests another time, and
whoever asked takes it back. The rules are in `app/ride_edits.py`."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from ..access import get_ride_or_404, may_run
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..events import ride_saved
from ..models import Ride, User
from ..push import notify
from ..ride_edits import consenting, plan, proposal_of, settle, tell_applied
from ..schemas import RideRead, RideUpdate, TimeSuggestion
from ..services import to_ride_read_dict

router = APIRouter(prefix="/api/rides", tags=["rides"])

SessionDep = Annotated[Session, Depends(get_session)]
# Every mutation is check-then-write (free seats, car availability, ownership),
# so it runs under the write lock from the first statement (database.begin_write).
WriteSessionDep = Annotated[Session, Depends(get_write_session)]


def _proposal_or_409(session: Session, creds, ride_id: int) -> tuple[User, Ride, dict]:
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    asked = proposal_of(ride)
    if asked is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "The driver is not asking for a change")
    return user, ride, asked


def _answering_passenger(user: User, ride: Ride) -> None:
    if user.id not in consenting(ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a passenger in this car can answer the driver")


def _answering_driver(user: User, ride: Ride) -> None:
    if not may_run(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver or an admin can answer a suggestion")


def _saved(session: Session, ride: Ride) -> None:
    session.add(ride)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)


@router.post("/{ride_id}/proposal/suggest", response_model=RideRead)
def suggest_time(ride_id: int, payload: TimeSuggestion, session: WriteSessionDep, creds: CredsDep):
    """A passenger suggests another departure or return time. It goes to the
    driver (`time_suggested`); once the driver accepts it, it is the driver's
    ask like any other, the suggester counted as agreeing. One ask at a time."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    _answering_passenger(user, ride)
    if ride.proposal:
        raise HTTPException(status.HTTP_409_CONFLICT, "A change is already asked on this ride")
    sent = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v != getattr(ride, k)}
    if not sent:
        raise HTTPException(422, "Suggest a departure or return time other than the ride's")
    driver = session.get(User, ride.driver_id) if ride.driver_id is not None else None
    plan(session, driver or user, ride, sent)
    ride.proposal = json.dumps(
        {
            "by": user.display_name,
            "by_id": user.id,
            "suggested": True,
            "fields": RideUpdate.model_validate(sent).model_dump(mode="json", exclude_unset=True),
            "agreed": [user.id],
        }
    )
    _saved(session, ride)
    notify(session, [ride.driver_id], "time_suggested", ride, name=user.display_name)
    return to_ride_read_dict(ride)


@router.post("/{ride_id}/proposal/agree", response_model=RideRead)
def agree_to_change(ride_id: int, session: WriteSessionDep, creds: CredsDep):
    """A passenger agrees to the driver's change. The last one to agree makes
    it, held to the rules as they stand now (a shared car taken since is the
    usual 409, and the agreement is not kept); the driver is pushed.

    On a passenger's suggestion it is the driver (or an admin) accepting it:
    it becomes the driver's ask to the others, made at once when nobody else
    is waiting."""
    user, ride, asked = _proposal_or_409(session, creds, ride_id)
    if asked.get("suggested"):
        _answering_driver(user, ride)
        sent = RideUpdate.model_validate(asked["fields"]).model_dump(exclude_unset=True)
        plan(session, user, ride, sent)
        suggester = asked["by_id"]
        ride.proposal = json.dumps(
            {
                "by": ride.driver_name,
                "by_id": ride.driver_id,
                "suggested_by": asked["by"],
                "fields": asked["fields"],
                "agreed": asked["agreed"],
            }
        )
        applied = settle(session, ride)
        _saved(session, ride)
        notify(session, [suggester], "suggestion_accepted", ride, name=user.display_name)
        if applied is None and ride.proposal:
            waiting = set(consenting(ride)) - set(asked["agreed"])
            notify(session, list(waiting), "change_asked", ride, driver=ride.driver_name)
        tell_applied(session, ride, applied)
        return to_ride_read_dict(ride)
    _answering_passenger(user, ride)
    if user.id not in asked["agreed"]:
        asked["agreed"].append(user.id)
    ride.proposal = json.dumps(asked)
    applied = settle(session, ride)
    _saved(session, ride)
    if applied is not None:
        notify(session, [ride.driver_id], "change_agreed", ride)
        tell_applied(session, ride, applied)
    return to_ride_read_dict(ride)


@router.post("/{ride_id}/proposal/decline", response_model=RideRead)
def decline_change(ride_id: int, session: WriteSessionDep, creds: CredsDep):
    """A passenger says no: the change is dropped and the driver is pushed who
    said no. The ride stays as it was. On a passenger's suggestion it is the
    driver saying no, and the suggester is told."""
    user, ride, asked = _proposal_or_409(session, creds, ride_id)
    if asked.get("suggested"):
        _answering_driver(user, ride)
        ride.proposal = ""
        _saved(session, ride)
        notify(session, [asked["by_id"]], "suggestion_declined", ride, name=user.display_name)
        return to_ride_read_dict(ride)
    _answering_passenger(user, ride)
    ride.proposal = ""
    _saved(session, ride)
    notify(session, [ride.driver_id], "change_declined", ride, name=user.display_name)
    return to_ride_read_dict(ride)


@router.delete("/{ride_id}/proposal", response_model=RideRead)
def withdraw_change(ride_id: int, session: WriteSessionDep, creds: CredsDep):
    """Whoever asked takes it back: the driver (or an admin) their change, a
    passenger their suggestion."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    asked = proposal_of(ride)
    if not may_run(user, ride) and not (asked is not None and asked.get("by_id") == user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver or an admin can edit this ride")
    if ride.proposal:
        ride.proposal = ""
        _saved(session, ride)
    return to_ride_read_dict(ride)
