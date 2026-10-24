"""`/api/admin`: the people side of being an admin (the car side is
`routers/cars.py`). An admin sees every account, can make another account an
admin or stop it being one, and can hand someone who forgot their password a
one-time link to set a new one; there is no email to send it by, so the admin
passes it on however the team talks.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..admin import admin_by_config, configured_admins, is_admin, require_admin
from ..auth import CredsDep, issue_reset
from ..database import get_session, get_write_session
from ..models import User
from ..schemas import AdminUserRead, AdminUserUpdate, ResetLinkOut

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
        others = [u for u in session.exec(select(User)).all() if u.id != user.id and is_admin(u)]
        if not others and not configured_admins():
            raise HTTPException(status.HTTP_409_CONFLICT, "There has to be at least one admin")
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
