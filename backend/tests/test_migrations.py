"""`create_all` never adds a column to a table that already exists, so a
database from an older release is patched on start (app/database.py)."""

from sqlalchemy import inspect, text
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel

from app.database import ADDED_COLUMNS, add_missing_columns, make_engine, relax_not_null
from app.models import AuthSession, Ride, User


def _engine():
    return make_engine("sqlite://", poolclass=StaticPool)


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


def test_email_becomes_optional_on_an_old_database():
    """The first accounts release made `appuser.email` NOT NULL; the table is
    rebuilt so it can be left out, keeping every row, id and sign-in."""
    engine = _engine()
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE appuser"))
        conn.execute(
            text(
                "CREATE TABLE appuser (id INTEGER NOT NULL, username VARCHAR NOT NULL, "
                "email VARCHAR NOT NULL, first_name VARCHAR NOT NULL, last_name VARCHAR NOT NULL, "
                "name_key VARCHAR NOT NULL, password_hash VARCHAR NOT NULL, created_at DATETIME NOT NULL, "
                "PRIMARY KEY (id))"
            )
        )
        conn.execute(text("CREATE UNIQUE INDEX ix_appuser_email ON appuser (email)"))
        conn.execute(
            text(
                "INSERT INTO appuser VALUES (7, 'ana', 'ana@example.com', 'Ana', 'P', 'ana p', 'x', "
                "'2026-01-01 00:00:00')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO authsession (token_hash, user_id, created_at, expires_at) "
                "VALUES ('h', 7, '2026-01-01 00:00:00', '2099-01-01 00:00:00')"
            )
        )

    assert relax_not_null(engine) == ["appuser.email"]
    assert relax_not_null(engine) == []
    assert add_missing_columns(engine) == []  # the rebuild brought `phone` along

    email = next(c for c in inspect(engine).get_columns("appuser") if c["name"] == "email")
    assert email["nullable"]
    assert {i["name"] for i in inspect(engine).get_indexes("appuser")} >= {"ix_appuser_email", "ix_appuser_name_key"}
    foreign = inspect(engine).get_foreign_keys("authsession")
    assert foreign[0]["referred_table"] == "appuser"

    with Session(engine) as s:
        ana = s.get(User, 7)
        assert ana is not None and ana.email == "ana@example.com" and ana.phone is None
        assert s.get(AuthSession, 1).user_id == 7
        s.add(User(username="marko", first_name="M", last_name="J", name_key="m j", password_hash="x"))
        s.add(User(username="mila", first_name="M", last_name="K", name_key="m k", password_hash="x"))
        s.commit()
