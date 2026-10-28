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
from sqlalchemy.schema import CreateTable
from sqlmodel import Session, SQLModel, create_engine, select

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
    ("appuser", "phone", "VARCHAR"),
    ("appuser", "is_admin", "BOOLEAN NOT NULL DEFAULT 0"),
    ("appuser", "calendar_token", "VARCHAR"),
    ("ride", "driver_id", "INTEGER REFERENCES appuser (id)"),
    ("booking", "passenger_id", "INTEGER REFERENCES appuser (id)"),
    ("pushsubscription", "user_id", "INTEGER REFERENCES appuser (id)"),
    ("ride", "approval", "VARCHAR NOT NULL DEFAULT ''"),
    ("appuser", "push_muted", "VARCHAR NOT NULL DEFAULT ''"),
    ("appuser", "remind_before", "INTEGER NOT NULL DEFAULT 30"),
    ("ride", "km_reminder_sent", "BOOLEAN NOT NULL DEFAULT 0"),
    ("ride", "stops_before", "VARCHAR NOT NULL DEFAULT ''"),
    ("ride", "passengers_add_stops", "BOOLEAN NOT NULL DEFAULT 1"),
    ("waitlistentry", "new_stop_before", "BOOLEAN"),
    ("waitlistentry", "new_stop_index", "INTEGER"),
    ("ride", "needs_driver", "BOOLEAN NOT NULL DEFAULT 0"),
    ("ride", "coffee_please", "BOOLEAN NOT NULL DEFAULT 0"),
    ("corporatecar", "home", "VARCHAR NOT NULL DEFAULT ''"),
]

# Columns that started out NOT NULL and are optional now. SQLite cannot drop a
# NOT NULL with ALTER TABLE, so such a table is rebuilt from its model
# (`relax_not_null`); each entry is (table, column).
RELAXED_COLUMNS: list[tuple[str, str]] = [
    ("appuser", "email"),
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
            # The model's index on the new column, which `create_all` would
            # have made for a fresh table but never adds to an existing one.
            model = SQLModel.metadata.tables.get(table)
            for index in model.indexes if model is not None else ():
                if column in index.columns:
                    index.create(conn, checkfirst=True)
    return [f"{table}.{column}" for table, column, _ in missing]


def relax_not_null(target: Engine) -> list[str]:
    """Rebuild the tables in RELAXED_COLUMNS whose column is still NOT NULL.

    The SQLite recipe: create the table afresh from the model under a scratch
    name, copy the rows across (the columns both sides have), drop the old one,
    rename the new one into place and recreate its indexes. Row ids are copied,
    so `authsession.user_id` still points at the same people; the legacy rename
    keeps SQLite from rewriting that foreign key on the way. Returns the
    "table.column" names that were relaxed; an up-to-date database is a no-op.
    """
    inspector = inspect(target)
    tables = set(inspector.get_table_names())
    todo = sorted(
        {
            table
            for table, column in RELAXED_COLUMNS
            if table in tables
            and any(c["name"] == column and not c["nullable"] for c in inspector.get_columns(table))
        }
    )
    if not todo:
        return []
    old_columns = {table: [c["name"] for c in inspector.get_columns(table)] for table in todo}
    with target.begin() as conn:
        conn.exec_driver_sql("PRAGMA legacy_alter_table=ON")
        for name in todo:
            table = SQLModel.metadata.tables[name]
            scratch = f"{name}__rebuild"
            ddl = str(CreateTable(table).compile(conn)).replace(f"CREATE TABLE {name} ", f"CREATE TABLE {scratch} ", 1)
            conn.exec_driver_sql(ddl)
            shared = ", ".join(c for c in old_columns[name] if c in table.columns)
            conn.exec_driver_sql(f"INSERT INTO {scratch} ({shared}) SELECT {shared} FROM {name}")
            conn.exec_driver_sql(f"DROP TABLE {name}")
            conn.exec_driver_sql(f"ALTER TABLE {scratch} RENAME TO {name}")
            for index in table.indexes:
                index.create(conn)
        conn.exec_driver_sql("PRAGMA legacy_alter_table=OFF")
    return [f"{t}.{c}" for t, c in RELAXED_COLUMNS if t in todo]


def link_people(target: Engine) -> dict[str, int]:
    """Point the rows that only carry a name at the account that goes by it.

    Before accounts the board knew people by name alone (`Ride.driver_name`,
    `Booking.passenger_name`, the name a push subscription was filed under);
    `driver_id` / `passenger_id` / `user_id` came later. This fills them in by
    the same rule the names were always compared with (`services.norm_name`,
    which is what `User.name_key` holds), and gives every account its calendar
    feed token. Safe on every start: a linked database is a no-op. Returns how
    many rows of each kind were linked.
    """
    from .models import Booking, PushSubscription, Ride, User
    from .services import new_calendar_token, norm_name

    linked = {"rides": 0, "bookings": 0, "subscriptions": 0, "calendar_tokens": 0}
    with Session(target) as session:
        users = session.exec(select(User)).all()
        by_key = {u.name_key: u.id for u in users}
        for user in users:
            if not user.calendar_token:
                user.calendar_token = new_calendar_token()
                session.add(user)
                linked["calendar_tokens"] += 1
        for ride in session.exec(select(Ride).where(Ride.driver_id.is_(None))):  # type: ignore[union-attr]
            uid = by_key.get(norm_name(ride.driver_name))
            if uid is not None:
                ride.driver_id = uid
                session.add(ride)
                linked["rides"] += 1
        for booking in session.exec(select(Booking).where(Booking.passenger_id.is_(None))):  # type: ignore[union-attr]
            uid = by_key.get(norm_name(booking.passenger_name))
            if uid is not None:
                booking.passenger_id = uid
                session.add(booking)
                linked["bookings"] += 1
        for sub in session.exec(select(PushSubscription).where(PushSubscription.user_id.is_(None))):  # type: ignore[union-attr]
            uid = by_key.get(sub.user_name)
            if uid is not None:
                sub.user_id = uid
                session.add(sub)
                linked["subscriptions"] += 1
        session.commit()
    return linked


def init_db() -> None:
    if DATABASE_URL == DEFAULT_DB_URL:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    relax_not_null(engine)
    add_missing_columns(engine)
    link_people(engine)


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
