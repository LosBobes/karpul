"""Push notifications: the encryption on the wire, the subscription store, who
gets told about what, and the departure reminder."""

from datetime import date, datetime, timedelta

import pytest
from sqlmodel import Session

from app import push as push_module
from app.models import Ride
from app.push import Target, deliver_all, ride_message
from app.reminders import send_due_reminders
from app.webpush import Vapid, b64url_decode, b64url_encode, encrypt, generate_private_key_b64, private_key_from_raw

TOMORROW = (date.today() + timedelta(days=1)).isoformat()


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    monkeypatch.delenv("KARPUL_VAPID_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("KARPUL_VAPID_SUBJECT", raising=False)


@pytest.fixture()
def configured(monkeypatch):
    monkeypatch.setenv("KARPUL_VAPID_PRIVATE_KEY", generate_private_key_b64())
    monkeypatch.setenv("KARPUL_VAPID_SUBJECT", "mailto:karpul@example.com")


@pytest.fixture()
def sent(monkeypatch):
    """Capture every message instead of talking to a push service, on this thread."""
    box: list[tuple[Target, dict]] = []

    def fake_deliver(target, message, identity):
        box.append((target, message))
        return 201

    class Now:
        def submit(self, fn, *args):
            fn(*args)

    monkeypatch.setattr(push_module, "deliver", fake_deliver)
    monkeypatch.setattr(push_module, "_executor", Now())
    return box


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


def subscription(endpoint="https://push.example/abc", locale="en"):
    return {
        "endpoint": endpoint,
        "keys": {
            "p256dh": "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
            "auth": "BTBZMqHH6r4Tts7J_aSIgg",
        },
        "locale": locale,
    }


# --- The wire format -----------------------------------------------------------


def test_encryption_matches_the_rfc_8291_test_vector():
    # RFC 8291, section 5.
    plaintext = b"When I grow up, I want to be a watermelon"
    ua_public = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
    auth = "BTBZMqHH6r4Tts7J_aSIgg"
    server_key = private_key_from_raw(b64url_decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"))
    salt = b64url_decode("DGv6ra1nlYgDCS1FRnbzlw")
    body = encrypt(plaintext, ua_public, auth, salt=salt, server_key=server_key)
    assert b64url_encode(body) == (
        "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
    )


def test_vapid_authorization_header_shape():
    identity = Vapid.from_raw(generate_private_key_b64(), "mailto:karpul@example.com")
    header = identity.authorization("https://fcm.googleapis.com/fcm/send/xyz")
    assert header.startswith("vapid t=")
    token, key = header[len("vapid t=") :].split(", k=")
    assert len(token.split(".")) == 3
    assert key == identity.public_key_b64
    assert len(b64url_decode(key)) == 65


# --- Subscriptions ---------------------------------------------------------------


def test_push_off_without_a_key(client):
    assert client.get("/api/push/config").json() == {"enabled": False, "public_key": None}
    r = client.post("/api/push/subscriptions", json=subscription(), headers={"X-User-Name": "Ana"})
    assert r.status_code == 503


def test_subscribe_needs_a_name_and_updates_in_place(client, configured):
    cfg = client.get("/api/push/config").json()
    assert cfg["enabled"] and len(b64url_decode(cfg["public_key"])) == 65
    assert client.post("/api/push/subscriptions", json=subscription()).status_code == 401
    assert client.post("/api/push/subscriptions", json=subscription(), headers={"X-User-Name": "Ana"}).status_code == 201
    # Same endpoint, new name: one row, renamed.
    assert client.post("/api/push/subscriptions", json=subscription(locale="sr"), headers={"X-User-Name": "Ana P"}).status_code == 201
    http = dict(subscription(), endpoint="http://insecure.example/x")
    assert client.post("/api/push/subscriptions", json=http, headers={"X-User-Name": "Ana"}).status_code == 422
    assert client.request("DELETE", "/api/push/subscriptions", json={"endpoint": "https://push.example/abc"}).status_code == 204
    assert client.request("DELETE", "/api/push/subscriptions", json={"endpoint": "https://push.example/abc"}).status_code == 204


# --- Who is told -----------------------------------------------------------------


def test_driver_is_told_when_someone_gets_in_or_out(client, configured, sent):
    client.post("/api/push/subscriptions", json=subscription(), headers={"X-User-Name": "ANA"})
    ride = client.post("/api/rides", json=own_ride()).json()
    r = client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Bojan"})
    assert r.status_code == 201
    assert len(sent) == 1
    target, message = sent[0]
    assert target.endpoint == "https://push.example/abc"
    assert message["title"] == "Bojan got in your car"
    assert "Novi Sad to HQ" in message["body"] and "07:30" in message["body"]
    assert message["url"] == f"/ride/{ride['id']}"

    bid = r.json()["bookings"][0]["id"]
    client.delete(f"/api/rides/{ride['id']}/bookings/{bid}", headers={"X-User-Name": "Bojan"})
    assert sent[-1][1]["title"] == "Bojan got out of your car"

    # The driver putting someone in is not news to the driver.
    client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Mila"}, headers={"X-User-Name": "Ana"})
    assert len(sent) == 2


def test_passengers_are_told_in_their_language_when_the_ride_moves_or_goes(client, configured, sent):
    client.post("/api/push/subscriptions", json=subscription("https://push.example/bojan", locale="sr"), headers={"X-User-Name": "Bojan"})
    client.post("/api/push/subscriptions", json=subscription("https://push.example/mila"), headers={"X-User-Name": "Mila"})
    ride = client.post("/api/rides", json=own_ride()).json()
    rid = ride["id"]
    client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Bojan"})
    client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Mila"})
    assert sent == []  # the driver has no subscription

    # A note is not a change worth a push; a new departure time is.
    client.patch(f"/api/rides/{rid}", json={"notes": "coffee first"}, headers={"X-User-Name": "Ana"})
    assert sent == []
    client.patch(f"/api/rides/{rid}", json={"departure_time": "08:00"}, headers={"X-User-Name": "Ana"})
    titles = sorted((t.endpoint, m["title"]) for t, m in sent)
    assert titles == [
        ("https://push.example/bojan", "Ana je izmenio/la vožnju"),
        ("https://push.example/mila", "Ana changed the ride"),
    ]
    assert "08:00" in sent[0][1]["body"]

    sent.clear()
    client.delete(f"/api/rides/{rid}", headers={"X-User-Name": "Ana"})
    assert sorted(m["title"] for _, m in sent) == ["Ana je uklonio/la vožnju", "Ana removed the ride"]


def test_dead_endpoints_are_forgotten(client, configured, monkeypatch):
    client.post("/api/push/subscriptions", json=subscription(), headers={"X-User-Name": "Ana"})
    forgotten: list[list[str]] = []
    monkeypatch.setattr(push_module, "deliver", lambda target, message, identity: 410)
    monkeypatch.setattr(push_module, "forget", lambda endpoints: forgotten.append(endpoints))
    identity = push_module.vapid()
    dead = deliver_all([Target("https://push.example/abc", "k", "a", "en")], lambda locale: {"title": "x"}, identity)
    assert dead == ["https://push.example/abc"] and forgotten == [dead]


def test_ride_message_wording():
    ride = Ride(
        id=7, ride_date=date(2026, 9, 14), car_type="own", car_name="Golf", driver_name="Ana",
        origin="Liman", destination="HQ", departure_time=datetime.strptime("07:30", "%H:%M").time(), seats=2,
    )
    assert ride_message("leaving_soon", ride, "en", minutes=30) == {
        "title": "Leaving in 30 min",
        "body": "Mon 14 Sep 07:30, Liman to HQ",
        "url": "/ride/7",
        "tag": "ride-7-leaving_soon",
    }
    assert ride_message("leaving_soon", ride, "sr", minutes=5)["title"] == "Polazak za 5 min"


# --- Reminders -------------------------------------------------------------------


def test_departure_reminder_goes_out_once(client, configured, sent):
    from app.database import get_session
    from app.main import app

    client.post("/api/push/subscriptions", json=subscription("https://push.example/ana"), headers={"X-User-Name": "Ana"})
    client.post("/api/push/subscriptions", json=subscription("https://push.example/bojan"), headers={"X-User-Name": "Bojan"})
    client.post("/api/push/subscriptions", json=subscription("https://push.example/mila"), headers={"X-User-Name": "Mila"})
    today = date.today().isoformat()
    soon = client.post("/api/rides", json=own_ride(ride_date=today, departure_time="09:00", return_time="10:00")).json()
    later = client.post("/api/rides", json=own_ride(ride_date=today, driver_name="Mila", departure_time="15:00", return_time="16:00")).json()
    client.post(f"/api/rides/{soon['id']}/bookings", json={"passenger_name": "Bojan"})
    sent.clear()

    session_gen = app.dependency_overrides[get_session]()
    session: Session = next(session_gen)
    now = datetime.combine(date.today(), datetime.strptime("08:40", "%H:%M").time())
    assert send_due_reminders(session, now) == 1
    assert sorted(t.endpoint for t, _ in sent) == ["https://push.example/ana", "https://push.example/bojan"]
    assert sent[0][1]["title"] == "Leaving in 20 min"
    # Second tick: already sent; the later ride is not due yet.
    assert send_due_reminders(session, now) == 0
    assert send_due_reminders(session, now + timedelta(hours=6)) == 1
    assert sent[-1][1]["title"] == "Leaving in 20 min" and sent[-1][1]["url"] == f"/ride/{later['id']}"
    # A ride whose departure has passed is never reminded late.
    session.close()
