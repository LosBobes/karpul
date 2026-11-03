"""A driver moving the day, a time or the route of a ride with passengers in it
asks them first: the change is made once every one of them agrees."""

from datetime import date, timedelta

import pytest

from tests.conftest import patch_ride_notify

DAY = date.today() + timedelta(days=4)
DRIVER = {"X-User-Name": "Ana Vozač"}
BOJAN = {"X-User-Name": "Bojan Putnik"}
MILA = {"X-User-Name": "Mila Putnik"}


def own(**overrides):
    base = {
        "ride_date": DAY.isoformat(),
        "car_type": "own",
        "car_name": "Blue Golf",
        "driver_name": "Ana Vozač",
        "origin": "Novi Sad",
        "destination": "HQ",
        "departure_time": "07:30",
        "return_time": "16:30",
        "seats": 3,
    }
    base.update(overrides)
    return base


@pytest.fixture()
def sent(monkeypatch):
    out = []

    def fake_notify(session, user_ids, kind, ride=None, **args):
        out.append(kind)
        return 0

    patch_ride_notify(monkeypatch, fake_notify)
    return out


@pytest.fixture()
def ride(client):
    rid = client.post("/api/rides", json=own()).json()["id"]
    client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Bojan Putnik"})
    client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Mila Putnik"})
    return rid


def test_the_change_waits_for_every_passenger(client, ride, sent):
    asked = client.patch(f"/api/rides/{ride}", json={"departure_time": "08:15", "notes": "Back door"}, headers=DRIVER)
    assert asked.status_code == 200, asked.text
    body = asked.json()
    # The note is made at once; the time is asked.
    assert body["notes"] == "Back door"
    assert body["departure_time"] == "07:30:00"
    assert body["proposal"]["fields"] == {"departure_time": "08:15:00"}
    assert body["proposal"]["by"] == "Ana Vozač"
    assert "change_asked" in sent

    one = client.post(f"/api/rides/{ride}/proposal/agree", headers=BOJAN).json()
    assert one["departure_time"] == "07:30:00"
    assert len(one["proposal"]["agreed"]) == 1

    sent.clear()
    both = client.post(f"/api/rides/{ride}/proposal/agree", headers=MILA).json()
    assert both["departure_time"] == "08:15:00"
    assert both["proposal"] is None
    assert sent == ["change_agreed"]


def test_one_no_drops_it(client, ride, sent):
    client.patch(f"/api/rides/{ride}", json={"ride_date": (DAY + timedelta(days=1)).isoformat()}, headers=DRIVER)
    client.post(f"/api/rides/{ride}/proposal/agree", headers=BOJAN)
    no = client.post(f"/api/rides/{ride}/proposal/decline", headers=MILA).json()
    assert no["ride_date"] == DAY.isoformat()
    assert no["proposal"] is None
    assert sent[-1] == "change_declined"


def test_only_the_passengers_answer_and_the_driver_can_withdraw(client, ride):
    client.patch(f"/api/rides/{ride}", json={"destination": "Beograd"}, headers=DRIVER)
    assert client.post(f"/api/rides/{ride}/proposal/agree", headers={"X-User-Name": "Neko Treći"}).status_code == 403
    assert client.post(f"/api/rides/{ride}/proposal/agree", headers=DRIVER).status_code == 403
    gone = client.delete(f"/api/rides/{ride}/proposal", headers=DRIVER).json()
    assert gone["proposal"] is None and gone["destination"] == "HQ"
    refused = client.post(f"/api/rides/{ride}/proposal/agree", headers=BOJAN)
    assert refused.status_code == 409
    assert refused.json()["detail"] == "The driver is not asking for a change"


def test_no_passengers_or_an_admin_changes_it_at_once(client, admin_auth):
    empty = client.post("/api/rides", json=own()).json()
    moved = client.patch(f"/api/rides/{empty['id']}", json={"departure_time": "09:00"}, headers=DRIVER).json()
    assert moved["departure_time"] == "09:00:00" and moved["proposal"] is None

    rid = client.post("/api/rides", json=own(departure_time="06:00", return_time="10:00")).json()["id"]
    client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Bojan Putnik"})
    client.patch(f"/api/rides/{rid}", json={"departure_time": "06:30"}, headers=DRIVER)
    # The office overrides: made at once, and the driver's ask is overtaken.
    by_admin = client.patch(f"/api/rides/{rid}", json={"departure_time": "07:00"}, headers=admin_auth).json()
    assert by_admin["departure_time"] == "07:00:00" and by_admin["proposal"] is None


def test_a_change_the_rules_refuse_is_refused_before_anyone_is_asked(client, ride):
    bad = client.patch(f"/api/rides/{ride}", json={"departure_time": "17:00"}, headers=DRIVER)
    assert bad.status_code == 422
    assert client.get(f"/api/rides/{ride}", headers=DRIVER).json()["proposal"] is None


def test_the_last_one_waited_on_leaving_makes_it(client, ride):
    client.patch(f"/api/rides/{ride}", json={"return_time": "18:00"}, headers=DRIVER)
    client.post(f"/api/rides/{ride}/proposal/agree", headers=BOJAN)
    mila = next(b for b in client.get(f"/api/rides/{ride}", headers=DRIVER).json()["bookings"] if b["passenger_name"] == "Mila Putnik")
    after = client.delete(f"/api/rides/{ride}/bookings/{mila['id']}", headers=MILA).json()
    assert after["return_time"] == "18:00:00" and after["proposal"] is None


def test_a_passenger_suggests_a_time_the_driver_takes_it_and_the_others_agree(client, ride, sent):
    asked = client.post(f"/api/rides/{ride}/proposal/suggest", json={"departure_time": "08:00"}, headers=BOJAN)
    assert asked.status_code == 200, asked.text
    proposal = asked.json()["proposal"]
    assert proposal["suggested"] is True and proposal["by"] == "Bojan Putnik"
    assert sent[-1] == "time_suggested"

    # One ask at a time; the other passenger cannot answer it; the time is unchanged.
    assert client.post(f"/api/rides/{ride}/proposal/suggest", json={"return_time": "17:00"}, headers=MILA).status_code == 409
    assert client.post(f"/api/rides/{ride}/proposal/agree", headers=MILA).status_code == 403

    taken = client.post(f"/api/rides/{ride}/proposal/agree", headers=DRIVER).json()
    assert taken["departure_time"] == "07:30:00"
    assert taken["proposal"]["suggested"] is False and taken["proposal"]["suggested_by"] == "Bojan Putnik"
    assert "suggestion_accepted" in sent and sent[-1] == "change_asked"

    made = client.post(f"/api/rides/{ride}/proposal/agree", headers=MILA).json()
    assert made["departure_time"] == "08:00:00" and made["proposal"] is None


def test_the_driver_declines_a_suggestion_and_a_lone_passenger_still_needs_the_driver(client, sent):
    rid = client.post("/api/rides", json=own()).json()["id"]
    client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Bojan Putnik"})
    client.post(f"/api/rides/{rid}/proposal/suggest", json={"return_time": "15:00"}, headers=BOJAN)
    assert client.post(f"/api/rides/{rid}/proposal/decline", headers=BOJAN).status_code == 403
    kept = client.post(f"/api/rides/{rid}/proposal/decline", headers=DRIVER).json()
    assert kept["return_time"] == "16:30:00" and kept["proposal"] is None
    assert sent[-1] == "suggestion_declined"

    # Nothing new, or a time the rules refuse, is no suggestion.
    same = client.post(f"/api/rides/{rid}/proposal/suggest", json={"departure_time": "07:30"}, headers=BOJAN)
    assert same.status_code == 422
    assert client.post(f"/api/rides/{rid}/proposal/suggest", json={"departure_time": "20:00"}, headers=BOJAN).status_code == 422

    # Accepted with nobody else to ask, it is made at once.
    client.post(f"/api/rides/{rid}/proposal/suggest", json={"return_time": "15:00"}, headers=BOJAN)
    made = client.post(f"/api/rides/{rid}/proposal/agree", headers=DRIVER).json()
    assert made["return_time"] == "15:00:00" and made["proposal"] is None
