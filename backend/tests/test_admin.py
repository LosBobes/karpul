"""Admins are accounts: who is one, and what they can do for the others."""


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
