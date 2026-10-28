"""The admin's log: a line for every admin action (models.AdminAction).

A route that lets an admin do something on someone else's behalf calls
`record` before its commit, so the line and the change land together or not
at all. A driver editing their own ride is not logged, even when they are an
admin: the log is about the admin power, not about everyone's day.
"""

import json
from datetime import date, time
from typing import Any

from sqlmodel import Session

from .models import AdminAction, Ride, User

ACTIONS = (
    "ride_added",  # a ride in someone else's name
    "ride_edited",
    "ride_removed",
    "ride_approved",  # a shared car past the driver's share, let through
    "ride_declined",
    "seat_added",  # someone put in someone else's car
    "seat_removed",
    "car_added",
    "car_edited",
    "car_removed",
    "admin_granted",
    "admin_revoked",
    "reset_link",
    "photo_removed",  # someone's profile photo taken down
    "account_deleted",
)


def words(value: Any) -> str:
    """A stored value as the log shows it: clock times as HH:MM, nothing as ''."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, time):
        return value.strftime("%H:%M")
    if isinstance(value, date):
        return value.isoformat()
    if hasattr(value, "value"):  # an enum
        return str(value.value)
    return str(value)


def ride_label(ride: Ride) -> str:
    return f"{ride.departure_time.strftime('%H:%M')} {ride.origin} → {ride.destination}"


def record(
    session: Session,
    admin: User,
    action: str,
    subject: str = "",
    *,
    ride: Ride | None = None,
    changes: list[tuple[str, Any, Any]] | None = None,
) -> None:
    assert action in ACTIONS, action
    session.add(
        AdminAction(
            admin_id=admin.id,
            admin_name=admin.display_name,
            action=action,
            subject=subject,
            ride_id=ride.id if ride is not None else None,
            ride_date=ride.ride_date if ride is not None else None,
            ride_label=ride_label(ride) if ride is not None else "",
            changes=json.dumps([[field, words(old), words(new)] for field, old, new in changes or []], ensure_ascii=False),
        )
    )


def diff(before: Any, after: dict[str, Any], skip: tuple[str, ...] = ()) -> list[tuple[str, Any, Any]]:
    """The fields of `after` whose value differs on `before`, in `after`'s order."""
    return [(k, getattr(before, k), v) for k, v in after.items() if k not in skip and getattr(before, k) != v]
