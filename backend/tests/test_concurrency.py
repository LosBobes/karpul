"""Twenty people tapping "get in" at the same moment must not overbook a car.

The other tests share one in-memory connection, which serialises everything by
accident. These run against a real SQLite file through the production engine
factory, with one thread per client, so the check-then-write races in the
routers are exercised for real: without `BEGIN IMMEDIATE` on the write path
(app/database.py) two joins read the same free seat and both insert.
"""

import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session, SQLModel

from app.database import get_session, make_engine
from app.main import app
from app.seed import seed_corporate_cars

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
CLIENTS = 20


@pytest.fixture()
def file_engine(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'karpul.db'}")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        seed_corporate_cars(s)

    def override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override
    yield engine
    app.dependency_overrides.clear()
    engine.dispose()


def ride_json(**overrides):
    base = {
        "ride_date": TOMORROW,
        "car_type": "own",
        "car_name": "Blue Golf",
        "driver_name": "Ana",
        "origin": "Novi Sad",
        "destination": "HQ",
        "departure_time": "07:30",
        "return_time": "16:30",
        "seats": 3,
    }
    base.update(overrides)
    return base


def hammer(n: int, fn: Callable[[TestClient, int], int]) -> list[int]:
    """Run `fn(client, i)` on `n` threads released at the same instant; return the status codes."""
    barrier = threading.Barrier(n)

    def run(i: int) -> int:
        client = TestClient(app)
        barrier.wait()
        return fn(client, i)

    with ThreadPoolExecutor(max_workers=n) as pool:
        return list(pool.map(run, range(n)))


def test_file_database_runs_in_wal_mode(file_engine):
    with file_engine.connect() as conn:
        assert conn.execute(text("PRAGMA journal_mode")).scalar() == "wal"
        assert conn.execute(text("PRAGMA busy_timeout")).scalar() > 0


def test_last_seats_are_never_overbooked(file_engine):
    ride = TestClient(app).post("/api/rides", json=ride_json(seats=3)).json()

    codes = hammer(
        CLIENTS,
        lambda c, i: c.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": f"P{i}"}).status_code,
    )

    assert sorted(codes) == [201] * 3 + [409] * (CLIENTS - 3)
    final = TestClient(app).get(f"/api/rides/{ride['id']}").json()
    assert len(final["bookings"]) == 3 and final["free_seats"] == 0


def test_same_person_joins_once(file_engine):
    ride = TestClient(app).post("/api/rides", json=ride_json(seats=8)).json()

    codes = hammer(
        CLIENTS,
        lambda c, _: c.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Marko"}).status_code,
    )

    assert codes.count(201) == 1 and codes.count(409) == CLIENTS - 1
    assert len(TestClient(app).get(f"/api/rides/{ride['id']}").json()["bookings"]) == 1


def test_company_car_is_handed_to_one_driver(file_engine):
    car = TestClient(app).get("/api/cars/corporate").json()[0]

    codes = hammer(
        CLIENTS,
        lambda c, i: c.post(
            "/api/rides",
            json=ride_json(car_type="corporate", corporate_car_id=car["id"], driver_name=f"D{i}", seats=1),
        ).status_code,
    )

    assert codes.count(201) == 1 and codes.count(409) == CLIENTS - 1
    rides = TestClient(app).get("/api/rides", params={"date": TOMORROW}).json()
    assert len(rides) == 1


def test_seats_cannot_drop_below_a_concurrent_join(file_engine):
    """The driver lowering seats and a passenger joining race for the same seat."""
    ride = TestClient(app).post("/api/rides", json=ride_json(seats=2)).json()
    TestClient(app).post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Marko"})

    def act(client: TestClient, i: int) -> int:
        if i % 2:
            return client.patch(f"/api/rides/{ride['id']}", json={"seats": 1}, headers={"X-User-Name": "Ana"}).status_code
        return client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": f"P{i}"}).status_code

    codes = hammer(CLIENTS, act)

    assert set(codes) <= {200, 201, 409}
    final = TestClient(app).get(f"/api/rides/{ride['id']}").json()
    assert len(final["bookings"]) <= final["seats"]


def test_readers_are_not_blocked_by_writers(file_engine):
    """A burst of reads and writes together must produce no 5xx and no lock errors."""
    ride = TestClient(app).post("/api/rides", json=ride_json(seats=8)).json()

    def act(client: TestClient, i: int) -> int:
        if i % 3:
            return client.get("/api/rides", params={"date": TOMORROW}).status_code
        return client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": f"P{i}"}).status_code

    codes = hammer(CLIENTS, act)
    assert set(codes) <= {200, 201, 409}, codes
