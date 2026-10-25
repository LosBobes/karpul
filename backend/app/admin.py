"""Who may manage the company-car pool and the accounts.

An admin is an account: either one whose `is_admin` flag another admin
switched on (`PATCH /api/admin/users/{id}`), or one whose username is listed
in `KARPUL_ADMINS` (comma-separated). The variable is how the first admin of a
fresh deployment comes to exist, and it cannot be undone from the app: an
admin by configuration stays one until the server's environment says
otherwise. It is read per request, not at import, so tests monkeypatch it.

Like `require_user`, the check runs in the handler body, after a mutating
route has taken the write lock (see `auth.Credentials`).
"""

import os

from fastapi import HTTPException, status
from sqlmodel import Session

from .auth import Credentials, require_user
from .models import User


def configured_admins() -> set[str]:
    return {u.strip().lower() for u in os.getenv("KARPUL_ADMINS", "").split(",") if u.strip()}


def admin_by_config(user: User) -> bool:
    return user.username in configured_admins()


def is_admin(user: User) -> bool:
    return user.is_admin or admin_by_config(user)


def admin_ids(session: Session) -> list[int | None]:
    """Every admin's account id: the ones flagged in the database and the
    ones configured, for a push that goes to the admins."""
    from sqlmodel import select

    return [u.id for u in session.exec(select(User)) if is_admin(u)]


def require_admin(session: Session, creds: Credentials) -> User:
    """The signed-in account if it is an admin: 401 without a session, 403 without the role."""
    user = require_user(session, creds)
    if not is_admin(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an admin can do that")
    return user
