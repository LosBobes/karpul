from datetime import date, timedelta

import pytest

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
PASSWORD = "let-me-in"
AUTH = {"X-Admin-Password": PASSWORD}


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    """Never inherit a real KARPUL_ADMIN_PASSWORD from the developer's shell."""
    monkeypatch.delenv("KARPUL_ADMIN_PASSWORD", raising=False)


@pytest.fixture()
def admin(monkeypatch):
    monkeypatch.setenv("KARPUL_ADMIN_PASSWORD", PASSWORD)


def new_car(**overrides):
    base = {"name": "Fiat Panda", "plate": "firm-009", "passenger_seats": 3}
    base.update(overrides)
    return base


def test_admin_off_by_default(client):
    # No KARPUL_ADMIN_PASSWORD in the environment: the endpoints are switched off.
    assert client.post("/api/cars/corporate", json=new_car()).status_code == 503
    assert client.get("/api/cars/corporate", params={"include_inactive": True}).status_code == 503


def test_wrong_password_rejected(client, admin):
    r = client.post("/api/cars/corporate", json=new_car(), headers={"X-Admin-Password": "nope"})
    assert r.status_code == 401
    assert client.post("/api/cars/corporate", json=new_car()).status_code == 401


def test_create_car_normalises_plate_and_appears_in_pool(client, admin):
    r = client.post("/api/cars/corporate", json=new_car(), headers=AUTH)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["plate"] == "FIRM-009"
    assert body["active"] is True

    pool = client.get("/api/cars/corporate").json()
    assert body["id"] in [c["id"] for c in pool]


def test_duplicate_plate_rejected(client, admin):
    seeded = client.get("/api/cars/corporate").json()[0]
    r = client.post("/api/cars/corporate", json=new_car(plate=seeded["plate"]), headers=AUTH)
    assert r.status_code == 409
    assert seeded["plate"] in r.json()["detail"]


def test_edit_car_fields(client, admin):
    car = client.get("/api/cars/corporate").json()[0]
    r = client.patch(
        f"/api/cars/corporate/{car['id']}",
        json={"name": "  Skoda   Superb ", "passenger_seats": 5},
        headers=AUTH,
    )
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Skoda Superb"
    assert r.json()["passenger_seats"] == 5


def test_retire_hides_car_from_pool_but_admin_still_sees_it(client, admin):
    car = client.get("/api/cars/corporate").json()[0]
    r = client.patch(f"/api/cars/corporate/{car['id']}", json={"active": False}, headers=AUTH)
    assert r.status_code == 200
    assert r.json()["active"] is False

    assert car["id"] not in [c["id"] for c in client.get("/api/cars/corporate").json()]
    everything = client.get(
        "/api/cars/corporate", params={"include_inactive": True}, headers=AUTH
    ).json()
    assert car["id"] in [c["id"] for c in everything]

    # And back again.
    client.patch(f"/api/cars/corporate/{car['id']}", json={"active": True}, headers=AUTH)
    assert car["id"] in [c["id"] for c in client.get("/api/cars/corporate").json()]


def test_retired_car_cannot_be_booked(client, admin):
    car = client.get("/api/cars/corporate").json()[0]
    client.patch(f"/api/cars/corporate/{car['id']}", json={"active": False}, headers=AUTH)
    r = client.post(
        "/api/rides",
        json={
            "ride_date": TOMORROW,
            "car_type": "corporate",
            "corporate_car_id": car["id"],
            "car_name": "",
            "driver_name": "Ana",
            "origin": "Novi Sad",
            "destination": "HQ",
            "departure_time": "07:30",
            "return_time": "16:30",
            "seats": 2,
        },
    )
    assert r.status_code == 404


def test_shrinking_seats_below_an_existing_ride_is_rejected(client, admin):
    car = client.get("/api/cars/corporate").json()[0]
    ride = {
        "ride_date": TOMORROW,
        "car_type": "corporate",
        "corporate_car_id": car["id"],
        "car_name": "",
        "driver_name": "Ana",
        "origin": "Novi Sad",
        "destination": "HQ",
        "departure_time": "07:30",
        "return_time": "16:30",
        "seats": 4,
    }
    assert client.post("/api/rides", json=ride).status_code == 201

    r = client.patch(f"/api/cars/corporate/{car['id']}", json={"passenger_seats": 2}, headers=AUTH)
    assert r.status_code == 409
    assert "Ana" in r.json()["detail"]

    # Growing is always fine.
    assert (
        client.patch(
            f"/api/cars/corporate/{car['id']}", json={"passenger_seats": 6}, headers=AUTH
        ).status_code
        == 200
    )


def test_delete_unused_car_but_not_one_with_rides(client, admin):
    fresh = client.post("/api/cars/corporate", json=new_car(), headers=AUTH).json()
    assert client.delete(f"/api/cars/corporate/{fresh['id']}", headers=AUTH).status_code == 204
    assert client.delete(f"/api/cars/corporate/{fresh['id']}", headers=AUTH).status_code == 404

    used = client.get("/api/cars/corporate").json()[0]
    client.post(
        "/api/rides",
        json={
            "ride_date": TOMORROW,
            "car_type": "corporate",
            "corporate_car_id": used["id"],
            "car_name": "",
            "driver_name": "Ana",
            "origin": "Novi Sad",
            "destination": "HQ",
            "departure_time": "07:30",
            "return_time": "16:30",
            "seats": 2,
        },
    )
    r = client.delete(f"/api/cars/corporate/{used['id']}", headers=AUTH)
    assert r.status_code == 409
    assert "retire" in r.json()["detail"]


def test_rename_reaches_rides_already_booked_in_that_car(client, admin):
    """`Ride.car_name` is a snapshot, so an admin rename has to be pushed out."""
    car = client.get("/api/cars/corporate").json()[0]
    ride = client.post(
        "/api/rides",
        json={
            "ride_date": TOMORROW,
            "car_type": "corporate",
            "corporate_car_id": car["id"],
            "driver_name": "Ana",
            "origin": "Novi Sad",
            "destination": "HQ",
            "departure_time": "07:30",
            "return_time": "16:30",
            "seats": 2,
        },
    ).json()
    assert ride["car_name"] == f"{car['name']} ({car['plate']})"

    r = client.patch(
        f"/api/cars/corporate/{car['id']}",
        json={"name": "Mazda 6e", "plate": "bg-123-xy"},
        headers=AUTH,
    )
    assert r.status_code == 200, r.text

    after = client.get(f"/api/rides/{ride['id']}").json()
    assert after["car_name"] == "Mazda 6e (BG-123-XY)"
    # The driver's own seat offer is theirs, and is left alone.
    assert after["seats"] == 2


def test_raising_capacity_leaves_existing_offers_alone(client, admin):
    """Growing the car does not silently widen a ride the driver already posted."""
    car = client.get("/api/cars/corporate").json()[0]
    ride = client.post(
        "/api/rides",
        json={
            "ride_date": TOMORROW,
            "car_type": "corporate",
            "corporate_car_id": car["id"],
            "driver_name": "Ana",
            "origin": "Novi Sad",
            "destination": "HQ",
            "departure_time": "07:30",
            "seats": 2,
        },
    ).json()
    client.patch(
        f"/api/cars/corporate/{car['id']}", json={"passenger_seats": 8}, headers=AUTH
    ).raise_for_status()

    assert client.get(f"/api/rides/{ride['id']}").json()["seats"] == 2
    # ...but the driver can now edit up to the new capacity.
    r = client.patch(
        f"/api/rides/{ride['id']}", json={"seats": 7}, headers={"X-User-Name": "ana"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["seats"] == 7
