"""SQLModel tables."""

from datetime import date, datetime, time, timezone
from enum import Enum

from sqlmodel import Field, Relationship, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CarType(str, Enum):
    corporate = "corporate"
    own = "own"


class User(SQLModel, table=True):
    """A person with an account: username, password and their real name, plus
    an email and a mobile number if they choose to give them.

    The rest of the app identifies people by the name they show to colleagues
    (`Ride.driver_name`, `Booking.passenger_name`), so the account owns that
    name: `display_name` is "<first> <last>" and `name_key` is its normalised
    form (services.norm_name), kept unique so two accounts can never answer to
    the same name on the board.

    The table is `appuser`, not `user`: "user" is a reserved word in some SQL
    dialects and quoting it everywhere is a trap for later.
    """

    __tablename__ = "appuser"

    id: int | None = Field(default=None, primary_key=True)
    # Lowercased on the way in, so a login is case-insensitive.
    username: str = Field(unique=True, index=True)
    # Optional. Several NULLs never clash under SQLite's UNIQUE.
    email: str | None = Field(default=None, unique=True, index=True)
    # Optional; shown on the rides this person drives, for a "call the driver" button.
    phone: str | None = Field(default=None)
    first_name: str
    last_name: str
    # norm_name(display_name); unique, see the class docstring.
    name_key: str = Field(unique=True, index=True)
    # "pbkdf2_sha256$<rounds>$<salt hex>$<hash hex>" (app/auth.py). Never the password.
    password_hash: str
    # May manage the company-car pool and the accounts (app/admin.py). The
    # usernames in KARPUL_ADMINS are admins whatever this says.
    # A server default too, so rebuilding an old table (database.relax_not_null)
    # can copy rows that predate the column.
    is_admin: bool = Field(default=False, sa_column_kwargs={"server_default": "0"})
    # The secret in this person's calendar feed address (/api/calendar/<token>.ics):
    # a calendar app cannot send a bearer token, so the URL is the credential.
    # Kept in the clear because the owner has to be shown it again; rotating it
    # (POST /api/auth/me/calendar-token) cuts off every old subscription.
    calendar_token: str | None = Field(default=None, index=True)
    # The kinds of push this person switched off (app/push.py CATEGORIES),
    # comma-separated; "" is everything on. Per account, so it holds in every
    # browser they turned notifications on in.
    push_muted: str = Field(default="", sa_column_kwargs={"server_default": ""})
    # How many minutes before departure this person wants the reminder
    # (app/reminders.py); one of reminders.LEAD_CHOICES.
    remind_before: int = Field(default=30, sa_column_kwargs={"server_default": "30"})
    created_at: datetime = Field(default_factory=utcnow)

    sessions: list["AuthSession"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

    @property
    def display_name(self) -> str:
        """How this person appears in a car."""
        return f"{self.first_name} {self.last_name}".strip()


class AuthSession(SQLModel, table=True):
    """One signed-in browser. The token itself is never stored, only its SHA-256,
    so a stolen database does not hand out sessions."""

    id: int | None = Field(default=None, primary_key=True)
    token_hash: str = Field(unique=True, index=True)
    user_id: int = Field(foreign_key="appuser.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime

    user: User = Relationship(back_populates="sessions")


class CorporateCar(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    plate: str = Field(unique=True)
    passenger_seats: int = Field(ge=1, le=8)
    active: bool = Field(default=True)
    # Where the car is kept: a new ride in it starts here unless the driver says otherwise.
    home: str = Field(default="", sa_column_kwargs={"server_default": ""})

    rides: list["Ride"] = Relationship(back_populates="corporate_car")


class Ride(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ride_date: date = Field(index=True)
    car_type: CarType
    car_name: str
    corporate_car_id: int | None = Field(default=None, foreign_key="corporatecar.id")
    # Who drives: the account, and the name it went by, which is what the board
    # shows and what a rename rewrites. `driver_id` is None only for a ride from
    # before accounts whose driver never registered (database.link_people).
    driver_id: int | None = Field(default=None, foreign_key="appuser.id", index=True)
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
    # Pickup points before the origin, in the order the car reaches them: a
    # passenger collected on the way to the start. Same one-per-line text.
    stops_before: str = ""
    # Driver's choice: may a passenger put a new pickup point on the route
    # when getting in or moving? Off, only the driver (and an admin) adds them.
    passengers_add_stops: bool = Field(default=True)
    # Driver's hint: they would appreciate a coffee. Only ever shown.
    coffee_please: bool = Field(default=False, sa_column_kwargs={"server_default": "0"})
    # One-way distance, for the "km shared" figures. Optional; the driver's estimate.
    distance_km: float | None = None
    # A free-text "chip in" note per seat ("300 din", "2 EUR"). No payments here,
    # just the agreement written where the passengers can see it.
    chip_in: str = ""
    # Rides created together by "repeat weekly until" share a series id, so the
    # driver can remove this and the following ones in one go.
    series_id: str | None = None
    # Set once everyone in the car has had their departure reminder, or the
    # ride has left (app/reminders.py; who was told is in ReminderSent).
    reminder_sent: bool = Field(default=False)
    # Set once the driver was asked to note the odometer after a shared car's
    # return (app/reminders.py), so it is asked once.
    km_reminder_sent: bool = Field(default=False, sa_column_kwargs={"server_default": "0"})
    # A shared car is rationed (services.SHARED_CAR_PER_WEEK / _PER_DAY): a
    # ride past the driver's share is "" when within it, "pending" while it
    # waits for an admin, "approved" once an admin let it through (or made
    # it). Own cars are always "".
    approval: str = Field(default="")
    # The driver of a shared car cancelled with passengers in it: the ride
    # stays (and keeps the car) while they are asked whether one of them
    # drives instead (POST /api/rides/{id}/takeover). `driver_id` and
    # `driver_name` still say who cancelled, but that account no longer runs
    # the ride (access.is_driver). Nobody by departure, it goes
    # (reminders.drop_driverless).
    needs_driver: bool = Field(default=False, sa_column_kwargs={"server_default": "0"})
    created_at: datetime = Field(default_factory=utcnow)

    corporate_car: CorporateCar | None = Relationship(back_populates="rides")
    bookings: list["Booking"] = Relationship(
        back_populates="ride",
        # Oldest first, whichever way they were loaded (lazily or in bulk).
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "Booking.id"},
    )
    # Queued for a seat while the car is full, first come first served.
    waitlist: list["WaitlistEntry"] = Relationship(
        back_populates="ride",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "WaitlistEntry.id"},
    )
    messages: list["RideMessage"] = Relationship(
        back_populates="ride",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "RideMessage.id"},
    )
    # Who was at the wheel of a shared car, from what odometer reading to
    # what, in the order they drove (DriveLeg).
    legs: list["DriveLeg"] = Relationship(
        back_populates="ride",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "DriveLeg.id"},
    )
    # Who has had their departure reminder (app/reminders.py); goes with the ride.
    reminders: list["ReminderSent"] = Relationship(sa_relationship_kwargs={"cascade": "all, delete-orphan"})


class Booking(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ride_id: int = Field(foreign_key="ride.id", index=True)
    # The passenger's account; None for a colleague the driver put in by name
    # who has no account yet (registering under that name claims the seat).
    passenger_id: int | None = Field(default=None, foreign_key="appuser.id", index=True)
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
    # Whose browser this is; pushes are addressed by account.
    user_id: int | None = Field(default=None, foreign_key="appuser.id", index=True)
    # The account's normalised name when it subscribed. Only read to link
    # subscriptions from before `user_id` existed (database.link_people).
    user_name: str = Field(index=True)
    # The app language the browser had when it subscribed: "en" or "sr".
    locale: str = "en"
    created_at: datetime = Field(default_factory=utcnow)


class PasswordReset(SQLModel, table=True):
    """A one-time link an admin hands someone who forgot their password
    (POST /api/admin/users/{id}/reset-link). Stored as the SHA-256 of the
    token, like a session; using it sets a new password and signs every
    browser of that account out."""

    id: int | None = Field(default=None, primary_key=True)
    token_hash: str = Field(unique=True, index=True)
    user_id: int = Field(foreign_key="appuser.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime
    used_at: datetime | None = None


class WaitlistEntry(SQLModel, table=True):
    """Someone waiting for a seat in a full car. When a seat frees up the first
    in line is put in the car and told (services.promote_waitlist)."""

    id: int | None = Field(default=None, primary_key=True)
    ride_id: int = Field(foreign_key="ride.id", index=True)
    user_id: int = Field(foreign_key="appuser.id", index=True)
    name: str
    # Where they want to get in, as for a booking: "" is the origin.
    pickup: str = ""
    # A `pickup` that is not on the route yet: where it goes once they get the
    # seat (services.add_stop), before the origin or after it, at that index.
    # None while the pickup is the origin or one of the stops.
    new_stop_before: bool | None = None
    new_stop_index: int | None = None
    created_at: datetime = Field(default_factory=utcnow)

    ride: Ride = Relationship(back_populates="waitlist")


class RideMessage(SQLModel, table=True):
    """One line in a ride's thread ("running five minutes late")."""

    id: int | None = Field(default=None, primary_key=True)
    ride_id: int = Field(foreign_key="ride.id", index=True)
    author_id: int | None = Field(default=None, foreign_key="appuser.id")
    author_name: str
    body: str
    created_at: datetime = Field(default_factory=utcnow)

    ride: Ride = Relationship(back_populates="messages")


class RideRequest(SQLModel, table=True):
    """A passenger asking for a ride that nobody offers yet: "Tuesday around
    8, Novi Sad to HQ". A driver answers it by adding a ride for it, which
    puts the requester in the car; getting into any car that day answers it too."""

    id: int | None = Field(default=None, primary_key=True)
    request_date: date = Field(index=True)
    user_id: int = Field(foreign_key="appuser.id", index=True)
    name: str
    origin: str
    destination: str
    # Roughly when they would like to leave.
    departure_time: time
    note: str = ""
    # The ride that answered it; None while it is open.
    ride_id: int | None = Field(default=None, foreign_key="ride.id")
    created_at: datetime = Field(default_factory=utcnow)


class AdminAction(SQLModel, table=True):
    """One thing an admin did that was not theirs to do as a plain user: a
    ride added in someone's name, someone's ride edited or removed, a seat
    managed in someone's car, a pool car or an account changed. The admin's
    log (GET /api/admin/log, admins only) reads it, newest first.

    Everything is a snapshot in words, not a foreign key, so the line still
    reads right after the ride, the car or either person is gone.
    """

    id: int | None = Field(default=None, primary_key=True)
    at: datetime = Field(default_factory=utcnow, index=True)
    admin_id: int | None = None
    admin_name: str
    # What happened, one of audit.ACTIONS.
    action: str
    # Whose ride, which car or which account it was about.
    subject: str = ""
    ride_id: int | None = None
    ride_date: date | None = None
    # "07:30 Novi Sad → HQ": which of that day's rides it was.
    ride_label: str = ""
    # JSON: [[field, before, after], ...], each value already in words.
    changes: str = "[]"


class DataMigration(SQLModel, table=True):
    """A one-time change to the data that has been applied, by name, so that it
    is never applied twice (app/backfill.py runs on start until it is here)."""

    name: str = Field(primary_key=True)
    applied_at: datetime = Field(default_factory=utcnow)


class DriveLeg(SQLModel, table=True):
    """One stretch at the wheel of a shared car: who drove it and the odometer
    when they took the wheel and when they handed it on (or brought the car
    back). A ride's legs follow each other: a handover ends one at the reading
    the next starts from. The ride's driver is who booked the car; this is who
    actually drove, and how far."""

    id: int | None = Field(default=None, primary_key=True)
    ride_id: int = Field(foreign_key="ride.id", index=True)
    # The account at the wheel; None for a passenger put in by name without
    # one (or an account since deleted). The name is a snapshot, like everywhere.
    driver_id: int | None = Field(default=None, foreign_key="appuser.id", index=True)
    driver_name: str
    start_km: int
    # None while this stretch is being driven.
    end_km: int | None = None
    created_at: datetime = Field(default_factory=utcnow)

    ride: Ride = Relationship(back_populates="legs")


class ProfilePhoto(SQLModel, table=True):
    """A person's picture, shown in their avatar instead of the initials.

    The bytes live in the database rather than in a folder next to it, so the
    backup (app/backup.py) carries them and there is one thing to keep. The
    browser has already cropped and shrunk it to a small square (a few tens of
    KB). `key` is random and new with every upload: the picture is served
    openly at /api/avatars/<key> (an <img> cannot send a bearer token), so the
    address is the secret, like the calendar feed's, and the old one stops
    working the moment the photo changes or goes.
    """

    user_id: int = Field(foreign_key="appuser.id", primary_key=True)
    key: str = Field(unique=True, index=True)
    # "image/webp", "image/jpeg" or "image/png", sniffed from the bytes.
    content_type: str
    data: bytes
    updated_at: datetime = Field(default_factory=utcnow)
class ReminderSent(SQLModel, table=True):
    """One person told that their ride leaves soon (app/reminders.py). Each
    person picks how long before departure they want it (`User.remind_before`),
    so a ride's reminders go out at different minutes; this is who has had theirs."""

    id: int | None = Field(default=None, primary_key=True)
    ride_id: int = Field(foreign_key="ride.id", index=True)
    user_id: int = Field(foreign_key="appuser.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)


class CarReport(SQLModel, table=True):
    """How a shared car was found or left: the odometer, the battery, whether
    it is clean, and anything wrong with it (a scratch, a warning light, no
    washer fluid). Written when a car is brought back (`routers/odometer.py`)
    or on its own (`POST /api/cars/corporate/{id}/reports`); the newest one is
    the car's state (`services.car_states`). Snapshots, like everything: the
    name stays when the account goes."""

    id: int | None = Field(default=None, primary_key=True)
    car_id: int = Field(foreign_key="corporatecar.id", index=True)
    # The ride the car came back from, when the report came with its return.
    ride_id: int | None = Field(default=None, foreign_key="ride.id")
    user_id: int | None = Field(default=None, foreign_key="appuser.id")
    user_name: str
    # None when the reporter did not read it.
    odometer_km: int | None = None
    # Battery (or fuel) in percent; None when not read.
    soc: int | None = None
    # True clean, False needs a wash, None not said.
    clean: bool | None = None
    # What is wrong, in the reporter's words: "" for nothing wrong, None for not said.
    issues: str | None = None
    created_at: datetime = Field(default_factory=utcnow, index=True)
