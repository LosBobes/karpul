"""Shared-password gate for the car-pool admin endpoints.

Karpul has no accounts by design (see the README): ride actions are honour-based
and checked against `X-User-Name`. Editing the company-car pool is the one thing
that is not, because a bad edit affects everybody's rides — so it sits behind a
single shared password from `KARPUL_ADMIN_PASSWORD`, sent as `X-Admin-Password`.

Leaving the variable unset switches the admin endpoints off entirely (503), which
is the default for a plain `uvicorn app.main:app` checkout.
"""

import os
import secrets
from typing import Annotated

from fastapi import Header, HTTPException, status

AdminPasswordHeader = Annotated[str | None, Header(alias="X-Admin-Password")]


def configured_password() -> str:
    # Read per request, not at import: tests (and a restarted container) set it late.
    return os.getenv("KARPUL_ADMIN_PASSWORD", "").strip()


def require_admin(x_admin_password: AdminPasswordHeader = None) -> None:
    """FastAPI dependency: 503 when admin is switched off, 401 on a bad password."""
    configured = configured_password()
    if not configured:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Car-pool admin is not configured on this server (KARPUL_ADMIN_PASSWORD is unset)",
        )
    supplied = (x_admin_password or "").strip()
    if not supplied or not secrets.compare_digest(supplied, configured):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong or missing admin password")
