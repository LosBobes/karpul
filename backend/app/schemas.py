"""Request / response schemas."""

import json
import re
from datetime import date, datetime, time, timezone

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


# --- accounts (app/auth.py) --------------------------------------------------

# A username is a handle, not a name: lowercase letters, digits and . _ -, with
# a letter or digit at each end, 3 to 32 characters. The display name (first +
# last) is where accents and spaces belong.
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$")
# Deliberately loose: an address is proved by a person receiving mail at it, not
# by a regular expression. This only catches typing the wrong thing in the box.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$")
# A mobile number as people type it: digits with spaces, dashes, dots, slashes
# or brackets between them and an optional leading +. 6 to 15 digits (E.164 tops
# out at 15) catches a typo without knowing every country's numbering plan.
PHONE_RE = re.compile(r"^\+?[0-9 ()./-]+$")
MIN_PASSWORD = 8


def _clean_username(value: str) -> str:
    value = value.strip().lower()
    if not USERNAME_RE.match(value):
        raise ValueError(
            "3 to 32 characters: lowercase letters, digits, dot, dash or underscore, "
            "starting and ending with a letter or digit"
        )
    return value


def _clean_email(value: str | None) -> str | None:
    """Optional: an empty box means no email."""
    value = (value or "").strip().lower()
    if not value:
        return None
    if not EMAIL_RE.match(value):
        raise ValueError("must be an email address")
    return value


def _clean_phone(value: str | None) -> str | None:
    """Optional, kept as typed (spaces collapsed) so it reads the way its owner wrote it."""
    value = " ".join((value or "").split())
    if not value:
        return None
    digits = sum(c.isdigit() for c in value)
    if not PHONE_RE.match(value) or not 6 <= digits <= 15:
        raise ValueError("must be a phone number")
    return value


def _check_password(value: str) -> str:
    if len(value) < MIN_PASSWORD:
        raise ValueError(f"must be at least {MIN_PASSWORD} characters")
    return value


class RegisterIn(BaseModel):
    """A new account. `first_name` + `last_name` become the name colleagues see."""

    username: str = Field(min_length=3, max_length=32)
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    first_name: str = Field(min_length=1, max_length=40)
    last_name: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("username")
    @classmethod
    def clean_username(cls, v: str) -> str:
        return _clean_username(v)

    @field_validator("email")
    @classmethod
    def clean_email(cls, v: str | None) -> str | None:
        return _clean_email(v)

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, v: str | None) -> str | None:
        return _clean_phone(v)

    @field_validator("first_name", "last_name")
    @classmethod
    def clean_person_name(cls, v: str) -> str:
        return _clean_name(v)

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return _check_password(v)


class LoginIn(BaseModel):
    """`login` is the username or the email; either signs the same account in."""

    login: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class ProfileUpdate(BaseModel):
    """Partial update of your own account. Changing the password needs the
    current one; changing the name renames you everywhere on the board."""

    first_name: str | None = Field(default=None, min_length=1, max_length=40)
    last_name: str | None = Field(default=None, min_length=1, max_length=40)
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    current_password: str | None = Field(default=None, max_length=200)
    new_password: str | None = Field(default=None, min_length=1, max_length=200)

    @field_validator("first_name", "last_name")
    @classmethod
    def clean_person_name(cls, v: str | None) -> str | None:
        return _clean_name(v) if v is not None else None

    @field_validator("email")
    @classmethod
    def clean_email(cls, v: str | None) -> str | None:
        return _clean_email(v)

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, v: str | None) -> str | None:
        return _clean_phone(v)

    @field_validator("new_password")
    @classmethod
    def check_password(cls, v: str | None) -> str | None:
        return _check_password(v) if v is not None else None

    @model_validator(mode="after")
    def check_password_pair(self) -> "ProfileUpdate":
        if self.new_password is not None and not self.current_password:
            raise ValueError("current_password is required to set a new password")
        return self


class UserRead(BaseModel):
    """An account as its owner sees it. Never carries the password hash.
    Build it with `routers.auth.user_read`, which fills in `is_admin` as the
    server sees it (the flag or KARPUL_ADMINS)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str | None
    phone: str | None
    first_name: str
    last_name: str
    display_name: str
    is_admin: bool = False
    # The secret in this person's calendar feed address; theirs alone to see.
    calendar_token: str | None = None
    created_at: datetime


class AdminUserRead(BaseModel):
    """An account in the admin's list of people."""

    id: int
    username: str
    display_name: str
    email: str | None
    phone: str | None
    is_admin: bool
    # An admin through KARPUL_ADMINS, which the app cannot change.
    admin_by_config: bool
    created_at: datetime


class AdminActionRead(BaseModel):
    """A line of the admin's log (app/audit.py)."""

    id: int
    at: datetime
    admin_id: int | None
    admin_name: str
    action: str
    subject: str
    ride_id: int | None
    ride_date: date | None
    ride_label: str
    # [[field, before, after], ...], each value already in words.
    changes: list[list[str]]

    @classmethod
    def from_row(cls, row) -> "AdminActionRead":
        data = row.model_dump()
        data["changes"] = json.loads(row.changes or "[]")
        # SQLite hands the time back without its zone; it was written in UTC.
        if data["at"].tzinfo is None:
            data["at"] = data["at"].replace(tzinfo=timezone.utc)
        return cls(**data)


class AdminUserUpdate(BaseModel):
    is_admin: bool


class ResetLinkOut(BaseModel):
    """A one-time password reset link for the admin to pass on."""

    path: str
    expires_at: datetime


class ResetInfo(BaseModel):
    """Who a reset link belongs to, so the page can greet them by name."""

    username: str
    display_name: str


class ResetIn(BaseModel):
    token: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)

    @field_validator("new_password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return _check_password(v)


class AuthOut(BaseModel):
    """What a successful register or login hands the browser."""

    token: str
    expires_at: datetime
    user: UserRead


class BookingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # None for a colleague put in by name who has no account yet.
    passenger_id: int | None
    passenger_name: str
    pickup: str
    created_at: datetime


class WaitlistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    pickup: str
    created_at: datetime


class WaitlistJoin(BaseModel):
    # Where to get in once a seat frees up: "" is the origin, else one of the stops.
    pickup: str = Field(default="", max_length=120)

    @field_validator("pickup")
    @classmethod
    def clean_pickup(cls, v: str) -> str:
        return " ".join(v.split())


MAX_MESSAGE = 500


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_MESSAGE)

    @field_validator("body")
    @classmethod
    def clean_body(cls, v: str) -> str:
        # Line breaks are kept (a message may be an address on two lines);
        # runs of blank lines and the edges are not.
        lines = [" ".join(line.split()) for line in v.strip().splitlines()]
        cleaned = "\n".join(lines)
        while "\n\n\n" in cleaned:
            cleaned = cleaned.replace("\n\n\n", "\n\n")
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ride_id: int
    author_id: int | None
    author_name: str
    body: str
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
    # Always the signed-in account's name on the way in (routers/rides.py);
    # a client-supplied value is ignored.
    driver_name: str = Field(default="", max_length=80)
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
    # A ride offered in answer to someone's request (RideRequest): the
    # requester is put in the car. Not stored on the ride.
    request_id: int | None = None
    # Who drives, when an admin adds a ride for someone else. Left out (or
    # the caller's own id) the caller drives. Not stored as given: the ride's
    # driver_id/driver_name are set from the account.
    driver_id: int | None = None

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
    driver_id: int | None
    # The driver's mobile number when their account has one, for "Call the driver".
    driver_phone: str | None = None
    bookings: list[BookingRead]
    # Waiting for a seat while the car is full, first in line first.
    waitlist: list[WaitlistRead] = []
    message_count: int = 0
    free_seats: int


# --- ride requests ------------------------------------------------------------


class RideRequestCreate(BaseModel):
    request_date: date
    origin: str = Field(min_length=1, max_length=120)
    destination: str = Field(min_length=1, max_length=120)
    departure_time: time
    note: str = Field(default="", max_length=300)

    @field_validator("origin", "destination", "note")
    @classmethod
    def strip_text(cls, v: str) -> str:
        return " ".join(v.split())

    @field_validator("origin", "destination")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("must not be empty")
        return v


class RideRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    request_date: date
    user_id: int
    name: str
    origin: str
    destination: str
    departure_time: time
    note: str
    # The ride that answered it; None while it is open.
    ride_id: int | None
    created_at: datetime
