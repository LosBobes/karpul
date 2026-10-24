"""Error tracking: Sentry, when `KARPUL_SENTRY_DSN` is set.

Off by default, like push: a plain checkout sends nothing anywhere. With a DSN
the backend reports unhandled exceptions and error logs to Sentry. No request
bodies, cookies or headers go with them (`send_default_pii=False`, which also
keeps the bearer token and passwords out), and no performance traces unless
`KARPUL_SENTRY_TRACES` asks for a sample rate.
"""

import logging
import os

log = logging.getLogger("karpul.monitoring")


def init_sentry() -> bool:
    dsn = os.getenv("KARPUL_SENTRY_DSN", "").strip()
    if not dsn:
        return False
    try:
        import sentry_sdk
    except ImportError:
        log.error("KARPUL_SENTRY_DSN is set but sentry-sdk is not installed; error tracking is off")
        return False
    try:
        traces = float(os.getenv("KARPUL_SENTRY_TRACES", "0") or 0)
    except ValueError:
        traces = 0.0
    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("KARPUL_SENTRY_ENVIRONMENT", "production"),
        send_default_pii=False,
        traces_sample_rate=traces,
    )
    return True
