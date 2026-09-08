"""SQLModel tables."""

from datetime import date, datetime, time, timezone
from enum import Enum

from sqlmodel import Field, Relationship, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CarType(str, Enum):
    corporate = "corporate"
    own = "own"


class CorporateCar(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    plate: str = Field(unique=True)
    passenger_seats: int = Field(ge=1, le=8)
    active: bool = Field(default=True)

    rides: list["Ride"] = Relationship(back_populates="corporate_car")


class Ride(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ride_date: date = Field(index=True)
    car_type: CarType
    car_name: str
    corporate_car_id: int | None = Field(default=None, foreign_key="corporatecar.id")
    driver_name: str = Field(index=True)
    origin: str
    destination: str
    departure_time: time
    return_time: time | None = None
    seats: int = Field(ge=0, le=8)
    notes: str = ""
    created_at: datetime = Field(default_factory=utcnow)

    corporate_car: CorporateCar | None = Relationship(back_populates="rides")
    bookings: list["Booking"] = Relationship(
        back_populates="ride", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class Booking(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ride_id: int = Field(foreign_key="ride.id", index=True)
    passenger_name: str
    created_at: datetime = Field(default_factory=utcnow)

    ride: Ride = Relationship(back_populates="bookings")
