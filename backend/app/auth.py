"""Accounts: username + password sign-in.

* A browser signs in once and keeps an opaque token (`AuthSession`), sent as
  `Authorization: Bearer <token>`. The token is stored only as its SHA-256.
* Passwords are PBKDF2-HMAC-SHA256 from the standard library, in the
  `pbkdf2_sha256$<rounds>$<salt>$<hash>` shape, so the cost can be raised later
  without invalidating anybody's password. No new dependency: the deployment
  already fights with packages that need a compiler (see `app/webpush.py`).
* `require_user` is the one answer to "who is doing this?", for reading the
  board as much as for changing it. There is no anonymous way in: the
  honour-based `X-User-Name` header Karpul started with is gone.
"""

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlmodel import Session, select

from .models import AuthSession, PasswordReset, User, utcnow

HASH_ALGO = "sha256"
HASH_NAME = f"pbkdf2_{HASH_ALGO}"
# PBKDF2 rounds for a new password. Stored with the hash, so raising this only
# affects passwords set from then on.
PBKDF2_ROUNDS = 200_000
SALT_BYTES = 16
TOKEN_BYTES = 32
# How long a browser stays signed in without being used. A session that is
# used is pushed on (`renew_session`), so only a browser left alone for this
# long sees the door again.
SESSION_DAYS = 30
# How much of a session's life has to be gone before using it writes a new
# expiry: a row per day per session at most, not one per request.
SESSION_RENEW_AFTER = timedelta(days=1)

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


def renew_session(session: Session, raw: str, now: datetime | None = None) -> bool:
    """Push a live session's expiry out to a full SESSION_DAYS from now, if
    it was last pushed more than SESSION_RENEW_AFTER ago. Returns whether it
    wrote anything; the caller commits. Called from a write route only
    (`GET /api/auth/me`, which the app calls on every start): the read routes
    must not turn into writers (database.begin_write)."""
    row = session_for_token(session, raw)
    if row is None:
        return False
    now = now or datetime.now(timezone.utc)
    if _as_utc(row.expires_at) - now > timedelta(days=SESSION_DAYS) - SESSION_RENEW_AFTER:
        return False
    row.expires_at = now + timedelta(days=SESSION_DAYS)
    session.add(row)
    return True


def purge_expired(session: Session, now: datetime | None = None) -> dict[str, int]:
    """Delete the sessions that have expired and the reset links that have
    expired or were used: they are refused anyway, and the tables would only
    grow. Returns how many of each went; the caller commits."""
    now = now or datetime.now(timezone.utc)
    gone = {"sessions": 0, "resets": 0}
    for row in session.exec(select(AuthSession)):
        if _as_utc(row.expires_at) <= now:
            session.delete(row)
            gone["sessions"] += 1
    for row in session.exec(select(PasswordReset)):
        if row.used_at is not None or _as_utc(row.expires_at) <= now:
            session.delete(row)
            gone["resets"] += 1
    return gone


def end_session(session: Session, raw: str) -> bool:
    """Sign this browser out. The caller commits."""
    row = session.exec(select(AuthSession).where(AuthSession.token_hash == hash_token(raw))).first()
    if row is None:
        return False
    session.delete(row)
    return True


def end_other_sessions(session: Session, user: User, keep: str | None) -> int:
    """Sign every other browser of `user` out (after a password change, or on
    request); `keep=None` signs them all out. Returns how many. The caller commits."""
    keep_hash = hash_token(keep) if keep else None
    rows = session.exec(select(AuthSession).where(AuthSession.user_id == user.id)).all()
    ended = 0
    for row in rows:
        if row.token_hash != keep_hash:
            session.delete(row)
            ended += 1
    return ended


# --- password reset links ----------------------------------------------------

# How long an admin-issued reset link works.
RESET_HOURS = 48


def issue_reset(session: Session, user: User) -> tuple[str, PasswordReset]:
    """A fresh one-time reset token for `user`; any older unused one stops
    working, so only the link handed over last is live. The caller commits."""
    for old in session.exec(
        select(PasswordReset).where(PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None))  # type: ignore[union-attr]
    ):
        session.delete(old)
    raw = secrets.token_urlsafe(TOKEN_BYTES)
    row = PasswordReset(
        token_hash=hash_token(raw),
        user_id=user.id,  # type: ignore[arg-type]
        expires_at=utcnow() + timedelta(hours=RESET_HOURS),
    )
    session.add(row)
    return raw, row


def reset_for_token(session: Session, raw: str) -> PasswordReset | None:
    """The live reset behind a raw token: known, unused and not expired."""
    row = session.exec(select(PasswordReset).where(PasswordReset.token_hash == hash_token(raw))).first()
    if row is None or row.used_at is not None:
        return None
    if _as_utc(row.expires_at) <= datetime.now(timezone.utc):
        return None
    return row


# --- who is doing this? ------------------------------------------------------


@dataclass(frozen=True)
class Credentials:
    """The bearer token of one request, read but not yet resolved.

    Deliberately free of database access: a mutating route takes the write lock
    on its session first (`database.begin_write`, which refuses a session that
    has already run a query), so the lookup has to happen in the handler body,
    not while dependencies are being resolved.
    """

    token: str | None = None


def bearer_token(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


def credentials(authorization: Annotated[str | None, Header()] = None) -> Credentials:
    return Credentials(token=bearer_token(authorization))


CredsDep = Annotated[Credentials, Depends(credentials)]


def user_for_token(session: Session, token: str | None) -> User | None:
    """The account behind a raw token, or None when it is unknown or expired."""
    if not token:
        return None
    row = session_for_token(session, token)
    return session.get(User, row.user_id) if row is not None else None


def require_user(session: Session, creds: Credentials) -> User:
    """The signed-in account, or 401.

    A token that is unknown or expired gets its own wording: the browser is
    holding a dead session and drops it (lib/api.ts), which shows the door again.
    """
    if not creds.token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in first")
    user = user_for_token(session, creds.token)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired; sign in again")
    return user


def user_by_login(session: Session, login: str) -> User | None:
    """Look an account up by its username or its email, either case."""
    key = login.strip().lower()
    if not key:
        return None
    return session.exec(
        select(User).where((User.username == key) | (User.email == key))
    ).first()
