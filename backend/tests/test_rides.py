from datetime import date, timedelta

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
        "seats": 2,
    }
    base.update(overrides)
    return base


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_corporate_cars_seeded(client):
    cars = client.get("/api/cars/corporate").json()
    assert len(cars) == 3
    assert {"id", "name", "plate", "passenger_seats"} <= set(cars[0])


def test_create_own_car_ride_and_list_by_date(client):
    r = client.post("/api/rides", json=own_ride())
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["free_seats"] == 2
    assert body["bookings"] == []

    rides = client.get("/api/rides", params={"date": TOMORROW}).json()
    assert [x["id"] for x in rides] == [body["id"]]
    assert client.get("/api/rides", params={"date": "2000-01-01"}).json() == []


def test_own_car_requires_name(client):
    r = client.post("/api/rides", json=own_ride(car_name="  "))
    assert r.status_code == 422


def test_return_must_be_after_departure(client):
    r = client.post("/api/rides", json=own_ride(return_time="07:00"))
    assert r.status_code == 422


def test_corporate_ride_uses_pool_car_and_blocks_overlap(client):
    car = client.get("/api/cars/corporate").json()[0]
    payload = own_ride(car_type="corporate", corporate_car_id=car["id"], car_name="")
    r = client.post("/api/rides", json=payload)
    assert r.status_code == 201, r.text
    assert car["name"] in r.json()["car_name"]

    # Same car, overlapping window -> conflict
    clash = own_ride(
        car_type="corporate",
        corporate_car_id=car["id"],
        driver_name="Bojan",
        departure_time="12:00",
        return_time="18:00",
    )
    r = client.post("/api/rides", json=clash)
    assert r.status_code == 409
    assert "already booked" in r.json()["detail"]

    # Same car, after the first ride returns -> fine
    later = dict(clash, departure_time="17:00", return_time="20:00")
    assert client.post("/api/rides", json=later).status_code == 201

    # Same car, picked up exactly when the first ride returns -> a handover, fine
    handover = dict(clash, departure_time="16:30", return_time="17:00", driver_name="Mila")
    assert client.post("/api/rides", json=handover).status_code == 201, "back-to-back"

    # ...but one minute early still overlaps
    early = dict(clash, departure_time="16:29", return_time="16:45", driver_name="Nina")
    assert client.post("/api/rides", json=early).status_code == 409

    # Different day -> fine
    other_day = dict(clash, ride_date=(date.today() + timedelta(days=2)).isoformat())
    assert client.post("/api/rides", json=other_day).status_code == 201


def test_corporate_ride_requires_car_id_and_seat_cap(client):
    r = client.post("/api/rides", json=own_ride(car_type="corporate"))
    assert r.status_code == 422
    car = client.get("/api/cars/corporate").json()[0]
    r = client.post(
        "/api/rides",
        json=own_ride(car_type="corporate", corporate_car_id=car["id"], seats=car["passenger_seats"] + 1),
    )
    assert r.status_code == 422
    r = client.post("/api/rides", json=own_ride(car_type="corporate", corporate_car_id=9999))
    assert r.status_code == 404


def test_join_and_leave_ride(client):
    ride = client.post("/api/rides", json=own_ride(seats=1)).json()
    url = f"/api/rides/{ride['id']}/bookings"

    r = client.post(url, json={"passenger_name": "Marko"})
    assert r.status_code == 201
    assert r.json()["free_seats"] == 0

    assert client.post(url, json={"passenger_name": " marko "}).status_code == 409  # duplicate
    assert client.post(url, json={"passenger_name": "Ana"}).status_code == 409  # driver
    assert client.post(url, json={"passenger_name": "Petar"}).status_code == 409  # full

    booking_id = r.json()["bookings"][0]["id"]
    # Random person cannot remove the booking
    assert client.delete(f"{url}/{booking_id}", headers={"X-User-Name": "Petar"}).status_code == 403
    # Without a name -> 401
    assert client.delete(f"{url}/{booking_id}").status_code == 401
    # Passenger can leave
    r = client.delete(f"{url}/{booking_id}", headers={"X-User-Name": "Marko"})
    assert r.status_code == 200
    assert r.json()["free_seats"] == 1


def test_driver_can_kick_passenger(client):
    ride = client.post("/api/rides", json=own_ride()).json()
    url = f"/api/rides/{ride['id']}/bookings"
    booking_id = client.post(url, json={"passenger_name": "Marko"}).json()["bookings"][0]["id"]
    r = client.delete(f"{url}/{booking_id}", headers={"X-User-Name": "ana"})
    assert r.status_code == 200
    assert r.json()["bookings"] == []


def test_only_driver_can_edit_or_delete(client):
    ride = client.post("/api/rides", json=own_ride()).json()
    rid = ride["id"]
    assert client.patch(f"/api/rides/{rid}", json={"seats": 3}).status_code == 401
    assert (
        client.patch(f"/api/rides/{rid}", json={"seats": 3}, headers={"X-User-Name": "Zoran"}).status_code
        == 403
    )
    r = client.patch(f"/api/rides/{rid}", json={"seats": 3}, headers={"X-User-Name": "Ana"})
    assert r.status_code == 200
    assert r.json()["free_seats"] == 3

    # Cannot shrink below booked passengers
    client.post(f"/api/rides/{rid}/bookings", json={"passenger_name": "Marko"})
    r = client.patch(f"/api/rides/{rid}", json={"seats": 0}, headers={"X-User-Name": "Ana"})
    assert r.status_code == 409

    assert client.delete(f"/api/rides/{rid}", headers={"X-User-Name": "Zoran"}).status_code == 403
    assert client.delete(f"/api/rides/{rid}", headers={"X-User-Name": "Ana"}).status_code == 204
    assert client.get(f"/api/rides/{rid}").status_code == 404


def test_range_listing_and_validation(client):
    d1 = date.today() + timedelta(days=1)
    d2 = d1 + timedelta(days=3)
    client.post("/api/rides", json=own_ride(ride_date=d1.isoformat()))
    client.post("/api/rides", json=own_ride(ride_date=d2.isoformat(), driver_name="Bojan"))
    rides = client.get("/api/rides", params={"from": d1.isoformat(), "to": d2.isoformat()}).json()
    assert [r["driver_name"] for r in rides] == ["Ana", "Bojan"]
    r = client.get("/api/rides", params={"from": d2.isoformat(), "to": d1.isoformat()})
    assert r.status_code == 422


def _booking_id(ride: dict, name: str) -> int:
    return next(b["id"] for b in ride["bookings"] if b["passenger_name"] == name)


def test_passengers_manage_defaults_off_and_only_driver_adds_or_removes_others(client):
    ride = client.post("/api/rides", json=own_ride(seats=3)).json()
    assert ride["passengers_manage"] is False
    url = f"/api/rides/{ride['id']}/bookings"

    # Self-joins need no header at all.
    assert client.post(url, json={"passenger_name": "Marko"}).status_code == 201
    # A passenger putting somebody else in: refused while the switch is off.
    r = client.post(url, json={"passenger_name": "Petar"}, headers={"X-User-Name": "Marko"})
    assert r.status_code == 403
    assert "Only the driver" in r.json()["detail"]
    # A stranger neither.
    assert client.post(url, json={"passenger_name": "Petar"}, headers={"X-User-Name": "Zoran"}).status_code == 403
    # The driver always can.
    r = client.post(url, json={"passenger_name": "Petar"}, headers={"X-User-Name": "ana"})
    assert r.status_code == 201, r.text
    assert [b["passenger_name"] for b in r.json()["bookings"]] == ["Marko", "Petar"]

    # A passenger removing another: refused while the switch is off.
    petar = _booking_id(r.json(), "Petar")
    assert client.delete(f"{url}/{petar}", headers={"X-User-Name": "Marko"}).status_code == 403


def test_passengers_manage_lets_passengers_add_and_remove_each_other(client):
    ride = client.post("/api/rides", json=own_ride(seats=3, passengers_manage=True)).json()
    assert ride["passengers_manage"] is True
    url = f"/api/rides/{ride['id']}/bookings"
    client.post(url, json={"passenger_name": "Marko"})

    # Marko, seated, puts Petar in ...
    r = client.post(url, json={"passenger_name": "Petar"}, headers={"X-User-Name": "marko"})
    assert r.status_code == 201, r.text
    # ... but somebody outside the car still cannot.
    r = client.post(url, json={"passenger_name": "Mila"}, headers={"X-User-Name": "Zoran"})
    assert r.status_code == 403
    assert "passenger in this car" in r.json()["detail"]
    # The usual seat rules still apply to whoever is added.
    assert client.post(url, json={"passenger_name": "Ana"}, headers={"X-User-Name": "Marko"}).status_code == 409
    assert client.post(url, json={"passenger_name": "petar"}, headers={"X-User-Name": "Marko"}).status_code == 409

    # Petar takes Marko out; Zoran, not in the car, cannot take anyone out.
    body = client.get(f"/api/rides/{ride['id']}").json()
    marko = _booking_id(body, "Marko")
    assert client.delete(f"{url}/{marko}", headers={"X-User-Name": "Zoran"}).status_code == 403
    r = client.delete(f"{url}/{marko}", headers={"X-User-Name": "Petar"})
    assert r.status_code == 200
    assert [b["passenger_name"] for b in r.json()["bookings"]] == ["Petar"]


def test_driver_toggles_passengers_manage(client):
    ride = client.post("/api/rides", json=own_ride(seats=3)).json()
    rid = ride["id"]
    url = f"/api/rides/{rid}/bookings"
    client.post(url, json={"passenger_name": "Marko"})

    # Only the driver flips the switch.
    assert client.patch(f"/api/rides/{rid}", json={"passengers_manage": True}, headers={"X-User-Name": "Marko"}).status_code == 403
    r = client.patch(f"/api/rides/{rid}", json={"passengers_manage": True}, headers={"X-User-Name": "Ana"})
    assert r.status_code == 200
    assert r.json()["passengers_manage"] is True
    assert client.post(url, json={"passenger_name": "Petar"}, headers={"X-User-Name": "Marko"}).status_code == 201

    # Off again: what was allowed a moment ago is refused.
    r = client.patch(f"/api/rides/{rid}", json={"passengers_manage": False}, headers={"X-User-Name": "Ana"})
    assert r.json()["passengers_manage"] is False
    assert client.post(url, json={"passenger_name": "Mila"}, headers={"X-User-Name": "Marko"}).status_code == 403
    # A partial edit of something else leaves the switch alone.
    r = client.patch(f"/api/rides/{rid}", json={"passengers_manage": True}, headers={"X-User-Name": "Ana"})
    r = client.patch(f"/api/rides/{rid}", json={"notes": "bring coffee"}, headers={"X-User-Name": "Ana"})
    assert r.json()["passengers_manage"] is True
