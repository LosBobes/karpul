"""A shared car's odometer, stretch by stretch: who drove it and how far."""

from datetime import date, timedelta

import pytest

TODAY = date.today()


def shared(car_id, day=TODAY, **overrides):
    base = {
        "ride_date": day.isoformat(),
        "car_type": "corporate",
        "corporate_car_id": car_id,
        "car_name": "",
        "driver_name": "Ana Petrović",
        "origin": "Beograd",
        "destination": "Novi Sad",
        "departure_time": "00:00",
        "return_time": "23:00",
        "seats": 3,
    }
    base.update(overrides)
    return base


@pytest.fixture()
def ride(client):
    car = client.get("/api/cars/corporate").json()[0]
    ride = client.post("/api/rides", json=shared(car["id"])).json()
    ride = client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Marko Marković"}).json()
    return ride


ANA = {"X-User-Name": "Ana Petrović"}
MARKO = {"X-User-Name": "Marko Marković"}


def legs(body):
    return [(leg["driver_name"], leg["start_km"], leg["end_km"]) for leg in body["legs"]]


def test_the_driver_notes_the_start_hands_over_and_the_end(client, ride):
    rid = ride["id"]
    marko = ride["bookings"][0]["id"]
    started = client.post(f"/api/rides/{rid}/legs", json={"km": 12340}, headers=ANA)
    assert started.status_code == 201, started.text
    assert legs(started.json()) == [("Ana Petrović", 12340, None)]
    # Marko takes the wheel at 12 460: Ana's stretch ends there.
    handed = client.post(f"/api/rides/{rid}/legs", json={"km": 12460, "booking_id": marko}, headers=ANA)
    assert legs(handed.json()) == [("Ana Petrović", 12340, 12460), ("Marko Marković", 12460, None)]
    # ...and hands it back to Ana himself, being at the wheel.
    back = client.post(f"/api/rides/{rid}/legs", json={"km": 12500}, headers=MARKO)
    assert back.status_code == 201, back.text
    done = client.post(f"/api/rides/{rid}/legs/end", json={"km": 12580}, headers=ANA)
    assert legs(done.json()) == [
        ("Ana Petrović", 12340, 12460),
        ("Marko Marković", 12460, 12500),
        ("Ana Petrović", 12500, 12580),
    ]
    # Everyone sees it on the board.
    board = client.get("/api/rides", params={"date": TODAY.isoformat()}).json()
    assert legs(board[0]) == legs(done.json())


def test_the_readings_only_go_up_and_hand_over_to_someone_else(client, ride):
    rid = ride["id"]
    client.post(f"/api/rides/{rid}/legs", json={"km": 500}, headers=ANA)
    lower = client.post(f"/api/rides/{rid}/legs/end", json={"km": 499}, headers=ANA)
    assert lower.status_code == 422
    assert lower.json()["detail"] == "The odometer cannot read less than 500 km here"
    same = client.post(f"/api/rides/{rid}/legs", json={"km": 600}, headers=ANA)
    assert same.status_code == 409
    assert same.json()["detail"] == "Ana Petrović is already at the wheel"
    client.post(f"/api/rides/{rid}/legs/end", json={"km": 600}, headers=ANA)
    again = client.post(f"/api/rides/{rid}/legs", json={"km": 700}, headers=ANA)
    assert again.status_code == 409
    assert client.post(f"/api/rides/{rid}/legs/end", json={"km": 700}, headers=ANA).status_code == 409


def test_who_may_note_it(client, ride, admin_auth):
    rid = ride["id"]
    marko = ride["bookings"][0]["id"]
    # A passenger cannot start it, nor can a stranger.
    assert client.post(f"/api/rides/{rid}/legs", json={"km": 1}, headers=MARKO).status_code == 403
    assert client.post(f"/api/rides/{rid}/legs", json={"km": 1}, headers={"X-User-Name": "Vuk Vuković"}).status_code == 403
    # An admin can, for anyone in the car.
    first = client.post(f"/api/rides/{rid}/legs", json={"km": 1, "booking_id": marko}, headers=admin_auth)
    assert first.status_code == 201
    # Marko, at the wheel now, may end it; a stranger may not.
    assert client.post(f"/api/rides/{rid}/legs/end", json={"km": 9}, headers={"X-User-Name": "Vuk Vuković"}).status_code == 403
    assert client.post(f"/api/rides/{rid}/legs/end", json={"km": 9}, headers=MARKO).status_code == 200
    # Only the driver or an admin undoes.
    assert client.delete(f"/api/rides/{rid}/legs/last", headers=MARKO).status_code == 403


def test_undo_steps_back_one_thing_at_a_time(client, ride):
    rid = ride["id"]
    marko = ride["bookings"][0]["id"]
    client.post(f"/api/rides/{rid}/legs", json={"km": 100}, headers=ANA)
    client.post(f"/api/rides/{rid}/legs", json={"km": 150, "booking_id": marko}, headers=ANA)
    client.post(f"/api/rides/{rid}/legs/end", json={"km": 190}, headers=ANA)
    out = client.delete(f"/api/rides/{rid}/legs/last", headers=ANA).json()
    assert legs(out) == [("Ana Petrović", 100, 150), ("Marko Marković", 150, None)]
    out = client.delete(f"/api/rides/{rid}/legs/last", headers=ANA).json()
    assert legs(out) == [("Ana Petrović", 100, None)]
    out = client.delete(f"/api/rides/{rid}/legs/last", headers=ANA).json()
    assert legs(out) == []
    assert client.delete(f"/api/rides/{rid}/legs/last", headers=ANA).status_code == 409


def test_only_a_shared_car_on_its_day_or_after(client):
    car = client.get("/api/cars/corporate").json()[0]
    coming = client.post("/api/rides", json=shared(car["id"], TODAY + timedelta(days=9))).json()
    early = client.post(f"/api/rides/{coming['id']}/legs", json={"km": 1}, headers=ANA)
    assert early.status_code == 409
    assert early.json()["detail"] == "The odometer is noted from the day of the ride"
    own = client.post(
        "/api/rides",
        json=shared(None, car_type="own", car_name="Blue Golf", driver_name="Mila Ilić"),
    ).json()
    refused = client.post(f"/api/rides/{own['id']}/legs", json={"km": 1}, headers={"X-User-Name": "Mila Ilić"})
    assert refused.status_code == 409
    assert refused.json()["detail"] == "Kilometres are only kept for the shared cars"


def test_the_admins_table_carries_it(client, ride, admin_auth):
    rid = ride["id"]
    client.post(f"/api/rides/{rid}/legs", json={"km": 10}, headers=ANA)
    client.post(f"/api/rides/{rid}/legs/end", json={"km": 60}, headers=ANA)
    rows = client.get("/api/admin/rides", params={"from": TODAY.isoformat(), "to": TODAY.isoformat()}, headers=admin_auth).json()
    assert legs(rows[0]) == [("Ana Petrović", 10, 60)]


def test_a_deleted_account_keeps_its_name_on_the_odometer(client, ride, admin_auth):
    rid = ride["id"]
    client.post(f"/api/rides/{rid}/legs", json={"km": 10, "booking_id": ride["bookings"][0]["id"]}, headers=ANA)
    marko_id = client.get("/api/auth/me", headers=MARKO).json()["id"]
    assert client.delete(f"/api/admin/users/{marko_id}", headers=admin_auth).status_code == 204
    leg = client.get("/api/rides", params={"date": TODAY.isoformat()}).json()[0]["legs"][0]
    assert (leg["driver_id"], leg["driver_name"]) == (None, "Marko Marković")
