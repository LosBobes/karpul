"""Places on the map (app/geo.py, routers/places.py): pins on a ride's route,
the places Karpul knows, and the place search, the pin's name and the road
from the outside services (faked here: no test talks to the network)."""

from datetime import date, time, timedelta

import pytest
from sqlmodel import select

from app import geo
from app.models import AdminAction, KnownPlace, Ride, RideRequest
from app.offices import OFFICE_POINTS

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
LIMAN = {"lat": 45.2440, "lng": 19.8420}
FUTOG = {"lat": 45.2390, "lng": 19.7110}
HQ = {"lat": 45.2600, "lng": 19.8300}


def own_ride(**overrides):
    base = {
        "ride_date": TOMORROW,
        "car_type": "own",
        "car_name": "Blue Golf",
        "driver_name": "Ana",
        "origin": "Liman",
        "destination": "HQ",
        "departure_time": "07:30",
        "return_time": "16:30",
        "seats": 3,
    }
    base.update(overrides)
    return base


def as_(name):
    return {"X-User-Name": name}


@pytest.fixture
def sent(monkeypatch):
    out = []

    def fake_notify(session, user_ids, kind, ride=None, *, request=None, **args):
        out.append((kind, sorted(uid for uid in user_ids if uid is not None), args))
        return 0

    for module in ("app.routers.rides", "app.routers.requests"):
        monkeypatch.setattr(f"{module}.notify", fake_notify)
    return out


@pytest.fixture
def outside(monkeypatch):
    """A geocoder and a router that answer from here; the URLs asked are kept."""
    asked: list[str] = []
    answers: dict[str, object] = {}

    def fake_fetch(url):
        asked.append(url)
        for part, answer in answers.items():
            if part in url:
                if isinstance(answer, Exception):
                    raise answer
                return answer
        raise OSError("nothing here")

    monkeypatch.setenv("KARPUL_GEOCODER_URL", "https://geo.test")
    monkeypatch.setattr(geo, "fetch_json", fake_fetch)
    return asked, answers


# --- pins on a ride -----------------------------------------------------------


def test_a_ride_keeps_the_pins_of_its_route(client):
    r = client.post(
        "/api/rides",
        json=own_ride(stops=["Futog"], points={"Liman": LIMAN, " futog ": FUTOG, "Somewhere": HQ}),
    )
    assert r.status_code == 201, r.text
    # By the place's folded name, only for places on the route.
    assert r.json()["points"] == {"liman": LIMAN, "futog": FUTOG}
    # Not every place has to be pinned; HQ is just its words.
    assert "hq" not in r.json()["points"]


def test_a_point_outside_the_area_is_refused(client):
    r = client.post("/api/rides", json=own_ride(points={"Liman": {"lat": 40.7, "lng": -74.0}}))
    assert r.status_code == 422 and "outside the area" in r.text


def test_an_office_is_pinned_for_everyone(client):
    ride = client.post("/api/rides", json=own_ride(origin="Beograd", destination="NS")).json()
    lat, lng = OFFICE_POINTS["beograd"]
    assert ride["points"]["beograd"] == {"lat": lat, "lng": lng}
    lat, lng = OFFICE_POINTS["novi sad"]
    assert ride["points"]["ns"] == {"lat": lat, "lng": lng}


def test_an_office_placed_by_an_admin_is_where_rides_go(client, admin_auth, engine):
    geo.seed_places(engine)
    office = next(p for p in client.get("/api/admin/places", headers=admin_auth).json() if p["key"] == "beograd")
    exact = {"lat": 44.8000, "lng": 20.4700}
    r = client.patch(f"/api/admin/places/{office['id']}", json={"point": exact}, headers=admin_auth)
    assert r.status_code == 200, r.text
    ride = client.post("/api/rides", json=own_ride(origin="Belgrade", destination="Novi Sad")).json()
    assert ride["points"]["belgrade"] == exact


def test_editing_the_route_keeps_and_drops_pins(client, sent):
    ride = client.post("/api/rides", json=own_ride(stops=["Futog"], points={"Liman": LIMAN, "Futog": FUTOG})).json()
    rid = ride["id"]
    client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Bojan"})
    sent.clear()
    # A note changes nothing on the map.
    r = client.patch(f"/api/rides/{rid}", json={"notes": "Blue car"}, headers=as_("Ana"))
    assert r.json()["points"] == {"liman": LIMAN, "futog": FUTOG}
    # A stop taken off takes its pin with it.
    r = client.patch(f"/api/rides/{rid}", json={"stops": []}, headers=as_("Ana"))
    assert r.json()["points"] == {"liman": LIMAN}
    assert not [s for s in sent if s[0] == "ride_changed"]
    # A first pin on a place is not the route moving...
    r = client.patch(f"/api/rides/{rid}", json={"points": {"Liman": LIMAN, "HQ": HQ}}, headers=as_("Ana"))
    assert r.json()["points"] == {"liman": LIMAN, "hq": HQ}
    assert not [s for s in sent if s[0] == "ride_changed"]
    # ...a pin put somewhere else is, and the passengers hear it.
    moved = {"lat": 45.2500, "lng": 19.8500}
    r = client.patch(f"/api/rides/{rid}", json={"points": {"Liman": moved, "HQ": HQ}}, headers=as_("Ana"))
    assert r.json()["points"]["liman"] == moved
    assert [s[0] for s in sent] == ["ride_changed"]


def test_an_admin_moving_a_pin_is_in_the_log(client, admin_auth, engine, session_factory):
    rid = client.post("/api/rides", json=own_ride(points={"Liman": LIMAN})).json()["id"]
    moved = {"lat": 45.2500, "lng": 19.8500}
    r = client.patch(f"/api/rides/{rid}", json={"points": {"Liman": moved}}, headers=admin_auth)
    assert r.status_code == 200, r.text
    with session_factory() as s:
        line = s.exec(select(AdminAction).where(AdminAction.action == "ride_edited")).one()
        assert '["pins", "", "Liman"]' in line.changes


def test_a_passenger_pins_the_new_place_they_get_in_at(client):
    rid = client.post("/api/rides", json=own_ride(points={"Liman": LIMAN})).json()["id"]
    r = client.post(
        f"/api/rides/{rid}/bookings",
        json={"passenger_name": "Bojan", "pickup": "Futog", "new_stop": {"before": True, "point": FUTOG}},
    )
    assert r.status_code == 201, r.text
    assert r.json()["stops_before"] == ["Futog"] and r.json()["points"]["futog"] == FUTOG
    # A place already on the route keeps the pin it has: only whoever runs the
    # ride moves one.
    r = client.post(
        f"/api/rides/{rid}/bookings",
        json={"passenger_name": "Mila", "pickup": "Liman", "new_stop": {"point": HQ}},
    )
    assert r.json()["points"]["liman"] == LIMAN


def test_the_driver_adds_a_pinned_stop(client):
    rid = client.post("/api/rides", json=own_ride()).json()["id"]
    r = client.post(f"/api/rides/{rid}/stops", json={"stop": "Futog", "before": True, "point": FUTOG}, headers=as_("Ana"))
    assert r.status_code == 201, r.text
    assert r.json()["points"] == {"futog": FUTOG}


def test_a_new_place_from_the_waiting_list_comes_with_its_pin(client):
    rid = client.post("/api/rides", json=own_ride(seats=1)).json()["id"]
    first = client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Bojan"}).json()["bookings"][0]
    r = client.post(
        f"/api/rides/{rid}/waitlist",
        json={"pickup": "Futog", "new_stop": {"before": True, "point": FUTOG}},
        headers=as_("Mila"),
    )
    assert r.status_code == 201, r.text
    assert "futog" not in r.json()["points"]
    r = client.delete(f"/api/rides/{rid}/bookings/{first['id']}", headers=as_("Bojan"))
    assert r.json()["stops_before"] == ["Futog"] and r.json()["points"]["futog"] == FUTOG


def test_the_calendar_says_where_to_be(client):
    rid = client.post("/api/rides", json=own_ride(stops=["Futog"], points={"Liman": LIMAN, "Futog": FUTOG})).json()["id"]
    client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Bojan", "pickup": "Futog"})
    driver = client.get(f"/api/rides/{rid}/calendar.ics", headers=as_("Ana")).text
    assert "LOCATION:Liman" in driver and "GEO:45.244000;19.842000" in driver
    passenger = client.get(f"/api/rides/{rid}/calendar.ics", headers=as_("Bojan")).text
    assert "LOCATION:Futog" in passenger and "GEO:45.239000;19.711000" in passenger


# --- shared cars' homes -------------------------------------------------------


def test_a_shared_cars_home_pin_goes_on_its_rides(client, admin_auth):
    home = {"lat": 45.2560, "lng": 19.8440}
    car = client.post(
        "/api/cars/corporate",
        json={"name": "Mazda 6e", "plate": "NS-100-AA", "passenger_seats": 4, "home": "Garaža Spens", "home_point": home},
        headers=admin_auth,
    )
    assert car.status_code == 201, car.text
    assert (car.json()["home_lat"], car.json()["home_lng"]) == (home["lat"], home["lng"])
    ride = client.post(
        "/api/rides",
        json=own_ride(car_type="corporate", corporate_car_id=car.json()["id"], car_name="", origin="Garaža Spens", seats=2),
    ).json()
    assert ride["points"]["garaza spens"] == home
    # Any ride starting there gets it: the car's home is a place everyone knows.
    other = client.post("/api/rides", json=own_ride(origin="garaza spens", driver_name="Vuk", car_name="Red Clio")).json()
    assert other["points"]["garaza spens"] == home
    # Taking the pin away.
    r = client.patch(f"/api/cars/corporate/{car.json()['id']}", json={"home_point": None}, headers=admin_auth)
    assert r.json()["home_lat"] is None


# --- requests -----------------------------------------------------------------


def ask(**overrides):
    base = {"request_date": TOMORROW, "origin": "Futog", "destination": "HQ", "departure_time": "07:30"}
    base.update(overrides)
    return base


def test_a_request_keeps_its_pins_and_finds_drivers_nearby(client, sent):
    # Ana leaves from Liman, which is not Futog by name but is within reach
    # by pin; Vuk leaves from far away.
    near_futog = {"lat": 45.2400, "lng": 19.7200}
    client.post("/api/rides", json=own_ride(origin="Kod pumpe", points={"Kod pumpe": near_futog, "HQ": HQ}))
    client.post("/api/rides", json=own_ride(driver_name="Vuk", car_name="Red Clio", origin="Liman", points={"Liman": LIMAN}))
    r = client.post("/api/requests", json=ask(points={"Futog": FUTOG, "HQ": HQ}), headers=as_("Mila"))
    assert r.status_code == 201, r.text
    assert r.json()["points"] == {"futog": FUTOG, "hq": HQ}
    told = [ids for kind, ids, _ in sent if kind == "request_made"]
    assert len(told) == 1 and len(told[0]) == 1
    listed = client.get("/api/requests", params={"from": TOMORROW, "to": TOMORROW}).json()
    assert listed[0]["points"]["futog"] == FUTOG


# --- the places Karpul knows --------------------------------------------------


def test_places_people_pin_are_suggested(client):
    client.post("/api/rides", json=own_ride(origin="Pumpa na Zemunskoj", points={"Pumpa na Zemunskoj": LIMAN}))
    client.post("/api/rides", json=own_ride(origin="Pumpa NIS", points={"Pumpa NIS": FUTOG}, driver_name="Vuk", car_name="Red Clio"))
    client.post("/api/rides", json=own_ride(origin="pumpa nis", points={"pumpa nis": FUTOG}, driver_name="Pera", car_name="Grey Polo"))
    found = client.get("/api/places", params={"q": "pump"}).json()
    # The more used first; the search is not asked (there is none set up).
    assert [p["name"] for p in found] == ["Pumpa NIS", "Pumpa na Zemunskoj"]
    assert found[0]["source"] == "learned" and found[0]["lat"] == FUTOG["lat"]
    # A word inside the name counts too.
    assert [p["name"] for p in client.get("/api/places", params={"q": "zemun"}).json()] == ["Pumpa na Zemunskoj"]


def test_the_offices_are_suggested_first(client, engine):
    geo.seed_places(engine)
    client.post("/api/rides", json=own_ride(origin="Novi Beograd blok 45", points={"Novi Beograd blok 45": LIMAN}))
    found = client.get("/api/places", params={"q": "beo"}).json()
    assert [p["source"] for p in found][:1] == ["office"]


def test_the_place_search_asks_the_geocoder(client, outside):
    asked, answers = outside
    answers["/search?"] = [
        {"lat": "45.2671", "lon": "19.8335", "name": "Spens", "address": {"city": "Novi Sad"}},
        {"lat": "45.25", "lon": "19.84", "name": "", "address": {"road": "Bulevar oslobođenja", "house_number": "12", "city": "Novi Sad"}},
        {"bad": "row"},
    ]
    found = client.get("/api/places", params={"q": "spens", "lang": "sr", "lat": 45.25, "lng": 19.84}).json()
    assert found == [
        {"name": "Spens, Novi Sad", "lat": 45.2671, "lng": 19.8335, "source": "search"},
        {"name": "Bulevar oslobođenja 12, Novi Sad", "lat": 45.25, "lng": 19.84, "source": "search"},
    ]
    assert "accept-language=sr-Latn" in asked[0] and "countrycodes=rs%2Cde" in asked[0] and "viewbox=" in asked[0]
    # Asked again: the answer is remembered.
    client.get("/api/places", params={"q": "Spens ", "lang": "sr", "lat": 45.25, "lng": 19.84})
    assert len(asked) == 1
    # Short queries never leave the server.
    client.get("/api/places", params={"q": "sp"})
    assert len(asked) == 1


def test_a_failing_geocoder_is_no_suggestions(client, outside):
    _, answers = outside
    answers["/search?"] = OSError("down")
    r = client.get("/api/places", params={"q": "Spens"})
    assert r.status_code == 200 and r.json() == []


def test_place_lookups_are_throttled_per_account(client, outside):
    _, answers = outside
    answers["/search?"] = []
    for i in range(60):
        assert client.get("/api/places", params={"q": f"place {i}"}).status_code == 200
    r = client.get("/api/places", params={"q": "one more"})
    assert r.status_code == 429 and "Retry-After" in r.headers
    # Another person is not slowed down.
    assert client.get("/api/places", params={"q": "one more"}, headers=as_("Vuk")).status_code == 200


def test_a_dropped_pin_gets_a_name(client, outside, engine):
    asked, answers = outside
    answers["/reverse?"] = {"name": "", "address": {"road": "Futoška", "house_number": "3", "city": "Novi Sad"}}
    r = client.get("/api/places/reverse", params={"lat": 45.25, "lng": 19.83})
    assert r.json() == {"name": "Futoška 3, Novi Sad"}
    # Right on a place Karpul knows: that place, without asking anyone.
    geo.seed_places(engine)
    lat, lng = OFFICE_POINTS["novi sad"]
    assert client.get("/api/places/reverse", params={"lat": lat, "lng": lng}).json() == {"name": "Novi Sad"}
    assert len(asked) == 1


def test_the_road_between_pins(client, outside, monkeypatch):
    via = "45.244,19.842;45.26,19.83"
    assert client.get("/api/places/road", params={"via": via}).status_code == 404
    monkeypatch.setenv("KARPUL_ROUTER_URL", "https://road.test")
    _, answers = outside
    answers["/route/v1/driving/"] = {
        "routes": [{"distance": 4321.0, "duration": 600.0, "geometry": {"coordinates": [[19.842, 45.244], [19.83, 45.26]]}}]
    }
    r = client.get("/api/places/road", params={"via": via})
    assert r.status_code == 200, r.text
    assert r.json() == {"km": 4.3, "minutes": 10, "line": [[45.244, 19.842], [45.26, 19.83]]}
    assert client.get("/api/places/road", params={"via": "45.2,19.8"}).status_code == 422
    assert client.get("/api/places/road", params={"via": "here;there"}).status_code == 422


def test_the_map_config_is_open(client, monkeypatch):
    config = client.anon.get("/api/map/config").json()
    assert config["tiles"].startswith("https://tile.openstreetmap.org/") and config["search"] is False
    monkeypatch.setenv("KARPUL_MAP_TILES", "")
    assert client.anon.get("/api/map/config").json()["tiles"] == ""
    # Everything else needs a session.
    assert client.anon.get("/api/places", params={"q": "x"}).status_code == 401


def test_admins_keep_the_known_places(client, admin_auth, engine, session_factory):
    geo.seed_places(engine)
    client.post("/api/rides", json=own_ride(origin="Pumpa", points={"Pumpa": LIMAN}))
    assert client.get("/api/admin/places", headers=as_("Ana")).status_code == 403
    places = client.get("/api/admin/places", headers=admin_auth).json()
    assert [p["kind"] for p in places] == ["office", "office", "learned"]
    pumpa = places[-1]
    r = client.patch(f"/api/admin/places/{pumpa['id']}", json={"name": "Pumpa NIS Liman"}, headers=admin_auth)
    assert r.json()["key"] == "pumpa nis liman"
    office = places[0]
    r = client.patch(f"/api/admin/places/{pumpa['id']}", json={"name": office["name"]}, headers=admin_auth)
    assert r.status_code == 409
    assert client.delete(f"/api/admin/places/{pumpa['id']}", headers=admin_auth).status_code == 204
    assert client.delete(f"/api/admin/places/{pumpa['id']}", headers=admin_auth).status_code == 404
    with session_factory() as s:
        actions = [a.action for a in s.exec(select(AdminAction))]
    assert actions == ["place_moved", "place_removed"]


def test_seeding_on_start_pins_old_rides_and_is_safe_to_repeat(engine, session_factory):
    with session_factory() as s:
        s.add(Ride(ride_date=date.today(), car_type="own", car_name="Golf", driver_name="Ana", origin="Beograd",
                   destination="Liman", departure_time=time(7), seats=2))
        s.add(RideRequest(request_date=date.today(), user_id=1, name="Mila", origin="Liman", destination="NS",
                          departure_time=time(7)))
        s.commit()
    assert geo.seed_places(engine) == 4
    assert geo.seed_places(engine) == 0
    with session_factory() as s:
        ride = s.exec(select(Ride)).one()
        assert list(geo.load(ride.points)) == ["beograd"]
        assert list(geo.load(s.exec(select(RideRequest)).one().points)) == ["ns"]
        assert len(s.exec(select(KnownPlace)).all()) == 2


def test_unreadable_points_are_no_points():
    assert geo.load("not json") == {} and geo.load('["x"]') == {} and geo.load('{"a": {"lat": "x"}}') == {}


def test_distances():
    assert geo.km_between(OFFICE_POINTS_DICT["beograd"], OFFICE_POINTS_DICT["novi sad"]) == pytest.approx(72, abs=3)
    assert geo.near(LIMAN, {"lat": 45.2500, "lng": 19.8420})
    assert not geo.near(LIMAN, FUTOG) and not geo.near(None, LIMAN)


OFFICE_POINTS_DICT = {k: {"lat": lat, "lng": lng} for k, (lat, lng) in OFFICE_POINTS.items()}


def test_the_maps_are_for_admins_while_they_are_tried_out(client, admin_auth, monkeypatch):
    monkeypatch.delenv("KARPUL_MAPS")
    assert client.anon.get("/api/map/config").json()["audience"] == "admins"
    # A plain account is refused the lookups; an admin is not.
    r = client.get("/api/places", params={"q": "Beo"}, headers=as_("Ana"))
    assert r.status_code == 403 and "not switched on" in r.text
    assert client.get("/api/places/reverse", params={"lat": 45.25, "lng": 19.84}, headers=as_("Ana")).status_code == 403
    assert client.get("/api/places", params={"q": "Beo"}, headers=admin_auth).status_code == 200
    # The pins are kept all the same, so turning the maps on shows them at once,
    # but a plain account's calendar does not carry them yet.
    rid = client.post("/api/rides", json=own_ride(points={"Liman": LIMAN})).json()["id"]
    assert client.get(f"/api/rides/{rid}", headers=as_("Ana")).json()["points"] == {"liman": LIMAN}
    assert "GEO:" not in client.get(f"/api/rides/{rid}/calendar.ics", headers=as_("Ana")).text
    assert "GEO:" in client.get(f"/api/rides/{rid}/calendar.ics", headers=admin_auth).text
    monkeypatch.setenv("KARPUL_MAPS", "off")
    assert client.get("/api/places", params={"q": "Beo"}, headers=admin_auth).status_code == 403
    monkeypatch.setenv("KARPUL_MAPS", "everyone")
    assert client.get("/api/places", params={"q": "Beo"}, headers=as_("Ana")).status_code == 200


def test_moving_an_office_moves_its_coming_rides(client, admin_auth, engine, session_factory):
    geo.seed_places(engine)
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    old = {"lat": OFFICE_POINTS["beograd"][0], "lng": OFFICE_POINTS["beograd"][1]}
    coming = client.post("/api/rides", json=own_ride(origin="Beograd", destination="NS")).json()
    # One rider dropped a pin of their own for the office: it stays theirs.
    own_pin = {"lat": 44.8200, "lng": 20.4100}
    custom = client.post(
        "/api/rides", json=own_ride(origin="Belgrade", destination="NS", points={"Belgrade": own_pin}, driver_name="Vuk", car_name="Red Clio")
    ).json()
    asked = client.post("/api/requests", json=ask(origin="BG", destination="HQ"), headers=as_("Mila")).json()
    with session_factory() as s:
        # A ride already driven keeps the pin it was driven with.
        s.add(Ride(ride_date=date.fromisoformat(yesterday), car_type="own", car_name="Golf", driver_name="Ana",
                   origin="Beograd", destination="HQ", departure_time=time(7), seats=2,
                   points=geo.dump({"beograd": old})))
        s.commit()
    office = next(p for p in client.get("/api/admin/places", headers=admin_auth).json() if p["key"] == "beograd")
    exact = {"lat": 44.8000, "lng": 20.4700}
    assert client.patch(f"/api/admin/places/{office['id']}", json={"point": exact}, headers=admin_auth).status_code == 200

    assert client.get(f"/api/rides/{coming['id']}").json()["points"]["beograd"] == exact
    assert client.get(f"/api/rides/{custom['id']}").json()["points"]["belgrade"] == own_pin
    listed = client.get("/api/requests", params={"from": TOMORROW, "to": TOMORROW}).json()
    assert next(r for r in listed if r["id"] == asked["id"])["points"]["bg"] == exact
    with session_factory() as s:
        past = s.exec(select(Ride).where(Ride.ride_date == date.fromisoformat(yesterday))).one()
        assert geo.load(past.points)["beograd"] == old
        line = s.exec(select(AdminAction).where(AdminAction.action == "place_moved")).one()
        assert '["rides", "", "1"]' in line.changes

    # Moved again, from the admin's spot this time: the coming ride follows.
    again = {"lat": 44.8010, "lng": 20.4710}
    client.patch(f"/api/admin/places/{office['id']}", json={"point": again}, headers=admin_auth)
    assert client.get(f"/api/rides/{coming['id']}").json()["points"]["beograd"] == again


def test_moving_a_cars_home_moves_its_coming_rides(client, admin_auth):
    home = {"lat": 45.2560, "lng": 19.8440}
    car = client.post(
        "/api/cars/corporate",
        json={"name": "Mazda 6e", "plate": "NS-200-AA", "passenger_seats": 4, "home": "Garaža Spens", "home_point": home},
        headers=admin_auth,
    ).json()
    ride = client.post(
        "/api/rides", json=own_ride(car_type="corporate", corporate_car_id=car["id"], car_name="", origin="Garaža Spens", seats=2)
    ).json()
    assert ride["points"]["garaza spens"] == home
    moved = {"lat": 45.2570, "lng": 19.8450}
    r = client.patch(f"/api/cars/corporate/{car['id']}", json={"home_point": moved}, headers=admin_auth)
    assert r.status_code == 200, r.text
    assert client.get(f"/api/rides/{ride['id']}").json()["points"]["garaza spens"] == moved


def test_rides_pinned_before_an_office_was_placed_catch_up_on_start(client, engine, session_factory):
    geo.seed_places(engine)
    ride = client.post("/api/rides", json=own_ride(origin="Beograd", destination="NS")).json()
    exact = {"lat": 44.8000, "lng": 20.4700}
    with session_factory() as s:
        # Placed without the rides following (as before this existed).
        office = s.exec(select(KnownPlace).where(KnownPlace.key == "beograd")).one()
        office.lat, office.lng = exact["lat"], exact["lng"]
        s.add(office)
        s.commit()
    assert geo.seed_places(engine) == 1
    assert client.get(f"/api/rides/{ride['id']}").json()["points"]["beograd"] == exact
    assert geo.seed_places(engine) == 0
