"""`/api/notices`: "you lost a seat" (app/notices.py), until it is seen.

The app fetches them on every (re)connect and on `notices.changed`, which only
the account concerned hears, and shows them on top of the board; *Got it*
marks one seen. A notice for a day gone by is never shown."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..events import notices_changed
from ..models import SeatNotice
from ..schemas import SeatNoticeRead

router = APIRouter(prefix="/api/notices", tags=["notices"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]


@router.get("", response_model=list[SeatNoticeRead])
def list_notices(session: SessionDep, creds: CredsDep):
    """The signed-in person's unseen notices for today on, newest first."""
    user = require_user(session, creds)
    return session.exec(
        select(SeatNotice)
        .where(SeatNotice.user_id == user.id, col(SeatNotice.seen).is_(False), SeatNotice.ride_date >= date.today())
        .order_by(col(SeatNotice.id).desc())
    ).all()


@router.post("/{notice_id}/seen", status_code=status.HTTP_204_NO_CONTENT)
def mark_seen(notice_id: int, session: WriteSessionDep, creds: CredsDep):
    user = require_user(session, creds)
    notice = session.get(SeatNotice, notice_id)
    if notice is None or notice.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notice not found")
    notice.seen = True
    session.add(notice)
    session.commit()
    notices_changed(user.id)  # type: ignore[arg-type]
