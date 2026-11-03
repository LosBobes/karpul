"""The one-time push about the shared Mazda's backfilled log (app/backfill_notice.py)."""

from datetime import date, time

import pytest
from sqlmodel import Session, select

from app import backfill_notice
from app import push as push_module
from app.backfill import MARKER as BACKFILL_MARKER
from app.backfill import backfill
from app.backfill_notice import MARKER, candidates, run_once
from app.models import Booking, DataMigration, DriveLeg, PushSubscription, Ride
from app.push import Target, ride_message
from app.webpush import generate_private_key_b64
from tests.conftest import make_person
from tests.test_backfill import TODAY, mazda


@pytest.fixture()
def sent(monkeypatch):
    """Push on, every message delivered on this thread: (endpoint, message)."""
    monkeypatch.setenv("KARPUL_VAPID_PRIVATE_KEY", generate_private_key_b64())
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


def backfilled(engine):
    mazda(engine)
    with Session(engine) as session:
        backfill(session, TODAY)
        session.add(DataMigration(name=BACKFILL_MARKER))
        session.commit()


def subscribe(engine, user, locale="en"):
    with Session(engine) as session:
        session.add(PushSubscription(endpoint=f"https://push.example/{user.id}", p256dh="k", auth="a", user_id=user.id, user_name=user.display_name, locale=locale))
        session.commit()


def test_an_account_on_the_log_is_told_about_its_rides_still_holding_a_guess(engine):
    blazic, _ = make_person(engine, "Milan Blažić")
    backfilled(engine)
    with Session(engine) as session:
        his = session.exec(select(Ride).where(Ride.driver_id == blazic.id).order_by(Ride.ride_date)).all()
        # One driven ride has its odometer, one coming ride got its real times.
        session.add(DriveLeg(ride_id=his[0].id, driver_id=blazic.id, driver_name=blazic.display_name, start_km=100, end_km=190))
        coming = next(r for r in his if r.ride_date >= TODAY)
        coming.departure_time, coming.return_time = time(9, 0), time(15, 0)
        session.add(coming)
        session.commit()
        notices = {(n.user.display_name, n.kind): n for n in candidates(session, TODAY)}
        mine = notices[("Milan Blažić", "log_yours")]
        assert len(mine.rides) == len(his) - 2
        # The link is the soonest coming ride still on the guess.
        assert mine.link(TODAY).ride_date == date(2026, 10, 28)


def test_a_name_with_no_account_asks_the_most_alike_account_only(engine):
    make_person(engine, "Pavle Čičmill")  # a letter off: the backfill could not match it
    make_person(engine, "Pavle Cicmilović")  # alike, but less so
    make_person(engine, "Pavle Jovanović")  # a first name is not enough
    backfilled(engine)
    with Session(engine) as session:
        notices = {(n.user.display_name, n.kind): n for n in candidates(session, TODAY)}
        claims = {who for who, kind in notices if kind == "log_claim"}
        assert claims == {"Pavle Čičmill"}
        assert notices[("Pavle Čičmill", "log_claim")].name == "Pavle Cicmil"
        assert len(notices[("Pavle Čičmill", "log_claim")].rides) == 5


def test_nobody_is_asked_to_claim_a_ride_they_sit_in(engine):
    zeljko, _ = make_person(engine, "Zelko Kojić")
    backfilled(engine)
    with Session(engine) as session:
        ride = session.exec(select(Ride).where(Ride.driver_name == "Zeljko Kojic")).one()
        session.add(Booking(ride_id=ride.id, passenger_id=zeljko.id, passenger_name=zeljko.display_name))
        session.commit()
        assert not [n for n in candidates(session, TODAY) if n.kind == "log_claim" and n.user.id == zeljko.id]


def test_it_sends_once_and_only_with_push_on(engine, sent, monkeypatch):
    blazic, _ = make_person(engine, "Milan Blažić")
    marko, _ = make_person(engine, "Marco Marković")
    subscribe(engine, blazic)
    subscribe(engine, marko, "sr")
    backfilled(engine)

    monkeypatch.delenv("KARPUL_VAPID_PRIVATE_KEY")
    assert run_once(engine, TODAY) is None
    with Session(engine) as session:
        assert session.get(DataMigration, MARKER) is None

    monkeypatch.setenv("KARPUL_VAPID_PRIVATE_KEY", generate_private_key_b64())
    told = run_once(engine, TODAY)
    assert set(told) == {("Milan Blažić", "log_yours"), ("Marco Marković", "log_claim")}
    messages = dict(sent)
    assert "check the times" in messages[f"https://push.example/{blazic.id}"]["title"]
    assert messages[f"https://push.example/{blazic.id}"]["url"].startswith("/ride/")
    assert messages[f"https://push.example/{marko.id}"]["title"].startswith("Da li si ti Marko Markovic?")
    assert "Ovo sam ja" in messages[f"https://push.example/{marko.id}"]["title"]

    assert run_once(engine, TODAY) is None
    assert len(sent) == 2


def test_it_waits_for_the_backfill(engine, sent):
    make_person(engine, "Milan Blažić")
    assert run_once(engine, TODAY) is None
    with Session(engine) as session:
        assert session.get(DataMigration, MARKER) is None


def test_the_wording_counts_in_both_languages():
    ride = Ride(id=1, ride_date=TODAY, car_type="corporate", car_name="Mazda", driver_name="X", origin="A", destination="B", departure_time=time(8), seats=4)
    assert ride_message("log_claim", ride, "en", name="Ana", n=1)["title"] == "Are you Ana? The shared Mazda's log has 1 ride under that name. Tap This is me"
    assert "2 vožnje" in ride_message("log_claim", ride, "sr", name="Ana", n=2)["title"]
    assert "5 vožnji" in ride_message("log_claim", ride, "sr", name="Ana", n=5)["title"]
    assert "21 vožnja" in ride_message("log_claim", ride, "sr", name="Ana", n=21)["title"]
    assert "(3)" in ride_message("log_yours", ride, "sr", n=3)["title"]
    assert backfill_notice.MARKER != BACKFILL_MARKER
