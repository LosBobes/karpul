"""The chores (app/housekeeping.py): sessions that slide, expired rows that
go, and a nightly backup that rotates."""

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, SQLModel, select

from app import auth
from app.housekeeping import backup_due, backups_in, run_housekeeping, write_backup
from app.models import AuthSession, CorporateCar, PasswordReset, User
from tests.conftest import make_person

# --- sessions slide ------------------------------------------------------------


def test_using_the_app_pushes_the_session_on(client, session_factory):
    _, token = make_person(client.engine, "Ana Petrović")
    with session_factory() as s:
        row = s.exec(select(AuthSession)).one()
        # Issued a fortnight ago: half gone.
        row.expires_at = datetime.now(timezone.utc) + timedelta(days=auth.SESSION_DAYS - 14)
        s.add(row)
        s.commit()
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    with session_factory() as s:
        row = s.exec(select(AuthSession)).one()
        left = auth._as_utc(row.expires_at) - datetime.now(timezone.utc)
        assert timedelta(days=auth.SESSION_DAYS) - timedelta(minutes=1) < left <= timedelta(days=auth.SESSION_DAYS)
        before = row.expires_at
    # Used again right away: no second write (one a day at most).
    client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    with session_factory() as s:
        assert s.exec(select(AuthSession)).one().expires_at == before


def test_a_dead_session_does_not_come_back(client, session_factory):
    _, token = make_person(client.engine, "Ana Petrović")
    with session_factory() as s:
        row = s.exec(select(AuthSession)).one()
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        s.add(row)
        s.commit()
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_purge_drops_expired_sessions_and_spent_reset_links(session_factory):
    now = datetime.now(timezone.utc)
    with session_factory() as s:
        user = User(username="ana", first_name="Ana", last_name="P", name_key="ana p", password_hash="!")
        s.add(user)
        s.flush()
        s.add(AuthSession(token_hash="live", user_id=user.id, expires_at=now + timedelta(days=1)))
        s.add(AuthSession(token_hash="dead", user_id=user.id, expires_at=now - timedelta(days=1)))
        s.add(PasswordReset(token_hash="fresh", user_id=user.id, expires_at=now + timedelta(hours=1)))
        s.add(PasswordReset(token_hash="old", user_id=user.id, expires_at=now - timedelta(hours=1)))
        s.add(PasswordReset(token_hash="used", user_id=user.id, expires_at=now + timedelta(hours=1), used_at=now))
        s.commit()
        assert auth.purge_expired(s, now) == {"sessions": 1, "resets": 2}
        s.commit()
        assert [r.token_hash for r in s.exec(select(AuthSession))] == ["live"]
        assert [r.token_hash for r in s.exec(select(PasswordReset))] == ["fresh"]


# --- backups -------------------------------------------------------------------


def file_engine(tmp_path):
    from app.database import make_engine

    engine = make_engine(f"sqlite:///{tmp_path / 'karpul.db'}")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(CorporateCar(name="Fiat Panda", plate="FIRM-009", passenger_seats=3))
        s.commit()
    return engine


def test_a_backup_is_written_beside_the_database_and_rotated(tmp_path, monkeypatch):
    monkeypatch.delenv("KARPUL_BACKUP_DIR", raising=False)
    engine = file_engine(tmp_path)
    folder = tmp_path / "backups"
    day = datetime(2026, 3, 1, 3, 0)
    written = [write_backup(engine, day + timedelta(days=i), keep=3) for i in range(5)]
    assert all(p is not None and p.parent == folder for p in written)
    assert [p.name for p in backups_in(folder)] == ["karpul-20260303-0300.db", "karpul-20260304-0300.db", "karpul-20260305-0300.db"]
    # Nothing half-written is left behind, and the newest opens on its own.
    assert not list(folder.glob("*.part"))
    import sqlite3

    db = sqlite3.connect(backups_in(folder)[-1])
    assert db.execute("SELECT name FROM corporatecar").fetchall() == [("Fiat Panda",)]
    db.close()
    engine.dispose()


def test_housekeeping_backs_up_once_a_day(tmp_path, monkeypatch):
    monkeypatch.setenv("KARPUL_BACKUP_DIR", str(tmp_path / "elsewhere"))
    engine = file_engine(tmp_path)
    folder = tmp_path / "elsewhere"
    three_am = datetime(2026, 3, 1, 3, 0)
    assert run_housekeeping(engine, three_am)["backup"] == str(folder / "karpul-20260301-0300.db")
    assert run_housekeeping(engine, three_am + timedelta(hours=5))["backup"] is None
    assert backup_due(folder, three_am + timedelta(hours=5)) is False
    assert run_housekeeping(engine, three_am + timedelta(days=1))["backup"] == str(folder / "karpul-20260302-0300.db")
    engine.dispose()


def test_no_backup_on_an_in_memory_database(engine):
    assert run_housekeeping(engine)["backup"] is None
