"""An own car coming to the Beograd office: its plate goes on the garage's list,
which an admin keeps by hand and ticks off in Karpul."""

from datetime import date, timedelta

import pytest

from tests.conftest import patch_ride_notify

DAY = date.today() + timedelta(days=3)


def own(**overrides):
    base = {
        "ride_date": DAY.isoformat(),
        "car_type": "own",
        "car_name": "Grey Golf",
        "driver_name": "Nina Novosađanka",
        "origin": "Novi Sad",
        "destination": "Beograd",
        "departure_time": "07:30",
        "return_time": "16:00",
        "seats": 3,
        "plate": "  ns 123-ab ",
    }
    base.update(overrides)
    return base


@pytest.fixture()
def sent(monkeypatch):
    out = []

    def fake_notify(session, user_ids, kind, ride=None, **args):
        out.append((kind, args))
        return 0

    patch_ride_notify(monkeypatch, fake_notify, "app.routers.admin")
    return out


def test_a_plate_to_beograd_is_an_admin_task_until_ticked_off(client, admin_auth, sent):
    ride = client.post("/api/rides", json=own()).json()
    assert ride["plate"] == "NS 123-AB"
    assert ride["plate_registered"] is False
    assert ("garage_plate", {"name": "Nina Novosađanka", "plate": "NS 123-AB"}) in sent

    # Not a garage task: no plate, another destination, a shared car.
    client.post("/api/rides", json=own(plate=""))
    client.post("/api/rides", json=own(destination="Novi Sad", origin="Beograd"))

    listed = client.get("/api/admin/garage", headers=admin_auth)
    assert listed.status_code == 200
    assert [r["id"] for r in listed.json()] == [ride["id"]]
    assert client.get("/api/admin/garage", headers={"X-User-Name": "Nina Novosađanka"}).status_code == 403

    sent.clear()
    done = client.put(f"/api/admin/garage/{ride['id']}", json={"registered": True}, headers=admin_auth)
    assert done.status_code == 200, done.text
    assert done.json()["plate_registered"] is True
    assert sent == [("plate_registered", {"name": "Ada Admin", "plate": "NS 123-AB"})]
    # Still listed, ticked, so the tick can be taken back.
    assert [r["plate_registered"] for r in client.get("/api/admin/garage", headers=admin_auth).json()] == [True]

    log = client.get("/api/admin/log", headers=admin_auth).json()
    assert log[0]["action"] == "plate_registered"


def test_a_new_plate_or_day_is_a_new_task(client, admin_auth, sent):
    ride = client.post("/api/rides", json=own()).json()
    client.put(f"/api/admin/garage/{ride['id']}", json={"registered": True}, headers=admin_auth)

    # A note changes nothing.
    sent.clear()
    noted = client.patch(f"/api/rides/{ride['id']}", json={"notes": "Parking level -2"}, headers={"X-User-Name": "Nina Novosađanka"})
    assert noted.json()["plate_registered"] is True
    assert not [k for k, _ in sent if k == "garage_plate"]

    replated = client.patch(f"/api/rides/{ride['id']}", json={"plate": "NS 999-ZZ"}, headers={"X-User-Name": "Nina Novosađanka"})
    assert replated.json()["plate_registered"] is False
    assert ("garage_plate", {"name": "Nina Novosađanka", "plate": "NS 999-ZZ"}) in sent

    client.put(f"/api/admin/garage/{ride['id']}", json={"registered": True}, headers=admin_auth)
    moved = client.patch(
        f"/api/rides/{ride['id']}", json={"ride_date": (DAY + timedelta(days=1)).isoformat()}, headers={"X-User-Name": "Nina Novosađanka"}
    )
    assert moved.json()["plate_registered"] is False


def test_no_plate_for_a_shared_car_and_no_tick_without_one(client, admin_auth):
    car = client.get("/api/cars/corporate").json()[0]
    shared = client.post(
        "/api/rides",
        json=own(car_type="corporate", corporate_car_id=car["id"], car_name="", seats=1, return_time="10:00"),
    ).json()
    assert shared["plate"] == ""
    refused = client.put(f"/api/admin/garage/{shared['id']}", json={"registered": True}, headers=admin_auth)
    assert refused.status_code == 409
    assert refused.json()["detail"] == "This ride has no plate for the garage"
