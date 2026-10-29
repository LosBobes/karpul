"""Places on the map: the pins on a ride, the places Karpul knows, and the
outside services that turn words into points and back.

A place in Karpul is the words someone typed (`Ride.origin`, a stop, a
booking's `pickup`), and those words stay the contract: bookings point at a
stop by its text. A pin is extra, kept next to the words in `Ride.points`
(and `RideRequest.points`) as JSON keyed by the place's folded name
(`services.fold_name`), so any spelling of a place finds its pin and a
reordered route needs no bookkeeping. `prune` drops the pins of places that
left the route.

Nobody has to pin anything. An office (`offices.office_of`) and a shared car's
home are pinned for everyone (`fill_known`); a place someone pinned on a ride
is learned (`KnownPlace`, `learn`) and suggested to the next person who types
it (`suggestions`), but never put on a ride by itself, because "Centar" in one
colleague's mouth is not another's.

The outside services are asked by the server, never the browser: the place
search and the pin's address (`search`, `reverse`) from an OSM Nominatim
(`KARPUL_GEOCODER_URL`, the public one by default; "" turns it off), and the
road between pins (`road`) from an OSRM (`KARPUL_ROUTER_URL`, off by default:
the public demo is not for production use). Their answers are kept in memory
for `CACHE_DAYS` (one worker, like the live hub), and the public Nominatim is
asked at most once a second (its usage policy). Tests replace `fetch_json`.
"""

from __future__ import annotations

import json
import logging
import math
import os
import threading
import time as clock
import urllib.parse
import urllib.request
from collections import OrderedDict
from collections.abc import Callable
from datetime import date
from typing import Any

from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from .models import CorporateCar, KnownPlace, Ride, RideRequest, utcnow
from .offices import OFFICE_POINTS, office_of

log = logging.getLogger("karpul.geo")

KINDS = ("office", "car_home", "learned")

# How long an answer from the geocoder or the router is reused.
CACHE_DAYS = 30
CACHE_ENTRIES = 5000
# The public Nominatim asks for one request a second at most.
MIN_INTERVAL_S = 1.0
TIMEOUT_S = 6.0
USER_AGENT = "Karpul/1.0 (carpooling for a company; https://www.karpul.dev)"

DEFAULT_GEOCODER = "https://nominatim.openstreetmap.org"
DEFAULT_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
DEFAULT_ATTRIBUTION = "© OpenStreetMap contributors"

# A request starts "where a ride passes" when it is this close to one of the
# ride's pickup points (routers/requests.drivers_for, the app's stop hint).
NEAR_KM = 2.0
# Suggestions for one search.
MAX_SUGGESTIONS = 8


def fold(place: str) -> str:
    from .services import fold_name

    return fold_name(place)


# --- the pins on a ride -------------------------------------------------------


def load(text: str | None) -> dict[str, dict[str, float]]:
    """`Ride.points` as a dict; anything unreadable is no pins at all."""
    try:
        data = json.loads(text or "{}")
    except ValueError:
        return {}
    if not isinstance(data, dict):
        return {}
    out = {}
    for key, value in data.items():
        if isinstance(value, dict) and isinstance(value.get("lat"), (int, float)) and isinstance(value.get("lng"), (int, float)):
            out[str(key)] = {"lat": float(value["lat"]), "lng": float(value["lng"])}
    return out


def dump(points: dict[str, dict[str, float]]) -> str:
    return json.dumps(points, sort_keys=True, separators=(",", ":"))


def route_places(ride: Any) -> list[str]:
    """Every place of a ride (a `Ride` or a validated payload) in the order
    the car reaches them: the stops before the start, the start, the stops on
    the way, the destination."""
    before = ride.stops_before if isinstance(ride.stops_before, list) else [s for s in ride.stops_before.split("\n") if s]
    after = ride.stops if isinstance(ride.stops, list) else [s for s in ride.stops.split("\n") if s]
    return [*before, ride.origin, *after, ride.destination]


def folded(given: dict[str, Any] | None) -> dict[str, dict[str, float]]:
    """Pins from a payload (by the place as written) under folded keys."""
    out: dict[str, dict[str, float]] = {}
    for place, point in (given or {}).items():
        lat = point["lat"] if isinstance(point, dict) else point.lat
        lng = point["lng"] if isinstance(point, dict) else point.lng
        key = fold(place)
        if key:
            out[key] = {"lat": lat, "lng": lng}
    return out


def prune(points: dict[str, dict[str, float]], places: list[str]) -> dict[str, dict[str, float]]:
    """Only the pins of `places`."""
    keep = {fold(p) for p in places}
    return {k: v for k, v in points.items() if k in keep}


def known_point(session: Session, place: str, car: CorporateCar | None = None) -> dict[str, float] | None:
    """The pin everyone gets for `place` without pinning it: the shared car's
    home when the place is it, an office (as the admins placed it, else the
    city centre), or a car home Karpul knows. Never a learned place."""
    key = fold(place)
    if not key:
        return None
    if car is not None and car.home_lat is not None and car.home_lng is not None and fold(car.home) == key:
        return {"lat": car.home_lat, "lng": car.home_lng}
    office = office_of(place)
    if office is not None:
        row = session.exec(select(KnownPlace).where(KnownPlace.key == office, KnownPlace.kind == "office")).first()
        if row is not None:
            return {"lat": row.lat, "lng": row.lng}
        lat, lng = OFFICE_POINTS[office]
        return {"lat": lat, "lng": lng}
    row = session.exec(select(KnownPlace).where(KnownPlace.key == key, KnownPlace.kind == "car_home")).first()
    if row is not None:
        return {"lat": row.lat, "lng": row.lng}
    return None


def fill_known(
    session: Session, points: dict[str, dict[str, float]], places: list[str], car: CorporateCar | None = None
) -> dict[str, dict[str, float]]:
    """`points` with a pin added for every place of `places` that has none and
    that everyone knows (`known_point`)."""
    out = dict(points)
    for place in places:
        key = fold(place)
        if key and key not in out:
            point = known_point(session, place, car)
            if point is not None:
                out[key] = point
    return out


def points_for(
    session: Session, places: list[str], given: dict[str, Any] | None, car: CorporateCar | None = None
) -> dict[str, dict[str, float]]:
    """The pins to store for a route: what was given, only for its places,
    and the known ones filled in."""
    return fill_known(session, prune(folded(given), places), places, car)


def pin(ride: Ride, place: str, point: Any | None) -> None:
    """Put `point` (a `schemas.Point` or None) on `ride` for `place`."""
    if point is None:
        return
    points = load(ride.points)
    points[fold(place)] = {"lat": point.lat, "lng": point.lng}
    ride.points = dump(points)


def prune_ride(ride: Ride) -> None:
    """Drop the pins of places that are no longer on `ride`'s route."""
    ride.points = dump(prune(load(ride.points), route_places(ride)))


def moved(before: dict[str, dict[str, float]], after: dict[str, dict[str, float]]) -> list[str]:
    """The keys pinned both times somewhere else: a pin that moved, which is
    the route moving. A first pin on a place is not."""
    return [k for k in after if k in before and before[k] != after[k]]


def _same(a: dict[str, float], b: dict[str, float]) -> bool:
    return abs(a["lat"] - b["lat"]) < 1e-6 and abs(a["lng"] - b["lng"]) < 1e-6


def repin(
    session: Session,
    names_it: Callable[[str], bool],
    old: list[dict[str, float]],
    new: dict[str, float],
    today: date | None = None,
) -> tuple[list[Ride], list[RideRequest]]:
    """A known place (an office, a shared car's home) moved: the rides from
    `today` on, and the open requests, that name it (`names_it`) and still
    carry one of its `old` pins get the `new` one. A pin someone dropped
    somewhere else for that place stays theirs, and the past stays as it was
    driven. Returns what changed, for the caller to publish after its commit."""
    today = today or date.today()
    rides: list[Ride] = []
    for ride in session.exec(select(Ride).where(Ride.ride_date >= today)):
        points, hit = load(ride.points), False
        for place in route_places(ride):
            key = fold(place)
            if names_it(place) and key in points and any(_same(points[key], o) for o in old):
                points[key], hit = dict(new), True
        if hit:
            ride.points = dump(points)
            session.add(ride)
            rides.append(ride)
    requests: list[RideRequest] = []
    for request in session.exec(select(RideRequest).where(RideRequest.request_date >= today)):
        points, hit = load(request.points), False
        for place in (request.origin, request.destination):
            key = fold(place)
            if names_it(place) and key in points and any(_same(points[key], o) for o in old):
                points[key], hit = dict(new), True
        if hit:
            request.points = dump(points)
            session.add(request)
            requests.append(request)
    return rides, requests


def repin_known(session: Session, place: KnownPlace, old: dict[str, float]) -> tuple[list[Ride], list[RideRequest]]:
    """`place` moved from `old`: its upcoming rides follow (`repin`). An
    office is named under any of its names, and a ride pinned from the city
    centre before an admin placed it moves too; anything else by its own name."""
    new = {"lat": place.lat, "lng": place.lng}
    if place.kind == "office":
        olds = [old]
        if place.key in OFFICE_POINTS:
            lat, lng = OFFICE_POINTS[place.key]
            olds.append({"lat": lat, "lng": lng})
        return repin(session, lambda p: office_of(p) == place.key, olds, new)
    return repin(session, lambda p: fold(p) == place.key, [old], new)


# --- the places Karpul knows --------------------------------------------------


def learn(session: Session, places: list[str], points: dict[str, dict[str, float]]) -> None:
    """Remember the places of `places` that carry a pin in `points` as
    suggestions for everyone (`KnownPlace`, kind "learned"). An office's or a
    car home's own pin is never moved by it: an admin placed those."""
    seen = set()
    for place in places:
        key = fold(place)
        point = points.get(key)
        if point is None or key in seen or office_of(place) is not None:
            continue
        seen.add(key)
        row = session.exec(select(KnownPlace).where(KnownPlace.key == key)).first()
        if row is None:
            session.add(KnownPlace(name=place, key=key, lat=point["lat"], lng=point["lng"], kind="learned", uses=1))
            continue
        if row.kind == "learned":
            row.lat, row.lng = point["lat"], point["lng"]
        row.uses += 1
        row.last_used = utcnow()
        session.add(row)


def keep_car_home(session: Session, car: CorporateCar) -> None:
    """The car's home as a known place everyone's ride gets the pin of."""
    if not car.home or car.home_lat is None or car.home_lng is None or office_of(car.home) is not None:
        return
    key = fold(car.home)
    row = session.exec(select(KnownPlace).where(KnownPlace.key == key)).first()
    if row is None:
        row = KnownPlace(name=car.home, key=key, lat=car.home_lat, lng=car.home_lng, kind="car_home")
    else:
        row.kind, row.lat, row.lng = "car_home", car.home_lat, car.home_lng
    session.add(row)


def seed_places(target: Engine) -> int:
    """On every start: the offices as known places (once; an admin may move
    them after), the coming rides still on an office's city centre once an
    admin has placed it, the pinned car homes, and the pins of the old rides
    and requests that name an office. Returns how many rows changed."""
    changed = 0
    with Session(target) as session:
        names = {"beograd": "Beograd", "novi sad": "Novi Sad"}
        for office, (lat, lng) in OFFICE_POINTS.items():
            if session.exec(select(KnownPlace).where(KnownPlace.key == office)).first() is None:
                session.add(KnownPlace(name=names.get(office, office.title()), key=office, lat=lat, lng=lng, kind="office"))
                changed += 1
        session.flush()
        # An office an admin has placed: coming rides still on its city-centre
        # pin (pinned before it was placed) move there. Safe to repeat.
        for office, (lat, lng) in OFFICE_POINTS.items():
            row = session.exec(select(KnownPlace).where(KnownPlace.key == office, KnownPlace.kind == "office")).first()
            if row is not None and not _same({"lat": row.lat, "lng": row.lng}, {"lat": lat, "lng": lng}):
                rides, requests = repin(
                    session, lambda p, o=office: office_of(p) == o, [{"lat": lat, "lng": lng}], {"lat": row.lat, "lng": row.lng}
                )
                changed += len(rides) + len(requests)
        for car in session.exec(select(CorporateCar)):
            keep_car_home(session, car)
        for ride in session.exec(select(Ride)):
            places = route_places(ride)
            if not any(office_of(p) for p in places):
                continue
            before = load(ride.points)
            after = fill_known(session, before, places)
            if after != before:
                ride.points = dump(after)
                session.add(ride)
                changed += 1
        for request in session.exec(select(RideRequest)):
            places = [request.origin, request.destination]
            before = load(request.points)
            after = fill_known(session, before, places)
            if after != before:
                request.points = dump(after)
                session.add(request)
                changed += 1
        session.commit()
    return changed


def suggestions(session: Session, query: str, limit: int = MAX_SUGGESTIONS) -> list[dict[str, Any]]:
    """The known places whose name starts with (or has a word starting with)
    what was typed, the offices first, then the most used."""
    q = fold(query)
    if not q:
        return []
    rows = session.exec(select(KnownPlace)).all()
    hits = [r for r in rows if r.key.startswith(q) or any(w.startswith(q) for w in r.key.split())]
    rank = {"office": 0, "car_home": 1, "learned": 2}
    hits.sort(key=lambda r: (not r.key.startswith(q), rank.get(r.kind, 3), -r.uses, r.name))
    return [{"name": r.name, "lat": r.lat, "lng": r.lng, "source": r.kind} for r in hits[:limit]]


# --- distances ----------------------------------------------------------------


def km_between(a: dict[str, float], b: dict[str, float]) -> float:
    """As the crow flies (haversine), in kilometres."""
    r = 6371.0
    la1, la2 = math.radians(a["lat"]), math.radians(b["lat"])
    dla, dln = la2 - la1, math.radians(b["lng"] - a["lng"])
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dln / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def near(a: dict[str, float] | None, b: dict[str, float] | None, km: float = NEAR_KM) -> bool:
    return a is not None and b is not None and km_between(a, b) <= km


# --- the outside services -----------------------------------------------------


def geocoder_url() -> str:
    """Read per call, like the other knobs; "" is no place search at all."""
    return os.getenv("KARPUL_GEOCODER_URL", DEFAULT_GEOCODER).strip().rstrip("/")


def router_url() -> str:
    return os.getenv("KARPUL_ROUTER_URL", "").strip().rstrip("/")


AUDIENCES = ("everyone", "admins", "off")


def audience() -> str:
    """Who has the maps (`KARPUL_MAPS`, read per call like the other knobs):
    "everyone" (the default), "admins" (to try something out first), or
    "off". Anyone without them sees the places as words; the pins are still
    kept on the rides, so turning the maps back on shows them at once."""
    value = os.getenv("KARPUL_MAPS", "everyone").strip().lower()
    return value if value in AUDIENCES else "everyone"


def maps_for(user: Any) -> bool:
    from .admin import is_admin

    who = audience()
    return who == "everyone" or (who == "admins" and is_admin(user))


def map_config() -> dict[str, Any]:
    """What the browser needs to draw a map; `tiles` "" is no map (the app
    then only offers "Open in Maps"). `audience` says who may use it; the
    app shows nothing of the maps to anyone else."""
    tiles = os.getenv("KARPUL_MAP_TILES", DEFAULT_TILES).strip()
    return {
        "audience": audience(),
        "tiles": tiles,
        "attribution": os.getenv("KARPUL_MAP_ATTRIBUTION", DEFAULT_ATTRIBUTION).strip() if tiles else "",
        "max_zoom": 19,
        "search": bool(geocoder_url()),
        "road": bool(router_url()),
    }


class _Cache:
    """A small TTL cache, oldest out first."""

    def __init__(self) -> None:
        self._data: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> tuple[bool, Any]:
        with self._lock:
            hit = self._data.get(key)
            if hit is None or hit[0] < clock.time():
                self._data.pop(key, None)
                return False, None
            self._data.move_to_end(key)
            return True, hit[1]

    def put(self, key: str, value: Any) -> None:
        with self._lock:
            self._data[key] = (clock.time() + CACHE_DAYS * 86400, value)
            self._data.move_to_end(key)
            while len(self._data) > CACHE_ENTRIES:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


cache = _Cache()
_pace = threading.Lock()
_last_call = [0.0]


def fetch_json(url: str) -> Any:
    """GET `url` and parse it, one call a second at most across the process.
    Raises on any failure; the callers turn that into "nothing found"."""
    with _pace:
        wait = _last_call[0] + MIN_INTERVAL_S - clock.monotonic()
        if wait > 0:
            clock.sleep(wait)
        _last_call[0] = clock.monotonic()
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:  # noqa: S310 - the URL is our own setting
        return json.loads(response.read().decode("utf-8"))


def _countries() -> str:
    raw = os.getenv("KARPUL_ALLOWED_COUNTRIES", "") or "RS,DE"
    return ",".join(c.strip().lower() for c in raw.split(",") if c.strip())


def short_name(item: dict[str, Any]) -> str:
    """A Nominatim result as people would say it: the named thing or the
    street and number, then the town ("Pumpa NIS, Novi Sad",
    "Bulevar oslobođenja 12, Novi Sad")."""
    address = item.get("address") or {}
    town = next((address[k] for k in ("city", "town", "village", "municipality", "suburb") if address.get(k)), "")
    road = address.get("road") or address.get("pedestrian") or ""
    if road and address.get("house_number"):
        road = f"{road} {address['house_number']}"
    name = item.get("name") or ""
    first = name or road or (item.get("display_name") or "").split(",")[0].strip()
    parts = [first] + ([town] if town and town != first else [])
    return ", ".join(p for p in parts if p)[:120]


def search(query: str, lang: str = "en", near_point: dict[str, float] | None = None) -> list[dict[str, Any]]:
    """Places matching `query` from the geocoder, at most a handful, nearest
    the commute first (the result order, biased to a box round `near_point`)."""
    base = geocoder_url()
    q = " ".join(query.split())
    if not base or len(q) < 3:
        return []
    key = f"search:{lang}:{fold(q)}:{near_point and (round(near_point['lat'], 1), round(near_point['lng'], 1))}"
    hit, value = cache.get(key)
    if hit:
        return value
    params = {
        "format": "jsonv2",
        "q": q,
        "limit": "6",
        "addressdetails": "1",
        "accept-language": lang,
        "countrycodes": _countries(),
    }
    if near_point is not None:
        lat, lng = near_point["lat"], near_point["lng"]
        params["viewbox"] = f"{lng - 0.6},{lat + 0.4},{lng + 0.6},{lat - 0.4}"
    try:
        items = fetch_json(f"{base}/search?{urllib.parse.urlencode(params)}")
    except Exception:
        log.warning("The place search failed for %r", q, exc_info=True)
        return []
    found = []
    for item in items if isinstance(items, list) else []:
        try:
            found.append({"name": short_name(item), "lat": round(float(item["lat"]), 6), "lng": round(float(item["lon"]), 6), "source": "search"})
        except (KeyError, TypeError, ValueError):
            continue
    cache.put(key, found)
    return found


def reverse(lat: float, lng: float, lang: str = "en") -> str | None:
    """A short name for a pin dropped on the map, or None."""
    base = geocoder_url()
    if not base:
        return None
    key = f"reverse:{lang}:{lat:.5f},{lng:.5f}"
    hit, value = cache.get(key)
    if hit:
        return value
    params = {"format": "jsonv2", "lat": f"{lat:.6f}", "lon": f"{lng:.6f}", "zoom": "18", "addressdetails": "1", "accept-language": lang}
    try:
        item = fetch_json(f"{base}/reverse?{urllib.parse.urlencode(params)}")
        name = short_name(item) if isinstance(item, dict) and not item.get("error") else None
    except Exception:
        log.warning("The pin's address lookup failed", exc_info=True)
        return None
    cache.put(key, name or None)
    return name or None


def road(points: list[dict[str, float]]) -> dict[str, Any] | None:
    """The road through `points` in order from the router: its length, how
    long it takes and the line to draw ([[lat, lng], ...]), or None (no
    router, fewer than two points, or no answer)."""
    base = router_url()
    if not base or len(points) < 2:
        return None
    via = ";".join(f"{p['lng']:.5f},{p['lat']:.5f}" for p in points)
    key = f"road:{via}"
    hit, value = cache.get(key)
    if hit:
        return value
    try:
        data = fetch_json(f"{base}/route/v1/driving/{via}?overview=simplified&geometries=geojson")
        route = data["routes"][0]
        answer = {
            "km": round(route["distance"] / 1000, 1),
            "minutes": round(route["duration"] / 60),
            "line": [[round(lat, 5), round(lng, 5)] for lng, lat in route["geometry"]["coordinates"]],
        }
    except Exception:
        log.warning("The road lookup failed", exc_info=True)
        return None
    cache.put(key, answer)
    return answer
