"""`/api/requests`: "I need a ride Tuesday around 8, Novi Sad to HQ".

A request is the passenger's side of the board. It is answered either by a
driver adding a ride for it (`POST /api/rides` with `request_id`, which puts
the requester in the car) or by the requester getting into any car that day;
either way `ride_id` says which ride it was. Removing that ride opens the
request again. Every change goes out over the socket (`request.saved`,
`request.deleted`).
"""

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, col, select

from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..events import request_deleted, request_saved
from ..models import RideRequest
from ..schemas import RideRequestCreate, RideRequestRead

router = APIRouter(prefix="/api/requests", tags=["requests"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]

# One person's open requests at a time; plenty for a fortnight of commutes.
MAX_OPEN_REQUESTS = 14


@router.get("", response_model=list[RideRequestRead])
def list_requests(
    session: SessionDep,
    creds: CredsDep,
    date_from: date = Query(alias="from"),
    date_to: date = Query(alias="to"),
):
    """Requests between `from` and `to`, inclusive, open and answered, in
    board order (day, then time)."""
    require_user(session, creds)
    if date_to < date_from:
        raise HTTPException(422, "`to` must not be before `from`")
    if (date_to - date_from).days > 92:
        raise HTTPException(422, "Range may not exceed 92 days")
    stmt = (
        select(RideRequest)
        .where(RideRequest.request_date >= date_from, RideRequest.request_date <= date_to)
        .order_by(RideRequest.request_date, RideRequest.departure_time, RideRequest.id)
    )
    return session.exec(stmt).all()


@router.post("", response_model=RideRequestRead, status_code=status.HTTP_201_CREATED)
def create_request(payload: RideRequestCreate, session: WriteSessionDep, creds: CredsDep):
    user = require_user(session, creds)
    if payload.request_date < date.today():
        raise HTTPException(422, "That day is already over")
    if payload.request_date > date.today() + timedelta(days=92):
        raise HTTPException(422, "Ask for a ride at most three months ahead")
    open_count = len(
        session.exec(
            select(RideRequest.id).where(
                RideRequest.user_id == user.id,
                RideRequest.request_date >= date.today(),
                col(RideRequest.ride_id).is_(None),
            )
        ).all()
    )
    if open_count >= MAX_OPEN_REQUESTS:
        raise HTTPException(status.HTTP_409_CONFLICT, f"You already have {MAX_OPEN_REQUESTS} open requests")
    request = RideRequest(**payload.model_dump(), user_id=user.id, name=user.display_name)  # type: ignore[arg-type]
    session.add(request)
    session.commit()
    session.refresh(request)
    request_saved(request)
    return request


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request(request_id: int, session: WriteSessionDep, creds: CredsDep):
    """Withdraw your own request (answered or not: the seat, if any, stays)."""
    user = require_user(session, creds)
    request = session.get(RideRequest, request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride request not found")
    if request.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the person who asked can withdraw a request")
    session.delete(request)
    session.commit()
    request_deleted(request_id)
