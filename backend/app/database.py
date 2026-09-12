"""Database engine and session helpers.

SQLite with a room full of people
---------------------------------
Karpul is one process on one SQLite file, and twenty colleagues tapping "get
in" at 07:55 all land on it at once. Two things make that safe:

* **WAL journal + busy timeout** (`_on_connect`). In WAL mode readers never
  wait for the writer and the writer never waits for readers, so the board
  keeps loading while someone books. The busy timeout makes a second writer
  queue up instead of failing with "database is locked".

* **`BEGIN IMMEDIATE` on every write request** (`_on_begin` / `begin_write`).
  Every mutation in the routers is check-then-write: read the ride, count the
  bookings, insert one. With SQLite's default deferred transactions two such
  requests read the same free seat and both insert it. Taking the write lock
  up front serialises the whole request against other writers, so the check
  sees every earlier commit. Reads stay deferred and unaffected.

The pysqlite driver starts transactions itself, late and only before DML,
which makes the above impossible to control, so the driver's transaction
handling is switched off and SQLAlchemy's `begin` event issues the `BEGIN`
(this is the recipe from the SQLAlchemy docs for pysqlite). Every engine —
production and the tests' — goes through `make_engine` so all of them get it.
"""

import os
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlalchemy import event, inspect, text
from sqlalchemy.engine import Connection, Engine
from sqlmodel import Session, SQLModel, create_engine

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_DB_URL = f"sqlite:///{DATA_DIR / 'karpul.db'}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB_URL)

# How long a writer waits for the lock before SQLite gives up. Writes take
# milliseconds, so this is only ever reached if something is badly wrong.
BUSY_TIMEOUT_S = 15

# Execution option that marks a connection's transaction as a write. Set by
# `begin_write` before the transaction starts; read by `_on_begin`.
WRITE_OPTION = "karpul_write"


def _on_connect(dbapi_connection, _record) -> None:
    # Hand transaction control to SQLAlchemy (see module docstring).
    dbapi_connection.isolation_level = None
    cursor = dbapi_connection.cursor()
    try:
        # WAL is per file and sticks; harmless on an in-memory database.
        cursor.execute("PRAGMA journal_mode=WAL")
        # With WAL, NORMAL is durable against application crashes and only
        # loses the last transactions on a power cut; it is much cheaper than FULL.
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_S * 1000}")
    finally:
        cursor.close()


def _on_begin(conn: Connection) -> None:
    mode = "BEGIN IMMEDIATE" if conn.get_execution_options().get(WRITE_OPTION) else "BEGIN"
    conn.exec_driver_sql(mode)


def configure_sqlite(target: Engine) -> Engine:
    """Install the pragmas and transaction control on a SQLite engine."""
    event.listen(target, "connect", _on_connect)
    event.listen(target, "begin", _on_begin)
    return target


def make_engine(url: str, **kwargs) -> Engine:
    """The one place engines are built, so tests run on the same configuration."""
    if not url.startswith("sqlite"):
        return create_engine(url, **kwargs)
    kwargs.setdefault("connect_args", {"check_same_thread": False, "timeout": BUSY_TIMEOUT_S})
    if url not in ("sqlite://", "sqlite:///:memory:") and "poolclass" not in kwargs:
        # A file database: keep enough connections for a burst of requests
        # (uvicorn's thread pool runs 40 sync handlers at once) so nobody
        # queues for a connection. Idle SQLite connections cost nothing.
        kwargs.setdefault("pool_size", 10)
        kwargs.setdefault("max_overflow", 30)
    return configure_sqlite(create_engine(url, **kwargs))


engine = make_engine(DATABASE_URL)


# Columns added after the first release. `create_all` only creates missing
# tables, so a database from an older version is patched here with a plain
# ALTER TABLE; each entry is (table, column, DDL for the new column).
ADDED_COLUMNS: list[tuple[str, str, str]] = [
    ("ride", "passengers_manage", "BOOLEAN NOT NULL DEFAULT 0"),
    ("ride", "stops", "VARCHAR NOT NULL DEFAULT ''"),
    ("ride", "distance_km", "FLOAT"),
    ("ride", "chip_in", "VARCHAR NOT NULL DEFAULT ''"),
    ("ride", "series_id", "VARCHAR"),
    ("ride", "reminder_sent", "BOOLEAN NOT NULL DEFAULT 0"),
    ("booking", "pickup", "VARCHAR NOT NULL DEFAULT ''"),
]


def add_missing_columns(target: Engine) -> list[str]:
    """Add the columns in ADDED_COLUMNS that `target` does not have yet.

    Returns the "table.column" names that were added. Safe to run on every
    start: an up-to-date database is a no-op.
    """
    # Inspect first, alter second: the inspector uses its own connection, and
    # it must not be opened while the ALTER transaction below holds this one.
    inspector = inspect(target)
    tables = set(inspector.get_table_names())
    missing = [
        (table, column, ddl)
        for table, column, ddl in ADDED_COLUMNS
        if table in tables and not any(c["name"] == column for c in inspector.get_columns(table))
    ]
    if not missing:
        return []
    with target.begin() as conn:
        for table, column, ddl in missing:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
    return [f"{table}.{column}" for table, column, _ in missing]


def init_db() -> None:
    if DATABASE_URL == DEFAULT_DB_URL:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    add_missing_columns(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def begin_write(session: Session) -> Session:
    """Start this session's transaction as a write (`BEGIN IMMEDIATE`).

    Must be the first thing that happens on the session: once a deferred
    transaction is open there is no upgrading it without a deadlock risk.
    """
    if session.in_transaction():
        raise RuntimeError("begin_write must be called before the session runs any statement")
    session.connection(execution_options={WRITE_OPTION: True})
    return session


def get_write_session(session: Annotated[Session, Depends(get_session)]) -> Session:
    """`get_session` for handlers that mutate. Tests override `get_session` only
    and this wrapper picks that up, so the write lock is taken there too."""
    return begin_write(session)
