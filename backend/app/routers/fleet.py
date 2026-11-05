"""`/api/fleet`: what an admin keeps about the shared cars beyond their rides
(app/fleet.py): when a car is out of service, what it costs, the official fuel
price, the office's rules, and the overview of cost and km per car.
Everything here is admin-only except reading the fuel price.
"""

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from .. import audit, fleet
from ..admin import require_admin
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..events import cars_state_changed
from ..models import CarBlock, CarCost, CorporateCar, FuelPrice
from ..push import notify
from ..schemas import (
    CarBlockEnd,
    CarBlockIn,
    CarBlockOut,
    CarBlockRead,
    CarCostIn,
    CarCostRead,
    FleetSettings,
    FuelPriceIn,
    FuelPriceRead,
)
from ..services import board_extras, corporate_car_label, to_ride_read_dict

router = APIRouter(prefix="/api/fleet", tags=["fleet"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]

MAX_COST_DAYS = 3 * 366


def _car_or_404(session: Session, car_id: int) -> CorporateCar:
    car = session.get(CorporateCar, car_id)
    if car is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Corporate car not found")
    return car


def _span(block: CarBlock) -> str:
    return f"{block.start_date.isoformat()} – {block.end_date.isoformat() if block.end_date else '…'}"


# --- Settings ----------------------------------------------------------------


@router.get("/settings", response_model=FleetSettings)
def read_settings(session: SessionDep, creds: CredsDep):
    require_admin(session, creds)
    return fleet.all_settings(session)


@router.put("/settings", response_model=FleetSettings)
def write_settings(payload: FleetSettings, session: WriteSessionDep, creds: CredsDep):
    admin = require_admin(session, creds)
    before = fleet.all_settings(session)
    after = payload.model_dump()
    changes = [(k, before[k], v) for k, v in after.items() if before[k] != v]
    for key, value in after.items():
        fleet.put_setting(session, key, value)
    if changes:
        audit.record(session, admin, "settings_changed", changes=changes)
    session.commit()
    return fleet.all_settings(session)


# --- The fuel price ----------------------------------------------------------


@router.get("/fuel", response_model=list[FuelPriceRead])
def fuel_prices(session: SessionDep, creds: CredsDep):
    """The official prices, newest first. Anyone signed in may read them."""
    require_user(session, creds)
    return fleet.prices(session)


@router.post("/fuel", response_model=FuelPriceRead, status_code=status.HTTP_201_CREATED)
def add_fuel_price(payload: FuelPriceIn, session: WriteSessionDep, creds: CredsDep):
    """A new week's official price. One a day: the same day again is a 409."""
    admin = require_admin(session, creds)
    if session.exec(select(FuelPrice).where(FuelPrice.valid_from == payload.valid_from)).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "There is a price from that day already")
    row = FuelPrice(**payload.model_dump())
    session.add(row)
    audit.record(
        session, admin, "fuel_price_added", payload.valid_from.isoformat(),
        changes=[("diesel", None, payload.diesel), ("petrol", None, payload.petrol)],
    )
    session.commit()
    session.refresh(row)
    return row


@router.delete("/fuel/{price_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_fuel_price(price_id: int, session: WriteSessionDep, creds: CredsDep):
    admin = require_admin(session, creds)
    row = session.get(FuelPrice, price_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Price not found")
    if len(fleet.prices(session)) == 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "Keep at least one fuel price")
    audit.record(session, admin, "fuel_price_removed", row.valid_from.isoformat())
    session.delete(row)
    session.commit()


# --- Out of service ----------------------------------------------------------


@router.get("/blocks", response_model=list[CarBlockRead])
def list_blocks(session: SessionDep, creds: CredsDep):
    """The blocks still running or to come, soonest first."""
    require_admin(session, creds)
    return fleet.blocks_from(session, date.today())


@router.post("/blocks", response_model=CarBlockOut, status_code=status.HTTP_201_CREATED)
def add_block(payload: CarBlockIn, session: WriteSessionDep, creds: CredsDep):
    """Take a car out of service. The rides already booked in it on those
    days are not removed (the admin may move them to another car, or the
    driver may), but their drivers are told, and the answer lists them."""
    admin = require_admin(session, creds)
    car = _car_or_404(session, payload.car_id)
    for other in fleet.blocks_from(session, payload.start_date, car.id):
        if payload.end_date is None or other.start_date <= payload.end_date:
            raise HTTPException(status.HTTP_409_CONFLICT, "That car is already out of service on some of those days")
    block = CarBlock(**payload.model_dump(), by_name=admin.display_name)
    session.add(block)
    session.flush()
    rides = fleet.rides_in_block(session, block, date.today())
    audit.record(
        session, admin, "car_blocked", corporate_car_label(car),
        changes=[("days", None, _span(block)), ("reason", None, block.reason)] + ([("rides", None, len(rides))] if rides else []),
    )
    session.commit()
    session.refresh(block)
    label = corporate_car_label(car)
    for ride in rides:
        notify(session, [ride.driver_id], "car_blocked", ride, car=label, reason=block.reason)
    cars_state_changed()
    extras = board_extras(session, rides)
    return CarBlockOut(block=CarBlockRead.model_validate(block), rides=[to_ride_read_dict(r, extras) for r in rides])  # type: ignore[misc]


@router.patch("/blocks/{block_id}", response_model=CarBlockRead)
def change_block(block_id: int, payload: CarBlockEnd, session: WriteSessionDep, creds: CredsDep):
    """Move the last day of a block (back early, or longer than thought)."""
    admin = require_admin(session, creds)
    block = session.get(CarBlock, block_id)
    if block is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    if payload.end_date is not None and payload.end_date < block.start_date:
        raise HTTPException(422, "The last day cannot be before the first")
    before = _span(block)
    block.end_date = payload.end_date
    car = session.get(CorporateCar, block.car_id)
    audit.record(session, admin, "car_block_changed", corporate_car_label(car) if car else "", changes=[("days", before, _span(block))])
    session.add(block)
    session.commit()
    session.refresh(block)
    cars_state_changed()
    return block


@router.delete("/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_block(block_id: int, session: WriteSessionDep, creds: CredsDep):
    """The car is back in service: the block goes."""
    admin = require_admin(session, creds)
    block = session.get(CarBlock, block_id)
    if block is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    car = session.get(CorporateCar, block.car_id)
    audit.record(session, admin, "car_unblocked", corporate_car_label(car) if car else "", changes=[("days", _span(block), None)])
    session.delete(block)
    session.commit()
    cars_state_changed()


# --- Costs -------------------------------------------------------------------


def _window(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    today = date.today()
    end = date_to or today
    start = date_from or end - timedelta(days=89)
    if end < start:
        raise HTTPException(422, "`to` must not be before `from`")
    if (end - start).days > MAX_COST_DAYS:
        raise HTTPException(422, f"Range may not exceed {MAX_COST_DAYS} days")
    return start, end


@router.get("/costs", response_model=list[CarCostRead])
def list_costs(
    session: SessionDep,
    creds: CredsDep,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
):
    require_admin(session, creds)
    start, end = _window(date_from, date_to)
    return fleet.costs_between(session, start, end)


@router.post("/costs", response_model=CarCostRead, status_code=status.HTTP_201_CREATED)
def add_cost(payload: CarCostIn, session: WriteSessionDep, creds: CredsDep):
    admin = require_admin(session, creds)
    car = _car_or_404(session, payload.car_id)
    cost = CarCost(**payload.model_dump(), user_id=admin.id, user_name=admin.display_name)
    session.add(cost)
    audit.record(
        session, admin, "cost_added", corporate_car_label(car),
        changes=[("kind", None, payload.kind), ("amount", None, payload.amount), ("day", None, payload.day)],
    )
    session.commit()
    session.refresh(cost)
    return cost


@router.delete("/costs/{cost_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_cost(cost_id: int, session: WriteSessionDep, creds: CredsDep):
    admin = require_admin(session, creds)
    cost = session.get(CarCost, cost_id)
    if cost is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    car = session.get(CorporateCar, cost.car_id)
    audit.record(
        session, admin, "cost_removed", corporate_car_label(car) if car else "",
        changes=[("kind", cost.kind, None), ("amount", cost.amount, None), ("day", cost.day, None)],
    )
    session.delete(cost)
    session.commit()


@router.get("/overview")
def overview(
    session: SessionDep,
    creds: CredsDep,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
):
    """Per car: what was spent, the km its odometer logged, the km nobody
    logged, and dinars a km (fleet.fleet_overview)."""
    require_admin(session, creds)
    start, end = _window(date_from, date_to)
    return fleet.fleet_overview(session, start, end)

