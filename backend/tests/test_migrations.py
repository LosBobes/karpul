"""`create_all` never adds a column to a table that already exists, so a
database from an older release is patched on start (app/database.py)."""

from sqlalchemy import inspect, text
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.database import ADDED_COLUMNS, add_missing_columns
from app.models import Ride


def _engine():
    return create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)


def _columns(engine, table: str) -> set[str]:
    return {c["name"] for c in inspect(engine).get_columns(table)}


def test_adds_columns_an_old_database_lacks():
    engine = _engine()
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        for table, column, _ in ADDED_COLUMNS:
            conn.execute(text(f"ALTER TABLE {table} DROP COLUMN {column}"))
    assert "passengers_manage" not in _columns(engine, "ride")

    assert add_missing_columns(engine) == [f"{t}.{c}" for t, c, _ in ADDED_COLUMNS]
    assert "passengers_manage" in _columns(engine, "ride")
    # Second run: nothing left to do.
    assert add_missing_columns(engine) == []

    # Existing rows get the default, and the model reads them back.
    with Session(engine) as s:
        s.exec(
            text(
                "INSERT INTO ride (ride_date, car_type, car_name, driver_name, origin, destination, "
                "departure_time, seats, notes, created_at) VALUES ('2026-01-05', 'own', 'Golf', 'Ana', "
                "'A', 'B', '08:00:00', 2, '', '2026-01-01 00:00:00')"
            )
        )
        s.commit()
        ride = s.get(Ride, 1)
        assert ride is not None and ride.passengers_manage is False


def test_fresh_database_needs_nothing():
    engine = _engine()
    SQLModel.metadata.create_all(engine)
    assert add_missing_columns(engine) == []


def test_missing_table_is_skipped():
    # Before `create_all` there is no ride table at all; the patch must not crash.
    assert add_missing_columns(_engine()) == []
