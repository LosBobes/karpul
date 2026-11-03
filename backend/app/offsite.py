"""A copy of the nightly snapshot off the box, in S3-compatible object storage.

The snapshots in `KARPUL_BACKUP_DIR` (app/housekeeping.py) live on the same
disk as the database: they survive a bad deploy or a fat finger, not losing
the server. With `KARPUL_BACKUP_S3_URL` set, each new snapshot is also PUT to
a bucket: Hetzner's Object Storage, Cloudflare R2, Backblaze B2, AWS S3, a
MinIO, anything that speaks S3 with a path-style address.

* `KARPUL_BACKUP_S3_URL`: the endpoint, the bucket and an optional prefix,
  e.g. `https://fsn1.your-objectstorage.com/karpul-backups/nightly`. Unset or
  blank, nothing is sent anywhere.
* `KARPUL_BACKUP_S3_KEY` / `KARPUL_BACKUP_S3_SECRET`: an access key that may
  write to that bucket. It needs nothing else: no list, no delete, so a box
  that is broken into cannot wipe its own backups. How long the copies are
  kept is the bucket's lifecycle rule, not Karpul's.
* `KARPUL_BACKUP_S3_REGION`: the signing region (`us-east-1` when unset;
  Hetzner's is the location, `fsn1`, R2's is `auto`).

The request is signed with AWS Signature Version 4 on the standard library,
for the same reason `app/webpush.py` avoids pywebpush: no new dependency for
one PUT. `tests/test_offsite.py` holds the signer to AWS's own example.

A snapshot that went up gets a `<name>.sent` marker beside it, so a failed
upload is tried again on the next hourly pass, and `status` can tell a monitor
whether the newest snapshot is safe off the box (`/api/health`).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qsl, quote, urlsplit

log = logging.getLogger("karpul.offsite")

TIMEOUT_S = 120
MARKER = ".sent"
# A snapshot this young that has not gone up yet is on its way, not failing.
GRACE = timedelta(hours=2)


@dataclass(frozen=True)
class Target:
    url: str
    key: str
    secret: str
    region: str


def target() -> Target | None:
    """The configured bucket, read per call like the other settings; None when off."""
    url = os.getenv("KARPUL_BACKUP_S3_URL", "").strip().rstrip("/")
    if not url:
        return None
    return Target(
        url=url,
        key=os.getenv("KARPUL_BACKUP_S3_KEY", "").strip(),
        secret=os.getenv("KARPUL_BACKUP_S3_SECRET", "").strip(),
        region=os.getenv("KARPUL_BACKUP_S3_REGION", "").strip() or "us-east-1",
    )


def _hmac(key: bytes, text: str) -> bytes:
    return hmac.new(key, text.encode(), hashlib.sha256).digest()


def _encode(text: str, safe: str = "-_.~") -> str:
    return quote(text, safe=safe)


def sign(
    method: str,
    url: str,
    headers: dict[str, str],
    payload_sha256: str,
    *,
    key: str,
    secret: str,
    region: str,
    now: datetime,
    service: str = "s3",
) -> dict[str, str]:
    """The request's headers with AWS Signature Version 4 added: `headers`
    plus `Host`, `x-amz-date`, `x-amz-content-sha256` and `Authorization`.
    Every header given is signed. `now` is UTC."""
    parts = urlsplit(url)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    day = now.strftime("%Y%m%d")
    signed_headers = {k.lower(): " ".join(str(v).split()) for k, v in headers.items()}
    signed_headers.update({"host": parts.netloc, "x-amz-date": amz_date, "x-amz-content-sha256": payload_sha256})
    names = sorted(signed_headers)
    query = sorted((_encode(k), _encode(v)) for k, v in parse_qsl(parts.query, keep_blank_values=True))
    canonical = "\n".join(
        [
            method,
            # S3 takes the path encoded once, slashes kept.
            _encode(parts.path or "/", safe="/-_.~"),
            "&".join(f"{k}={v}" for k, v in query),
            "".join(f"{n}:{signed_headers[n]}\n" for n in names),
            ";".join(names),
            payload_sha256,
        ]
    )
    scope = f"{day}/{region}/{service}/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    signing_key = _hmac(_hmac(_hmac(_hmac(f"AWS4{secret}".encode(), day), region), service), "aws4_request")
    signature = hmac.new(signing_key, to_sign.encode(), hashlib.sha256).hexdigest()
    out = {**headers, "Host": parts.netloc, "x-amz-date": amz_date, "x-amz-content-sha256": payload_sha256}
    out["Authorization"] = (
        f"AWS4-HMAC-SHA256 Credential={key}/{scope}, SignedHeaders={';'.join(names)}, Signature={signature}"
    )
    return out


def put(url: str, body: bytes, headers: dict[str, str]) -> int:
    """One HTTP PUT; the status code. Tests replace it."""
    request = urllib.request.Request(url, data=body, headers=headers, method="PUT")
    with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:  # noqa: S310 - the configured bucket
        return response.status


def upload(snapshot: Path, where: Target, now: datetime | None = None) -> str:
    """PUT `snapshot` into the bucket under its own name; the object's address.
    Raises on anything but a 2xx answer."""
    body = snapshot.read_bytes()
    url = f"{where.url}/{snapshot.name}"
    digest = hashlib.sha256(body).hexdigest()
    headers = sign(
        "PUT",
        url,
        {"Content-Type": "application/vnd.sqlite3", "Content-Length": str(len(body))},
        digest,
        key=where.key,
        secret=where.secret,
        region=where.region,
        now=now or datetime.now(timezone.utc),
    )
    # urllib sets Host itself from the address.
    headers.pop("Host")
    code = put(url, body, headers)
    if not 200 <= code < 300:
        raise OSError(f"{url}: HTTP {code}")
    return url


def marker(snapshot: Path) -> Path:
    return snapshot.with_name(snapshot.name + MARKER)


def send_newest(snapshots: list[Path]) -> str | None:
    """Upload the newest snapshot unless it is up already (its marker). The
    address it went to, or None when nothing was due or the copy is off. A
    failure is logged and left for the next pass; it never stops the app."""
    where = target()
    if where is None or not snapshots:
        return None
    newest = snapshots[-1]
    if marker(newest).exists():
        return None
    try:
        url = upload(newest, where)
    except Exception as exc:  # noqa: BLE001 - logged, retried next hour
        log.warning("off-site copy of %s failed: %s", newest.name, exc)
        return None
    marker(newest).write_text(url + "\n")
    log.info("off-site copy written: %s", url)
    return url


def drop_stale_markers(folder: Path) -> None:
    """The markers of snapshots that were pruned go with them."""
    for m in folder.glob(f"*.db{MARKER}"):
        if not m.with_name(m.name[: -len(MARKER)]).exists():
            m.unlink()


def status(snapshots: list[Path], taken: datetime | None, now: datetime) -> str:
    """For /api/health: "off" (not configured), "ok" (the newest snapshot is
    up), "pending" (it is young and on its way) or "failing"."""
    if target() is None:
        return "off"
    if not snapshots:
        return "pending"
    if marker(snapshots[-1]).exists():
        return "ok"
    return "pending" if taken is not None and now - taken < GRACE else "failing"
