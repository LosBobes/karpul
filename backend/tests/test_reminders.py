"""Reminders (app/reminders.py): each person's own lead before departure, and
the odometer asked for once a shared car should be back."""

from datetime import date, datetime

import pytest

from app import push as push_module
from app.push import Target
from app.reminders import send_due_reminders
from app.webpush import generate_private_key_b64

TODAY = date.today()


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setenv("KARPUL_VAPID_PRIVATE_KEY", generate_private_key_b64())


@pytest.fixture()
def sent(monkeypatch):
    """Every push, delivered on this thread: (endpoint, message)."""
    box: list[tuple[str, dict]] = []

    def fake_deliver(target: Target, message, identity):
        box.append((target.endpoint, message))
        return 201

    class Now:
        def submit(self, fn, *args):
            fn(*args)

    monkeypatch.setattr(push_module, "deliver", fake_deliver)
    monkeypatch.setattr(push_module, "_executor", Now())
    return box


def subscription(endpoint):
    return {
        "endpoint": endpoint,
        "keys": {
            "p256dh": "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
            "auth": "BTBZMqHH6r4Tts7J_aSIgg",
        },
        "locale": "en",
    }


def subscribe(client, name):
    client.post("/api/push/subscriptions", json=subscription(f"https://push.example/{name}"), headers={"X-User-Name": name})


@pytest.fixture()
def session(client):
    from app.database import get_session
    from app.main import app

    gen = app.dependency_overrides[get_session]()
    s = next(gen)
    yield s
    s.close()


def at(hhmm: str) -> datetime:
    return datetime.combine(TODAY, datetime.strptime(hhmm, "%H:%M").time())


def own_ride(**overrides):
    base = {
        "ride_date": TODAY.isoformat(),
        "car_type": "own",
        "car_name": "Blue Golf",
        "driver_name": "Ana",
        "origin": "Novi Sad",
        "destination": "HQ",
        "departure_time": "09:00",
        "return_time": "16:30",
        "seats": 2,
    }
    base.update(overrides)
    return base


def test_everyone_gets_the_reminder_at_their_own_lead(client, sent, session):
    for name in ("Ana", "Bojan", "Ceca"):
        subscribe(client, name)
    client.put("/api/push/preferences", json={"muted": [], "remind_before": 60}, headers={"X-User-Name": "Bojan"})
    client.put("/api/push/preferences", json={"muted": [], "remind_before": 15}, headers={"X-User-Name": "Ceca"})
    assert client.get("/api/push/preferences", headers={"X-User-Name": "Ceca"}).json()["remind_before"] == 15
    ride = client.post("/api/rides", json=own_ride()).json()
    client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Bojan"})
    client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Ceca"})
    sent.clear()

    # 08:00: only Bojan's hour has come.
    assert send_due_reminders(session, at("08:00")) == 1
    assert [e for e, _ in sent] == ["https://push.example/Bojan"]
    assert sent[0][1]["title"] == "Leaving in 60 min"
    # 08:31: Ana's half hour. Bojan is not told twice.
    assert send_due_reminders(session, at("08:31")) == 1
    assert [e for e, _ in sent][1:] == ["https://push.example/Ana"]
    assert sent[-1][1]["title"] == "Leaving in 29 min"
    assert send_due_reminders(session, at("08:40")) == 0
    # 08:46: Ceca's quarter hour, and the ride is done with.
    assert send_due_reminders(session, at("08:46")) == 1
    assert [e for e, _ in sent][2:] == ["https://push.example/Ceca"]
    assert send_due_reminders(session, at("08:50")) == 0
    assert client.get(f"/api/rides/{ride['id']}", headers={"X-User-Name": "Ana"}).json()["id"] == ride["id"]


def test_a_ride_that_left_is_never_reminded_late(client, sent, session):
    subscribe(client, "Ana")
    client.post("/api/rides", json=own_ride(departure_time="07:00"))
    sent.clear()
    assert send_due_reminders(session, at("07:05")) == 0
    assert send_due_reminders(session, at("06:50")) == 0
    assert sent == []


def test_a_nonsense_lead_is_refused(client):
    r = client.put("/api/push/preferences", json={"muted": [], "remind_before": 45}, headers={"X-User-Name": "Ana"})
    assert r.status_code == 422


# --- note the odometer ---------------------------------------------------------


def shared(car_id, **overrides):
    base = {
        "ride_date": TODAY.isoformat(),
        "car_type": "corporate",
        "corporate_car_id": car_id,
        "car_name": "",
        "driver_name": "Ana",
        "origin": "Beograd",
        "destination": "Novi Sad",
        "departure_time": "08:00",
        "return_time": "12:00",
        "seats": 3,
    }
    base.update(overrides)
    return base


def test_the_driver_is_asked_for_the_odometer_once_the_car_should_be_back(client, sent, session):
    subscribe(client, "Ana")
    subscribe(client, "Marko")
    car = client.get("/api/cars/corporate").json()[0]
    ride = client.post("/api/rides", json=shared(car["id"])).json()
    marko = client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Marko"}).json()["bookings"][0]["id"]
    sent.clear()
    # Still out, or just back: nothing yet.
    send_due_reminders(session, at("12:10"))
    assert sent == []
    # Marko took the wheel: he is asked too, with the driver.
    client.post(f"/api/rides/{ride['id']}/legs", json={"km": 1000}, headers={"X-User-Name": "Ana"})
    client.post(f"/api/rides/{ride['id']}/legs", json={"km": 1090, "booking_id": marko}, headers={"X-User-Name": "Ana"})
    send_due_reminders(session, at("12:25"))
    assert sorted(e for e, _ in sent) == ["https://push.example/Ana", "https://push.example/Marko"]
    assert sent[0][1]["title"] == f"{car['name']} back? Note the odometer"
    assert sent[0][1]["url"] == f"/ride/{ride['id']}"
    # Once only.
    send_due_reminders(session, at("13:00"))
    assert len(sent) == 2


def test_no_nudge_when_the_odometer_is_closed_or_the_ride_is_pending(client, sent, session, admin_auth):
    subscribe(client, "Ana")
    car = client.get("/api/cars/corporate").json()[0]
    ride = client.post("/api/rides", json=shared(car["id"])).json()
    client.post(f"/api/rides/{ride['id']}/legs", json={"km": 1000}, headers={"X-User-Name": "Ana"})
    client.post(f"/api/rides/{ride['id']}/legs/end", json={"km": 1182}, headers={"X-User-Name": "Ana"})
    sent.clear()
    send_due_reminders(session, at("13:00"))
    assert sent == []
    # A second shared car the same day needs approval; pending, it is not asked about.
    asked = client.post("/api/rides", json=shared(car["id"], departure_time="14:00", return_time="15:00", request_approval=True)).json()
    assert asked["approval"] == "pending"
    send_due_reminders(session, at("16:00"))
    assert sent == []
