"""The chores: a nightly backup of the database, and sweeping out the rows
that are only refused anyway.

`run_housekeeping` is the whole rule, run on start and then once an hour by
`housekeeping_loop` from the app's lifespan:

* **Backups.** A consistent snapshot (`backup.snapshot`, SQLite's backup API,
  the one safe way to copy a WAL database) is written to `KARPUL_BACKUP_DIR`
  (default: `backups/` beside the database file, which in production is the
  `karpul_data` volume) as `karpul-<date>-<time>.db`, once a day
  (BACKUP_EVERY), and the newest KARPUL_BACKUP_KEEP (14) are kept. The volume
  is on the same box as the database, so the runbook also copies the newest
  snapshot off it (`make backup` or the host's cron); this is what protects
  against a wrong `docker compose down -v`, a bad migration or a fat finger
  in the admin sheet, not against losing the box. Nothing runs on a database
  that is not a SQLite file (the tests' in-memory one).
* **Purging.** Expired sessions and spent reset links (`auth.purge_expired`).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.engine import Engine, make_url
from sqlmodel import Session

from .auth import purge_expired
from .backup import snapshot

log = logging.getLogger("karpul.housekeeping")

BACKUP_EVERY = timedelta(hours=23)
CHECK_EVERY_S = 3600
BACKUP_NAME = re.compile(r"^karpul-(\d{8})-(\d{4})\.db$")


def database_file(target: Engine) -> Path | None:
    """The SQLite file behind `target`, or None (in memory, another database)."""
    url = make_url(str(target.url))
    if url.drivername.split("+")[0] != "sqlite" or not url.database or url.database == ":memory:":
        return None
    return Path(url.database)


def backup_dir(target: Engine) -> Path | None:
    configured = os.getenv("KARPUL_BACKUP_DIR", "").strip()
    if configured:
        return Path(configured)
    db = database_file(target)
    return db.parent / "backups" if db is not None else None


def backup_keep() -> int:
    try:
        return max(int(os.getenv("KARPUL_BACKUP_KEEP", "14")), 1)
    except ValueError:
        return 14


def backups_in(folder: Path) -> list[Path]:
    """The snapshots in `folder`, oldest first (the name carries the time)."""
    if not folder.is_dir():
        return []
    return sorted(p for p in folder.iterdir() if BACKUP_NAME.match(p.name))


def backup_due(folder: Path, now: datetime) -> bool:
    newest = backups_in(folder)[-1:]
    if not newest:
        return True
    m = BACKUP_NAME.match(newest[0].name)
    taken = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M")  # type: ignore[union-attr]
    return now - taken >= BACKUP_EVERY


def write_backup(target: Engine, now: datetime | None = None, keep: int | None = None) -> Path | None:
    """Snapshot the database into the backup folder and drop the oldest past
    `keep`. Returns the file written, or None when there is no file database.
    The snapshot lands under a temporary name and is renamed into place, so a
    crash mid-write never leaves a half file that looks like a backup."""
    now = now or datetime.now()
    keep = keep if keep is not None else backup_keep()
    db = database_file(target)
    folder = backup_dir(target)
    if db is None or folder is None or not db.exists():
        return None
    folder.mkdir(parents=True, exist_ok=True)
    final = folder / f"karpul-{now:%Y%m%d}-{now:%H%M}.db"
    partial = folder / (final.name + ".part")
    partial.write_bytes(snapshot(str(db)))
    partial.replace(final)
    for old in backups_in(folder)[:-keep]:
        old.unlink()
    return final


def run_housekeeping(target: Engine, now: datetime | None = None) -> dict[str, int | str | None]:
    """One pass: purge, then a backup when the last one is a day old."""
    now = now or datetime.now()
    with Session(target) as session:
        gone = purge_expired(session)
        session.commit()
    done: dict[str, int | str | None] = {**gone, "backup": None}
    folder = backup_dir(target)
    if folder is not None and database_file(target) is not None and backup_due(folder, now):
        written = write_backup(target, now)
        done["backup"] = str(written) if written is not None else None
    return done


async def housekeeping_loop() -> None:
    """Runs for the life of the process, on a worker thread, once an hour; the
    first pass is on start. A failure is logged and never stops the app."""
    from .database import engine

    while True:
        try:
            done = await asyncio.to_thread(run_housekeeping, engine)
            if done.get("backup"):
                log.info("backup written: %s", done["backup"])
            if done.get("sessions") or done.get("resets"):
                log.info("purged %s expired sessions and %s reset links", done["sessions"], done["resets"])
        except Exception as exc:  # noqa: BLE001 - keep the loop alive whatever happened
            log.warning("housekeeping failed: %s", exc)
        await asyncio.sleep(CHECK_EVERY_S)
