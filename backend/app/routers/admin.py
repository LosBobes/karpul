"""`/api/admin`: the people side of being an admin (the car side is
`routers/cars.py`). An admin sees every account, can make another account an
admin or stop it being one, and can hand someone who forgot their password a
one-time link to set a new one; there is no email to send it by, so the admin
passes it on however the team talks. An admin can also delete an account.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, delete, select

from ..admin import admin_by_config, configured_admins, is_admin, require_admin
from ..auth import CredsDep, issue_reset
from ..database import get_session, get_write_session
from ..events import disconnect, request_deleted, request_saved, ride_deleted, ride_saved
from ..models import (
    Booking,
    PasswordReset,
    PushSubscription,
    Ride,
    RideMessage,
    RideRequest,
    User,
    WaitlistEntry,
)
from ..push import notify
from ..schemas import AdminUserRead, AdminUserUpdate, ResetLinkOut
from ..services import promote_waitlist

router = APIRouter(prefix="/api/admin", tags=["admin"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]


def _admin_view(user: User) -> AdminUserRead:
    return AdminUserRead(
        id=user.id,  # type: ignore[arg-type]
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        phone=user.phone,
        is_admin=is_admin(user),
        admin_by_config=admin_by_config(user),
        created_at=user.created_at,
    )


def _keep_an_admin(session: Session, leaving: User) -> None:
    """409 if `leaving` is the last admin, or nobody could manage the pool any more."""
    others = [u for u in session.exec(select(User)).all() if u.id != leaving.id and is_admin(u)]
    if not others and not configured_admins():
        raise HTTPException(status.HTTP_409_CONFLICT, "There has to be at least one admin")


def _get_user_or_404(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    return user


@router.get("/users", response_model=list[AdminUserRead])
def list_users(session: SessionDep, creds: CredsDep):
    require_admin(session, creds)
    users = session.exec(select(User).order_by(User.first_name, User.last_name, User.id)).all()
    return [_admin_view(u) for u in users]


@router.patch("/users/{user_id}", response_model=AdminUserRead)
def update_user(user_id: int, payload: AdminUserUpdate, session: WriteSessionDep, creds: CredsDep):
    """Make an account an admin, or stop it being one. An admin through
    KARPUL_ADMINS stays one whatever this says, and the last admin cannot be
    removed, or nobody could manage the pool any more."""
    require_admin(session, creds)
    user = _get_user_or_404(session, user_id)
    if not payload.is_admin and admin_by_config(user):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{user.display_name} is an admin by the server's configuration (KARPUL_ADMINS)",
        )
    if not payload.is_admin and user.is_admin:
        _keep_an_admin(session, user)
    user.is_admin = payload.is_admin
    session.add(user)
    session.commit()
    session.refresh(user)
    return _admin_view(user)


@router.post("/users/{user_id}/reset-link", response_model=ResetLinkOut, status_code=status.HTTP_201_CREATED)
def reset_link(user_id: int, session: WriteSessionDep, creds: CredsDep):
    """A one-time link (`/reset/<token>`) that lets this person set a new
    password; any link issued for them before stops working."""
    require_admin(session, creds)
    user = _get_user_or_404(session, user_id)
    token, row = issue_reset(session, user)
    session.commit()
    session.refresh(row)
    return ResetLinkOut(path=f"/reset/{token}", expires_at=row.expires_at)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, session: WriteSessionDep, creds: CredsDep):
    """Delete an account. What it had planned goes: the rides it would drive
    from today on (their passengers are told), its seats in coming rides (the
    seat goes to the first in line), its waiting-list places and its ride
    requests. The past stays as it was written, under the name it had then,
    so the history and the car-usage figures still add up; its messages stay
    in their threads too. Its browsers are signed out, live sockets included.
    """
    admin = require_admin(session, creds)
    user = _get_user_or_404(session, user_id)
    if user.id == admin.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot delete your own account")
    if admin_by_config(user):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{user.display_name} is an admin by the server's configuration (KARPUL_ADMINS)",
        )
    if is_admin(user):
        _keep_an_admin(session, user)
    today = date.today()

    # Rides it would drive: cancelled, as if it had removed them itself.
    gone: list[tuple[int, date]] = []
    reopened: list[RideRequest] = []
    for ride in session.exec(select(Ride).where(Ride.driver_id == user.id, Ride.ride_date >= today)).all():
        passengers = [b.passenger_id for b in ride.bookings]
        if passengers:
            notify(session, passengers, "ride_removed", ride, driver=ride.driver_name)
        for request in session.exec(select(RideRequest).where(RideRequest.ride_id == ride.id)):
            request.ride_id = None
            session.add(request)
            reopened.append(request)
        gone.append((ride.id, ride.ride_date))  # type: ignore[arg-type]
        session.delete(ride)

    # Its seats in coming rides, and its places in their queues.
    changed: dict[int, Ride] = {}
    promoted: list[tuple[Ride, list[Booking]]] = []
    seats = session.exec(
        select(Booking).join(Ride).where(Booking.passenger_id == user.id, Ride.ride_date >= today)
    ).all()
    for booking in seats:
        ride = booking.ride
        ride.bookings.remove(booking)
        session.delete(booking)
        changed[ride.id] = ride  # type: ignore[index]
        notify(session, [ride.driver_id], "got_out", ride, name=booking.passenger_name)
    for entry in session.exec(select(WaitlistEntry).where(WaitlistEntry.user_id == user.id)).all():
        entry.ride.waitlist.remove(entry)
        session.delete(entry)
        changed[entry.ride_id] = entry.ride
    for ride in changed.values():
        if ride in session.deleted:
            continue
        promoted.append((ride, promote_waitlist(session, ride)))

    requests = session.exec(select(RideRequest).where(RideRequest.user_id == user.id)).all()
    withdrawn = [r.id for r in requests]
    for request in requests:
        session.delete(request)
    reopened = [r for r in reopened if r.user_id != user.id]

    # The past keeps its names; only the link to the account goes.
    for booking in session.exec(select(Booking).where(Booking.passenger_id == user.id)).all():
        booking.passenger_id = None
        session.add(booking)
    for ride in session.exec(select(Ride).where(Ride.driver_id == user.id)).all():
        if ride not in session.deleted:
            ride.driver_id = None
            session.add(ride)
    for message in session.exec(select(RideMessage).where(RideMessage.author_id == user.id)).all():
        message.author_id = None
        session.add(message)
    session.exec(delete(PushSubscription).where(col(PushSubscription.user_id) == user.id))
    session.exec(delete(PasswordReset).where(col(PasswordReset.user_id) == user.id))
    session.delete(user)  # its sessions go with it
    session.commit()

    disconnect(user_id)
    for rid, rdate in gone:
        ride_deleted(rid, rdate)
    for ride, booked in promoted:
        session.refresh(ride)
        ride_saved(ride, created=False)
        if booked:
            notify(session, [b.passenger_id for b in booked], "seat_freed", ride, driver=ride.driver_name)
    for rid in withdrawn:
        request_deleted(rid)  # type: ignore[arg-type]
    for request in reopened:
        session.refresh(request)
        request_saved(request)
