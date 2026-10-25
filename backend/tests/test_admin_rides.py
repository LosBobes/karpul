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


# --- the admin's log -----------------------------------------------------------


def log(client, admin_auth):
    res = client.get("/api/admin/log", headers=admin_auth)
    assert res.status_code == 200, res.text
    return res.json()


def test_the_log_records_what_an_admin_did_to_someone_elses_ride(client, admin_auth):
    marko = user_id(client, "Marko Jovanović")
    made = client.post("/api/rides", json=ride(driver_id=marko), headers=admin_auth).json()
    url = f"/api/rides/{made['id']}"
    client.patch(url, json={"departure_time": "08:15", "notes": "Card is in the glovebox"}, headers=admin_auth)
    seat = client.post(f"{url}/bookings", json={"passenger_name": "Mila Ilić"}, headers=admin_auth).json()["bookings"][0]
    client.delete(f"{url}/bookings/{seat['id']}", headers=admin_auth)
    client.delete(url, headers=admin_auth)

    lines = log(client, admin_auth)
    assert [line["action"] for line in lines] == ["ride_removed", "seat_removed", "seat_added", "ride_edited", "ride_added"]
    assert all(line["admin_name"] == "Ada Admin" and line["subject"] == "Marko Jovanović" for line in lines)
    edited = lines[3]
    assert edited["ride_id"] == made["id"]
    assert edited["ride_date"] == TOMORROW
    assert edited["ride_label"] == "08:15 Novi Sad → HQ"
    assert edited["changes"] == [["departure_time", "07:30", "08:15"], ["notes", "", "Card is in the glovebox"]]
    assert lines[2]["changes"] == [["passenger", "", "Mila Ilić"]]
    assert lines[1]["changes"] == [["passenger", "Mila Ilić", ""]]
    assert lines[0]["at"].endswith(("Z", "+00:00"))


def test_an_admins_own_rides_and_plain_users_leave_no_line(client, admin_auth):
    mine = client.post("/api/rides", json=ride(), headers=admin_auth).json()
    client.patch(f"/api/rides/{mine['id']}", json={"notes": "mine"}, headers=admin_auth)
    other = client.post("/api/rides", json=ride(driver_name="Ana Petrović")).json()
    client.patch(f"/api/rides/{other['id']}", json={"notes": "hers"}, headers={"X-User-Name": "Ana Petrović"})
    # Nothing changed, nothing to say either.
    client.patch(f"/api/rides/{other['id']}", json={"notes": "hers"}, headers=admin_auth)
    assert log(client, admin_auth) == []


def test_the_pool_and_the_people_are_logged_too(client, admin_auth):
    car = client.post("/api/cars/corporate", json={"name": "Octavia", "plate": "NS-002", "passenger_seats": 4}, headers=admin_auth).json()
    client.patch(f"/api/cars/corporate/{car['id']}", json={"passenger_seats": 3}, headers=admin_auth)
    client.delete(f"/api/cars/corporate/{car['id']}", headers=admin_auth)
    marko = user_id(client, "Marko Jovanović")
    client.patch(f"/api/admin/users/{marko}", json={"is_admin": True}, headers=admin_auth)
    client.patch(f"/api/admin/users/{marko}", json={"is_admin": False}, headers=admin_auth)
    client.post(f"/api/admin/users/{marko}/reset-link", headers=admin_auth)
    client.delete(f"/api/admin/users/{marko}", headers=admin_auth)

    lines = log(client, admin_auth)
    assert [(line["action"], line["subject"]) for line in lines] == [
        ("account_deleted", "Marko Jovanović"),
        ("reset_link", "Marko Jovanović"),
        ("admin_revoked", "Marko Jovanović"),
        ("admin_granted", "Marko Jovanović"),
        ("car_removed", "Octavia (NS-002)"),
        ("car_edited", "Octavia (NS-002)"),
        ("car_added", "Octavia (NS-002)"),
    ]
    assert lines[5]["changes"] == [["passenger_seats", "4", "3"]]


def test_only_admins_read_the_log(client, admin_auth):
    client.post("/api/rides", json=ride(driver_id=user_id(client, "Marko Jovanović")), headers=admin_auth)
    assert client.get("/api/admin/log", headers={"X-User-Name": "Marko Jovanović"}).status_code == 403
    assert client.anon.get("/api/admin/log").status_code == 401
    first = log(client, admin_auth)
    assert client.get(f"/api/admin/log?before={first[0]['id']}", headers=admin_auth).json() == []
