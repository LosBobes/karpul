"""`/api/rides/{id}/waitlist`: the queue for a seat in a full car."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from ..access import booking_of, get_ride_or_404, is_driver
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..events import ride_saved
from ..models import WaitlistEntry
from ..schemas import RideRead, WaitlistJoin
from ..services import pickup_or_422, to_ride_read_dict

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
    pickup = pickup_or_422(ride, payload.pickup)
    ride.waitlist.append(WaitlistEntry(ride_id=ride.id, user_id=user.id, name=user.display_name, pickup=pickup))  # type: ignore[arg-type]
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
