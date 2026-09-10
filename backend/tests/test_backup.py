"""`python -m app.backup` must capture commits still sitting in the WAL."""

import sqlite3

from sqlmodel import Session, SQLModel

from app.backup import snapshot
from app.database import make_engine
from app.models import CorporateCar


def test_snapshot_includes_uncheckpointed_writes(tmp_path):
    path = tmp_path / "karpul.db"
    engine = make_engine(f"sqlite:///{path}")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(CorporateCar(name="Fiat Panda", plate="FIRM-009", passenger_seats=3))
        s.commit()
    # The engine is still open, so the row has not necessarily been checkpointed
    # from karpul.db-wal into karpul.db yet; the snapshot must have it regardless.
    assert (tmp_path / "karpul.db-wal").exists()

    data = snapshot(str(path))

    # A restore is "drop the file in place": it must open on its own, without
    # WAL companions, and be intact.
    (tmp_path / "restored.db").write_bytes(data)
    restored = sqlite3.connect(tmp_path / "restored.db")
    assert restored.execute("PRAGMA journal_mode").fetchone() == ("delete",)
    assert restored.execute("SELECT name FROM corporatecar").fetchall() == [("Fiat Panda",)]
    assert restored.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    restored.close()
    engine.dispose()
