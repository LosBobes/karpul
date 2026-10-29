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

from .. import geo
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..events import request_deleted, request_saved
from ..models import Ride, RideRequest
from ..offices import office_of
from ..push import notify
from ..schemas import RideRequestCreate, RideRequestRead
from ..services import all_stops, fold_name

router = APIRouter(prefix="/api/requests", tags=["requests"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]

# One person's open requests at a time; plenty for a fortnight of commutes.
MAX_OPEN_REQUESTS = 14
# How far back a ride still makes its driver someone who "drives that way".
DRIVES_THAT_WAY_DAYS = 60


def _place(name: str) -> str:
    """A place as one key: an office under any of its names, else the folded text."""
    return office_of(name) or fold_name(name)


def drivers_for(session: Session, request: RideRequest) -> list[int]:
    """The accounts that drive the way `request` asks to go: a ride of theirs
    from DRIVES_THAT_WAY_DAYS ago on, past or coming, that ends where the
    request ends and starts, or picks up, where it starts. The requester is
    not one of them."""
    start, end = _place(request.origin), _place(request.destination)
    pins = geo.load(request.points)
    start_pin, end_pin = pins.get(geo.fold(request.origin)), pins.get(geo.fold(request.destination))
    rides = session.exec(
        select(Ride).where(
            Ride.ride_date >= date.today() - timedelta(days=DRIVES_THAT_WAY_DAYS),
            col(Ride.driver_id).is_not(None),
            Ride.driver_id != request.user_id,
            Ride.needs_driver == False,  # noqa: E712 - SQL comparison
        )
    ).all()
    found = {r.driver_id for r in rides if _drives_that_way(r, start, end, start_pin, end_pin)}
    return sorted(uid for uid in found if uid is not None)


def _drives_that_way(
    ride: Ride, start: str, end: str, start_pin: dict[str, float] | None, end_pin: dict[str, float] | None
) -> bool:
    """Does `ride` end where the request ends and start, or pick up, where it
    starts? A place matches by name, or by its pin within `geo.NEAR_KM` of
    the request's when both are pinned."""
    pins = geo.load(ride.points)
    pickups = [ride.origin, *all_stops(ride)]
    ends = _place(ride.destination) == end or geo.near(end_pin, pins.get(geo.fold(ride.destination)))
    starts = start in {_place(p) for p in pickups} or any(geo.near(start_pin, pins.get(geo.fold(p))) for p in pickups)
    return ends and starts


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
    places = [payload.origin, payload.destination]
    points = geo.points_for(session, places, payload.points)
    request = RideRequest(
        **payload.model_dump(exclude={"points"}), points=geo.dump(points), user_id=user.id, name=user.display_name  # type: ignore[arg-type]
    )
    geo.learn(session, places, geo.folded(payload.points))
    session.add(request)
    session.commit()
    session.refresh(request)
    request_saved(request)
    notify(session, drivers_for(session, request), "request_made", request=request, name=user.display_name)
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
