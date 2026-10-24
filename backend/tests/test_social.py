"""Waiting for a seat, a ride's thread, and asking for a ride."""

from datetime import date, time, timedelta

import pytest

from app import push as push_module

TOMORROW = (date.today() + timedelta(days=1)).isoformat()


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
        "seats": 1,
    }
    base.update(overrides)
    return base


def as_(name):
    return {"X-User-Name": name}


@pytest.fixture()
def sent(monkeypatch):
    """Push switched on, with every notification captured instead of sent:
    (kind, the accounts it was addressed to, its arguments)."""
    out = []

    def fake_notify(session, user_ids, kind, ride, **args):
        out.append((kind, sorted(uid for uid in user_ids if uid is not None), args))
        return 0

    for module in ("app.routers.rides",):
        monkeypatch.setattr(f"{module}.notify", fake_notify)
    return out


def user_id(client, name):
    return client.get("/api/auth/me", headers=as_(name)).json()["id"]


# --- the waiting list --------------------------------------------------------


def test_waiting_for_a_full_car_and_getting_the_seat_when_it_frees_up(client, sent):
    ride = client.post("/api/rides", json=own_ride(stops=["Liman"])).json()
    url = f"/api/rides/{ride['id']}"
    marko = client.post(f"{url}/bookings", json={"passenger_name": "Marko"}).json()["bookings"][0]["id"]

    # Free seats: get in, do not queue.
    assert client.post(f"{url}/waitlist", json={}, headers=as_("Mila")).status_code == 201
    r = client.post(f"{url}/waitlist", json={"pickup": "Liman"}, headers=as_("Bojan"))
    assert r.status_code == 201
    assert [w["name"] for w in r.json()["waitlist"]] == ["Mila", "Bojan"]
    assert client.post(f"{url}/waitlist", json={}, headers=as_("Bojan")).status_code == 409
    assert client.post(f"{url}/waitlist", json={}, headers=as_("Ana")).status_code == 409
    assert client.post(f"{url}/waitlist", json={}, headers=as_("Marko")).status_code == 409

    r = client.delete(f"{url}/bookings/{marko}", headers=as_("Marko"))
    assert r.status_code == 200
    body = r.json()
    assert [b["passenger_name"] for b in body["bookings"]] == ["Mila"]
    assert [w["name"] for w in body["waitlist"]] == ["Bojan"]
    assert ("seat_freed", [user_id(client, "Mila")], {"driver": "Ana"}) in sent


def test_a_free_seat_is_refused_to_the_queue(client):
    ride = client.post("/api/rides", json=own_ride(seats=2)).json()
    r = client.post(f"/api/rides/{ride['id']}/waitlist", json={}, headers=as_("Mila"))
    assert r.status_code == 409 and "free seats" in r.json()["detail"]


def test_more_seats_move_the_queue_up_with_their_pickup(client, sent):
    ride = client.post("/api/rides", json=own_ride(stops=["Liman"])).json()
    url = f"/api/rides/{ride['id']}"
    client.post(f"{url}/bookings", json={"passenger_name": "Marko"})
    client.post(f"{url}/waitlist", json={"pickup": "Liman"}, headers=as_("Bojan"))
    r = client.patch(url, json={"seats": 3}, headers=as_("Ana"))
    assert r.status_code == 200
    seats = {b["passenger_name"]: b["pickup"] for b in r.json()["bookings"]}
    assert seats == {"Marko": "", "Bojan": "Liman"}
    assert r.json()["waitlist"] == []


def test_whoever_found_another_car_drops_out_of_the_queue(client):
    full = client.post("/api/rides", json=own_ride()).json()
    other = client.post("/api/rides", json=own_ride(driver_name="Vuk", car_name="Red Clio", seats=3)).json()
    client.post(f"/api/rides/{full['id']}/bookings", json={"passenger_name": "Marko"})
    client.post(f"/api/rides/{full['id']}/waitlist", json={}, headers=as_("Bojan"))
    client.post(f"/api/rides/{full['id']}/waitlist", json={}, headers=as_("Mila"))

    # Bojan gets into Vuk's car: he stops waiting for Ana's.
    client.post(f"/api/rides/{other['id']}/bookings", json={"passenger_name": "Bojan"})
    queue = client.get(f"/api/rides/{full['id']}").json()["waitlist"]
    assert [w["name"] for w in queue] == ["Mila"]


def test_leaving_the_queue_yourself_or_by_the_driver(client):
    ride = client.post("/api/rides", json=own_ride()).json()
    url = f"/api/rides/{ride['id']}"
    client.post(f"{url}/bookings", json={"passenger_name": "Marko"})
    mila = client.post(f"{url}/waitlist", json={}, headers=as_("Mila")).json()["waitlist"][0]["id"]
    bojan = client.post(f"{url}/waitlist", json={}, headers=as_("Bojan")).json()["waitlist"][1]["id"]

    assert client.delete(f"{url}/waitlist/{mila}", headers=as_("Bojan")).status_code == 403
    assert client.delete(f"{url}/waitlist/{mila}", headers=as_("Mila")).status_code == 200
    r = client.delete(f"{url}/waitlist/{bojan}", headers=as_("Ana"))
    assert r.status_code == 200 and r.json()["waitlist"] == []
    assert client.delete(f"{url}/waitlist/{bojan}", headers=as_("Ana")).status_code == 404


# --- the ride's thread -------------------------------------------------------


def test_a_ride_has_a_thread_and_the_car_is_told(client, sent):
    ride = client.post("/api/rides", json=own_ride(seats=2)).json()
    url = f"/api/rides/{ride['id']}"
    client.post(f"{url}/bookings", json={"passenger_name": "Marko"})

    r = client.post(f"{url}/messages", json={"body": "  Running   five minutes late \n\n\n\n sorry "}, headers=as_("Ana"))
    assert r.status_code == 201, r.text
    assert r.json()["body"] == "Running five minutes late\n\nsorry"
    assert r.json()["author_name"] == "Ana"
    # A colleague who is not in the car may ask too.
    client.post(f"{url}/messages", json={"body": "Can you stop at Liman?"}, headers=as_("Mila"))

    thread = client.get(f"{url}/messages").json()
    assert [m["author_name"] for m in thread] == ["Ana", "Mila"]
    assert client.get(url).json()["message_count"] == 2
    board = client.get("/api/rides", params={"date": TOMORROW}).json()
    assert board[0]["message_count"] == 2

    told = [(kind, people) for kind, people, _ in sent if kind == "message"]
    assert told == [
        ("message", [user_id(client, "Marko")]),
        ("message", sorted([user_id(client, "Ana"), user_id(client, "Marko")])),
    ]
    assert client.post(f"{url}/messages", json={"body": "   "}, headers=as_("Ana")).status_code == 422
    assert client.post(f"{url}/messages", json={"body": "x" * 501}, headers=as_("Ana")).status_code == 422


def test_messages_are_taken_back_by_their_author_or_the_driver(client):
    ride = client.post("/api/rides", json=own_ride()).json()
    url = f"/api/rides/{ride['id']}"
    mila = client.post(f"{url}/messages", json={"body": "hello"}, headers=as_("Mila")).json()["id"]
    bojan = client.post(f"{url}/messages", json={"body": "hi"}, headers=as_("Bojan")).json()["id"]
    assert client.delete(f"{url}/messages/{mila}", headers=as_("Bojan")).status_code == 403
    assert client.delete(f"{url}/messages/{mila}", headers=as_("Mila")).status_code == 204
    assert client.delete(f"{url}/messages/{bojan}", headers=as_("Ana")).status_code == 204
    assert client.get(f"{url}/messages").json() == []


def test_a_long_message_is_cut_short_in_the_notification(client, sent):
    ride = client.post("/api/rides", json=own_ride()).json()
    client.post(f"/api/rides/{ride['id']}/messages", json={"body": "word " * 60}, headers=as_("Mila"))
    _, _, args = next(s for s in sent if s[0] == "message")
    assert len(args["text"]) <= 80 and args["text"].endswith("…")


def test_removing_a_ride_takes_its_thread_and_queue_with_it(client, session_factory):
    from sqlmodel import select

    from app.models import RideMessage, WaitlistEntry

    ride = client.post("/api/rides", json=own_ride()).json()
    url = f"/api/rides/{ride['id']}"
    client.post(f"{url}/bookings", json={"passenger_name": "Marko"})
    client.post(f"{url}/waitlist", json={}, headers=as_("Mila"))
    client.post(f"{url}/messages", json={"body": "hello"}, headers=as_("Mila"))
    assert client.delete(url, headers=as_("Ana")).status_code == 204
    with session_factory() as s:
        assert s.exec(select(RideMessage)).all() == []
        assert s.exec(select(WaitlistEntry)).all() == []


# --- asking for a ride -------------------------------------------------------


def ask(**overrides):
    base = {"request_date": TOMORROW, "origin": "Novi Sad", "destination": "HQ", "departure_time": "08:00", "note": "  any car  "}
    base.update(overrides)
    return base


def test_asking_for_a_ride_and_a_driver_answering_it(client, sent):
    r = client.post("/api/requests", json=ask(), headers=as_("Mila"))
    assert r.status_code == 201, r.text
    request = r.json()
    assert request["name"] == "Mila" and request["note"] == "any car" and request["ride_id"] is None

    listed = client.get("/api/requests", params={"from": TOMORROW, "to": TOMORROW}).json()
    assert [q["id"] for q in listed] == [request["id"]]

    # The answer is a ride on that day with a seat for her.
    assert client.post("/api/rides", json=own_ride(request_id=request["id"], ride_date=(date.today() + timedelta(days=2)).isoformat())).status_code == 422
    assert client.post("/api/rides", json=own_ride(request_id=request["id"], seats=0)).status_code == 422
    assert client.post("/api/rides", json=own_ride(request_id=request["id"], driver_name="Mila")).status_code == 409
    r = client.post("/api/rides", json=own_ride(request_id=request["id"]))
    assert r.status_code == 201, r.text
    ride = r.json()
    assert [b["passenger_name"] for b in ride["bookings"]] == ["Mila"]
    assert ("request_answered", [user_id(client, "Mila")], {"driver": "Ana"}) in sent

    answered = client.get("/api/requests", params={"from": TOMORROW, "to": TOMORROW}).json()[0]
    assert answered["ride_id"] == ride["id"]
    # Nobody else can answer it twice.
    assert client.post("/api/rides", json=own_ride(request_id=request["id"], driver_name="Vuk")).status_code == 409

    # The ride goes away: the request is open again.
    client.delete(f"/api/rides/{ride['id']}", headers=as_("Ana"))
    assert client.get("/api/requests", params={"from": TOMORROW, "to": TOMORROW}).json()[0]["ride_id"] is None


def test_getting_into_any_car_answers_your_request(client):
    request = client.post("/api/requests", json=ask(), headers=as_("Mila")).json()
    ride = client.post("/api/rides", json=own_ride(seats=2)).json()
    client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Mila"})
    after = client.get("/api/requests", params={"from": TOMORROW, "to": TOMORROW}).json()[0]
    assert after["id"] == request["id"] and after["ride_id"] == ride["id"]


def test_requests_are_withdrawn_by_their_owner_and_bounded(client):
    request = client.post("/api/requests", json=ask(), headers=as_("Mila")).json()
    assert client.delete(f"/api/requests/{request['id']}", headers=as_("Bojan")).status_code == 403
    assert client.delete(f"/api/requests/{request['id']}", headers=as_("Mila")).status_code == 204
    assert client.delete(f"/api/requests/{request['id']}", headers=as_("Mila")).status_code == 404

    yesterday = (date.today() - timedelta(days=1)).isoformat()
    assert client.post("/api/requests", json=ask(request_date=yesterday), headers=as_("Mila")).status_code == 422
    far = (date.today() + timedelta(days=120)).isoformat()
    assert client.post("/api/requests", json=ask(request_date=far), headers=as_("Mila")).status_code == 422
    assert client.post("/api/requests", json=ask(origin="  "), headers=as_("Mila")).status_code == 422
    for i in range(14):
        day = (date.today() + timedelta(days=i + 1)).isoformat()
        assert client.post("/api/requests", json=ask(request_date=day), headers=as_("Mila")).status_code == 201
    assert client.post("/api/requests", json=ask(), headers=as_("Mila")).status_code == 409


def test_request_changes_go_out_live(client):
    with client.websocket_connect("/api/ws") as ws:
        assert ws.receive_json()["type"] == "hello"
        request = client.post("/api/requests", json=ask(), headers=as_("Mila")).json()
        event = ws.receive_json()
        assert event["type"] == "request.saved" and event["request"]["id"] == request["id"]
        client.delete(f"/api/requests/{request['id']}", headers=as_("Mila"))
        assert ws.receive_json() == {"type": "request.deleted", "request_id": request["id"]}


def test_push_wording_for_the_new_notifications():
    from app.models import Ride

    ride = Ride(
        id=7,
        ride_date=date(2026, 9, 10),
        car_type="own",
        car_name="Golf",
        driver_name="Ana",
        origin="Novi Sad",
        destination="HQ",
        departure_time=time(7, 30),
        seats=2,
    )
    assert push_module.ride_message("seat_freed", ride, "en", driver="Ana")["title"] == "A seat freed up: you're in Ana's car"
    assert push_module.ride_message("message", ride, "sr", name="Mila", text="kasnim")["title"] == "Mila: kasnim"
    assert push_module.ride_message("request_answered", ride, "sr", driver="Ana")["title"] == "Ana ti nudi prevoz"
