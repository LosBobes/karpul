"""A shared car whose driver cancels with passengers in it asks them to drive
instead (`Ride.needs_driver`, POST /api/rides/{id}/takeover); and the
driver's coffee hint."""

from datetime import date, datetime, timedelta

import pytest
from sqlmodel import Session

from app.models import Ride
from app.reminders import drop_driverless

DAY = date.today() + timedelta(days=14)
ANA = {"X-User-Name": "Ana Petrović"}
BOB = {"X-User-Name": "Bob Jović"}
CID = {"X-User-Name": "Cid Ilić"}


def shared(car_id, day=DAY, **overrides):
    base = {
        "ride_date": day.isoformat(),
        "car_type": "corporate",
        "corporate_car_id": car_id,
        "car_name": "",
        "driver_name": "Ana Petrović",
        "origin": "Novi Sad",
        "destination": "Beograd",
        "departure_time": "08:00",
        "return_time": "12:00",
        "seats": 2,
    }
    base.update(overrides)
    return base


@pytest.fixture()
def sent(monkeypatch):
    out = []

    def fake_notify(session, user_ids, kind, ride=None, **args):
        out.append((kind, sorted(uid for uid in user_ids if uid is not None)))
        return 0

    monkeypatch.setattr("app.routers.rides.notify", fake_notify)
    return out


@pytest.fixture()
def car(client):
    return client.get("/api/cars/corporate").json()[0]


def uid(client, headers):
    return client.get("/api/auth/me", headers=headers).json()["id"]


def ride_with(client, car, *names, **overrides):
    ride = client.post("/api/rides", json=shared(car["id"], **overrides), headers=ANA).json()
    for name in names:
        assert client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": name}).status_code == 201
    return ride


def test_the_driver_cancelling_asks_the_passengers_and_one_takes_the_wheel(client, car, sent):
    ride = ride_with(client, car, "Bob Jović", "Cid Ilić")
    bob, cid = uid(client, BOB), uid(client, CID)
    sent.clear()
    assert client.delete(f"/api/rides/{ride['id']}", headers=ANA).status_code == 204

    held = client.get(f"/api/rides/{ride['id']}").json()
    assert held["needs_driver"] is True
    assert held["driver_name"] == "Ana Petrović"
    assert sent == [("driver_needed", sorted([bob, cid]))]

    # Ana gave it up: she can neither edit nor take it back.
    assert client.patch(f"/api/rides/{ride['id']}", json={"notes": "x"}, headers=ANA).status_code == 403
    assert client.post(f"/api/rides/{ride['id']}/takeover", headers=ANA).status_code == 403
    # The car is still taken in that window.
    clash = client.post("/api/rides", json=shared(car["id"], driver_name="Dan Kos"), headers={"X-User-Name": "Dan Kos"})
    assert clash.status_code == 409

    sent.clear()
    res = client.post(f"/api/rides/{ride['id']}/takeover", headers=BOB)
    assert res.status_code == 200, res.text
    taken = res.json()
    assert taken["needs_driver"] is False
    assert taken["driver_name"] == "Bob Jović" and taken["driver_id"] == bob
    assert [b["passenger_name"] for b in taken["bookings"]] == ["Cid Ilić"]
    assert sent == [("driver_found", [cid])]
    # Only once.
    assert client.post(f"/api/rides/{ride['id']}/takeover", headers=CID).status_code == 409
    # Bob runs it now.
    assert client.patch(f"/api/rides/{ride['id']}", json={"notes": "I drive"}, headers=BOB).status_code == 200


def test_a_ride_with_nobody_to_ask_an_own_car_or_an_admin_removal_just_goes(client, car, admin_auth):
    empty = ride_with(client, car)
    assert client.delete(f"/api/rides/{empty['id']}", headers=ANA).status_code == 204
    assert client.get(f"/api/rides/{empty['id']}").status_code == 404

    own = ride_with(client, car, "Bob Jović", car_type="own", car_name="Blue Golf", corporate_car_id=None)
    assert client.delete(f"/api/rides/{own['id']}", headers=ANA).status_code == 204
    assert client.get(f"/api/rides/{own['id']}").status_code == 404

    by_admin = ride_with(client, car, "Bob Jović", ride_date=(DAY + timedelta(days=7)).isoformat())
    assert client.delete(f"/api/rides/{by_admin['id']}", headers=admin_auth).status_code == 204
    assert client.get(f"/api/rides/{by_admin['id']}").status_code == 404


def test_the_last_passenger_leaving_frees_the_car(client, car):
    ride = ride_with(client, car, "Bob Jović")
    client.delete(f"/api/rides/{ride['id']}", headers=ANA)
    booking = client.get(f"/api/rides/{ride['id']}").json()["bookings"][0]
    res = client.delete(f"/api/rides/{ride['id']}/bookings/{booking['id']}", headers=BOB)
    assert res.status_code == 200
    assert res.json()["bookings"] == []
    assert client.get(f"/api/rides/{ride['id']}").status_code == 404


def test_a_cancelled_ride_is_not_the_drivers_share_any_more(client, car):
    ride = ride_with(client, car, "Bob Jović")
    client.delete(f"/api/rides/{ride['id']}", headers=ANA)
    other = client.get("/api/cars/corporate").json()[1]
    again = client.post("/api/rides", json=shared(other["id"]), headers=ANA)
    assert again.status_code == 201, again.text


def test_nobody_by_departure_and_the_ride_goes(client, car, engine):
    ride = ride_with(client, car, "Bob Jović")
    client.delete(f"/api/rides/{ride['id']}", headers=ANA)
    with Session(engine) as session:
        assert drop_driverless(session, datetime.combine(DAY, datetime.min.time())) == 0
        assert drop_driverless(session, datetime.combine(DAY, datetime.min.time()) + timedelta(hours=8)) == 1
        assert session.get(Ride, ride["id"]) is None


def test_the_coffee_hint_is_the_drivers_switch(client, car):
    ride = client.post("/api/rides", json=shared(car["id"], coffee_please=True), headers=ANA).json()
    assert ride["coffee_please"] is True
    res = client.patch(f"/api/rides/{ride['id']}", json={"coffee_please": False}, headers=ANA)
    assert res.json()["coffee_please"] is False
    assert client.patch(f"/api/rides/{ride['id']}", json={"coffee_please": True}, headers=BOB).status_code == 403
