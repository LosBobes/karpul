"""`/api/auth`: register, sign in, sign out and your own account.

The browser keeps the token from `register` / `login` and sends it as
`Authorization: Bearer <token>` on everything afterwards; `app/auth.py` turns
it back into the person acting. Nothing here ever returns a password hash.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..auth import (
    CredsDep,
    burn_password_time,
    end_other_sessions,
    end_session,
    hash_password,
    require_user,
    start_session,
    user_by_login,
    verify_password,
)
from ..database import get_session, get_write_session
from ..events import ride_saved
from ..models import User
from ..schemas import AuthOut, LoginIn, ProfileUpdate, RegisterIn, UserRead
from ..services import norm_name, rename_person

router = APIRouter(prefix="/api/auth", tags=["auth"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]


def _taken(session: Session, *, username: str | None = None, email: str | None = None, name_key: str | None = None) -> User | None:
    clauses = []
    if username is not None:
        clauses.append(User.username == username)
    if email is not None:
        clauses.append(User.email == email)
    if name_key is not None:
        clauses.append(User.name_key == name_key)
    if not clauses:
        return None
    where = clauses[0]
    for clause in clauses[1:]:
        where = where | clause
    return session.exec(select(User).where(where)).first()


def _signed_in(session: Session, user: User) -> AuthOut:
    token, row = start_session(session, user)
    session.commit()
    session.refresh(user)
    session.refresh(row)
    return AuthOut(token=token, expires_at=row.expires_at, user=UserRead.model_validate(user))


@router.post("/register", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, session: WriteSessionDep):
    """Create an account and sign the browser in with it.

    The display name (first + last) has to be free as well as the username and
    the email: the board identifies people by that name, so two accounts
    answering to one name would be two people sharing a seat list.
    """
    name = f"{payload.first_name} {payload.last_name}"
    name_key = norm_name(name)
    clash = _taken(session, username=payload.username, email=payload.email, name_key=name_key)
    if clash is not None:
        if clash.username == payload.username:
            raise HTTPException(status.HTTP_409_CONFLICT, "That username is taken")
        if clash.email == payload.email:
            raise HTTPException(status.HTTP_409_CONFLICT, "That email already has an account")
        raise HTTPException(status.HTTP_409_CONFLICT, f"Another account already goes by {name}")
    user = User(
        username=payload.username,
        email=payload.email,
        first_name=payload.first_name,
        last_name=payload.last_name,
        name_key=name_key,
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    # Flush so the row has its id before a session row points at it.
    session.flush()
    return _signed_in(session, user)


@router.post("/login", response_model=AuthOut)
def login(payload: LoginIn, session: WriteSessionDep):
    """Sign in with the username or the email, plus the password."""
    user = user_by_login(session, payload.login)
    if user is None:
        # Spend the same time as a real check, so a wrong username and a wrong
        # password are not told apart by how long the answer takes.
        burn_password_time(payload.password)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password")
    return _signed_in(session, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(session: WriteSessionDep, creds: CredsDep):
    """Sign this browser out. Unknown or already-gone tokens are fine: the
    browser wanted to be signed out and it is."""
    if creds.token:
        end_session(session, creds.token)
        session.commit()


@router.get("/me", response_model=UserRead)
def me(session: SessionDep, creds: CredsDep):
    return UserRead.model_validate(require_user(session, creds))


@router.patch("/me", response_model=UserRead)
def update_me(payload: ProfileUpdate, session: WriteSessionDep, creds: CredsDep):
    """Change your own name, email or password.

    A new name is carried across every ride and booking you are in
    (`services.rename_person`), so your history stays yours; the changed rides
    are pushed to the other tabs. A new password signs your other browsers out.
    """
    user = require_user(session, creds)
    data = payload.model_dump(exclude_unset=True)
    old_name = user.display_name

    if payload.email is not None and payload.email != user.email:
        if _taken(session, email=payload.email) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "That email already has an account")
        user.email = payload.email

    first = payload.first_name if payload.first_name is not None else user.first_name
    last = payload.last_name if payload.last_name is not None else user.last_name
    new_name = f"{first} {last}"
    renamed: list = []
    if norm_name(new_name) != user.name_key or new_name != old_name:
        clash = _taken(session, name_key=norm_name(new_name))
        if clash is not None and clash.id != user.id:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Another account already goes by {new_name}")
        user.first_name, user.last_name = first, last
        user.name_key = norm_name(new_name)
        renamed = rename_person(session, old_name, new_name)

    if "new_password" in data and payload.new_password is not None:
        if not verify_password(payload.current_password or "", user.password_hash):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Wrong current password")
        user.password_hash = hash_password(payload.new_password)
        # Whoever else is holding a session with the old password loses it.
        end_other_sessions(session, user, creds.token)

    session.add(user)
    session.commit()
    session.refresh(user)
    for ride in renamed:
        session.refresh(ride)
        ride_saved(ride, created=False)
    return UserRead.model_validate(user)
