"""`/api/places`: finding places on the map (app/geo.py).

Typing a place asks `GET /api/places?q=` for suggestions: the places Karpul
knows first (the offices, the shared cars' homes, the places colleagues
pinned before), then what the geocoder finds. A pin dropped on the map asks
`/reverse` for a name to go with it, and a route's pins ask `/road` for the
road between them when a router is configured. All of it is read-only on our
side: the outside answers are cached in memory, never written to the
database from a read route. `GET /api/map/config` (open, like the push
config) tells the browser where its map tiles come from.

Admins keep the known places tidy at `/api/admin/places`: an office put
where it really is, a learned place renamed or forgotten.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from .. import audit, geo, ratelimit
from ..admin import require_admin
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..models import KnownPlace
from ..schemas import KnownPlaceRead, KnownPlaceUpdate, MapConfigRead, PlaceRead, ReverseRead, RoadRead

router = APIRouter(tags=["places"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]

Lang = Literal["en", "sr"]
# What the geocoder is asked to name things in: Serbian in the Latin script.
GEOCODER_LANG = {"en": "en", "sr": "sr-Latn,sr,en"}
# Pins on one road: a ride's whole route at most.
MAX_VIA = 10
# A found place this close to a known one is that place.
SAME_PLACE_KM = 0.05


def _lookup_allowed(user_id: int | None) -> None:
    key = f"user:{user_id}"
    ratelimit.place_lookups.check(key)
    ratelimit.place_lookups.hit(key)


@router.get("/api/map/config", response_model=MapConfigRead)
def map_config():
    return geo.map_config()


@router.get("/api/places", response_model=list[PlaceRead])
def find_places(
    session: SessionDep,
    creds: CredsDep,
    q: str = Query(min_length=1, max_length=120),
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    lang: Lang = "en",
):
    """Places for what was typed, the known ones first, at most a handful.
    `lat`/`lng` (another place of the route, say) bias the search towards it."""
    user = require_user(session, creds)
    found = geo.suggestions(session, q)
    if len(found) < geo.MAX_SUGGESTIONS and len(q.strip()) >= 3 and geo.geocoder_url():
        _lookup_allowed(user.id)
        near = {"lat": lat, "lng": lng} if lat is not None and lng is not None else None
        for item in geo.search(q, GEOCODER_LANG[lang], near):
            same = any(
                geo.fold(item["name"]) == geo.fold(k["name"]) or geo.near(item, k, SAME_PLACE_KM) for k in found
            )
            if not same:
                found.append(item)
    return found[: geo.MAX_SUGGESTIONS]


@router.get("/api/places/reverse", response_model=ReverseRead)
def name_point(
    session: SessionDep,
    creds: CredsDep,
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    lang: Lang = "en",
):
    """A name for a pin dropped on the map: a known place right there, else
    what the geocoder calls the spot."""
    user = require_user(session, creds)
    point = {"lat": lat, "lng": lng}
    for place in session.exec(select(KnownPlace)):
        if geo.near(point, {"lat": place.lat, "lng": place.lng}, SAME_PLACE_KM):
            return {"name": place.name}
    if not geo.geocoder_url():
        return {"name": None}
    _lookup_allowed(user.id)
    return {"name": geo.reverse(lat, lng, GEOCODER_LANG[lang])}


def _via(text: str) -> list[dict[str, float]]:
    points = []
    for pair in text.split(";"):
        try:
            lat, lng = (float(x) for x in pair.split(","))
        except ValueError:
            raise HTTPException(422, "`via` is lat,lng pairs separated by semicolons") from None
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise HTTPException(422, "`via` is lat,lng pairs separated by semicolons")
        points.append({"lat": lat, "lng": lng})
    if not 2 <= len(points) <= MAX_VIA:
        raise HTTPException(422, f"A road needs 2 to {MAX_VIA} points")
    return points


@router.get("/api/places/road", response_model=RoadRead)
def find_road(session: SessionDep, creds: CredsDep, via: str = Query(min_length=3, max_length=400)):
    """The road through `via` (`lat,lng;lat,lng;...`, in order): its length,
    how long it takes, and the line to draw. 404 when there is no router or
    it found nothing; the app then draws straight lines."""
    user = require_user(session, creds)
    points = _via(via)
    if not geo.router_url():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No road finder is set up")
    _lookup_allowed(user.id)
    found = geo.road(points)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No road found between these points")
    return found


# --- admins -------------------------------------------------------------------


@router.get("/api/admin/places", response_model=list[KnownPlaceRead])
def list_known_places(session: SessionDep, creds: CredsDep):
    """Every known place: the offices, the car homes, then the learned ones,
    most used first."""
    require_admin(session, creds)
    rank = {"office": 0, "car_home": 1, "learned": 2}
    places = list(session.exec(select(KnownPlace)))
    places.sort(key=lambda p: (rank.get(p.kind, 3), -p.uses, p.name.casefold()))
    return places


def _place_or_404(session: Session, place_id: int) -> KnownPlace:
    place = session.get(KnownPlace, place_id)
    if place is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Place not found")
    return place


@router.patch("/api/admin/places/{place_id}", response_model=KnownPlaceRead)
def update_known_place(place_id: int, payload: KnownPlaceUpdate, session: WriteSessionDep, creds: CredsDep):
    """Put a known place where it really is, or rename it. Moving an office
    changes where the rides to it are pinned from now on; the rides already
    on the board keep the pin they were made with."""
    admin = require_admin(session, creds)
    place = _place_or_404(session, place_id)
    changes = []
    if payload.name is not None and payload.name != place.name:
        changes.append(("name", place.name, payload.name))
        place.name = payload.name
        if place.kind == "learned":
            key = geo.fold(payload.name)
            other = session.exec(select(KnownPlace).where(KnownPlace.key == key, KnownPlace.id != place.id)).first()
            if other is not None:
                raise HTTPException(status.HTTP_409_CONFLICT, f"{other.name} is already a known place")
            place.key = key
    if payload.point is not None and (payload.point.lat, payload.point.lng) != (place.lat, place.lng):
        changes.append(("pin", None, place.name))
        place.lat, place.lng = payload.point.lat, payload.point.lng
    if changes:
        audit.record(session, admin, "place_moved", place.name, changes=changes)
    session.add(place)
    session.commit()
    session.refresh(place)
    return place


@router.delete("/api/admin/places/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_known_place(place_id: int, session: WriteSessionDep, creds: CredsDep):
    """Forget a known place: it is no longer suggested. The rides pinned with
    it keep their pins. An office forgotten goes back to its city centre."""
    admin = require_admin(session, creds)
    place = _place_or_404(session, place_id)
    audit.record(session, admin, "place_removed", place.name)
    session.delete(place)
    session.commit()
