"""Only answering from the countries the team is in.

`KARPUL_ALLOWED_COUNTRIES` (ISO codes, comma-separated, e.g. `DE,RS`) turns it
on; unset lets everyone in, which is what a local checkout and the tests do.
Every request is held to it, the shell, the API and the live socket alike:
anything else gets a 403 (a socket is closed with 4403 before it opens).
Private and loopback addresses always pass, so Docker's health check and a
LAN keep working.

The country comes from the client address uvicorn reports, which is the real
one behind Caddy because production trusts `X-Forwarded-For`
(`FORWARDED_ALLOW_IPS`, see `app/ratelimit.py`), looked up in DB-IP's free
country database (`KARPUL_GEOIP_DB`, an .mmdb the Docker image downloads at
build time; CC BY 4.0, https://db-ip.com). An address the database does not
know is refused. If the filter is on and the database cannot be opened, the
app says so loudly in the log and lets everyone in rather than locking the
whole team out.
"""

from __future__ import annotations

import ipaddress
import logging
import os
from functools import lru_cache
from typing import Any

log = logging.getLogger("karpul.geofence")

DEFAULT_DB = "/app/geoip/country.mmdb"
CLOSE_FORBIDDEN = 4403
REFUSAL = b"Karpul is not available in your country."


def allowed_countries() -> frozenset[str]:
    raw = os.getenv("KARPUL_ALLOWED_COUNTRIES", "")
    return frozenset(c.strip().upper() for c in raw.split(",") if c.strip())


@lru_cache(maxsize=1)
def _reader(path: str) -> Any:
    try:
        import maxminddb

        return maxminddb.open_database(path)
    except Exception:
        log.exception("geofence: cannot open %s; letting every country in", path)
        return None


@lru_cache(maxsize=4096)
def country_of(ip: str) -> str | None:
    """The ISO country code of `ip`, or None when it is unknown. Raises
    LookupError when there is no database to ask."""
    reader = _reader(os.getenv("KARPUL_GEOIP_DB", DEFAULT_DB))
    if reader is None:
        raise LookupError("no geoip database")
    try:
        record = reader.get(ip)
    except ValueError:
        return None
    if not isinstance(record, dict):
        return None
    return (record.get("country") or {}).get("iso_code")


def admits(host: str | None, allowed: frozenset[str]) -> bool:
    if not allowed:
        return True
    if not host:
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and (address.is_private or address.is_loopback or address.is_link_local):
        return True
    try:
        return country_of(host) in allowed
    except LookupError:
        return True


class GeoFence:
    """Pure ASGI, so it sees WebSockets as well as HTTP."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        client = scope.get("client")
        if admits(client[0] if client else None, allowed_countries()):
            await self.app(scope, receive, send)
            return
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": CLOSE_FORBIDDEN})
            return
        await send(
            {
                "type": "http.response.start",
                "status": 403,
                "headers": [(b"content-type", b"text/plain; charset=utf-8"), (b"cache-control", b"no-store")],
            }
        )
        await send({"type": "http.response.body", "body": REFUSAL})
