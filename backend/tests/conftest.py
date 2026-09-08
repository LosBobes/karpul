import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.database import get_session
from app.main import app
from app.seed import seed_corporate_cars


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        seed_corporate_cars(s)

    def override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override
    # No context manager: lifespan is skipped so the on-disk DB is never touched.
    yield TestClient(app)
    app.dependency_overrides.clear()
