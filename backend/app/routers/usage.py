"""`/api/usage`: which screens get opened, counted with no one's name on it.

The app sends the names of the views and sheets opened (`lib/usage.ts`, in
batches); each one adds 1 to that day's `UsageCount`. The account is needed
to send (signed-out noise stays out) but is not stored: the table has only the
day, the name and the count. Admins read the totals at `/api/admin/usage`, the
*Usage* tab's *What gets opened*."""

import re
from collections import defaultdict
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from .. import ratelimit
from ..admin import require_admin
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..models import UsageCount

router = APIRouter(tags=["usage"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]

# A screen's name: a kind and a name ("view.week", "sheet.myRides"), nothing a
# person typed. Anything else is a 422, so the table can never hold free text.
USAGE_KEY = re.compile(r"^(view|sheet|plan)\.[A-Za-z][A-Za-z0-9]{0,39}$")
MAX_KEYS = 50


class UsageIn(BaseModel):
    keys: list[str] = Field(max_length=MAX_KEYS)

    @field_validator("keys")
    @classmethod
    def screen_names(cls, v: list[str]) -> list[str]:
        for key in v:
            if not USAGE_KEY.match(key):
                raise ValueError("Not a screen name")
        return v


@router.post("/api/usage", status_code=status.HTTP_204_NO_CONTENT)
def count_usage(payload: UsageIn, session: WriteSessionDep, creds: CredsDep):
    """Add one to today's count of each screen in `keys` (a name twice is two)."""
    user = require_user(session, creds)
    ratelimit.spend("usage", user.id)
    today = date.today()
    tally: dict[str, int] = defaultdict(int)
    for key in payload.keys:
        tally[key] += 1
    if not tally:
        return
    rows = {r.key: r for r in session.exec(select(UsageCount).where(UsageCount.day == today, UsageCount.key.in_(list(tally)))).all()}  # type: ignore[attr-defined]
    for key, n in tally.items():
        row = rows.get(key) or UsageCount(day=today, key=key, count=0)
        row.count += n
        session.add(row)
    session.commit()


@router.get("/api/admin/usage")
def usage_report(session: SessionDep, creds: CredsDep, days: Annotated[int, Query(ge=1, le=365)] = 30):
    """Per screen, how often it was opened in the last `days` days (today
    included) and on how many of them, most opened first."""
    require_admin(session, creds)
    start = date.today() - timedelta(days=days - 1)
    rows = session.exec(select(UsageCount).where(UsageCount.day >= start)).all()
    total: dict[str, int] = defaultdict(int)
    on_days: dict[str, int] = defaultdict(int)
    for r in rows:
        total[r.key] += r.count
        on_days[r.key] += 1
    screens = sorted(({"key": k, "count": n, "days": on_days[k]} for k, n in total.items()), key=lambda s: (-s["count"], s["key"]))
    return {"from": start, "to": date.today(), "screens": screens}
