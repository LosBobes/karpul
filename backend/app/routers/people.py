"""`GET /api/people`: everyone with an account, for picking a colleague.

Putting someone else in a car is picking them from this list, never typing a
name (`join_ride` refuses a name nobody answers to). It carries only what the
board already shows of a person, the id and the name, so it is open to anyone
signed in; the admins' `GET /api/admin/users` keeps the rest. `is_admin` and an
admin's own `email` are there because whoever takes a shared car mails the
admins about it; nobody else's email leaves the server."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from ..admin import is_admin
from ..auth import CredsDep, require_user
from ..database import get_session
from ..models import User

router = APIRouter(prefix="/api/people", tags=["people"])

SessionDep = Annotated[Session, Depends(get_session)]


class Person(BaseModel):
    id: int
    display_name: str
    is_admin: bool = False
    email: str | None = None


@router.get("", response_model=list[Person])
def list_people(session: SessionDep, creds: CredsDep):
    require_user(session, creds)
    people = session.exec(select(User)).all()
    out = []
    for p in people:
        if p.id is None or p.disabled:
            continue
        admin = is_admin(p)
        out.append(Person(id=p.id, display_name=p.display_name, is_admin=admin, email=(p.email or None) if admin else None))
    return sorted(out, key=lambda p: p.display_name.casefold())
