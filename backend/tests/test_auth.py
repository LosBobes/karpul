"""Accounts: register, sign in, and what a signed-in request is allowed to be."""

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlmodel import select

from app import auth
from app.models import AuthSession, Booking, Ride

TOMORROW = (date.today() + timedelta(days=1)).isoformat()

ANA = {
    "username": "ana",
    "email": "ana@example.com",
    "first_name": "Ana",
    "last_name": "Petrović",
    "password": "one-two-three-four",
}
MARKO = {
    "username": "marko",
    "email": "marko@example.com",
    "first_name": "Marko",
    "last_name": "Jovanović",
    "password": "four-three-two-one",
}


@pytest.fixture(autouse=True)
def cheap_hashing(monkeypatch):
    """Real PBKDF2, a thousandth of the rounds: the tests prove the shape of the
    thing, not how long a GPU would need."""
    monkeypatch.setattr(auth, "PBKDF2_ROUNDS", 200)
    auth._decoy_hash.cache_clear()
    yield
    auth._decoy_hash.cache_clear()


@pytest.fixture(autouse=True)
def no_forced_login(monkeypatch):
    """A developer's shell must not decide how these tests run (see test_cars.py)."""
    monkeypatch.delenv("KARPUL_REQUIRE_LOGIN", raising=False)


def register(client, who=ANA, **overrides):
    payload = {**who, **overrides}
    r = client.post("/api/auth/register", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def own_ride(**overrides):
    base = {
        "ride_date": TOMORROW,
        "car_type": "own",
        "car_name": "Blue Golf",
        "driver_name": "Ana Petrović",
        "origin": "Novi Sad",
        "destination": "HQ",
        "departure_time": "07:30",
        "seats": 3,
    }
    base.update(overrides)
    return base


# --- registering -------------------------------------------------------------


def test_register_signs_you_in_and_never_echoes_the_password(client):
    body = register(client)
    assert body["token"]
    assert body["user"]["username"] == "ana"
    assert body["user"]["display_name"] == "Ana Petrović"
    assert "password_hash" not in body["user"]
    assert ANA["password"] not in str(body)


def test_username_and_email_are_stored_lowercase(client):
    body = register(client, username="Ana.P", email="Ana.P@Example.COM")
    assert body["user"]["username"] == "ana.p"
    assert body["user"]["email"] == "ana.p@example.com"


@pytest.mark.parametrize(
    "overrides, field",
    [
        ({"username": "no"}, "username"),
        ({"username": "Ana Petrović"}, "username"),
        ({"email": "not-an-email"}, "email"),
        ({"password": "short"}, "password"),
        ({"first_name": "  "}, "first_name"),
    ],
)
def test_register_rejects_nonsense(client, overrides, field):
    r = client.post("/api/auth/register", json={**ANA, **overrides})
    assert r.status_code == 422, r.text
    assert field in r.text


def test_username_email_and_display_name_are_each_unique(client):
    register(client)
    taken_username = client.post("/api/auth/register", json={**ANA, "email": "other@example.com"})
    assert taken_username.status_code == 409
    assert "username" in taken_username.json()["detail"]

    taken_email = client.post("/api/auth/register", json={**ANA, "username": "ana2"})
    assert taken_email.status_code == 409
    assert "email" in taken_email.json()["detail"]

    # The board calls people by their display name, so two accounts may not
    # answer to one name however different their usernames are.
    same_name = client.post(
        "/api/auth/register",
        json={**ANA, "username": "ana2", "email": "ana2@example.com", "first_name": " ana ", "last_name": "PETROVIĆ"},
    )
    assert same_name.status_code == 409
    assert "Ana Petrović" in same_name.json()["detail"] or "ana PETROVIĆ" in same_name.json()["detail"]


# --- signing in --------------------------------------------------------------


def test_login_with_username_or_email(client):
    register(client)
    for login in ("ana", "ANA", "ana@example.com"):
        r = client.post("/api/auth/login", json={"login": login, "password": ANA["password"]})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["username"] == "ana"


def test_login_says_the_same_thing_for_a_wrong_name_and_a_wrong_password(client):
    register(client)
    wrong_password = client.post("/api/auth/login", json={"login": "ana", "password": "not-the-password"})
    no_such_user = client.post("/api/auth/login", json={"login": "nobody", "password": "not-the-password"})
    assert wrong_password.status_code == no_such_user.status_code == 401
    assert wrong_password.json()["detail"] == no_such_user.json()["detail"]


def test_me_needs_a_live_token(client):
    token = register(client)["token"]
    assert client.get("/api/auth/me", headers=bearer(token)).json()["username"] == "ana"
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=bearer("not-a-token")).status_code == 401


def test_logout_kills_the_token(client):
    token = register(client)["token"]
    assert client.post("/api/auth/logout", headers=bearer(token)).status_code == 204
    assert client.get("/api/auth/me", headers=bearer(token)).status_code == 401
    # Signing out twice is not an error; the browser wanted to be signed out.
    assert client.post("/api/auth/logout", headers=bearer(token)).status_code == 204


def test_an_expired_session_is_not_anonymous_but_an_error(client, session_factory):
    token = register(client)["token"]
    with session_factory() as s:
        row = s.exec(select(AuthSession)).one()
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        s.add(row)
        s.commit()
    r = client.get("/api/auth/me", headers=bearer(token))
    assert r.status_code == 401
    assert "expired" in r.json()["detail"]


# --- acting as your account --------------------------------------------------


def test_a_signed_in_driver_drives_their_own_ride(client):
    token = register(client)["token"]
    # The payload claims someone else; the account wins.
    r = client.post("/api/rides", json=own_ride(driver_name="Someone Else"), headers=bearer(token))
    assert r.status_code == 201, r.text
    assert r.json()["driver_name"] == "Ana Petrović"


def test_only_the_account_that_drives_can_edit_or_cancel(client):
    ana = register(client)["token"]
    marko = register(client, MARKO)["token"]
    ride = client.post("/api/rides", json=own_ride(), headers=bearer(ana)).json()

    assert client.patch(f"/api/rides/{ride['id']}", json={"seats": 1}, headers=bearer(marko)).status_code == 403
    assert client.delete(f"/api/rides/{ride['id']}", headers=bearer(marko)).status_code == 403
    assert client.patch(f"/api/rides/{ride['id']}", json={"seats": 1}, headers=bearer(ana)).status_code == 200
    assert client.delete(f"/api/rides/{ride['id']}", headers=bearer(ana)).status_code == 204


def test_joining_is_done_as_the_signed_in_account(client):
    ana = register(client)["token"]
    marko = register(client, MARKO)["token"]
    ride = client.post("/api/rides", json=own_ride(), headers=bearer(ana)).json()

    joined = client.post(
        f"/api/rides/{ride['id']}/bookings",
        json={"passenger_name": "Marko Jovanović"},
        headers=bearer(marko),
    )
    assert joined.status_code == 201, joined.text

    # Marko is not the driver and the ride does not let passengers manage seats,
    # so he cannot put a third person in the car.
    r = client.post(
        f"/api/rides/{ride['id']}/bookings",
        json={"passenger_name": "Someone Else"},
        headers=bearer(marko),
    )
    assert r.status_code == 403


def test_a_token_beats_the_x_user_name_header(client):
    ana = register(client)["token"]
    ride = client.post("/api/rides", json=own_ride(), headers=bearer(ana)).json()
    # Claiming to be the driver in the header does not make you the driver.
    marko = register(client, MARKO)["token"]
    r = client.patch(
        f"/api/rides/{ride['id']}",
        json={"seats": 1},
        headers={**bearer(marko), "X-User-Name": "Ana%20Petrovi%C4%87"},
    )
    assert r.status_code == 403


# --- KARPUL_REQUIRE_LOGIN ----------------------------------------------------


def test_without_the_flag_the_honour_system_still_works(client):
    r = client.post("/api/rides", json=own_ride(driver_name="Nobody In Particular"))
    assert r.status_code == 201
    assert r.json()["driver_name"] == "Nobody In Particular"


def test_with_the_flag_a_name_header_is_not_enough(client, monkeypatch):
    monkeypatch.setenv("KARPUL_REQUIRE_LOGIN", "1")
    assert client.post("/api/rides", json=own_ride()).status_code == 401
    r = client.post("/api/rides", json=own_ride(), headers={"X-User-Name": "Ana"})
    assert r.status_code == 401
    assert "Sign in" in r.json()["detail"]

    # Registering is of course still open, and a token gets you through.
    token = register(client)["token"]
    assert client.post("/api/rides", json=own_ride(), headers=bearer(token)).status_code == 201


def test_with_the_flag_a_seat_still_needs_an_account(client, monkeypatch):
    token = register(client)["token"]
    ride = client.post("/api/rides", json=own_ride(), headers=bearer(token)).json()
    monkeypatch.setenv("KARPUL_REQUIRE_LOGIN", "1")
    r = client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Gost"})
    assert r.status_code == 401


# --- your own account --------------------------------------------------------


def test_renaming_yourself_renames_you_on_the_board(client, session_factory):
    ana = register(client)["token"]
    marko = register(client, MARKO)["token"]
    ride = client.post("/api/rides", json=own_ride(), headers=bearer(ana)).json()
    client.post(
        f"/api/rides/{ride['id']}/bookings",
        json={"passenger_name": "Marko Jovanović"},
        headers=bearer(marko),
    )

    r = client.patch("/api/auth/me", json={"last_name": "Marković"}, headers=bearer(ana))
    assert r.status_code == 200, r.text
    assert r.json()["display_name"] == "Ana Marković"

    after = client.get(f"/api/rides/{ride['id']}").json()
    assert after["driver_name"] == "Ana Marković"

    # And the passenger of the other account is untouched.
    assert [b["passenger_name"] for b in after["bookings"]] == ["Marko Jovanović"]

    # The renamed driver can still edit the ride, which is the point.
    assert client.patch(f"/api/rides/{ride['id']}", json={"seats": 2}, headers=bearer(ana)).status_code == 200

    with session_factory() as s:
        assert s.exec(select(Ride)).one().driver_name == "Ana Marković"
        assert s.exec(select(Booking)).one().passenger_name == "Marko Jovanović"


def test_renaming_a_passenger_moves_their_seat_with_them(client):
    ana = register(client)["token"]
    marko = register(client, MARKO)["token"]
    ride = client.post("/api/rides", json=own_ride(), headers=bearer(ana)).json()
    client.post(
        f"/api/rides/{ride['id']}/bookings",
        json={"passenger_name": "Marko Jovanović"},
        headers=bearer(marko),
    )
    client.patch("/api/auth/me", json={"first_name": "Marco"}, headers=bearer(marko))
    after = client.get(f"/api/rides/{ride['id']}").json()
    assert [b["passenger_name"] for b in after["bookings"]] == ["Marco Jovanović"]


def test_you_cannot_rename_yourself_onto_someone_else(client):
    ana = register(client)["token"]
    register(client, MARKO)
    r = client.patch(
        "/api/auth/me", json={"first_name": "Marko", "last_name": "Jovanović"}, headers=bearer(ana)
    )
    assert r.status_code == 409


def test_changing_the_email(client):
    ana = register(client)["token"]
    register(client, MARKO)
    assert client.patch("/api/auth/me", json={"email": "marko@example.com"}, headers=bearer(ana)).status_code == 409
    r = client.patch("/api/auth/me", json={"email": "Ana.New@Example.com"}, headers=bearer(ana))
    assert r.status_code == 200
    assert r.json()["email"] == "ana.new@example.com"
    assert client.post("/api/auth/login", json={"login": "ana.new@example.com", "password": ANA["password"]}).status_code == 200


def test_changing_the_password_needs_the_old_one_and_drops_other_browsers(client):
    first = register(client)["token"]
    second = client.post("/api/auth/login", json={"login": "ana", "password": ANA["password"]}).json()["token"]

    assert client.patch("/api/auth/me", json={"new_password": "brand-new-password"}, headers=bearer(first)).status_code == 422
    wrong = client.patch(
        "/api/auth/me",
        json={"current_password": "not-it", "new_password": "brand-new-password"},
        headers=bearer(first),
    )
    assert wrong.status_code == 403

    ok = client.patch(
        "/api/auth/me",
        json={"current_password": ANA["password"], "new_password": "brand-new-password"},
        headers=bearer(first),
    )
    assert ok.status_code == 200
    # This browser stays signed in; the other one is out.
    assert client.get("/api/auth/me", headers=bearer(first)).status_code == 200
    assert client.get("/api/auth/me", headers=bearer(second)).status_code == 401
    assert client.post("/api/auth/login", json={"login": "ana", "password": ANA["password"]}).status_code == 401
    assert client.post("/api/auth/login", json={"login": "ana", "password": "brand-new-password"}).status_code == 200


def test_the_password_is_never_stored_in_the_clear(client, session_factory):
    from app.models import User

    register(client)
    with session_factory() as s:
        user = s.exec(select(User)).one()
    assert ANA["password"] not in user.password_hash
    assert user.password_hash.startswith("pbkdf2_sha256$")
    assert auth.verify_password(ANA["password"], user.password_hash)
    assert not auth.verify_password("something else", user.password_hash)


def test_the_token_is_stored_only_as_a_hash(client, session_factory):
    token = register(client)["token"]
    with session_factory() as s:
        row = s.exec(select(AuthSession)).one()
    assert token not in row.token_hash
    assert row.token_hash == auth.hash_token(token)
