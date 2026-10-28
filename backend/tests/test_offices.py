"""The road between the offices is a known length (app/offices.py)."""

from datetime import date, time, timedelta

import pytest
from sqlmodel import Session, select

from app.models import Ride
from app.offices import fill_office_distances, office_distance, office_of, ride_km

TOMORROW = (date.today() + timedelta(days=1)).isoformat()


@pytest.mark.parametrize(
    ("origin", "destination", "km"),
    [
        ("Beograd", "Novi Sad", 90),
        ("Novi Sad", "Beograd", 92),
        ("belgrade", "NS", 90),
        ("Novi Sad", "Niš", None),
        ("Office", "Novi Sad", None),
    ],
)
def test_the_known_road(origin, destination, km):
    assert office_distance(origin, destination) == km


def test_office_names_fold():
    assert office_of("BEOGRAD") == "beograd"
    assert office_of("Novi  Sad") == "novi sad"
    assert office_of("Zrenjanin") is None


def test_ride_km_counts_the_way_back():
    assert ride_km("Beograd", "Novi Sad", None, with_return=True) == 182
    assert ride_km("Beograd", "Novi Sad", None, with_return=False) == 90
    assert ride_km("Niš", "Beograd", 240, with_return=True) == 480
    assert ride_km("Niš", "Beograd", None, with_return=True) is None


def own(**overrides):
    base = {
        "ride_date": TOMORROW,
        "car_type": "own",
        "car_name": "Blue Golf",
        "driver_name": "Ana",
        "origin": "Beograd",
        "destination": "Novi Sad",
        "departure_time": "07:30",
        "return_time": "16:30",
        "seats": 2,
    }
    base.update(overrides)
    return base


def test_a_ride_between_the_offices_gets_its_distance_filled_in(client):
    ride = client.post("/api/rides", json=own()).json()
    assert ride["distance_km"] == 90
    back = client.post("/api/rides", json=own(origin="Novi Sad", destination="Beograd", departure_time="17:00", return_time=None)).json()
    assert back["distance_km"] == 92
    # The driver's own figure wins, and a blank one on another road stays blank.
    assert client.post("/api/rides", json=own(distance_km=95, departure_time="18:00", return_time=None)).json()["distance_km"] == 95
    assert client.post("/api/rides", json=own(destination="Niš", departure_time="19:00", return_time=None)).json()["distance_km"] is None
    # Editing the route onto the known road fills it in too.
    edited = client.patch(f"/api/rides/{ride['id']}", json={"destination": "Niš", "distance_km": None}, headers={"X-User-Name": "Ana"}).json()
    assert edited["distance_km"] is None
    edited = client.patch(f"/api/rides/{ride['id']}", json={"destination": "Novi Sad"}, headers={"X-User-Name": "Ana"}).json()
    assert edited["distance_km"] == 90


def test_old_rides_on_the_known_road_are_filled_in_on_start(engine):
    with Session(engine) as s:
        s.add(Ride(ride_date=date(2026, 1, 5), car_type="own", car_name="Golf", driver_name="Ana", origin="Beograd", destination="Novi Sad", departure_time=time(7, 0), seats=1))
        s.add(Ride(ride_date=date(2026, 1, 6), car_type="own", car_name="Golf", driver_name="Ana", origin="Beograd", destination="Niš", departure_time=time(7, 0), seats=1))
        s.commit()
    assert fill_office_distances(engine) == 1
    assert fill_office_distances(engine) == 0
    with Session(engine) as s:
        assert [r.distance_km for r in s.exec(select(Ride).order_by(Ride.ride_date))] == [90, None]
