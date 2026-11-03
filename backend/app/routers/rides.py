"""The rides themselves: the board, adding, editing and removing a ride.

The parts of a ride with rules of their own live beside it: the seats and
pickup points (`seats.py`), the driver's asks and the passengers' answers
(`proposals.py`), who drives (`drivers.py`), the odometer, the queue and the
thread. The rules they share are `app/ride_edits.py` (an edit held to the
creation rules, the consent fields) and `app/ride_removal.py` (a ride going)."""

import json
from datetime import date, timedelta
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import selectinload
from sqlmodel import Session, col, select

from .. import audit, geo
from ..access import get_ride_or_404, is_driver, may_run
from ..admin import admin_ids, is_admin
from ..auth import CredsDep, require_user
from ..calendar import ride_ics
from ..database import get_session, get_write_session
from ..events import request_saved, ride_saved
from ..models import Booking, Ride, RideRequest, User
from ..offices import garage_task
from ..push import notify
from ..ride_edits import CONSENT_FIELDS, apply_edit, approval_for, consenting, plan, prepare, tell_applied
from ..ride_removal import hands_over, remove_rides
from ..schemas import RideCreate, RideRead, RideUpdate
from ..services import board_extras, to_ride_read_dict, weekly_dates
from .seats import seated

router = APIRouter(prefix="/api/rides", tags=["rides"])

SessionDep = Annotated[Session, Depends(get_session)]
# Every mutation is check-then-write (free seats, car availability, ownership),
# so it runs under the write lock from the first statement (database.begin_write).
WriteSessionDep = Annotated[Session, Depends(get_write_session)]


@router.get("", response_model=list[RideRead])
def list_rides(
    session: SessionDep,
    creds: CredsDep,
    ride_date: date | None = Query(default=None, alias="date"),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
):
    """List rides for a single day (`date`) or an inclusive range (`from`/`to`).

    Without parameters the current week (Mon-Sun) is returned.
    """
    require_user(session, creds)
    if ride_date is not None:
        date_from = date_to = ride_date
    elif date_from is None and date_to is None:
        today = date.today()
        date_from = today - timedelta(days=today.weekday())
        date_to = date_from + timedelta(days=6)
    elif date_from is None:
        date_from = date_to
    elif date_to is None:
        date_to = date_from
    if date_to < date_from:  # type: ignore[operator]
        raise HTTPException(422, "`to` must not be before `from`")
    if (date_to - date_from).days > 92:  # type: ignore[operator]
        raise HTTPException(422, "Range may not exceed 92 days")

    stmt = (
        select(Ride)
        .where(Ride.ride_date >= date_from, Ride.ride_date <= date_to)
        # Bookings and queues are fetched in one extra query each for the whole
        # list rather than lazily once per ride; every tab reloads this on reconnect.
        .options(selectinload(Ride.bookings), selectinload(Ride.waitlist), selectinload(Ride.legs))  # type: ignore[arg-type]
        .order_by(Ride.ride_date, Ride.departure_time, Ride.id)
    )
    rides = session.exec(stmt).all()
    extras = board_extras(session, list(rides))
    return [to_ride_read_dict(r, extras) for r in rides]


def _request_to_answer(session: Session, payload: RideCreate, user: User) -> RideRequest | None:
    if payload.request_id is None:
        return None
    request = session.get(RideRequest, payload.request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride request not found")
    if request.ride_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Someone already answered that request")
    if request.user_id == user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "That is your own request")
    if payload.ride_date != request.request_date:
        raise HTTPException(422, "The ride has to be on the requested day")
    if payload.seats < 1:
        raise HTTPException(422, "Offer at least one seat to take the person who asked")
    return request


@router.post("", response_model=RideRead, status_code=status.HTTP_201_CREATED)
def create_ride(payload: RideCreate, session: WriteSessionDep, creds: CredsDep):
    """Add a ride, driven by the signed-in account: `driver_name` is
    overwritten with its name, the way `car_name` is for a company car. An
    admin may name another account in `driver_id` to add the ride for them
    (scheduling a company car for a colleague); that account then drives it,
    owns it like any ride of its own, and is told.

    With `repeat_until` one ride per week is added, all or nothing: a clash of
    the company car on any of the weeks fails the whole request and says which
    day. With `request_id` the ride answers someone's request and they are put
    in the (first) car. The first ride is returned; the rest reach every tab
    (this one included) over the live socket.
    """
    user = require_user(session, creds)
    driver = user
    if payload.driver_id is not None and payload.driver_id != user.id:
        if not is_admin(user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an admin can add a ride for someone else")
        found = session.get(User, payload.driver_id)
        if found is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
        driver = found
    payload = payload.model_copy(update={"driver_name": driver.display_name})
    request = _request_to_answer(session, payload, driver)
    dates = weekly_dates(payload.ride_date, payload.repeat_until)
    series_id = uuid4().hex if len(dates) > 1 else None
    rides: list[Ride] = []
    for ride_date in dates:
        occurrence = payload.model_copy(update={"ride_date": ride_date})
        try:
            data = prepare(session, occurrence)
            approval = approval_for(session, user, driver, occurrence)
        except HTTPException as exc:
            if exc.status_code == 409 and len(dates) > 1:
                raise HTTPException(409, f"{exc.detail} ({ride_date.isoformat()})") from exc
            raise
        ride = Ride(**data, driver_id=driver.id, series_id=series_id, approval=approval)
        session.add(ride)
        # Flush so the next occurrence's availability check sees this one.
        session.flush()
        rides.append(ride)
    # The places someone pinned become suggestions for the next ride.
    geo.learn(session, geo.route_places(payload), geo.folded(payload.points))
    if driver is not user:
        weeks = [("weeks", None, len(rides))] if len(rides) > 1 else []
        audit.record(session, user, "ride_added", driver.display_name, ride=rides[0], changes=weeks)
    queues: list[Ride] = []
    if request is not None:
        first = rides[0]
        first.bookings.append(Booking(ride_id=first.id, passenger_id=request.user_id, passenger_name=request.name))  # type: ignore[arg-type]
        request.ride_id = first.id
        session.add(request)
        queues = seated(session, first, request.user_id)
    session.commit()
    for ride in rides + queues:
        session.refresh(ride)
        ride_saved(ride, created=ride in rides)
    if request is not None:
        session.refresh(request)
        request_saved(request)
        notify(session, [request.user_id], "request_answered", rides[0], driver=driver.display_name)
    if driver is not user:
        notify(session, [driver.id], "ride_assigned", rides[0], name=user.display_name)
    if any(r.approval == "pending" for r in rides):
        notify(session, admin_ids(session), "approval_requested", rides[0], name=driver.display_name)
    if garage_task(rides[0]):
        notify(session, admin_ids(session), "garage_plate", rides[0], name=driver.display_name, plate=rides[0].plate)
    return to_ride_read_dict(rides[0])


@router.get("/last", response_model=RideRead | None)
def last_ride(session: SessionDep, creds: CredsDep):
    """The ride you added or were given to drive most recently, or null: what a
    new ride's form starts from (`User.prefill_rides`). A ride you handed over
    (`needs_driver`) is no longer yours to copy."""
    user = require_user(session, creds)
    ride = session.exec(
        select(Ride)
        .where(Ride.driver_id == user.id, Ride.needs_driver == False)  # noqa: E712
        .order_by(col(Ride.id).desc())
        .limit(1)
    ).first()
    return to_ride_read_dict(ride) if ride is not None else None


@router.get("/{ride_id}", response_model=RideRead)
def get_ride(ride_id: int, session: SessionDep, creds: CredsDep):
    require_user(session, creds)
    return to_ride_read_dict(get_ride_or_404(session, ride_id))


@router.get("/{ride_id}/calendar.ics", include_in_schema=True)
def ride_calendar(ride_id: int, session: SessionDep, creds: CredsDep):
    """The ride as a calendar file, for "Add to calendar"."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    return Response(
        ride_ics(ride, user),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="karpul-ride-{ride.id}.ics"'},
    )


@router.patch("/{ride_id}", response_model=RideRead)
def update_ride(ride_id: int, payload: RideUpdate, session: WriteSessionDep, creds: CredsDep):
    """Edit a ride. When its driver moves the day, a time, the start or the
    destination of a ride with passengers in it, that part is not made but
    asked (`proposal` on the ride, the passengers pushed `change_asked`): it
    is made once each of them agrees, and dropped when one declines. The
    rest of the edit is made at once. An admin's change to someone else's
    ride is made at once, all of it."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    if not may_run(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver or an admin can edit this ride")

    sent = payload.model_dump(exclude_unset=True)
    if is_driver(user, ride) and ride.unconfirmed:
        # The driver has looked at the ride from the paper log: it is theirs as it stands.
        ride.unconfirmed = False
        session.add(ride)
    held: dict = {}
    if is_driver(user, ride) and consenting(ride):
        moving = [k for k in CONSENT_FIELDS if k in sent and sent[k] != getattr(ride, k)]
        if moving:
            # Refused now rather than after everyone agreed.
            plan(session, user, ride, sent)
            held = {k: sent.pop(k) for k in moving}
            # The pins go with the places they belong to.
            if "points" in sent:
                held["points"] = sent.pop("points")
    applied = apply_edit(session, user, ride, sent)
    if held:
        ride.proposal = json.dumps(
            {
                "by": user.display_name,
                "by_id": user.id,
                "fields": RideUpdate.model_validate(held).model_dump(mode="json", exclude_unset=True),
                "agreed": [],
            }
        )
        session.add(ride)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    if held:
        notify(session, consenting(ride), "change_asked", ride, driver=user.display_name)
    if applied.moved:
        told = [b.passenger_id for b in ride.bookings if b not in applied.promoted]
        if told:
            notify(session, told, "ride_changed", ride, driver=user.display_name)
    # Any edit an admin makes to someone's ride is news to its driver.
    if not is_driver(user, ride):
        notify(session, [ride.driver_id], "ride_changed", ride, driver=user.display_name)
    tell_applied(session, ride, applied)
    return to_ride_read_dict(ride)


@router.delete("/{ride_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ride(
    ride_id: int,
    session: WriteSessionDep,
    creds: CredsDep,
    scope: Literal["one", "following"] = Query(default="one"),
):
    """Remove a ride; `scope=following` also removes the later rides of the
    same weekly series (the earlier ones, already gone or not, stay). A
    request the ride answered is open again."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    if not may_run(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the driver or an admin can cancel this ride")
    doomed = [ride]
    if scope == "following" and ride.series_id:
        stmt = select(Ride).where(Ride.series_id == ride.series_id, Ride.ride_date > ride.ride_date, Ride.id != ride.id)
        doomed += [r for r in session.exec(stmt) if may_run(user, r)]
    handed = [r for r in doomed if hands_over(user, r)]
    for r in handed:
        r.needs_driver = True
        session.add(r)
    remove_rides(session, user, [r for r in doomed if r not in handed])
    for r in handed:
        session.refresh(r)
        ride_saved(r, created=False)
        notify(session, [b.passenger_id for b in r.bookings], "driver_needed", r, driver=user.display_name)
