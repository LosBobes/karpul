"""Losing a seat is never silent: someone else taking a passenger out writes a
line in the thread, pushes the passenger and whoever put them in (a push that
cannot be muted), and leaves them a notice in the app (`/api/notices`); a ride
removed leaves one too. And a coming ride from the shared car's paper log
takes nobody until its driver confirms it (`Ride.unconfirmed`)."""

from datetime import date, time, timedelta

import pytest
from sqlmodel import Session, select

from app import push
from app.backfill import HOLD_MARKER, MARKER, hold_once
from app.models import Booking, CorporateCar, DataMigration, Ride, User
from tests.conftest import make_person, patch_ride_notify

DAY = date.today() + timedelta(days=3)
ANA = {"X-User-Name": "Ana Petrović"}  # drives
BOB = {"X-User-Name": "Bob Jović"}  # books for himself and for Cid
CID = {"X-User-Name": "Cid Ilić"}
DAN = {"X-User-Name": "Dan Kos"}


def own(**overrides):
    base = {
        "ride_date": DAY.isoformat(),
        "car_type": "own",
        "car_name": "Golf",
        "driver_name": "Ana Petrović",
        "origin": "Beograd",
        "destination": "Novi Sad",
        "departure_time": "08:00",
        "return_time": "18:00",
        "seats": 4,
    }
    base.update(overrides)
    return base


@pytest.fixture()
def sent(monkeypatch):
    out = []

    def fake_notify(session, user_ids, kind, ride=None, **args):
        out.append((kind, sorted(uid for uid in user_ids if uid is not None), args))
        return 0

    patch_ride_notify(monkeypatch, fake_notify)
    return out


def uid(client, headers):
    return client.get("/api/auth/me", headers=headers).json()["id"]


def booking(ride, name):
    return next(b for b in ride["bookings"] if b["passenger_name"] == name)


def bob_and_cid_in(client, **overrides):
    uid(client, CID)  # Cid has an account before Bob puts him in
    ride = client.post("/api/rides", json=own(passengers_manage=True, **overrides), headers=ANA).json()
    assert client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Bob Jović"}, headers=BOB).status_code == 201
    r = client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Cid Ilić"}, headers=BOB)
    assert r.status_code == 201
    return r.json()


def test_the_driver_taking_someone_out_tells_them_and_whoever_put_them_in(client, sent):
    ride = bob_and_cid_in(client)
    bob, cid = uid(client, BOB), uid(client, CID)
    sent.clear()
    r = client.delete(f"/api/rides/{ride['id']}/bookings/{booking(ride, 'Cid Ilić')['id']}", headers=ANA)
    assert r.status_code == 200
    assert ("taken_out", [cid], {"by": "Ana Petrović"}) in sent
    assert ("guest_taken_out", [bob], {"by": "Ana Petrović", "name": "Cid Ilić"}) in sent

    thread = client.get(f"/api/rides/{ride['id']}/messages").json()
    assert thread[-1]["author_name"] == "Ana Petrović"
    assert thread[-1]["removed_name"] == "Cid Ilić"
    assert r.json()["message_count"] == 1
    # It stays: not even its author (the driver) takes it back.
    gone = client.delete(f"/api/rides/{ride['id']}/messages/{thread[-1]['id']}", headers=ANA)
    assert gone.status_code == 409

    mine = client.get("/api/notices", headers=CID).json()
    assert len(mine) == 1
    assert mine[0] | {"id": 0, "created_at": ""} == {
        "id": 0,
        "created_at": "",
        "ride_id": ride["id"],
        "ride_date": DAY.isoformat(),
        "departure_time": "08:00:00",
        "origin": "Beograd",
        "destination": "Novi Sad",
        "kind": "taken_out",
        "passenger_name": "Cid Ilić",
        "yours": True,
        "by_name": "Ana Petrović",
    }
    bobs = client.get("/api/notices", headers=BOB).json()
    assert [(n["passenger_name"], n["yours"]) for n in bobs] == [("Cid Ilić", False)]
    # Nobody else's to see, and gone once seen.
    assert client.post(f"/api/notices/{mine[0]['id']}/seen", headers=BOB).status_code == 404
    assert client.post(f"/api/notices/{mine[0]['id']}/seen", headers=CID).status_code == 204
    assert client.get("/api/notices", headers=CID).json() == []
    assert client.get("/api/notices", headers=ANA).json() == []


def test_a_passenger_taking_someone_out_is_named_not_the_driver(client, sent):
    ride = bob_and_cid_in(client)
    cid = uid(client, CID)
    sent.clear()
    r = client.delete(f"/api/rides/{ride['id']}/bookings/{booking(ride, 'Bob Jović')['id']}", headers=CID)
    assert r.status_code == 200
    bob = uid(client, BOB)
    assert ("taken_out", [bob], {"by": "Cid Ilić"}) in sent
    # Bob put Cid in, not himself: nobody else to tell.
    assert not [s for s in sent if s[0] == "guest_taken_out"]
    assert client.get(f"/api/rides/{ride['id']}/messages").json()[-1]["author_id"] == cid
    assert client.get("/api/notices", headers=BOB).json()[0]["by_name"] == "Cid Ilić"


def test_a_seat_by_name_tells_whoever_put_it_there(client, engine, sent):
    # Nobody is put in by a bare name any more, but seats from before that
    # (and the paper log's) still go by one.
    ride = client.post("/api/rides", json=own(passengers_manage=True), headers=ANA).json()
    client.post(f"/api/rides/{ride['id']}/bookings", json={"passenger_name": "Bob Jović"}, headers=BOB)
    with Session(engine) as session:
        session.add(Booking(ride_id=ride["id"], passenger_name="Nobody Yet", added_by_id=uid(client, BOB)))
        session.commit()
    ride = client.get(f"/api/rides/{ride['id']}", headers=ANA).json()
    nobody = booking(ride, "Nobody Yet")
    assert nobody["passenger_id"] is None
    sent.clear()
    client.delete(f"/api/rides/{ride['id']}/bookings/{nobody['id']}", headers=ANA)
    assert ("guest_taken_out", [uid(client, BOB)], {"by": "Ana Petrović", "name": "Nobody Yet"}) in sent
    assert [n["passenger_name"] for n in client.get("/api/notices", headers=BOB).json()] == ["Nobody Yet"]


def test_leaving_on_your_own_leaves_no_trace(client, sent):
    ride = bob_and_cid_in(client)
    client.delete(f"/api/rides/{ride['id']}/bookings/{booking(ride, 'Cid Ilić')['id']}", headers=CID)
    assert client.get(f"/api/rides/{ride['id']}/messages").json() == []
    assert client.get("/api/notices", headers=BOB).json() == []
    assert client.get("/api/notices", headers=CID).json() == []


def test_a_ride_removed_leaves_its_passengers_a_notice(client, sent):
    ride = bob_and_cid_in(client)
    assert client.delete(f"/api/rides/{ride['id']}", headers=ANA).status_code == 204
    cids = client.get("/api/notices", headers=CID).json()
    assert [(n["kind"], n["yours"], n["by_name"]) for n in cids] == [("ride_removed", True, "Ana Petrović")]
    bobs = client.get("/api/notices", headers=BOB).json()
    assert sorted((n["passenger_name"], n["yours"]) for n in bobs) == [("Bob Jović", True), ("Cid Ilić", False)]
    assert client.get("/api/notices", headers=ANA).json() == []


def test_a_notice_for_a_day_gone_is_not_shown(client, engine, sent):
    ride = bob_and_cid_in(client)
    client.delete(f"/api/rides/{ride['id']}/bookings/{booking(ride, 'Cid Ilić')['id']}", headers=ANA)
    with Session(engine) as session:
        from app.models import SeatNotice

        for n in session.exec(select(SeatNotice)):
            n.ride_date = date.today() - timedelta(days=1)
            session.add(n)
        session.commit()
    assert client.get("/api/notices", headers=CID).json() == []


def test_losing_a_seat_reaches_someone_who_muted_seats(engine):
    cid, _ = make_person(engine, "Cid Ilić")
    with Session(engine) as session:
        user = session.get(User, cid.id)
        user.push_muted = "seats,changes"
        session.add(user)
        session.add(push.PushSubscription(endpoint="https://push.example/c", p256dh="k", auth="a", user_id=cid.id, user_name=user.display_name))
        session.commit()
        assert push.targets_for(session, [cid.id], "got_in") == []
        assert len(push.targets_for(session, [cid.id], "taken_out")) == 1
        assert len(push.targets_for(session, [cid.id], "guest_taken_out")) == 1
        assert len(push.targets_for(session, [cid.id], "ride_removed")) == 1
        assert push.ride_message("guest_taken_out", None, "sr", body="x", url="/", by="Ana", name="Cid")


def test_deleting_an_account_forgets_whom_it_put_in(client, engine, admin_auth, sent):
    ride = bob_and_cid_in(client)
    bob = uid(client, BOB)
    client.delete(f"/api/rides/{ride['id']}/bookings/{booking(ride, 'Bob Jović')['id']}", headers=BOB)
    assert client.delete(f"/api/admin/users/{bob}", headers=admin_auth).status_code == 204
    with Session(engine) as session:
        assert all(b.added_by_id is None for b in session.exec(select(Booking)))


# --- a ride from the paper log waits for its driver ---------------------------


def unconfirmed(client, engine, **overrides) -> int:
    ride = client.post("/api/rides", json=own(**overrides), headers=ANA).json()
    with Session(engine) as session:
        row = session.get(Ride, ride["id"])
        row.unconfirmed = True
        session.add(row)
        session.commit()
    return ride["id"]


def test_nobody_gets_into_an_unconfirmed_ride_until_the_driver_confirms(client, engine, admin_auth):
    rid = unconfirmed(client, engine, seats=1)
    assert client.get(f"/api/rides/{rid}").json()["unconfirmed"] is True
    r = client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Bob Jović"}, headers=BOB)
    assert r.status_code == 409
    assert r.json()["detail"] == "The driver has not confirmed this ride yet"
    # The driver may still put their own people in; then the queue is shut too.
    client.auth("Dan Kos")
    assert client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Dan Kos"}, headers=ANA).status_code == 201
    assert client.post(f"/api/rides/{rid}/waitlist", json={}, headers=BOB).json()["detail"] == "The driver has not confirmed this ride yet"

    assert client.post(f"/api/rides/{rid}/confirm", headers=BOB).status_code == 403
    r = client.post(f"/api/rides/{rid}/confirm", headers=ANA)
    assert r.status_code == 200 and r.json()["unconfirmed"] is False
    assert client.post(f"/api/rides/{rid}/confirm", headers=ANA).status_code == 409
    assert client.post(f"/api/rides/{rid}/waitlist", json={}, headers=BOB).status_code == 201
    # The driver's own confirmation is not an admin's action.
    assert client.get("/api/admin/log", headers=admin_auth).json() == []


def test_the_drivers_edit_confirms_it_and_an_admin_may_confirm_it(client, engine, admin_auth):
    rid = unconfirmed(client, engine)
    assert client.patch(f"/api/rides/{rid}", json={"departure_time": "07:30"}, headers=ANA).json()["unconfirmed"] is False
    rid = unconfirmed(client, engine, ride_date=(DAY + timedelta(days=1)).isoformat())
    assert client.post(f"/api/rides/{rid}/confirm", headers=admin_auth).json()["unconfirmed"] is False
    assert [line["action"] for line in client.get("/api/admin/log", headers=admin_auth).json()] == ["ride_confirmed"]
    assert client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Bob Jović"}, headers=BOB).status_code == 201


def test_the_coming_log_rides_nobody_has_looked_at_wait_once(engine):
    today = date(2026, 11, 3)
    dodic, _ = make_person(engine, "Miloš Dodić")
    with Session(engine) as session:
        car = CorporateCar(name="Mazda 6e", plate="BG-1", passenger_seats=4)
        session.add(car)
        session.commit()

        def log_ride(day, driver, start=time(8), back=time(18), **kw):
            ride = Ride(
                ride_date=day, car_type="corporate", car_name="Mazda 6e (BG-1)", corporate_car_id=car.id,
                driver_name=driver, origin="Beograd", destination="Novi Sad",
                departure_time=start, return_time=back, seats=4, **kw,
            )
            session.add(ride)
            return ride

        untouched = log_ride(date(2026, 11, 4), "Miloš Dodić", driver_id=dodic.id)
        untouched.bookings.append(Booking(passenger_name="Already In"))
        moved = log_ride(date(2026, 11, 10), "Marko Markovic", start=time(7, 15))
        unclaimed = log_ride(date(2026, 11, 17), "Pavle Cicmil")
        gone = log_ride(date(2026, 10, 30), "Milan Blazic")
        session.commit()
        ids = untouched.id, moved.id, unclaimed.id, gone.id

    # Not before the backfill itself has run.
    assert hold_once(engine, today) is None
    with Session(engine) as session:
        session.add(DataMigration(name=MARKER))
        session.commit()
    assert sorted(r.id for r in hold_once(engine, today)) == sorted([ids[0], ids[2]])
    assert hold_once(engine, today) is None
    with Session(engine) as session:
        assert session.get(DataMigration, HOLD_MARKER) is not None
        rides = [session.get(Ride, i) for i in ids]
        assert [r.unconfirmed for r in rides] == [True, False, True, False]
        assert [b.passenger_name for b in rides[0].bookings] == ["Already In"]
