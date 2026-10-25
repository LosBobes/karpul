"""An admin schedules rides for other people and fixes the ones that exist."""

from datetime import date, timedelta

import pytest

TOMORROW = (date.today() + timedelta(days=1)).isoformat()


def ride(**overrides):
    base = {
        "ride_date": TOMORROW,
        "car_type": "own",
        "car_name": "Blue Golf",
        "origin": "Novi Sad",
        "destination": "HQ",
        "departure_time": "07:30",
        "return_time": "16:30",
        "seats": 2,
    }
    base.update(overrides)
    return base


@pytest.fixture()
def sent(monkeypatch):
    """Every notification captured instead of sent: (kind, accounts, arguments)."""
    out = []

    def fake_notify(session, user_ids, kind, ride, **args):
        out.append((kind, sorted(uid for uid in user_ids if uid is not None), args))
        return 0

    monkeypatch.setattr("app.routers.rides.notify", fake_notify)
    return out


def user_id(client, name):
    return client.get("/api/auth/me", headers={"X-User-Name": name}).json()["id"]


def test_an_admin_adds_a_ride_for_someone_else(client, admin_auth, sent):
    marko = user_id(client, "Marko Jovanović")
    res = client.post("/api/rides", json=ride(driver_id=marko), headers=admin_auth)
    assert res.status_code == 201, res.text
    body = res.json()
    # Marko drives it, and it is his like any ride of his own.
    assert body["driver_id"] == marko
    assert body["driver_name"] == "Marko Jovanović"
    assert sent == [("ride_assigned", [marko], {"name": "Ada Admin"})]
    edit = client.patch(f"/api/rides/{body['id']}", json={"notes": "Bring the card"}, headers={"X-User-Name": "Marko Jovanović"})
    assert edit.status_code == 200


def test_naming_yourself_is_the_plain_case(client, admin_auth, sent):
    me = client.get("/api/auth/me", headers=admin_auth).json()["id"]
    body = client.post("/api/rides", json=ride(driver_id=me), headers=admin_auth).json()
    assert body["driver_id"] == me
    assert sent == []


def test_only_an_admin_adds_a_ride_for_someone_else(client):
    marko = user_id(client, "Marko Jovanović")
    res = client.post("/api/rides", json=ride(driver_id=marko), headers={"X-User-Name": "Ana Petrović"})
    assert res.status_code == 403
    assert res.json()["detail"] == "Only an admin can add a ride for someone else"


def test_an_unknown_driver_is_a_404(client, admin_auth):
    res = client.post("/api/rides", json=ride(driver_id=999_999), headers=admin_auth)
    assert res.status_code == 404
    assert res.json()["detail"] == "Account not found"


def test_an_admin_edits_and_removes_someone_elses_ride(client, admin_auth, sent):
    ana = user_id(client, "Ana Petrović")
    made = client.post("/api/rides", json=ride(driver_name="Ana Petrović")).json()
    client.post(f"/api/rides/{made['id']}/bookings", json={"passenger_name": "Mila Ilić"})
    mila = user_id(client, "Mila Ilić")

    res = client.patch(f"/api/rides/{made['id']}", json={"departure_time": "08:00"}, headers=admin_auth)
    assert res.status_code == 200, res.text
    # The driver never changes, whoever edits.
    assert res.json()["driver_id"] == ana
    assert ("ride_changed", [mila], {"driver": "Ada Admin"}) in sent
    assert ("ride_changed", [ana], {"driver": "Ada Admin"}) in sent

    # An admin may also put people in and take them out.
    added = client.post(f"/api/rides/{made['id']}/bookings", json={"passenger_name": "Zoran"}, headers=admin_auth)
    assert added.status_code == 201, added.text

    sent.clear()
    assert client.delete(f"/api/rides/{made['id']}", headers=admin_auth).status_code == 204
    assert sent == [("ride_removed", sorted([mila, ana]), {"driver": "Ada Admin"})]


def test_someone_else_still_cannot_edit_or_remove(client):
    made = client.post("/api/rides", json=ride(driver_name="Ana Petrović")).json()
    other = {"X-User-Name": "Marko Jovanović"}
    res = client.patch(f"/api/rides/{made['id']}", json={"notes": "mine now"}, headers=other)
    assert res.status_code == 403
    assert res.json()["detail"] == "Only the driver or an admin can edit this ride"
    res = client.delete(f"/api/rides/{made['id']}", headers=other)
    assert res.status_code == 403
    assert res.json()["detail"] == "Only the driver or an admin can cancel this ride"


def test_a_driver_editing_their_own_ride_is_not_told_about_it(client, sent):
    made = client.post("/api/rides", json=ride(driver_name="Ana Petrović")).json()
    client.patch(f"/api/rides/{made['id']}", json={"departure_time": "08:00"}, headers={"X-User-Name": "Ana Petrović"})
    assert sent == []
