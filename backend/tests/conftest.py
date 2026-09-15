from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel

from app.database import get_session, make_engine
from app.main import app
from app.seed import seed_corporate_cars


@pytest.fixture()
def engine():
    # Same pragmas and transaction control as production (app.database), on one
    # shared in-memory connection.
    target = make_engine("sqlite://", poolclass=StaticPool)
    SQLModel.metadata.create_all(target)
    with Session(target) as s:
        seed_corporate_cars(s)
    return target


@pytest.fixture()
def session_factory(engine):
    """A session on the same in-memory database the client is using, for a test
    that wants to look at (or reach into) the rows behind an endpoint."""

    @contextmanager
    def open_session():
        with Session(engine) as session:
            yield session

    return open_session


@pytest.fixture()
def client(engine):
    def override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override
    # No context manager: lifespan is skipped so the on-disk DB is never touched.
    yield TestClient(app)
    app.dependency_overrides.clear()
