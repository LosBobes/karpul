"""`/api/rides/{id}/waitlist`: the queue for a seat in a full car."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from ..access import booking_of, get_ride_or_404, is_driver, may_run
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..events import ride_saved
from ..models import WaitlistEntry
from ..schemas import MAX_STOPS, RideRead, WaitlistJoin
from ..services import all_stops, on_route, pickup_or_422, to_ride_read_dict

router = APIRouter(prefix="/api/rides", tags=["rides"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]


# --- waiting for a seat -------------------------------------------------------


@router.post("/{ride_id}/waitlist", response_model=RideRead, status_code=status.HTTP_201_CREATED)
def join_waitlist(ride_id: int, payload: WaitlistJoin, session: WriteSessionDep, creds: CredsDep):
    """Queue for a seat in a full car. Only for yourself: the first seat that
    frees up is yours without asking, so it is not something to sign anyone
    else up for."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    if is_driver(user, ride):
        raise HTTPException(status.HTTP_409_CONFLICT, "You drive this ride")
    if booking_of(ride, user) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "You are already in this car")
    if any(e.user_id == user.id for e in ride.waitlist):
        raise HTTPException(status.HTTP_409_CONFLICT, "You are already waiting for this car")
    if len(ride.bookings) < ride.seats:
        raise HTTPException(status.HTTP_409_CONFLICT, "There are free seats; get in instead")
    where = payload.new_stop
    known = on_route(ride, payload.pickup) if where is not None else pickup_or_422(ride, payload.pickup)
    entry = WaitlistEntry(ride_id=ride.id, user_id=user.id, name=user.display_name, pickup=known or "")  # type: ignore[arg-type]
    if known is None and where is not None:
        # Somewhere new: it goes on the route only once the seat is theirs.
        if not ride.passengers_add_stops and not may_run(user, ride):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "The driver does not take new pickup points on this ride")
        if len(all_stops(ride)) >= MAX_STOPS:
            raise HTTPException(status.HTTP_409_CONFLICT, f"This ride already has {MAX_STOPS} pickup points")
        entry.pickup, entry.new_stop_before, entry.new_stop_index = payload.pickup, where.before, where.index
        if where.point is not None:
            entry.new_stop_lat, entry.new_stop_lng = where.point.lat, where.point.lng
    ride.waitlist.append(entry)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    return to_ride_read_dict(ride)


@router.delete("/{ride_id}/waitlist/{entry_id}", response_model=RideRead)
def leave_waitlist(ride_id: int, entry_id: int, session: WriteSessionDep, creds: CredsDep):
    """Stop waiting; the driver may also take someone off the queue."""
    user = require_user(session, creds)
    ride = get_ride_or_404(session, ride_id)
    entry = next((e for e in ride.waitlist if e.id == entry_id), None)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not on the waiting list")
    if entry.user_id != user.id and not is_driver(user, ride):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the person waiting or the driver can do that")
    ride.waitlist.remove(entry)
    session.delete(entry)
    session.commit()
    session.refresh(ride)
    ride_saved(ride, created=False)
    return to_ride_read_dict(ride)
