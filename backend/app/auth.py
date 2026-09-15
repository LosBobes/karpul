"""Accounts: username + password sign-in.

Karpul was built without accounts (see `app/admin.py` and the README): whoever
typed a name into the browser was that person, and `X-User-Name` carried it.
This module adds real accounts on top of that, without throwing the old rule
away:

* A browser signs in once and keeps an opaque token (`AuthSession`), sent as
  `Authorization: Bearer <token>`. The token is stored only as its SHA-256.
* Passwords are PBKDF2-HMAC-SHA256 from the standard library, in the
  `pbkdf2_sha256$<rounds>$<salt>$<hash>` shape, so the cost can be raised later
  without invalidating anybody's password. No new dependency: the deployment
  already fights with packages that need a compiler (see `app/webpush.py`).
* `actor_name` is the one answer to "who is doing this?". A valid token wins;
  otherwise the old `X-User-Name` header is honoured, unless the server is
  started with `KARPUL_REQUIRE_LOGIN=1`, which turns the honour system off and
  makes a token the only way to act.

The flag is read per request, not at import, like `KARPUL_ADMIN_PASSWORD`.
"""

import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlmodel import Session, select

from .models import AuthSession, User, utcnow
from .services import norm_name, user_from_header

HASH_ALGO = "sha256"
HASH_NAME = f"pbkdf2_{HASH_ALGO}"
# PBKDF2 rounds for a new password. Stored with the hash, so raising this only
# affects passwords set from then on.
PBKDF2_ROUNDS = 200_000
SALT_BYTES = 16
TOKEN_BYTES = 32
# How long a browser stays signed in without signing in again.
SESSION_DAYS = 30

MIN_PASSWORD = 8


# --- passwords ---------------------------------------------------------------


def hash_password(password: str, *, rounds: int | None = None) -> str:
    # Resolved per call, not bound as a default, so the cost can be turned down
    # in tests and raised here without touching the call sites.
    rounds = rounds or PBKDF2_ROUNDS
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(HASH_ALGO, password.encode(), salt, rounds)
    return f"{HASH_NAME}${rounds}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check of `password` against a stored hash."""
    try:
        algo, rounds, salt_hex, digest_hex = stored.split("$")
        if algo != HASH_NAME:
            return False
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.pbkdf2_hmac(
            HASH_ALGO, password.encode(), bytes.fromhex(salt_hex), int(rounds), dklen=len(expected)
        )
    except (AttributeError, ValueError):
        return False
    return hmac.compare_digest(actual, expected)


@lru_cache(maxsize=1)
def _decoy_hash() -> str:
    """A hash of nothing in particular, verified against when the username does
    not exist, so a wrong username costs the same time as a wrong password."""
    return hash_password(secrets.token_urlsafe(16))


def burn_password_time(password: str) -> None:
    verify_password(password, _decoy_hash())


# --- sessions ----------------------------------------------------------------


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def start_session(session: Session, user: User) -> tuple[str, AuthSession]:
    """Issue a token for `user`. The caller commits; the raw token is returned
    once and never stored."""
    raw = secrets.token_urlsafe(TOKEN_BYTES)
    row = AuthSession(
        token_hash=hash_token(raw),
        user_id=user.id,  # type: ignore[arg-type]
        expires_at=utcnow() + timedelta(days=SESSION_DAYS),
    )
    session.add(row)
    return raw, row


def _as_utc(value: datetime) -> datetime:
    """SQLite hands datetimes back without a zone; they were written as UTC."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def session_for_token(session: Session, raw: str) -> AuthSession | None:
    row = session.exec(select(AuthSession).where(AuthSession.token_hash == hash_token(raw))).first()
    if row is None:
        return None
    if _as_utc(row.expires_at) <= datetime.now(timezone.utc):
        return None
    return row


def end_session(session: Session, raw: str) -> bool:
    """Sign this browser out. The caller commits."""
    row = session.exec(select(AuthSession).where(AuthSession.token_hash == hash_token(raw))).first()
    if row is None:
        return False
    session.delete(row)
    return True


def end_other_sessions(session: Session, user: User, keep: str | None) -> None:
    """Sign every other browser of `user` out (after a password change)."""
    keep_hash = hash_token(keep) if keep else None
    rows = session.exec(select(AuthSession).where(AuthSession.user_id == user.id)).all()
    for row in rows:
        if row.token_hash != keep_hash:
            session.delete(row)


# --- who is doing this? ------------------------------------------------------


@dataclass(frozen=True)
class Credentials:
    """The identity headers of one request, read but not yet resolved.

    Deliberately free of database access: a mutating route takes the write lock
    on its session first (`database.begin_write`, which refuses a session that
    has already run a query), so the lookup has to happen in the handler body,
    not while dependencies are being resolved.
    """

    token: str | None = None
    name: str | None = None


def credentials(
    authorization: Annotated[str | None, Header()] = None,
    x_user_name: Annotated[str | None, Header(alias="X-User-Name")] = None,
) -> Credentials:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip() or None
    return Credentials(token=token, name=user_from_header(x_user_name))


CredsDep = Annotated[Credentials, Depends(credentials)]


def login_required() -> bool:
    """`KARPUL_REQUIRE_LOGIN=1`: no account, no actions. Off by default, which
    keeps the honour-based `X-User-Name` path the README describes."""
    return os.getenv("KARPUL_REQUIRE_LOGIN", "").strip().lower() in {"1", "true", "yes", "on"}


def current_user(session: Session, creds: Credentials) -> User | None:
    """The signed-in account, or None when the request carries no token.

    A token that is unknown or expired is an error, not "anonymous": the
    browser is holding a dead session and has to be told to sign in again.
    """
    if not creds.token:
        return None
    row = session_for_token(session, creds.token)
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired; sign in again")
    user = session.get(User, row.user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired; sign in again")
    return user


def actor_name(session: Session, creds: Credentials) -> str | None:
    """Who the request acts as, by display name, or None if it says nobody."""
    user = current_user(session, creds)
    if user is not None:
        return user.display_name
    if login_required():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to do that")
    return creds.name


def require_actor(session: Session, creds: Credentials) -> str:
    name = actor_name(session, creds)
    if not name:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Sign in first (or send the X-User-Name header)"
        )
    return name


def require_user(session: Session, creds: Credentials) -> User:
    """For the account endpoints themselves: a token, or 401."""
    user = current_user(session, creds)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in first")
    return user


def user_by_login(session: Session, login: str) -> User | None:
    """Look an account up by its username or its email, either case."""
    key = login.strip().lower()
    if not key:
        return None
    return session.exec(
        select(User).where((User.username == key) | (User.email == key))
    ).first()


def user_by_name_key(session: Session, name: str) -> User | None:
    return session.exec(select(User).where(User.name_key == norm_name(name))).first()
