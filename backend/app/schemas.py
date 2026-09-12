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
    pickup: str
    created_at: datetime


class BookingCreate(BaseModel):
    passenger_name: str = Field(min_length=1, max_length=80)
    # "" is the ride's origin; otherwise one of the ride's stops, verbatim.
    pickup: str = Field(default="", max_length=120)

    @field_validator("passenger_name")
    @classmethod
    def clean(cls, v: str) -> str:
        return _clean_name(v)

    @field_validator("pickup")
    @classmethod
    def clean_pickup(cls, v: str) -> str:
        return " ".join(v.split())


class BookingUpdate(BaseModel):
    """A passenger moving to another of the ride's pickup points."""

    pickup: str = Field(max_length=120)

    @field_validator("pickup")
    @classmethod
    def clean_pickup(cls, v: str) -> str:
        return " ".join(v.split())


MAX_STOPS = 3
MAX_REPEAT_WEEKS = 26


def _clean_stops(stops: list[str]) -> list[str]:
    cleaned: list[str] = []
    for stop in stops:
        stop = " ".join(stop.split())
        if not stop:
            continue
        if len(stop) > 120:
            raise ValueError("a pickup point may have at most 120 characters")
        if stop.casefold() in (c.casefold() for c in cleaned):
            continue
        cleaned.append(stop)
    if len(cleaned) > MAX_STOPS:
        raise ValueError(f"at most {MAX_STOPS} extra pickup points")
    return cleaned


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
    stops: list[str] = Field(default_factory=list)
    distance_km: float | None = Field(default=None, ge=0, le=2000)
    chip_in: str = Field(default="", max_length=40)

    @field_validator("driver_name", "origin", "destination", "car_name", "notes", "chip_in")
    @classmethod
    def strip_text(cls, v: str) -> str:
        return " ".join(v.split())

    @field_validator("stops")
    @classmethod
    def clean_stops(cls, v: list[str]) -> list[str]:
        return _clean_stops(v)

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
        self.stops = [s for s in self.stops if s.casefold() != self.origin.casefold()]
        return self


class RideCreate(RideBase):
    # "Repeat weekly until": one ride per week on the same weekday, from
    # `ride_date` to this date inclusive. Not stored; the rides share a series id.
    repeat_until: date | None = None

    @model_validator(mode="after")
    def check_repeat(self) -> "RideCreate":
        if self.repeat_until is not None:
            if self.repeat_until < self.ride_date:
                raise ValueError("repeat_until must not be before ride_date")
            if (self.repeat_until - self.ride_date).days > MAX_REPEAT_WEEKS * 7:
                raise ValueError(f"repeat_until may be at most {MAX_REPEAT_WEEKS} weeks after ride_date")
        return self


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
    stops: list[str] | None = None
    distance_km: float | None = Field(default=None, ge=0, le=2000)
    chip_in: str | None = Field(default=None, max_length=40)


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
    stops: list[str]
    distance_km: float | None
    chip_in: str
    series_id: str | None
    created_at: datetime
    bookings: list[BookingRead]
    free_seats: int
