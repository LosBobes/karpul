"""A ride edit held to the creation rules, and the driver's ask to the passengers.

`prepare` turns a validated ride into column values (the shared-car label,
the car's window, the office road, the pins); `approval_for` applies the
shared car's share. `plan` merges a partial edit onto a ride and checks it
without writing; `apply_edit` makes it. A driver's change to the
`CONSENT_FIELDS` waits in `Ride.proposal` until every passenger with an
account agrees (`settle`)."""

import json
from dataclasses import dataclass

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlmodel import Session

from . import audit, geo
from .access import on_behalf
from .admin import admin_ids, is_admin
from .models import Booking, CarType, Ride, User
from .offices import garage_task, office_distance
from .push import notify
from .schemas import RideCreate, RideUpdate
from .services import (
    corporate_car_label,
    drop_orphaned_pickups,
    ensure_car_available,
    over_shared_car_share,
    promote_waitlist,
    resolve_corporate_car,
    ride_to_create_dict,
    stops_to_text,
)


def prepare(session: Session, validated: RideCreate | RideUpdate, exclude_ride_id: int | None = None) -> dict:
    """The column values for a validated ride, with the corporate-car rules applied."""
    data = validated.model_dump(exclude={"repeat_until", "request_id", "driver_id", "request_approval"})
    data["stops"] = stops_to_text(validated.stops)  # type: ignore[arg-type]
    data["stops_before"] = stops_to_text(validated.stops_before)  # type: ignore[arg-type]
    # The road between the offices is a known length (app/offices.py): a blank
    # distance on that route is filled in, so the figures never miss it.
    if data["distance_km"] is None:
        data["distance_km"] = office_distance(validated.origin, validated.destination)  # type: ignore[arg-type]
    car = None
    if validated.car_type == CarType.corporate:
        car = resolve_corporate_car(session, validated.corporate_car_id)  # type: ignore[arg-type]
        ensure_car_available(
            session,
            car.id,  # type: ignore[arg-type]
            validated.ride_date,  # type: ignore[arg-type]
            validated.departure_time,  # type: ignore[arg-type]
            validated.return_time,
            exclude_ride_id=exclude_ride_id,
        )
        data["car_name"] = corporate_car_label(car)
        if validated.seats > car.passenger_seats:  # type: ignore[operator]
            raise HTTPException(
                422,
                f"{car.name} only has {car.passenger_seats} passenger seats",
            )
    # The pins of the route (app/geo.py): what was given for its places, and
    # an office's or the car's home's pin where nobody gave one.
    data["points"] = geo.dump(geo.points_for(session, geo.route_places(validated), validated.points, car))
    return data


def approval_for(session: Session, actor: User, driver: User, payload: RideCreate, exclude_ride_id: int | None = None) -> str:
    """The shared cars are rationed per driver (services.shared_car_use). A
    ride within the share is "", one past it is a 409 naming the reason,
    unless the driver asked for approval ("pending") or an admin is the one
    adding it ("approved": the admin's word is the approval). Own cars are
    never rationed."""
    if payload.car_type != CarType.corporate:
        return ""
    reason = over_shared_car_share(
        session, driver.id, payload.ride_date, payload.departure_time, payload.return_time, exclude_ride_id  # type: ignore[arg-type]
    )
    if reason is None:
        return ""
    if is_admin(actor):
        return "approved"
    if payload.request_approval:
        return "pending"
    raise HTTPException(status.HTTP_409_CONFLICT, reason)


# A driver's change to these moves the plan the passengers got in for: it
# waits for each of them to agree (`Ride.proposal`) before it is made. An
# admin changing someone's ride is the office deciding, and applies at once.
CONSENT_FIELDS = ("ride_date", "departure_time", "return_time", "origin", "destination")


def consenting(ride: Ride) -> list[int]:
    """Who has to agree to the driver's change: the passengers with an account."""
    return [b.passenger_id for b in ride.bookings if b.passenger_id is not None and b.passenger_id != ride.driver_id]


def proposal_of(ride: Ride) -> dict | None:
    return json.loads(ride.proposal) if ride.proposal else None


def plan(session: Session, user: User, ride: Ride, sent: dict) -> tuple[RideCreate, dict]:
    """`sent` (a RideUpdate, as set) merged onto the ride and held to the full
    creation rules: the column values it would leave, or the HTTPException
    that refuses it. Writes nothing."""
    merged = ride_to_create_dict(ride)
    merged.update(sent)
    # Re-run the creation rules on the merged state.
    try:
        validated = RideCreate.model_validate({k: merged[k] for k in RideCreate.model_fields if k in merged})
    except ValidationError as exc:
        # The merged ride breaks a rule (a return before the departure): the
        # same 422 a request body gets, not a crash.
        raise HTTPException(
            422, [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
        ) from exc
    data = prepare(session, validated, exclude_ride_id=ride.id)
    # Moving an unapproved ride into a week (or onto a day) that already has
    # the driver's shared car, or stretching it into their next one, is the
    # same ask as adding one there; a pending ride stays pending wherever it
    # goes, an approved one stays approved.
    if data["car_type"] != CarType.corporate:
        data["approval"] = ""
    elif ride.approval == "" and any(
        data[key] != getattr(ride, key) for key in ("ride_date", "car_type", "departure_time", "return_time")
    ):
        driver = session.get(User, ride.driver_id) if ride.driver_id is not None else None
        if driver is not None:
            data["approval"] = approval_for(session, user, driver, validated, exclude_ride_id=ride.id)
    if validated.seats < len(ride.bookings):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{len(ride.bookings)} passengers already joined; seats cannot go below that",
        )
    return validated, data


@dataclass
class Applied:
    moved: bool
    promoted: list[Booking]
    garage_task: bool


def apply_edit(session: Session, user: User, ride: Ride, sent: dict) -> Applied:
    """Make the edit `sent` on the ride (not committed): the rules of
    `plan`, the admin's log, the garage list and the queue moving up."""
    validated, data = plan(session, user, ride, sent)
    # The passengers are told when the plan itself moves, not about a note;
    # a pin put somewhere else is the route moving.
    pins_before, pins_after = geo.load(ride.points), geo.load(data["points"])
    pins_moved = geo.moved(pins_before, pins_after)
    moved = bool(pins_moved) or any(getattr(ride, key) != data[key] for key in CONSENT_FIELDS)
    changes = audit.diff(ride, data, skip=("corporate_car_id", "driver_name", "points")) if on_behalf(user, ride) else []
    if pins_moved and on_behalf(user, ride):
        names = {geo.fold(p): p for p in geo.route_places(validated)}
        changes.append(("pins", None, ", ".join(names.get(k, k) for k in pins_moved)))
    geo.learn(
        session,
        geo.route_places(validated),
        {k: v for k, v in pins_after.items() if pins_before.get(k) != v and k in geo.folded(sent.get("points"))},
    )
    # The garage's list is of a plate on a day: a new plate or another day is
    # a new task for the admins, however the old one stood.
    was_task = garage_task(ride)
    if data["plate"] != ride.plate or data["ride_date"] != ride.ride_date:
        data["plate_registered"] = False
    # Whatever the driver had asked the passengers is overtaken by a change
    # made outright.
    if moved:
        data["proposal"] = ""
    for key, value in data.items():
        setattr(ride, key, value)
    new_task = garage_task(ride) and (not was_task or "plate_registered" in data)
    if changes:
        audit.record(session, user, "ride_edited", ride.driver_name, ride=ride, changes=changes)
    drop_orphaned_pickups(ride)
    # More seats than before: the queue moves up into them.
    promoted = promote_waitlist(session, ride)
    session.add(ride)
    return Applied(moved, promoted, new_task)


def settle(session: Session, ride: Ride) -> Applied | None:
    """Make the driver's held change once every passenger it waits for has
    agreed (or none is left to ask). None while it still waits, or when there
    is nothing to make; a driver whose account is gone takes the ask with it."""
    asked = proposal_of(ride)
    # A passenger's suggestion waits for the driver, not the others.
    if asked is None or asked.get("suggested"):
        return None
    waiting = set(consenting(ride)) - set(asked["agreed"])
    if waiting:
        return None
    proposer = session.get(User, asked["by_id"]) if asked.get("by_id") is not None else None
    ride.proposal = ""
    if proposer is None:
        return None
    sent = RideUpdate.model_validate(asked["fields"]).model_dump(exclude_unset=True)
    return apply_edit(session, proposer, ride, sent)


def tell_applied(session: Session, ride: Ride, applied: Applied | None) -> None:
    """The pushes an edit owes besides "it changed": seats freed up, a plate for the garage."""
    if applied is None:
        return
    if applied.promoted:
        notify(session, [b.passenger_id for b in applied.promoted], "seat_freed", ride, driver=ride.driver_name)
    if applied.garage_task:
        notify(session, admin_ids(session), "garage_plate", ride, name=ride.driver_name, plate=ride.plate)
