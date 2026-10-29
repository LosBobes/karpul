"""The two offices and the road between them.

Most rides on the board are the same commute: Beograd to Novi Sad and back.
That road is a known length, 90 km there and 92 km back (the way home takes a
longer loop onto the motorway), so a ride between the offices never needs the
driver to type a distance: `office_distance` knows it, `routers/rides.py`
fills `distance_km` in with it when the driver left it blank, and the car
state (`services.car_states`) uses it to guess how far a shared car has gone
when its odometer was not noted. The frontend's twin is `lib/offices.ts`;
keep the names and the figures in step.
"""

from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from .models import Ride
from .services import fold_name

# Each office under the names people write for it, folded (services.fold_name).
OFFICES: dict[str, tuple[str, ...]] = {
    "beograd": ("beograd", "belgrade", "bg", "beograd office", "kancelarija beograd", "beograd kancelarija"),
    "novi sad": ("novi sad", "ns", "novi sad office", "kancelarija novi sad", "novi sad kancelarija"),
}

# Where each office is until an admin places it exactly (a `KnownPlace` of
# kind "office", which app/geo.py seeds from these): the city centres.
# The frontend has no copy; it reads the pins off the rides.
OFFICE_POINTS: dict[str, tuple[float, float]] = {
    "beograd": (44.8125, 20.4612),
    "novi sad": (45.2551, 19.8452),
}

# Kilometres from one office to the other, by direction.
DISTANCES: dict[tuple[str, str], float] = {
    ("beograd", "novi sad"): 90.0,
    ("novi sad", "beograd"): 92.0,
}


def office_of(place: str) -> str | None:
    """Which office a place name means, or None for anywhere else."""
    key = fold_name(place)
    for office, names in OFFICES.items():
        if key in names:
            return office
    return None


def office_distance(origin: str, destination: str) -> float | None:
    """The kilometres from `origin` to `destination` when both are offices."""
    a, b = office_of(origin), office_of(destination)
    if a is None or b is None:
        return None
    return DISTANCES.get((a, b))


def ride_km(origin: str, destination: str, distance_km: float | None, with_return: bool) -> float | None:
    """How far a ride takes a car: the way there, and the way back when the
    ride returns. Between the offices each direction is its own figure; any
    other route is the driver's one-way distance, doubled for the return."""
    there = office_distance(origin, destination)
    if there is None:
        there = distance_km
    if there is None:
        return None
    if not with_return:
        return there
    back = office_distance(destination, origin)
    return there + (back if back is not None else there)


def fill_office_distances(target: Engine) -> int:
    """Give every ride between the offices that has no distance its known one.
    Safe on every start (the rides it touches have one afterwards). Returns
    how many were filled."""
    filled = 0
    with Session(target) as session:
        for ride in session.exec(select(Ride).where(Ride.distance_km.is_(None))):  # type: ignore[union-attr]
            km = office_distance(ride.origin, ride.destination)
            if km is not None:
                ride.distance_km = km
                session.add(ride)
                filled += 1
        session.commit()
    return filled
