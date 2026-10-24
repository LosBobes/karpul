"""Admins are accounts: who is one, and what they can do for the others."""

from datetime import date, timedelta

import pytest


def test_only_admins_see_the_people(client, admin_auth):
    client.auth("Ana Petrović")
    assert client.anon.get("/api/admin/users").status_code == 401
    assert client.get("/api/admin/users").status_code == 403
    r = client.get("/api/admin/users", headers=admin_auth)
    assert r.status_code == 200
    people = {u["display_name"]: u for u in r.json()}
    assert people["Ada Admin"]["is_admin"] is True
    assert people["Ana Petrović"]["is_admin"] is False
    assert "password_hash" not in r.text and "calendar_token" not in r.text


def test_an_admin_makes_another_one_and_takes_it_back(client, admin_auth):
    ana = client.auth("Ana Petrović")
    ana_id = client.get("/api/auth/me", headers=ana).json()["id"]
    assert client.patch(f"/api/admin/users/{ana_id}", json={"is_admin": True}, headers=ana).status_code == 403

    r = client.patch(f"/api/admin/users/{ana_id}", json={"is_admin": True}, headers=admin_auth)
    assert r.status_code == 200 and r.json()["is_admin"] is True
    assert client.get("/api/auth/me", headers=ana).json()["is_admin"] is True
    # Now Ana can manage the pool...
    car = {"name": "Fiat Panda", "plate": "FIRM-009", "passenger_seats": 3}
    assert client.post("/api/cars/corporate", json=car, headers=ana).status_code == 201
    # ...and take her own role away again, while Ada is still there.
    assert client.patch(f"/api/admin/users/{ana_id}", json={"is_admin": False}, headers=ana).status_code == 200
    assert client.post("/api/cars/corporate", json=car, headers=ana).status_code == 403


def test_the_last_admin_stays(client, admin_auth):
    ada_id = client.get("/api/auth/me", headers=admin_auth).json()["id"]
    r = client.patch(f"/api/admin/users/{ada_id}", json={"is_admin": False}, headers=admin_auth)
    assert r.status_code == 409 and "at least one admin" in r.json()["detail"]


def test_an_admin_by_configuration_cannot_be_demoted_from_the_app(client, admin_auth, monkeypatch):
    ana = client.auth("Ana Petrović")
    me = client.get("/api/auth/me", headers=ana).json()
    monkeypatch.setenv("KARPUL_ADMINS", me["username"])
    listed = {u["id"]: u for u in client.get("/api/admin/users", headers=admin_auth).json()}
    assert listed[me["id"]]["admin_by_config"] is True
    r = client.patch(f"/api/admin/users/{me['id']}", json={"is_admin": False}, headers=admin_auth)
    assert r.status_code == 409 and "KARPUL_ADMINS" in r.json()["detail"]


def test_reset_links_are_for_admins_to_hand_out(client, admin_auth):
    ana = client.auth("Ana Petrović")
    ana_id = client.get("/api/auth/me", headers=ana).json()["id"]
    assert client.post(f"/api/admin/users/{ana_id}/reset-link", headers=ana).status_code == 403
    r = client.post(f"/api/admin/users/{ana_id}/reset-link", headers=admin_auth)
    assert r.status_code == 201 and r.json()["path"].startswith("/reset/")
    assert client.post("/api/admin/users/9999/reset-link", headers=admin_auth).status_code == 404


# --- deleting an account -----------------------------------------------------

TOMORROW = (date.today() + timedelta(days=1)).isoformat()


def own_ride(driver, seats=1, **overrides):
    return {
        "ride_date": TOMORROW,
        "car_type": "own",
        "car_name": "Blue Golf",
        "driver_name": driver,
        "origin": "Novi Sad",
        "destination": "HQ",
        "departure_time": "07:30",
        "return_time": "16:30",
        "seats": seats,
        **overrides,
    }


def as_(name):
    return {"X-User-Name": name}


def account_id(client, name):
    return client.get("/api/auth/me", headers=as_(name)).json()["id"]


@pytest.fixture()
def told(monkeypatch):
    out = []

    def fake_notify(session, user_ids, kind, ride, **args):
        out.append((kind, sorted(uid for uid in user_ids if uid is not None)))
        return 0

    monkeypatch.setattr("app.routers.admin.notify", fake_notify)
    return out


def test_only_an_admin_deletes_and_not_themself_or_a_configured_one(client, admin_auth, monkeypatch):
    ana = account_id(client, "Ana")
    assert client.delete(f"/api/admin/users/{ana}", headers=as_("Marko")).status_code == 403
    assert client.anon.delete(f"/api/admin/users/{ana}").status_code == 401
    assert client.delete("/api/admin/users/9999", headers=admin_auth).status_code == 404
    ada = client.get("/api/auth/me", headers=admin_auth).json()
    r = client.delete(f"/api/admin/users/{ada['id']}", headers=admin_auth)
    assert r.status_code == 409 and "your own account" in r.json()["detail"]
    monkeypatch.setenv("KARPUL_ADMINS", client.get("/api/auth/me", headers=as_("Ana")).json()["username"])
    r = client.delete(f"/api/admin/users/{ana}", headers=admin_auth)
    assert r.status_code == 409 and "KARPUL_ADMINS" in r.json()["detail"]


def test_deleting_an_account_clears_its_plans_and_keeps_its_past(client, admin_auth, told, session_factory):
    from sqlmodel import select

    from app.models import Ride, RideMessage, User

    # Marko drives tomorrow with Mila in; he also sits in Ana's full car, Ivo waiting behind him.
    his = client.post("/api/rides", json=own_ride("Marko")).json()
    client.post(f"/api/rides/{his['id']}/bookings", json={"passenger_name": "Mila"})
    hers = client.post("/api/rides", json=own_ride("Ana", departure_time="08:00")).json()
    client.post(f"/api/rides/{hers['id']}/bookings", json={"passenger_name": "Marko"})
    client.post(f"/api/rides/{hers['id']}/waitlist", json={}, headers=as_("Ivo"))
    client.post(f"/api/rides/{hers['id']}/messages", json={"body": "on my way"}, headers=as_("Marko"))
    client.post("/api/requests", json={"request_date": TOMORROW, "origin": "A", "destination": "B", "departure_time": "09:00"}, headers=as_("Marko"))
    # And one ride in the past.
    old = client.post("/api/rides", json=own_ride("Marko", departure_time="10:00")).json()
    with session_factory() as s:
        ride = s.get(Ride, old["id"])
        ride.ride_date = date.today() - timedelta(days=3)
        s.add(ride)
        s.commit()
    marko, mila, ana, ivo = (account_id(client, n) for n in ("Marko", "Mila", "Ana", "Ivo"))

    assert client.delete(f"/api/admin/users/{marko}", headers=admin_auth).status_code == 204

    assert client.get("/api/auth/me", headers=as_("Marko")).status_code == 401
    assert client.get(f"/api/rides/{his['id']}", headers=as_("Ana")).status_code == 404
    seat = client.get(f"/api/rides/{hers['id']}", headers=as_("Ana")).json()
    assert [b["passenger_name"] for b in seat["bookings"]] == ["Ivo"] and seat["waitlist"] == []
    assert ("ride_removed", [mila]) in told and ("got_out", [ana]) in told and ("seat_freed", [ivo]) in told
    assert client.get("/api/requests", params={"from": TOMORROW, "to": TOMORROW}, headers=as_("Ana")).json() == []
    with session_factory() as s:
        past = s.get(Ride, old["id"])
        assert past is not None and past.driver_name == "Marko" and past.driver_id is None
        assert [m.body for m in s.exec(select(RideMessage))] == ["on my way"]
        assert s.get(User, marko) is None


def test_a_deleted_account_is_shown_out_of_the_live_socket(client, admin_auth):
    from starlette.websockets import WebSocketDisconnect

    marko = account_id(client, "Marko")
    with client.websocket_connect("/api/ws", as_name="Marko") as ws:
        assert ws.receive_json()["type"] == "hello"
        assert client.delete(f"/api/admin/users/{marko}", headers=admin_auth).status_code == 204
        with pytest.raises(WebSocketDisconnect) as closed:
            while True:
                ws.receive_json()
        assert closed.value.code == 4401

