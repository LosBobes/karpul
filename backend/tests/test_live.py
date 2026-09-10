"""Live board: every mutation is pushed to the clients on `/api/ws`."""

from datetime import date, timedelta

import pytest

from app.events import hub

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
PASSWORD = "let-me-in"
AUTH = {"X-Admin-Password": PASSWORD}


def own_ride(**overrides):
    base = {
        "ride_date": TOMORROW,
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


def test_socket_greets_and_tracks_connections(client):
    assert hub.connections == 0
    with client.websocket_connect("/api/ws") as ws:
        assert ws.receive_json() == {"type": "hello"}
        assert hub.connections == 1
        # Anything the client says is ignored, not treated as a protocol error.
        ws.send_text("ping")
    assert hub.connections == 0


def test_ride_lifecycle_is_broadcast(client):
    with client.websocket_connect("/api/ws") as ws:
        ws.receive_json()  # hello

        ride = client.post("/api/rides", json=own_ride()).json()
        ev = ws.receive_json()
        assert ev["type"] == "ride.created"
        # The socket payload is the REST payload, so the client can use it as-is.
        assert ev["ride"] == ride

        client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Marko"})
        ev = ws.receive_json()
        assert ev["type"] == "ride.updated"
        assert ev["ride"]["free_seats"] == 1
        booking_id = ev["ride"]["bookings"][0]["id"]

        client.delete(f"/api/rides/{ride['id']}/bookings/{booking_id}", headers={"X-User-Name": "Marko"})
        ev = ws.receive_json()
        assert (ev["type"], ev["ride"]["free_seats"]) == ("ride.updated", 2)

        client.patch(f"/api/rides/{ride['id']}", json={"seats": 3}, headers={"X-User-Name": "Ana"})
        ev = ws.receive_json()
        assert (ev["type"], ev["ride"]["seats"]) == ("ride.updated", 3)

        client.delete(f"/api/rides/{ride['id']}", headers={"X-User-Name": "Ana"})
        assert ws.receive_json() == {"type": "ride.deleted", "ride_id": ride["id"], "ride_date": TOMORROW}


def test_rejected_mutations_are_silent(client):
    with client.websocket_connect("/api/ws") as ws:
        ws.receive_json()  # hello
        assert client.post("/api/rides", json=own_ride(return_time="07:00")).status_code == 422
        ride = client.post("/api/rides", json=own_ride(seats=1)).json()
        assert ws.receive_json()["type"] == "ride.created"
        assert client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Ana"}).status_code == 409
        # A second, successful change proves the failed one produced nothing in between.
        client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Marko"})
        ev = ws.receive_json()
        assert ev["type"] == "ride.updated" and ev["ride"]["bookings"][0]["passenger_name"] == "Marko"


def test_every_client_gets_the_event(client):
    with client.websocket_connect("/api/ws") as a, client.websocket_connect("/api/ws") as b:
        a.receive_json()
        b.receive_json()
        client.post("/api/rides", json=own_ride())
        assert a.receive_json()["type"] == "ride.created"
        assert b.receive_json()["type"] == "ride.created"


@pytest.fixture()
def admin(monkeypatch):
    monkeypatch.setenv("KARPUL_ADMIN_PASSWORD", PASSWORD)


def test_car_pool_edits_are_broadcast(client, admin):
    with client.websocket_connect("/api/ws") as ws:
        ws.receive_json()  # hello
        car = client.post(
            "/api/cars/corporate", json={"name": "Fiat Panda", "plate": "FIRM-009", "passenger_seats": 3}, headers=AUTH
        ).json()
        assert ws.receive_json() == {"type": "cars.changed"}
        client.patch(f"/api/cars/corporate/{car['id']}", json={"name": "Fiat Panda II"}, headers=AUTH)
        assert ws.receive_json() == {"type": "cars.changed"}
        client.delete(f"/api/cars/corporate/{car['id']}", headers=AUTH)
        assert ws.receive_json() == {"type": "cars.changed"}


def test_publish_with_no_subscribers_is_a_noop(client):
    # No socket open: mutations must not fail just because nobody is listening.
    assert client.post("/api/rides", json=own_ride()).status_code == 201
