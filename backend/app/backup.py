"""Write a consistent snapshot of the database to stdout.

    docker compose exec -T app python -m app.backup > karpul-<date>.db

The database runs in WAL mode (see `database.py`), so the last commits live in
`karpul.db-wal` until a checkpoint; copying `karpul.db` alone silently drops
them, and copying it while someone is booking may not even parse. SQLite's
online backup API takes a transactionally consistent copy without blocking
the app, and the result is a plain single-file database.
"""

import os
import sqlite3
import sys
import tempfile

from sqlalchemy.engine import make_url

from .database import DATABASE_URL


def snapshot(path: str) -> bytes:
    """The whole database at `path` as one self-contained SQLite file.

    The copy is switched back to a rollback journal: a WAL-flagged file
    expects its `-wal` / `-shm` companions and cannot be opened on its own.
    """
    src = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            copy_path = os.path.join(tmp, "snapshot.db")
            copy = sqlite3.connect(copy_path)
            try:
                src.backup(copy)
                copy.execute("PRAGMA journal_mode=DELETE")
            finally:
                copy.close()
            with open(copy_path, "rb") as f:
                return f.read()
    finally:
        src.close()


def main() -> None:
    url = make_url(DATABASE_URL)
    if url.drivername.split("+")[0] != "sqlite" or not url.database:
        sys.exit(f"app.backup only knows SQLite files, not {DATABASE_URL}")
    sys.stdout.buffer.write(snapshot(url.database))


if __name__ == "__main__":
    main()
