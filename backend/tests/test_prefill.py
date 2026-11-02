"""A new ride's form starts from the last ride you drove (`User.prefill_rides`)."""

from datetime import date, timedelta

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
LATER = (date.today() + timedelta(days=3)).isoformat()


def ride(**overrides):
    base = {
        "ride_date": TOMORROW,
        "car_type": "own",
        "car_name": "Blue Golf",
        "driver_name": "Ana Petrović",
        "origin": "Novi Sad",
        "destination": "HQ",
        "departure_time": "07:30",
        "return_time": "16:30",
        "seats": 2,
    }
    base.update(overrides)
    return base


ANA = {"X-User-Name": "Ana Petrović"}


def test_nothing_driven_yet_is_null(client):
    res = client.get("/api/rides/last", headers=ANA)
    assert res.status_code == 200
    assert res.json() is None


def test_the_newest_ride_you_drive_comes_back(client):
    client.post("/api/rides", json=ride(), headers=ANA)
    # Added second though it is earlier on the calendar: added last is what counts.
    newest = client.post("/api/rides", json=ride(ride_date=TOMORROW, origin="Zrenjanin", departure_time="06:45"), headers=ANA).json()
    # Someone else's ride, and a seat in it, are not yours to copy.
    other = client.post("/api/rides", json=ride(driver_name="Marko Jovanović", ride_date=LATER), headers={"X-User-Name": "Marko Jovanović"}).json()
    client.post(f"/api/rides/{other['id']}/bookings", json={"passenger_name": "Ana Petrović"}, headers=ANA)
    body = client.get("/api/rides/last", headers=ANA).json()
    assert body["id"] == newest["id"]
    assert body["origin"] == "Zrenjanin"


def test_the_route_is_the_door(client):
    assert client.anon.get("/api/rides/last").status_code == 401


def test_the_preference_is_on_by_default_and_saved_per_account(client):
    me = client.get("/api/auth/me", headers=ANA).json()
    assert me["prefill_rides"] is True
    res = client.patch("/api/auth/me", json={"prefill_rides": False}, headers=ANA)
    assert res.status_code == 200
    assert res.json()["prefill_rides"] is False
    assert client.get("/api/auth/me", headers=ANA).json()["prefill_rides"] is False
    # Another account keeps its own.
    assert client.get("/api/auth/me", headers={"X-User-Name": "Marko Jovanović"}).json()["prefill_rides"] is True
