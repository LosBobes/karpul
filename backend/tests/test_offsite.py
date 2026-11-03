"""The nightly snapshot off the box (app/offsite.py), and how the backups
stand for the uptime check (housekeeping.backup_status, /api/health)."""

import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session, SQLModel

from app import offsite
from app.housekeeping import backup_status, backups_in, run_housekeeping, write_backup
from app.models import CorporateCar

BUCKET = "https://fsn1.your-objectstorage.com/karpul-backups/nightly"


def test_the_signature_is_aws_own_example():
    """AWS's Signature Version 4 example for S3 ("GET Object", examplebucket):
    the same credentials, time and headers give the published signature."""
    headers = offsite.sign(
        "GET",
        "https://examplebucket.s3.amazonaws.com/test.txt",
        {"Range": "bytes=0-9"},
        hashlib.sha256(b"").hexdigest(),
        key="AKIAIOSFODNN7EXAMPLE",
        secret="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region="us-east-1",
        now=datetime(2013, 5, 24, tzinfo=timezone.utc),
    )
    assert headers["Authorization"] == (
        "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, "
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, "
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
    )
    assert headers["x-amz-date"] == "20130524T000000Z"


def file_engine(tmp_path):
    from app.database import make_engine

    engine = make_engine(f"sqlite:///{tmp_path / 'karpul.db'}")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(CorporateCar(name="Fiat Panda", plate="FIRM-009", passenger_seats=3))
        s.commit()
    return engine


@pytest.fixture()
def bucket(monkeypatch):
    """A bucket configured, and the PUTs it got (url, body, headers); `answer[0]` is its next status code."""
    monkeypatch.setenv("KARPUL_BACKUP_S3_URL", BUCKET + "/")
    monkeypatch.setenv("KARPUL_BACKUP_S3_KEY", "KEY")
    monkeypatch.setenv("KARPUL_BACKUP_S3_SECRET", "SECRET")
    monkeypatch.setenv("KARPUL_BACKUP_S3_REGION", "fsn1")
    sent: list[tuple[str, bytes, dict]] = []
    answer = [200]

    def put(url, body, headers):
        if answer[0] == 0:
            raise OSError("connection refused")
        sent.append((url, body, headers))
        return answer[0]

    monkeypatch.setattr(offsite, "put", put)
    return sent, answer


def test_off_unless_configured(tmp_path, monkeypatch):
    monkeypatch.setenv("KARPUL_BACKUP_DIR", str(tmp_path / "backups"))
    called = []
    monkeypatch.setattr(offsite, "put", lambda *a: called.append(a) or 200)
    engine = file_engine(tmp_path)
    done = run_housekeeping(engine, datetime(2026, 3, 1, 3, 0))
    assert done["backup"] and done["offsite"] is None and called == []
    assert backup_status(engine, datetime(2026, 3, 1, 4, 0)) == {"backup": "ok", "offsite": "off"}
    engine.dispose()


def test_the_newest_snapshot_goes_up_once_signed(tmp_path, monkeypatch, bucket):
    sent, _ = bucket
    monkeypatch.setenv("KARPUL_BACKUP_DIR", str(tmp_path / "backups"))
    engine = file_engine(tmp_path)
    three_am = datetime(2026, 3, 1, 3, 0)
    done = run_housekeeping(engine, three_am)
    assert done["offsite"] == f"{BUCKET}/karpul-20260301-0300.db"
    (url, body, headers) = sent[0]
    snapshot = backups_in(tmp_path / "backups")[-1]
    assert url == f"{BUCKET}/karpul-20260301-0300.db" and body == snapshot.read_bytes()
    assert headers["x-amz-content-sha256"] == hashlib.sha256(body).hexdigest()
    assert headers["Authorization"].startswith("AWS4-HMAC-SHA256 Credential=KEY/")
    assert "/fsn1/s3/aws4_request" in headers["Authorization"] and "Host" not in headers
    # The next pass finds it up already.
    assert run_housekeeping(engine, three_am + timedelta(hours=1))["offsite"] is None
    assert len(sent) == 1
    assert backup_status(engine, three_am + timedelta(hours=1)) == {"backup": "ok", "offsite": "ok"}
    engine.dispose()


def test_a_failed_upload_is_tried_again_and_shows_as_failing(tmp_path, monkeypatch, bucket):
    sent, answer = bucket
    monkeypatch.setenv("KARPUL_BACKUP_DIR", str(tmp_path / "backups"))
    engine = file_engine(tmp_path)
    three_am = datetime(2026, 3, 1, 3, 0)
    answer[0] = 0
    assert run_housekeeping(engine, three_am)["offsite"] is None
    # Young: on its way. Hours later and still not up: failing.
    assert backup_status(engine, three_am + timedelta(minutes=30))["offsite"] == "pending"
    answer[0] = 403
    assert run_housekeeping(engine, three_am + timedelta(hours=3))["offsite"] is None
    assert backup_status(engine, three_am + timedelta(hours=3))["offsite"] == "failing"
    answer[0] = 200
    assert run_housekeeping(engine, three_am + timedelta(hours=4))["offsite"] == f"{BUCKET}/karpul-20260301-0300.db"
    assert backup_status(engine, three_am + timedelta(hours=4))["offsite"] == "ok"
    engine.dispose()


def test_a_pruned_snapshot_takes_its_marker_along(tmp_path, monkeypatch, bucket):
    monkeypatch.setenv("KARPUL_BACKUP_DIR", str(tmp_path / "backups"))
    monkeypatch.setenv("KARPUL_BACKUP_KEEP", "2")
    engine = file_engine(tmp_path)
    day = datetime(2026, 3, 1, 3, 0)
    for i in range(4):
        run_housekeeping(engine, day + timedelta(days=i))
    folder = tmp_path / "backups"
    assert sorted(p.name for p in folder.iterdir()) == [
        "karpul-20260303-0300.db",
        "karpul-20260303-0300.db.sent",
        "karpul-20260304-0300.db",
        "karpul-20260304-0300.db.sent",
    ]
    engine.dispose()


def test_a_snapshot_past_a_day_is_stale(tmp_path, monkeypatch):
    monkeypatch.setenv("KARPUL_BACKUP_DIR", str(tmp_path / "backups"))
    engine = file_engine(tmp_path)
    assert backup_status(engine, datetime(2026, 3, 1, 3, 0))["backup"] == "stale"
    write_backup(engine, datetime(2026, 3, 1, 3, 0))
    assert backup_status(engine, datetime(2026, 3, 2, 4, 59))["backup"] == "ok"
    assert backup_status(engine, datetime(2026, 3, 2, 5, 0))["backup"] == "stale"
    engine.dispose()


def test_no_status_on_an_in_memory_database(engine):
    assert backup_status(engine) == {"backup": "off", "offsite": "off"}
