from datetime import date, time

from sqlmodel import Session, select

from app.backfill import LOG, MARKER, backfill, days, run_once
from app.models import Booking, CarType, CorporateCar, DataMigration, Ride
from tests.conftest import make_person

TODAY = date(2026, 10, 27)


def mazda(engine) -> int:
    with Session(engine) as session:
        car = CorporateCar(name="Mazda 6e", plate="BG-123-XY", passenger_seats=4)
        session.add(car)
        session.commit()
        return car.id


def run(engine) -> dict[str, list[str]]:
    with Session(engine) as session:
        report = backfill(session, TODAY)
        session.commit()
        return report


def test_every_day_of_the_log_becomes_a_ride(engine):
    car_id = mazda(engine)
    report = run(engine)
    total = sum(len(days(e)) for e in LOG)
    assert len(report["added"]) == total
    with Session(engine) as session:
        rides = session.exec(select(Ride)).all()
        assert len(rides) == total
        assert {r.car_name for r in rides} == {"Mazda 6e (BG-123-XY)"}
        assert all(r.corporate_car_id == car_id and r.car_type == CarType.corporate for r in rides)
        # The week Nevenka had it is a ride a day, and so is the Niš trip.
        assert len([r for r in rides if r.driver_name == "Nevenka Stojanovic"]) == 7
        assert {r.ride_date for r in rides if r.destination == "Niš"} == {date(2026, 9, 9), date(2026, 9, 10)}
        airport = next(r for r in rides if r.destination == "Aerodrom")
        assert (airport.departure_time, airport.return_time) == (time(19, 30), time(21, 0))
        # Past days are not reminded of; today's and later rides are.
        assert all(r.reminder_sent == (r.ride_date < TODAY) for r in rides)


def test_drivers_are_matched_to_accounts_without_diacritics(engine):
    mazda(engine)
    blazic, _ = make_person(engine, "Milan Blažić")
    report = run(engine)
    assert "Milan Blazic" not in report["no account"]
    assert "Marko Markovic" in report["no account"]
    with Session(engine) as session:
        his = session.exec(select(Ride).where(Ride.driver_id == blazic.id)).all()
        assert len(his) == 15
        assert {r.driver_name for r in his} == {"Milan Blažić"}


def test_running_it_twice_adds_nothing(engine):
    mazda(engine)
    run(engine)
    again = run(engine)
    assert again["added"] == []
    assert len(again["already there"]) == sum(len(days(e)) for e in LOG)


def test_a_coming_day_already_booked_is_skipped(engine):
    car_id = mazda(engine)
    with Session(engine) as session:
        session.add(
            Ride(
                ride_date=date(2026, 11, 3),
                car_type=CarType.corporate,
                car_name="Mazda 6e (BG-123-XY)",
                corporate_car_id=car_id,
                driver_name="Ana Test",
                origin="A",
                destination="B",
                departure_time=time(9, 0),
                return_time=time(12, 0),
                seats=2,
            )
        )
        session.commit()
    report = run(engine)
    assert len(report["skipped, car taken"]) == 1
    assert report["skipped, car taken"][0].startswith("2026-11-03")
    # The past is written as the log has it, the double-booked 18 September included.
    with Session(engine) as session:
        assert len(session.exec(select(Ride).where(Ride.ride_date == date(2026, 9, 18))).all()) == 2


def test_on_start_it_runs_once_and_never_again(engine):
    car_id = mazda(engine)
    first = run_once(engine, TODAY)
    assert first is not None and len(first["added"]) == sum(len(days(e)) for e in LOG)
    with Session(engine) as session:
        assert session.get(DataMigration, MARKER) is not None
        # Someone removes a backfilled ride: the next start must not put it back.
        ride = session.exec(select(Ride).where(Ride.corporate_car_id == car_id)).first()
        session.delete(ride)
        session.commit()
    assert run_once(engine, TODAY) is None
    with Session(engine) as session:
        assert len(session.exec(select(Ride)).all()) == sum(len(days(e)) for e in LOG) - 1


def test_without_the_mazda_a_start_does_nothing_and_tries_again_later(engine):
    assert run_once(engine, TODAY) is None
    with Session(engine) as session:
        assert session.get(DataMigration, MARKER) is None
        assert session.exec(select(Ride)).all() == []
    mazda(engine)
    assert run_once(engine, TODAY) is not None


# --- claiming a ride the log wrote under a name with no account ---------------


def log_ride(engine, driver: str, day: date, *, booked: str | None = None) -> int:
    """A ride the way the backfill writes one for a driver with no account
    (in an own car, so the claim is not about the shared-car pool)."""
    with Session(engine) as session:
        ride = Ride(
            ride_date=day,
            car_type=CarType.own,
            car_name="Mazda 6e",
            driver_name=driver,
            origin="Beograd",
            destination="Novi Sad",
            departure_time=time(8),
            return_time=time(18),
            seats=4,
        )
        if booked:
            ride.bookings.append(Booking(passenger_name=booked))
        session.add(ride)
        session.commit()
        return ride.id


def test_a_name_without_an_account_shows_no_driver_id(client, engine):
    ride_id = log_ride(engine, "Nikola Stevic", date(2026, 9, 3))
    ride = client.get(f"/api/rides/{ride_id}").json()
    assert ride["driver_id"] is None and ride["driver_name"] == "Nikola Stevic"


def test_a_name_spelled_another_way_claims_all_its_rides(client, engine):
    first = log_ride(engine, "Pavle Cicmil", date(2026, 9, 15))
    second = log_ride(engine, "Pavle Cicmil", date(2026, 11, 17))
    other = log_ride(engine, "Milos Dodic", date(2026, 11, 4))
    pavle, _ = make_person(engine, "Pavle Čičmil")
    res = client.post(f"/api/rides/{second}/claim", headers={"X-User-Name": "Pavle Čičmil"})
    assert res.status_code == 200, res.text
    claimed = res.json()
    # The ride pressed first, then the rest of that name's rides.
    assert [r["id"] for r in claimed] == [second, first]
    assert all(r["driver_id"] == pavle.id and r["driver_name"] == "Pavle Čičmil" for r in claimed)
    with Session(engine) as session:
        assert session.get(Ride, other).driver_id is None
    # Now the driver may run it, and nobody can claim it again.
    assert client.patch(f"/api/rides/{first}", json={"notes": "mine"}, headers={"X-User-Name": "Pavle Čičmil"}).status_code == 200
    again = client.post(f"/api/rides/{first}/claim", headers={"X-User-Name": "Pavle Čičmil"})
    assert again.status_code == 409


def test_a_name_unlike_yours_is_not_yours_to_claim(client, engine):
    ride_id = log_ride(engine, "Milan Kolacek", date(2026, 10, 7))
    make_person(engine, "Milan Katanić")
    res = client.post(f"/api/rides/{ride_id}/claim", headers={"X-User-Name": "Milan Katanić"})
    assert res.status_code == 403
    assert res.json()["detail"] == "Milan Kolacek is not a name like yours"


def test_a_passenger_does_not_claim_the_wheel_of_their_own_seat(client, engine):
    ride_id = log_ride(engine, "Zeljko Kojic", date(2026, 10, 2), booked="Željko Kojić")
    make_person(engine, "Željko Kojić")
    res = client.post(f"/api/rides/{ride_id}/claim", headers={"X-User-Name": "Željko Kojić"})
    assert res.status_code == 409
