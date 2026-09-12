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
    # Driver's choice: may the passengers add and remove each other? Off, only
    # the driver (and each passenger, for themself) touches the seat list.
    passengers_manage: bool = Field(default=False)
    # Extra pickup points the driver offers besides `origin`, one per line
    # (the API shows them as a list; see services.stops_from_text). A passenger
    # picks one of them, or the origin, in `Booking.pickup`.
    stops: str = ""
    # One-way distance, for the "km shared" figures. Optional; the driver's estimate.
    distance_km: float | None = None
    # A free-text "chip in" note per seat ("300 din", "2 EUR"). No payments here,
    # just the agreement written where the passengers can see it.
    chip_in: str = ""
    # Rides created together by "repeat weekly until" share a series id, so the
    # driver can remove this and the following ones in one go.
    series_id: str | None = None
    # Set once the departure reminder has been pushed (app/reminders.py).
    reminder_sent: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)

    corporate_car: CorporateCar | None = Relationship(back_populates="rides")
    bookings: list["Booking"] = Relationship(
        back_populates="ride",
        # Oldest first, whichever way they were loaded (lazily or in bulk).
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "Booking.id"},
    )


class Booking(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ride_id: int = Field(foreign_key="ride.id", index=True)
    passenger_name: str
    # Where this passenger gets in: the ride's origin ("") or one of its stops.
    pickup: str = ""
    created_at: datetime = Field(default_factory=utcnow)

    ride: Ride = Relationship(back_populates="bookings")


class PushSubscription(SQLModel, table=True):
    """A browser that asked for push notifications (app/push.py), tied to the
    name it was using at the time; a renamed browser re-subscribes."""

    id: int | None = Field(default=None, primary_key=True)
    endpoint: str = Field(unique=True)
    p256dh: str
    auth: str
    # Normalised (services.norm_name), so a match is the same rule as everywhere.
    user_name: str = Field(index=True)
    # The app language the browser had when it subscribed: "en" or "sr".
    locale: str = "en"
    created_at: datetime = Field(default_factory=utcnow)
