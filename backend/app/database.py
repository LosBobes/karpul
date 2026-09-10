"""Database engine and session helpers."""

import os
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_DB_URL = f"sqlite:///{DATA_DIR / 'karpul.db'}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB_URL)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)


# Columns added after the first release. `create_all` only creates missing
# tables, so a database from an older version is patched here with a plain
# ALTER TABLE; each entry is (table, column, DDL for the new column).
ADDED_COLUMNS: list[tuple[str, str, str]] = [
    ("ride", "passengers_manage", "BOOLEAN NOT NULL DEFAULT 0"),
]


def add_missing_columns(target: Engine) -> list[str]:
    """Add the columns in ADDED_COLUMNS that `target` does not have yet.

    Returns the "table.column" names that were added. Safe to run on every
    start: an up-to-date database is a no-op.
    """
    inspector = inspect(target)
    tables = set(inspector.get_table_names())
    added: list[str] = []
    with target.begin() as conn:
        for table, column, ddl in ADDED_COLUMNS:
            if table not in tables:
                continue
            if any(c["name"] == column for c in inspector.get_columns(table)):
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            added.append(f"{table}.{column}")
    return added


def init_db() -> None:
    if DATABASE_URL == DEFAULT_DB_URL:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    add_missing_columns(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
