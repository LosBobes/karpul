"""Seed the corporate car pool on first start.

Override with the CORPORATE_CARS env var, e.g.
    CORPORATE_CARS="Skoda Octavia|B-123-XY|4;VW Transporter|B-456-ZZ|8"
"""

import os

from sqlmodel import Session, select

from .models import CorporateCar

DEFAULT_CARS = [
    ("Skoda Octavia", "FIRM-001", 4),
    ("Toyota Corolla", "FIRM-002", 4),
    ("VW Transporter", "FIRM-003", 8),
]


def parse_cars(raw: str) -> list[tuple[str, str, int]]:
    cars = []
    for chunk in raw.split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        name, plate, seats = (p.strip() for p in chunk.split("|"))
        cars.append((name, plate, int(seats)))
    return cars


def seed_corporate_cars(session: Session) -> None:
    if session.exec(select(CorporateCar)).first() is not None:
        return
    raw = os.getenv("CORPORATE_CARS")
    cars = parse_cars(raw) if raw else DEFAULT_CARS
    for name, plate, seats in cars:
        session.add(CorporateCar(name=name, plate=plate, passenger_seats=seats))
    session.commit()
