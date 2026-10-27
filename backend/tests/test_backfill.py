from datetime import date, time

from sqlmodel import Session, select

from app.backfill import LOG, MARKER, backfill, days, run_once
from app.models import CarType, CorporateCar, DataMigration, Ride
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
