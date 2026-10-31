"""A shared car's state (app/carstate.py): the last reading, the last report,
and the guess for the rides since."""

from datetime import date, datetime, timedelta

import pytest

from app import push as push_module
from app.carstate import SOC_PER_KM, car_states
from app.webpush import generate_private_key_b64

TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)
ANA = {"X-User-Name": "Ana"}


def shared(car_id, day=TODAY, **overrides):
    base = {
        "ride_date": day.isoformat(),
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


@pytest.fixture()
def car(client):
    return client.get("/api/cars/corporate").json()[0]


def state_of(session_factory, car, now=None):
    """The car's state as the service computes it, read on a session of its
    own (one held open across API calls would sit on the test connection)."""
    now = now or datetime.combine(TODAY, datetime.strptime("20:00", "%H:%M").time())
    with session_factory() as session:
        state = next(s for s in car_states(session, now) if s["car"].id == car["id"])
        state["recent"] = [(p.ride_id, p.odometer_km) for p in state["recent"]]
        return state


def test_nothing_known_about_a_fresh_car(client, car):
    states = client.get("/api/cars/corporate/state", headers=ANA).json()
    mine = next(s for s in states if s["car"]["id"] == car["id"])
    assert mine["odometer"] == {"value": None, "at": None, "by": None, "estimated": False}
    assert mine["issues"]["value"] == ""
    assert mine["recent"] == []
    assert client.anon.get("/api/cars/corporate/state").status_code == 401


def test_bringing_the_car_back_sets_its_state(client, car, session_factory):
    ride = client.post("/api/rides", json=shared(car["id"], YESTERDAY)).json()
    client.post(f"/api/rides/{ride['id']}/legs", json={"km": 12000}, headers=ANA)
    r = client.post(f"/api/rides/{ride['id']}/legs/end", json={"km": 12182, "soc": 60, "clean": True, "issues": ""}, headers=ANA)
    assert r.status_code == 200, r.text
    state = state_of(session_factory, car)
    assert state["odometer"]["value"] == 12182 and state["odometer"]["estimated"] is False and state["odometer"]["by"] == "Ana"
    assert state["soc"]["value"] == 60 and state["soc"]["estimated"] is False
    assert state["clean"]["value"] is True
    assert state["issues"]["value"] == ""
    assert state["recent"][0] == (ride["id"], 12182)


def test_a_ride_without_a_reading_is_guessed_from_its_length(client, car, session_factory):
    first = client.post("/api/rides", json=shared(car["id"], YESTERDAY)).json()
    client.post(f"/api/rides/{first['id']}/legs", json={"km": 12000}, headers=ANA)
    client.post(f"/api/rides/{first['id']}/legs/end", json={"km": 12182, "soc": 80}, headers=ANA)
    # Today's ride, there and back between the offices, over by 20:00, nobody noted anything.
    client.post("/api/rides", json=shared(car["id"], TODAY, driver_name="Marko"))
    state = state_of(session_factory, car)
    assert state["odometer"] == {"value": 12182 + 182, "at": state["odometer"]["at"], "by": "Ana", "estimated": True}
    assert state["soc"]["value"] == max(0, round(80 - 182 * SOC_PER_KM)) and state["soc"]["estimated"] is True
    # Before the ride is over, nothing is guessed.
    morning = datetime.combine(TODAY, datetime.strptime("09:00", "%H:%M").time())
    assert state_of(session_factory, car, morning)["odometer"] == {"value": 12182, "at": state["odometer"]["at"], "by": "Ana", "estimated": False}


def test_a_one_way_ride_counts_once_and_the_drivers_distance_elsewhere(client, car, session_factory):
    first = client.post("/api/rides", json=shared(car["id"], YESTERDAY - timedelta(days=1))).json()
    client.post(f"/api/rides/{first['id']}/legs", json={"km": 500}, headers=ANA)
    client.post(f"/api/rides/{first['id']}/legs/end", json={"km": 682}, headers=ANA)
    # One way yesterday (which holds the car to midnight), out and back to Niš today.
    assert client.post("/api/rides", json=shared(car["id"], YESTERDAY, driver_name="Marko", return_time=None, departure_time="06:00")).status_code == 201
    r = client.post("/api/rides", json=shared(car["id"], TODAY, driver_name="Mila", origin="Novi Sad", destination="Niš", distance_km=150, departure_time="09:00", return_time="13:00"))
    assert r.status_code == 201, r.text
    state = state_of(session_factory, car)
    # 90 one way between the offices, 150 there and 150 back to Niš.
    assert state["odometer"]["value"] == 682 + 90 + 300 and state["odometer"]["estimated"] is True
    # What the guess is made of, for the report's "driven since".
    assert state["odometer_read"] == 682 and state["km_since"] == 90 + 300


def test_a_report_on_its_own_and_what_it_tells_the_admins(client, car, session_factory, admin_auth, monkeypatch):
    monkeypatch.setenv("KARPUL_VAPID_PRIVATE_KEY", generate_private_key_b64())
    box: list[tuple[str, dict]] = []

    class Now:
        def submit(self, fn, *args):
            fn(*args)

    monkeypatch.setattr(push_module, "deliver", lambda target, message, identity: box.append((target.endpoint, message)) or 201)
    monkeypatch.setattr(push_module, "_executor", Now())
    client.post(
        "/api/push/subscriptions",
        json={"endpoint": "https://push.example/ada", "keys": {"p256dh": "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "auth": "BTBZMqHH6r4Tts7J_aSIgg"}, "locale": "sr"},
        headers=admin_auth,
    )

    url = f"/api/cars/corporate/{car['id']}/reports"
    assert client.post(url, json={}, headers=ANA).status_code == 422
    r = client.post(url, json={"clean": False, "issues": "Scratch on the left door"}, headers=ANA)
    assert r.status_code == 201, r.text
    assert r.json()["user_name"] == "Ana" and r.json()["ride_id"] is None
    state = state_of(session_factory, car)
    assert state["clean"]["value"] is False and state["issues"]["value"] == "Scratch on the left door"
    assert [e for e, _ in box] == ["https://push.example/ada"]
    assert box[0][1]["title"] == f"Ana prijavljuje problem sa autom {car['name']}" and box[0][1]["body"] == "Scratch on the left door"

    # A later reading alone leaves the flag; a later word on it clears it.
    client.post(url, json={"odometer_km": 700}, headers={"X-User-Name": "Marko"})
    state = state_of(session_factory, car)
    assert state["issues"]["value"] == "Scratch on the left door" and state["odometer"]["value"] == 700
    client.post(url, json={"clean": True, "issues": ""}, headers={"X-User-Name": "Marko"})
    state = state_of(session_factory, car)
    assert state["clean"]["value"] is True and state["issues"]["value"] == "" and state["issues"]["by"] == "Marko"
    assert len(box) == 1

    # A retired car takes no report.
    client.patch(f"/api/cars/corporate/{car['id']}", json={"active": False}, headers=admin_auth)
    assert client.post(url, json={"clean": True}, headers=ANA).status_code == 409


def test_the_state_goes_out_live(client, car):
    with client.websocket_connect("/api/ws") as ws:
        assert ws.receive_json()["type"] == "hello"
        client.post(f"/api/cars/corporate/{car['id']}/reports", json={"soc": 40}, headers=ANA)
        assert ws.receive_json() == {"type": "cars.state"}


def test_an_admin_puts_a_report_right_or_takes_it_out(client, car, session_factory, admin_auth):
    url = f"/api/cars/corporate/{car['id']}/reports"
    first = client.post(url, json={"odometer_km": 700, "soc": 80, "clean": True}, headers=ANA).json()
    wrong = client.post(url, json={"odometer_km": 7100, "issues": "Warning light"}, headers={"X-User-Name": "Marko"}).json()
    assert state_of(session_factory, car)["odometer"]["value"] == 7100

    edit = f"/api/cars/corporate/reports/{wrong['id']}"
    # Not for a plain user.
    assert client.patch(edit, json={"odometer_km": 710}, headers=ANA).status_code == 403
    assert client.delete(edit, headers=ANA).status_code == 403

    # The reading fixed, the problem cleared; author and time stay.
    r = client.patch(edit, json={"odometer_km": 710, "issues": None}, headers=admin_auth)
    assert r.status_code == 200, r.text
    assert r.json()["odometer_km"] == 710 and r.json()["issues"] is None and r.json()["user_name"] == "Marko"
    state = state_of(session_factory, car)
    assert state["odometer"]["value"] == 710 and state["odometer"]["by"] == "Marko"
    assert state["issues"]["value"] == ""
    # Left saying nothing is a 422: remove it instead.
    assert client.patch(edit, json={"odometer_km": None}, headers=admin_auth).status_code == 422

    assert client.delete(edit, headers=admin_auth).status_code == 204
    state = state_of(session_factory, car)
    assert state["odometer"]["value"] == 700 and state["odometer"]["by"] == "Ana"
    assert client.delete(edit, headers=admin_auth).status_code == 404

    log = client.get("/api/admin/log", headers=admin_auth).json()
    assert [line["action"] for line in log[:2]] == ["car_report_removed", "car_report_edited"]
    assert {c[0] for c in log[1]["changes"]} == {"odometer_km", "issues"}
    assert first["id"] != wrong["id"]


def test_an_edited_report_goes_out_live(client, car, admin_auth):
    report = client.post(f"/api/cars/corporate/{car['id']}/reports", json={"soc": 50}, headers=ANA).json()
    with client.websocket_connect("/api/ws") as ws:
        assert ws.receive_json()["type"] == "hello"
        client.patch(f"/api/cars/corporate/reports/{report['id']}", json={"soc": 55}, headers=admin_auth)
        assert ws.receive_json()["type"] == "cars.state"
