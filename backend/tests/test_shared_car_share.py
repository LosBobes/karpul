"""A shared car is rationed: one ride a week per driver, past that an admin approves."""

from datetime import date, timedelta

import pytest

from app.services import LIMIT_DAY, LIMIT_STRETCH, LIMIT_WEEK

# A Monday well ahead, so a week's rides never straddle today.
MONDAY = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 + 7)


def shared(car_id, day=MONDAY, **overrides):
    base = {
        "ride_date": day.isoformat(),
        "car_type": "corporate",
        "corporate_car_id": car_id,
        "car_name": "",
        "driver_name": "Ana Petrović",
        "origin": "Novi Sad",
        "destination": "HQ",
        "departure_time": "08:00",
        "return_time": "12:00",
        "seats": 2,
    }
    base.update(overrides)
    return base


@pytest.fixture()
def sent(monkeypatch):
    out = []

    def fake_notify(session, user_ids, kind, ride, **args):
        out.append((kind, sorted(uid for uid in user_ids if uid is not None), args))
        return 0

    monkeypatch.setattr("app.routers.rides.notify", fake_notify)
    return out


@pytest.fixture()
def cars(client):
    return client.get("/api/cars/corporate").json()


def user_id(client, name):
    return client.get("/api/auth/me", headers={"X-User-Name": name}).json()["id"]


def test_one_shared_car_a_week_then_a_refusal_that_names_the_way_out(client, cars):
    first = client.post("/api/rides", json=shared(cars[0]["id"]))
    assert first.status_code == 201, first.text
    assert first.json()["approval"] == ""

    # Another car, another day of the same week: still the same person's second shared car.
    again = client.post("/api/rides", json=shared(cars[1]["id"], MONDAY + timedelta(days=2)))
    assert again.status_code == 409
    assert again.json()["detail"] == LIMIT_WEEK

    # The same day says so (it is the nearer reason).
    same_day = client.post("/api/rides", json=shared(cars[1]["id"], departure_time="14:00", return_time="16:00"))
    assert same_day.status_code == 409
    assert same_day.json()["detail"] == LIMIT_DAY

    # Next week is a new share, and own cars are never rationed.
    assert client.post("/api/rides", json=shared(cars[0]["id"], MONDAY + timedelta(days=7))).status_code == 201
    own = shared(None, MONDAY + timedelta(days=1), car_type="own", car_name="Blue Golf")
    assert client.post("/api/rides", json=own).status_code == 201


def test_asking_for_approval_adds_the_ride_as_pending_and_tells_the_admins(client, cars, admin_auth, sent):
    ada = client.get("/api/auth/me", headers=admin_auth).json()["id"]
    ana = user_id(client, "Ana Petrović")
    client.post("/api/rides", json=shared(cars[0]["id"]))
    sent.clear()
    res = client.post("/api/rides", json=shared(cars[1]["id"], MONDAY + timedelta(days=2), request_approval=True))
    assert res.status_code == 201, res.text
    ride = res.json()
    assert ride["approval"] == "pending"
    assert sent == [("approval_requested", [ada], {"name": "Ana Petrović"})]

    # The pending ride counts: a third one is refused the same way.
    third = client.post("/api/rides", json=shared(cars[2]["id"], MONDAY + timedelta(days=3), request_approval=True))
    assert third.status_code == 201  # asked again: pending again
    assert third.json()["approval"] == "pending"

    # Approving is the admin's, and only a pending ride can be approved.
    assert client.post(f"/api/rides/{ride['id']}/approve", headers={"X-User-Name": "Ana Petrović"}).status_code == 403
    sent.clear()
    ok = client.post(f"/api/rides/{ride['id']}/approve", headers=admin_auth)
    assert ok.status_code == 200, ok.text
    assert ok.json()["approval"] == "approved"
    assert sent == [("ride_approved", [ana], {"name": "Ada Admin"})]
    twice = client.post(f"/api/rides/{ride['id']}/approve", headers=admin_auth)
    assert twice.status_code == 409
    assert twice.json()["detail"] == "This ride is not waiting for approval"

    # Declining removes the ride and tells the driver once, as a decline.
    other = third.json()
    client.post(f"/api/rides/{other['id']}/bookings", json={"passenger_name": "Mila Ilić"})
    mila = user_id(client, "Mila Ilić")
    sent.clear()
    assert client.post(f"/api/rides/{other['id']}/decline", headers=admin_auth).status_code == 204
    assert client.get(f"/api/rides/{other['id']}").status_code == 404
    assert sent == [
        ("ride_declined", [ana], {"name": "Ada Admin"}),
        ("ride_removed", [mila], {"driver": "Ada Admin", "alternatives": 0, "url": "/"}),
    ]

    # Both decisions are in the admin's log.
    log = client.get("/api/admin/log", headers=admin_auth).json()
    assert [line["action"] for line in log[:2]] == ["ride_declined", "ride_approved"]
    assert all(line["subject"] == "Ana Petrović" for line in log[:2])


def test_an_admin_is_the_approval(client, cars, admin_auth, sent):
    marko = user_id(client, "Marko Jovanović")
    client.post("/api/rides", json=shared(cars[0]["id"], driver_name="Marko Jovanović"))
    # An admin adding Marko's second shared car of the week: approved by the act.
    res = client.post("/api/rides", json=shared(cars[1]["id"], MONDAY + timedelta(days=1), driver_id=marko), headers=admin_auth)
    assert res.status_code == 201, res.text
    assert res.json()["approval"] == "approved"
    assert not any(kind == "approval_requested" for kind, _, _ in sent)
    # And an admin's own rides are never refused.
    client.post("/api/rides", json=shared(cars[2]["id"]), headers=admin_auth)
    mine = client.post("/api/rides", json=shared(cars[0]["id"], MONDAY + timedelta(days=4)), headers=admin_auth)
    assert mine.status_code == 201
    assert mine.json()["approval"] == "approved"


def test_moving_a_ride_is_held_to_the_share_too(client, cars):
    ana = {"X-User-Name": "Ana Petrović"}
    first = client.post("/api/rides", json=shared(cars[0]["id"])).json()
    second = client.post("/api/rides", json=shared(cars[1]["id"], MONDAY + timedelta(days=7))).json()
    # Into the week of the first: refused.
    moved = client.patch(f"/api/rides/{second['id']}", json={"ride_date": (MONDAY + timedelta(days=2)).isoformat()}, headers=ana)
    assert moved.status_code == 409
    assert moved.json()["detail"] == LIMIT_WEEK
    # Within its own week, or to an own car (which also drops any approval): fine.
    assert client.patch(f"/api/rides/{second['id']}", json={"ride_date": (MONDAY + timedelta(days=9)).isoformat()}, headers=ana).status_code == 200
    own = client.patch(f"/api/rides/{first['id']}", json={"car_type": "own", "car_name": "Blue Golf", "corporate_car_id": None}, headers=ana)
    assert own.status_code == 200, own.text
    assert own.json()["approval"] == ""


def test_a_pending_ride_holds_no_slot_until_approved(client, cars, admin_auth):
    car = cars[0]["id"]
    # Ana's first shared car this week, then a second one asked for: pending.
    client.post("/api/rides", json=shared(cars[1]["id"]))
    pending = client.post("/api/rides", json=shared(car, MONDAY + timedelta(days=2), request_approval=True)).json()
    assert pending["approval"] == "pending"

    # The car is still free in that window for anyone within their share.
    taken = client.post("/api/rides", json=shared(car, MONDAY + timedelta(days=2), driver_name="Mila Ilić"))
    assert taken.status_code == 201, taken.text

    # So approving now would double-book it: refused, and it stays pending.
    res = client.post(f"/api/rides/{pending['id']}/approve", headers=admin_auth)
    assert res.status_code == 409
    assert "already booked by Mila Ilić" in res.json()["detail"]
    assert client.get(f"/api/rides/{pending['id']}").json()["approval"] == "pending"

    # Once Mila's ride goes, the approval goes through.
    client.delete(f"/api/rides/{taken.json()['id']}", headers={"X-User-Name": "Mila Ilić"})
    assert client.post(f"/api/rides/{pending['id']}/approve", headers=admin_auth).status_code == 200


def test_the_admins_list_of_rides_waiting_for_approval(client, cars, admin_auth):
    client.post("/api/rides", json=shared(cars[0]["id"]))
    later = client.post("/api/rides", json=shared(cars[1]["id"], MONDAY + timedelta(days=4), request_approval=True)).json()
    sooner = client.post("/api/rides", json=shared(cars[2]["id"], MONDAY + timedelta(days=1), request_approval=True)).json()
    listed = client.get("/api/admin/approvals", headers=admin_auth)
    assert listed.status_code == 200
    assert [r["id"] for r in listed.json()] == [sooner["id"], later["id"]]
    client.post(f"/api/rides/{sooner['id']}/approve", headers=admin_auth)
    assert [r["id"] for r in client.get("/api/admin/approvals", headers=admin_auth).json()] == [later["id"]]
    assert client.get("/api/admin/approvals", headers={"X-User-Name": "Ana Petrović"}).status_code == 403


# A Sunday then the Monday after: two weeks, so the weekly share allows both
# and only the stretch between them is in question.
SUNDAY = MONDAY + timedelta(days=6)
NEXT_MONDAY = MONDAY + timedelta(days=7)


def test_rides_that_join_up_past_24_hours_need_an_admin(client, cars):
    # Out on Sunday at 08:00 with no return, which holds the car to midnight...
    assert client.post("/api/rides", json=shared(cars[0]["id"], SUNDAY, return_time=None)).status_code == 201
    # ...and on from 00:00 on Monday, in another shared car even: 26 hours in a row.
    on = client.post("/api/rides", json=shared(cars[1]["id"], NEXT_MONDAY, departure_time="00:00", return_time="10:00"))
    assert on.status_code == 409
    assert on.json()["detail"] == LIMIT_STRETCH
    asked = client.post("/api/rides", json=shared(cars[1]["id"], NEXT_MONDAY, departure_time="00:00", return_time="10:00", request_approval=True))
    assert asked.status_code == 201 and asked.json()["approval"] == "pending"


def test_24_hours_in_a_row_or_a_break_between_is_within_the_share(client, cars):
    # Sunday 10:00 to Monday 10:00 is exactly 24 hours.
    assert client.post("/api/rides", json=shared(cars[0]["id"], SUNDAY, departure_time="10:00", return_time=None)).status_code == 201
    exact = client.post("/api/rides", json=shared(cars[0]["id"], NEXT_MONDAY, departure_time="00:00", return_time="10:00"))
    assert exact.status_code == 201 and exact.json()["approval"] == ""
    # Someone else's rides never join up with yours.
    other = shared(cars[1]["id"], NEXT_MONDAY + timedelta(days=7), driver_name="Mila Ilić", return_time=None)
    assert client.post("/api/rides", json=other).status_code == 201


def test_a_break_between_the_rides_is_not_a_stretch(client, cars):
    assert client.post("/api/rides", json=shared(cars[0]["id"], SUNDAY, departure_time="06:00", return_time="23:30")).status_code == 201
    later = client.post("/api/rides", json=shared(cars[0]["id"], NEXT_MONDAY, departure_time="00:00", return_time="20:00"))
    assert later.status_code == 201 and later.json()["approval"] == ""


def test_stretching_a_ride_into_the_next_one_is_held_to_it_too(client, cars):
    sunday = client.post("/api/rides", json=shared(cars[0]["id"], SUNDAY)).json()
    assert client.post("/api/rides", json=shared(cars[0]["id"], NEXT_MONDAY, departure_time="00:00", return_time="10:00")).status_code == 201
    longer = client.patch(f"/api/rides/{sunday['id']}", json={"return_time": None}, headers=client.auth("Ana Petrović"))
    assert longer.status_code == 409
    assert longer.json()["detail"] == LIMIT_STRETCH


def test_an_admin_adding_a_long_stretch_is_the_approval(client, cars, admin_auth):
    assert client.post("/api/rides", json=shared(cars[0]["id"], SUNDAY, return_time=None), headers=admin_auth).status_code == 201
    on = client.post("/api/rides", json=shared(cars[0]["id"], NEXT_MONDAY, departure_time="00:00", return_time="10:00"), headers=admin_auth)
    assert on.status_code == 201 and on.json()["approval"] == "approved"
