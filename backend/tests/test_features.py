"""Recurring rides, pickup stops, chip-in and distance, stats, history and the
admin usage report."""

from datetime import date, timedelta

import pytest

TOMORROW = date.today() + timedelta(days=1)
PASSWORD = "let-me-in"
AUTH = {"X-Admin-Password": PASSWORD}


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    monkeypatch.delenv("KARPUL_ADMIN_PASSWORD", raising=False)
    monkeypatch.delenv("KARPUL_VAPID_PRIVATE_KEY", raising=False)


def own_ride(**overrides):
    base = {
        "ride_date": TOMORROW.isoformat(),
        "car_type": "own",
        "car_name": "Blue Golf",
        "driver_name": "Ana",
        "origin": "Novi Sad",
        "destination": "HQ",
        "departure_time": "07:30",
        "return_time": "16:30",
        "seats": 2,
    }
    base.update(overrides)
    return base


# --- Repeat weekly -----------------------------------------------------------


def test_repeat_weekly_creates_one_ride_per_week_in_a_series(client):
    until = TOMORROW + timedelta(days=21)
    r = client.post("/api/rides", json=own_ride(repeat_until=until.isoformat()))
    assert r.status_code == 201, r.text
    first = r.json()
    assert first["ride_date"] == TOMORROW.isoformat()
    assert first["series_id"]

    rides = client.get("/api/rides", params={"from": TOMORROW.isoformat(), "to": until.isoformat()}).json()
    assert [x["ride_date"] for x in rides] == [(TOMORROW + timedelta(days=7 * i)).isoformat() for i in range(4)]
    assert {x["series_id"] for x in rides} == {first["series_id"]}


def test_single_ride_has_no_series(client):
    r = client.post("/api/rides", json=own_ride())
    assert r.json()["series_id"] is None
    # repeat_until on the same day is just the one ride, no series either.
    r = client.post("/api/rides", json=own_ride(driver_name="Bojan", repeat_until=TOMORROW.isoformat()))
    assert r.status_code == 201 and r.json()["series_id"] is None


def test_repeat_is_bounded(client):
    too_far = TOMORROW + timedelta(weeks=27)
    assert client.post("/api/rides", json=own_ride(repeat_until=too_far.isoformat())).status_code == 422
    before = TOMORROW - timedelta(days=1)
    assert client.post("/api/rides", json=own_ride(repeat_until=before.isoformat())).status_code == 422


def test_repeat_with_a_company_car_is_all_or_nothing(client):
    car = client.get("/api/cars/corporate").json()[0]
    clash_day = TOMORROW + timedelta(days=14)
    taken = own_ride(car_type="corporate", corporate_car_id=car["id"], car_name="", driver_name="Mila", ride_date=clash_day.isoformat())
    assert client.post("/api/rides", json=taken).status_code == 201

    series = own_ride(car_type="corporate", corporate_car_id=car["id"], car_name="", repeat_until=(TOMORROW + timedelta(days=21)).isoformat())
    r = client.post("/api/rides", json=series)
    assert r.status_code == 409
    assert clash_day.isoformat() in r.json()["detail"]
    # Nothing of the series was written.
    rides = client.get("/api/rides", params={"from": TOMORROW.isoformat(), "to": (TOMORROW + timedelta(days=21)).isoformat()}).json()
    assert [x["driver_name"] for x in rides] == ["Mila"]


def test_delete_following_removes_the_rest_of_the_series(client):
    until = TOMORROW + timedelta(days=28)
    client.post("/api/rides", json=own_ride(repeat_until=until.isoformat()))
    # An unrelated ride by the same driver must survive.
    other = client.post("/api/rides", json=own_ride(ride_date=(TOMORROW + timedelta(days=15)).isoformat())).json()
    rides = client.get("/api/rides", params={"from": TOMORROW.isoformat(), "to": until.isoformat()}).json()
    series = [x for x in rides if x["series_id"]]
    assert len(series) == 5

    second = series[1]
    r = client.delete(f"/api/rides/{second['id']}", params={"scope": "following"}, headers={"X-User-Name": "ana"})
    assert r.status_code == 204
    left = client.get("/api/rides", params={"from": TOMORROW.isoformat(), "to": until.isoformat()}).json()
    assert sorted(x["id"] for x in left) == sorted([series[0]["id"], other["id"]])


def test_delete_one_leaves_the_series_alone(client):
    until = TOMORROW + timedelta(days=14)
    first = client.post("/api/rides", json=own_ride(repeat_until=until.isoformat())).json()
    assert client.delete(f"/api/rides/{first['id']}", headers={"X-User-Name": "Ana"}).status_code == 204
    left = client.get("/api/rides", params={"from": TOMORROW.isoformat(), "to": until.isoformat()}).json()
    assert len(left) == 2


# --- Stops and pickups ---------------------------------------------------------


def test_stops_are_cleaned_and_capped(client):
    r = client.post("/api/rides", json=own_ride(stops=["  Liman  ", "liman", "", "Novi sad", "Detelinara"]))
    assert r.status_code == 201, r.text
    # Duplicates, blanks and the origin itself are dropped.
    assert r.json()["stops"] == ["Liman", "Detelinara"]
    assert client.post("/api/rides", json=own_ride(stops=["a", "b", "c", "d"])).status_code == 422


def test_join_with_a_pickup_point(client):
    ride = client.post("/api/rides", json=own_ride(stops=["Liman", "Detelinara"], seats=3)).json()
    rid = ride["id"]
    r = client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Bojan", "pickup": "liman"})
    assert r.status_code == 201, r.text
    assert r.json()["bookings"][0]["pickup"] == "Liman"
    # The origin, spelled any way, is the empty pickup.
    r = client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Mila", "pickup": "NOVI SAD"})
    assert r.json()["bookings"][1]["pickup"] == ""
    # Somewhere the driver does not stop is refused.
    r = client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Vuk", "pickup": "Airport"})
    assert r.status_code == 422
    assert "Pickup must be" in r.json()["detail"]


def test_passenger_moves_between_pickups(client):
    ride = client.post("/api/rides", json=own_ride(stops=["Liman"])).json()
    rid = ride["id"]
    bid = client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Bojan"}).json()["bookings"][0]["id"]
    r = client.patch(f"/api/rides/{rid}/bookings/{bid}", json={"pickup": "Liman"}, headers={"X-User-Name": "Bojan"})
    assert r.status_code == 200 and r.json()["bookings"][0]["pickup"] == "Liman"
    # Someone else may not.
    r = client.patch(f"/api/rides/{rid}/bookings/{bid}", json={"pickup": ""}, headers={"X-User-Name": "Mila"})
    assert r.status_code == 403
    # The driver may.
    r = client.patch(f"/api/rides/{rid}/bookings/{bid}", json={"pickup": ""}, headers={"X-User-Name": "Ana"})
    assert r.status_code == 200 and r.json()["bookings"][0]["pickup"] == ""


def test_removing_a_stop_moves_its_passengers_back_to_the_origin(client):
    ride = client.post("/api/rides", json=own_ride(stops=["Liman"])).json()
    rid = ride["id"]
    client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Bojan", "pickup": "Liman"})
    r = client.patch(f"/api/rides/{rid}", json={"stops": []}, headers={"X-User-Name": "Ana"})
    assert r.status_code == 200, r.text
    assert r.json()["stops"] == [] and r.json()["bookings"][0]["pickup"] == ""


# --- Chip-in and distance -------------------------------------------------------


def test_chip_in_and_distance_round_trip_and_survive_a_patch(client):
    r = client.post("/api/rides", json=own_ride(chip_in="  300 din ", distance_km=82.5))
    assert r.status_code == 201, r.text
    assert r.json()["chip_in"] == "300 din" and r.json()["distance_km"] == 82.5
    rid = r.json()["id"]
    r = client.patch(f"/api/rides/{rid}", json={"notes": "bring a coat"}, headers={"X-User-Name": "Ana"})
    assert r.json()["chip_in"] == "300 din" and r.json()["distance_km"] == 82.5
    assert client.post("/api/rides", json=own_ride(distance_km=-1)).status_code == 422
    assert client.post("/api/rides", json=own_ride(chip_in="x" * 41)).status_code == 422


# --- Stats, history and calendar -------------------------------------------------


def test_my_stats_count_rides_driven_and_ridden(client):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    driven = client.post("/api/rides", json=own_ride(ride_date=yesterday, distance_km=40)).json()
    client.post(f"/api/rides/{driven['id']}/bookings", json={"passenger_name": "Bojan"})
    ridden = client.post("/api/rides", json=own_ride(ride_date=yesterday, driver_name="Mila", distance_km=10)).json()
    client.post(f"/api/rides/{ridden['id']}/bookings", json={"passenger_name": "ana"})
    # Tomorrow's ride is not history yet.
    client.post("/api/rides", json=own_ride(distance_km=99))

    r = client.get("/api/stats/me", params={"name": "Ana"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["all"] == {"rides_driven": 1, "rides_ridden": 1, "people_carried": 1, "km_shared": 50.0}
    assert [h["role"] for h in body["history"]] == ["passenger", "driver"] or [h["role"] for h in body["history"]] == ["driver", "passenger"]
    assert {h["id"] for h in body["history"]} == {driven["id"], ridden["id"]}
    assert client.get("/api/stats/me", params={"name": " "}).status_code == 422


def test_ride_and_person_calendars(client):
    ride = client.post("/api/rides", json=own_ride(stops=["Liman"], notes="Meet at the fountain")).json()
    client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Bojan"})

    r = client.get(f"/api/rides/{ride['id']}/calendar.ics")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/calendar")
    text = r.text
    assert f"UID:karpul-ride-{ride['id']}@karpul" in text
    assert f"DTSTART:{TOMORROW:%Y%m%d}T073000" in text
    assert f"DTEND:{TOMORROW:%Y%m%d}T163000" in text
    assert "SUMMARY:Karpul: Novi Sad to HQ (Ana)" in text
    assert "Passengers: Bojan" in text.replace("\r\n ", "")
    assert client.get("/api/rides/9999/calendar.ics").status_code == 404

    feed = client.get("/api/calendar/bojan.ics")
    assert feed.status_code == 200 and "BEGIN:VEVENT" in feed.text
    assert "X-WR-CALNAME:Karpul: bojan" in feed.text
    nobody = client.get("/api/calendar/Zed.ics")
    assert nobody.status_code == 200 and "BEGIN:VEVENT" not in nobody.text


def test_one_way_ride_gets_an_hour_long_event(client):
    ride = client.post("/api/rides", json=own_ride(return_time=None)).json()
    text = client.get(f"/api/rides/{ride['id']}/calendar.ics").text
    assert f"DTEND:{TOMORROW:%Y%m%d}T083000" in text


# --- Admin usage report --------------------------------------------------------


def test_usage_report_is_admin_only(client, monkeypatch):
    assert client.get("/api/cars/corporate/usage").status_code == 503
    monkeypatch.setenv("KARPUL_ADMIN_PASSWORD", PASSWORD)
    assert client.get("/api/cars/corporate/usage").status_code == 401
    assert client.get("/api/cars/corporate/usage", headers=AUTH).status_code == 200


def test_usage_report_counts_per_car(client, monkeypatch):
    monkeypatch.setenv("KARPUL_ADMIN_PASSWORD", PASSWORD)
    cars = client.get("/api/cars/corporate").json()
    a, b = cars[0], cars[1]
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    long_ago = (date.today() - timedelta(days=200)).isoformat()

    r1 = client.post("/api/rides", json=own_ride(ride_date=yesterday, car_type="corporate", corporate_car_id=a["id"], car_name="", distance_km=30)).json()
    client.post(f"/api/rides/{r1['id']}/bookings", json={"passenger_name": "Bojan"})
    client.post("/api/rides", json=own_ride(ride_date=yesterday, car_type="corporate", corporate_car_id=a["id"], car_name="", driver_name="Mila", departure_time="18:00", return_time="20:00", distance_km=12))
    client.post("/api/rides", json=own_ride(ride_date=long_ago, car_type="corporate", corporate_car_id=b["id"], car_name=""))
    # Tomorrow's is "upcoming", not usage.
    client.post("/api/rides", json=own_ride(car_type="corporate", corporate_car_id=b["id"], car_name=""))
    # An own car never counts.
    client.post("/api/rides", json=own_ride(ride_date=yesterday, driver_name="Vuk"))

    body = client.get("/api/cars/corporate/usage", params={"days": 90}, headers=AUTH).json()
    rows = {row["car"]["id"]: row for row in body["cars"]}
    assert rows[a["id"]]["rides"] == 2
    assert rows[a["id"]]["days_used"] == 1
    assert rows[a["id"]]["drivers"] == 2
    assert rows[a["id"]]["passengers"] == 1
    assert rows[a["id"]]["km"] == 42.0
    assert rows[a["id"]]["last_used"] == yesterday
    assert rows[a["id"]]["upcoming"] == 0
    assert rows[b["id"]]["rides"] == 0 and rows[b["id"]]["upcoming"] == 1 and rows[b["id"]]["last_used"] is None
    assert body["totals"]["rides"] == 2 and body["totals"]["passengers"] == 1
    assert [h["car_id"] for h in body["history"]] == [a["id"], a["id"]]
    assert 0 < rows[a["id"]]["use_rate"] <= 1

    wide = client.get("/api/cars/corporate/usage", params={"days": 365}, headers=AUTH).json()
    assert {row["car"]["id"]: row["rides"] for row in wide["cars"]}[b["id"]] == 1
    assert client.get("/api/cars/corporate/usage", params={"days": 1}, headers=AUTH).status_code == 422


# --- Names with Serbian letters in the header -------------------------------------


def test_user_name_header_may_be_percent_encoded(client):
    from urllib.parse import quote

    ride = client.post("/api/rides", json=own_ride(driver_name="Ana Petrović")).json()
    encoded = quote("ana petrović")
    r = client.patch(f"/api/rides/{ride['id']}", json={"notes": "ok"}, headers={"X-User-Name": encoded})
    assert r.status_code == 200, r.text
    # A plain ASCII name still works as it always did.
    assert client.patch(f"/api/rides/{ride['id']}", json={"notes": "no"}, headers={"X-User-Name": "Ana P"}).status_code == 403
    assert client.delete(f"/api/rides/{ride['id']}", headers={"X-User-Name": encoded}).status_code == 204
