"""`/api/auth`: register, sign in, sign out, your own account, and the
password reset links an admin hands out.

The browser keeps the token from `register` / `login` / `reset` and sends it
as `Authorization: Bearer <token>` on everything afterwards; `app/auth.py`
turns it back into the person acting. Nothing here ever returns a password hash.

The three doors (sign-in, registration, a reset link) are throttled in
`app/ratelimit.py`.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from .. import ratelimit
from ..admin import is_admin
from ..auth import (
    CredsDep,
    burn_password_time,
    end_other_sessions,
    end_session,
    hash_password,
    renew_session,
    require_user,
    reset_for_token,
    start_session,
    user_by_login,
    verify_password,
)
from ..database import get_session, get_write_session
from ..events import ride_saved
from ..models import User, utcnow
from ..schemas import AuthOut, LoginIn, ProfileUpdate, RegisterIn, ResetIn, ResetInfo, UserRead
from ..services import claim_rows, new_calendar_token, norm_name, rename_person

router = APIRouter(prefix="/api/auth", tags=["auth"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]


def user_read(user: User) -> UserRead:
    """The account as its owner sees it, with `is_admin` as the server sees it."""
    out = UserRead.model_validate(user)
    out.is_admin = is_admin(user)
    return out


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
    return AuthOut(token=token, expires_at=row.expires_at, user=user_read(user))


@router.post("/register", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, request: Request, session: WriteSessionDep):
    """Create an account and sign the browser in with it.

    The display name (first + last) has to be free as well as the username and
    the email: the board identifies people by that name, so two accounts
    answering to one name would be two people sharing a seat list. Rides and
    seats that already go by the name and belong to no account (from before
    accounts, or a seat a driver gave this colleague by name) become theirs.
    """
    ip = f"ip:{ratelimit.client_ip(request)}"
    ratelimit.registrations.check(ip)
    ratelimit.registrations.hit(ip)
    name = f"{payload.first_name} {payload.last_name}"
    name_key = norm_name(name)
    clash = _taken(session, username=payload.username, email=payload.email, name_key=name_key)
    if clash is not None:
        if clash.username == payload.username:
            raise HTTPException(status.HTTP_409_CONFLICT, "That username is taken")
        if payload.email is not None and clash.email == payload.email:
            raise HTTPException(status.HTTP_409_CONFLICT, "That email already has an account")
        raise HTTPException(status.HTTP_409_CONFLICT, f"Another account already goes by {name}")
    user = User(
        username=payload.username,
        email=payload.email,
        phone=payload.phone,
        first_name=payload.first_name,
        last_name=payload.last_name,
        name_key=name_key,
        password_hash=hash_password(payload.password),
        calendar_token=new_calendar_token(),
    )
    session.add(user)
    # Flush so the row has its id before a session row (or a claimed seat) points at it.
    session.flush()
    claimed = claim_rows(session, user)
    out = _signed_in(session, user)
    for ride in claimed:
        session.refresh(ride)
        ride_saved(ride, created=False)
    return out


@router.post("/login", response_model=AuthOut)
def login(payload: LoginIn, request: Request, session: WriteSessionDep):
    """Sign in with the username or the email, plus the password.

    Wrong passwords are counted per account and per address; past the limit
    the answer is 429 until the window has passed, right password or not.
    """
    account = f"login:{payload.login.strip().lower()}"
    ip = f"ip:{ratelimit.client_ip(request)}"
    ratelimit.login_failures_by_account.check(account)
    ratelimit.login_failures_by_ip.check(ip)
    user = user_by_login(session, payload.login)
    if user is None:
        # Spend the same time as a real check, so a wrong username and a wrong
        # password are not told apart by how long the answer takes.
        burn_password_time(payload.password)
        ok = False
    else:
        ok = verify_password(payload.password, user.password_hash)
    if not ok:
        ratelimit.login_failures_by_account.hit(account)
        ratelimit.login_failures_by_ip.hit(ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password")
    ratelimit.login_failures_by_account.forget(account)
    return _signed_in(session, user)  # type: ignore[arg-type]


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(session: WriteSessionDep, creds: CredsDep):
    """Sign this browser out. Unknown or already-gone tokens are fine: the
    browser wanted to be signed out and it is."""
    if creds.token:
        end_session(session, creds.token)
        session.commit()


@router.post("/logout-others")
def logout_others(session: WriteSessionDep, creds: CredsDep):
    """Sign every other browser of this account out (a lost phone, a shared
    computer); this one stays signed in. Says how many were signed out."""
    user = require_user(session, creds)
    ended = end_other_sessions(session, user, creds.token)
    session.commit()
    return {"ended": ended}


@router.get("/me", response_model=UserRead)
def me(session: WriteSessionDep, creds: CredsDep):
    """Your account. A write route on purpose: the app calls it on every
    start, and that is when a session in use is pushed on (`renew_session`),
    so a phone opened now and then never sees the door again."""
    user = require_user(session, creds)
    if renew_session(session, creds.token):  # type: ignore[arg-type]
        session.commit()
        session.refresh(user)
    return user_read(user)


@router.post("/me/calendar-token", response_model=UserRead)
def rotate_calendar_token(session: WriteSessionDep, creds: CredsDep):
    """A new secret for your calendar feed: every calendar subscribed to the
    old address stops getting your rides."""
    user = require_user(session, creds)
    user.calendar_token = new_calendar_token()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user_read(user)


@router.patch("/me", response_model=UserRead)
def update_me(payload: ProfileUpdate, session: WriteSessionDep, creds: CredsDep):
    """Change your own name, email, mobile number or password. An empty email
    or number removes it; both are optional.

    A new name is carried across every ride and booking you are in
    (`services.rename_person`), so the board shows it; the changed rides are
    pushed to the other tabs. A new password signs your other browsers out.
    """
    user = require_user(session, creds)
    data = payload.model_dump(exclude_unset=True)
    old_name = user.display_name

    if "email" in data and payload.email != user.email:
        if payload.email is not None and _taken(session, email=payload.email) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "That email already has an account")
        user.email = payload.email

    if "phone" in data:
        user.phone = payload.phone

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
        renamed = rename_person(session, user, new_name)

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
    return user_read(user)


# --- password reset links (issued by an admin, routers/admin.py) --------------


def _live_reset(session: Session, token: str, request: Request):
    ip = f"ip:{ratelimit.client_ip(request)}"
    ratelimit.reset_attempts.check(ip)
    row = reset_for_token(session, token)
    if row is None:
        ratelimit.reset_attempts.hit(ip)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This reset link has expired or was already used")
    return row


@router.get("/reset/{token}", response_model=ResetInfo)
def reset_info(token: str, request: Request, session: SessionDep):
    """Whose reset link this is, so the page can say "Set a new password, Ana"."""
    row = _live_reset(session, token, request)
    user = session.get(User, row.user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This reset link has expired or was already used")
    return ResetInfo(username=user.username, display_name=user.display_name)


@router.post("/reset", response_model=AuthOut)
def reset_password(payload: ResetIn, request: Request, session: WriteSessionDep):
    """Set a new password with a reset link. The link is spent, every browser
    signed in to the account is signed out, and this one is signed in."""
    row = _live_reset(session, payload.token, request)
    user = session.get(User, row.user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This reset link has expired or was already used")
    user.password_hash = hash_password(payload.new_password)
    row.used_at = utcnow()
    end_other_sessions(session, user, None)
    session.add(user)
    session.add(row)
    ratelimit.login_failures_by_account.forget(f"login:{user.username}")
    return _signed_in(session, user)
