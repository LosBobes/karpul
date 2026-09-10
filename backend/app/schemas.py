"""Request / response schemas."""

from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import CarType


def _clean_name(value: str) -> str:
    value = " ".join(value.split())
    if not value:
        raise ValueError("must not be empty")
    return value


def _clean_plate(value: str) -> str:
    value = " ".join(value.split()).upper()
    if not value:
        raise ValueError("must not be empty")
    return value


class CorporateCarRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    plate: str
    passenger_seats: int
    active: bool


class CorporateCarCreate(BaseModel):
    """Admin-only: a new car for the company pool."""

    name: str = Field(min_length=1, max_length=80)
    plate: str = Field(min_length=1, max_length=20)
    passenger_seats: int = Field(ge=1, le=8)
    active: bool = True

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        return _clean_name(v)

    @field_validator("plate")
    @classmethod
    def clean_plate(cls, v: str) -> str:
        return _clean_plate(v)


class CorporateCarUpdate(BaseModel):
    """Admin-only partial update; `active=False` retires a car without deleting it."""

    name: str | None = Field(default=None, min_length=1, max_length=80)
    plate: str | None = Field(default=None, min_length=1, max_length=20)
    passenger_seats: int | None = Field(default=None, ge=1, le=8)
    active: bool | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str | None) -> str | None:
        return _clean_name(v) if v is not None else None

    @field_validator("plate")
    @classmethod
    def clean_plate(cls, v: str | None) -> str | None:
        return _clean_plate(v) if v is not None else None


class BookingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    passenger_name: str
    created_at: datetime


class BookingCreate(BaseModel):
    passenger_name: str = Field(min_length=1, max_length=80)

    @field_validator("passenger_name")
    @classmethod
    def clean(cls, v: str) -> str:
        return _clean_name(v)


class RideBase(BaseModel):
    ride_date: date
    car_type: CarType
    car_name: str = Field(default="", max_length=80)
    corporate_car_id: int | None = None
    driver_name: str = Field(min_length=1, max_length=80)
    origin: str = Field(min_length=1, max_length=120)
    destination: str = Field(min_length=1, max_length=120)
    departure_time: time
    return_time: time | None = None
    seats: int = Field(ge=0, le=8)
    notes: str = Field(default="", max_length=500)
    passengers_manage: bool = False

    @field_validator("driver_name", "origin", "destination", "car_name", "notes")
    @classmethod
    def strip_text(cls, v: str) -> str:
        return " ".join(v.split())

    @model_validator(mode="after")
    def check_consistency(self) -> "RideBase":
        if self.car_type == CarType.corporate and self.corporate_car_id is None:
            raise ValueError("corporate_car_id is required for a corporate car")
        if self.car_type == CarType.own:
            self.corporate_car_id = None
            if not self.car_name:
                raise ValueError("car_name is required for an own car")
        if self.return_time is not None and self.return_time <= self.departure_time:
            raise ValueError("return_time must be after departure_time")
        return self


class RideCreate(RideBase):
    pass


class RideUpdate(BaseModel):
    """Partial update; every field optional."""

    ride_date: date | None = None
    car_type: CarType | None = None
    car_name: str | None = Field(default=None, max_length=80)
    corporate_car_id: int | None = None
    origin: str | None = Field(default=None, min_length=1, max_length=120)
    destination: str | None = Field(default=None, min_length=1, max_length=120)
    departure_time: time | None = None
    return_time: time | None = None
    seats: int | None = Field(default=None, ge=0, le=8)
    notes: str | None = Field(default=None, max_length=500)
    passengers_manage: bool | None = None


class RideRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ride_date: date
    car_type: CarType
    car_name: str
    corporate_car_id: int | None
    driver_name: str
    origin: str
    destination: str
    departure_time: time
    return_time: time | None
    seats: int
    notes: str
    passengers_manage: bool
    created_at: datetime
    bookings: list[BookingRead]
    free_seats: int
