"""When a shared car is taken, for the ride form's calendar (GET /api/cars/corporate/{id}/busy)."""

from datetime import date, timedelta

MONDAY = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 + 7)


def shared(car_id, day=MONDAY, driver="Ana Petrović", **overrides):
    base = {
        "ride_date": day.isoformat(),
        "car_type": "corporate",
        "corporate_car_id": car_id,
        "car_name": "",
        "driver_name": driver,
        "origin": "Novi Sad",
        "destination": "HQ",
        "departure_time": "08:00",
        "return_time": "12:00",
        "seats": 2,
    }
    base.update(overrides)
    return base


def busy(client, car_id, **params):
    query = {"from": MONDAY.isoformat(), "to": (MONDAY + timedelta(days=41)).isoformat(), **params}
    return client.get(f"/api/cars/corporate/{car_id}/busy", params=query)


def test_the_rides_that_hold_a_car_and_not_the_pending_ones(client):
    car, other = client.get("/api/cars/corporate").json()[:2]
    held = client.post("/api/rides", json=shared(car["id"])).json()
    client.post("/api/rides", json=shared(other["id"], MONDAY + timedelta(days=1), driver="Marko Jović"))
    # Past the share and asked for approval: it holds nothing yet.
    asked = shared(car["id"], MONDAY + timedelta(days=2), departure_time="14:00", return_time="16:00", request_approval=True)
    assert client.post("/api/rides", json=asked).json()["approval"] == "pending"

    got = busy(client, car["id"])
    assert got.status_code == 200, got.text
    assert got.json() == [
        {"ride_id": held["id"], "ride_date": MONDAY.isoformat(), "departure_time": "08:00:00", "return_time": "12:00:00", "driver_name": "Ana Petrović", "out_of_service": False}
    ]
    # The ride being edited never clashes with itself.
    assert busy(client, car["id"], exclude=held["id"]).json() == []


def test_signed_in_a_known_car_and_a_short_range(client):
    car = client.get("/api/cars/corporate").json()[0]
    assert client.anon.get(f"/api/cars/corporate/{car['id']}/busy?from=2026-01-01&to=2026-01-31").status_code == 401
    assert busy(client, 99999).status_code == 404
    assert busy(client, car["id"], to=(MONDAY + timedelta(days=93)).isoformat()).status_code == 422
