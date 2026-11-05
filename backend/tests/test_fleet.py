"""The fleet manager's and the office manager's side (app/fleet.py,
routers/fleet.py): a car out of service, its paperwork and upkeep, what it
costs, the official fuel price, the odometer's gaps, the month summary, the
share as a setting, switched-off accounts and plates the garage lets in for good."""

from datetime import date, datetime, timedelta

import pytest
from sqlmodel import Session

from app import auth, fleet
from app.models import FuelPrice
from app.reminders import send_approval_nudges
from tests.conftest import patch_ride_notify

TODAY = date.today()
SOON = TODAY + timedelta(days=3)


def shared(car_id, day=SOON, **overrides):
    base = {
        "ride_date": day.isoformat(),
        "car_type": "corporate",
        "corporate_car_id": car_id,
        "car_name": "",
        "driver_name": "Ana Petrović",
        "origin": "Beograd",
        "destination": "Novi Sad",
        "departure_time": "08:00",
        "return_time": "16:00",
        "seats": 3,
    }
    base.update(overrides)
    return base


def own(day=SOON, **overrides):
    base = {
        "ride_date": day.isoformat(),
        "car_type": "own",
        "car_name": "Grey Golf",
        "driver_name": "Nina Nikolić",
        "origin": "Novi Sad",
        "destination": "Beograd",
        "departure_time": "07:30",
        "return_time": "16:00",
        "seats": 3,
    }
    base.update(overrides)
    return base


@pytest.fixture()
def car(client):
    return client.get("/api/cars/corporate").json()[0]


@pytest.fixture()
def pushed(monkeypatch):
    out: list[tuple[str, list, dict]] = []

    def fake_notify(session, user_ids, kind, ride=None, **args):
        out.append((kind, list(user_ids), args))
        return 0

    patch_ride_notify(monkeypatch, fake_notify, "app.routers.fleet", "app.routers.admin", "app.push", "app.reminders")
    return out


# --- Out of service ----------------------------------------------------------


def test_a_car_out_of_service_cannot_be_booked_and_its_drivers_are_told(client, admin_auth, car, pushed):
    booked = client.post("/api/rides", json=shared(car["id"])).json()
    r = client.post(
        "/api/fleet/blocks",
        json={"car_id": car["id"], "start_date": SOON.isoformat(), "end_date": (SOON + timedelta(days=1)).isoformat(), "reason": "  Service "},
        headers=admin_auth,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["block"]["reason"] == "Service"
    # The ride already in it stays, and is listed for the admin to move.
    assert [ride["id"] for ride in body["rides"]] == [booked["id"]]
    assert ("car_blocked", [booked["driver_id"]]) in [(k, ids) for k, ids, _ in pushed]

    # Nobody can take it on those days; the day after is free again.
    refused = client.post("/api/rides", json=shared(car["id"], SOON + timedelta(days=1), driver_name="Marko Jović"))
    assert refused.status_code == 409
    assert refused.json()["detail"] == "That car is out of service that day"
    later = client.post("/api/rides", json=shared(car["id"], SOON + timedelta(days=2), driver_name="Marko Jović"))
    assert later.status_code == 201

    # The ride form's calendar sees the days as taken.
    busy = client.get(
        f"/api/cars/corporate/{car['id']}/busy",
        params={"from": SOON.isoformat(), "to": (SOON + timedelta(days=5)).isoformat()},
    ).json()
    out = [b for b in busy if b["out_of_service"]]
    assert [b["ride_date"] for b in out] == [SOON.isoformat(), (SOON + timedelta(days=1)).isoformat()]
    assert out[0]["driver_name"] == "Service"

    # Everyone sees it on the car's card.
    state = next(s for s in client.get("/api/cars/corporate/state").json() if s["car"]["id"] == car["id"])
    assert [b["reason"] for b in state["blocks"]] == ["Service"]

    # Overlapping blocks are refused; removing it frees the car.
    again = client.post("/api/fleet/blocks", json={"car_id": car["id"], "start_date": SOON.isoformat()}, headers=admin_auth)
    assert again.status_code == 409
    assert client.delete(f"/api/fleet/blocks/{body['block']['id']}", headers=admin_auth).status_code == 204
    assert client.post("/api/rides", json=shared(car["id"], SOON + timedelta(days=1), driver_name="Mila Milić")).status_code == 201


def test_until_further_notice_and_only_admins(client, admin_auth, car):
    assert client.post("/api/fleet/blocks", json={"car_id": car["id"], "start_date": TODAY.isoformat()}).status_code == 403
    r = client.post("/api/fleet/blocks", json={"car_id": car["id"], "start_date": TODAY.isoformat(), "reason": "Warning light"}, headers=admin_auth)
    block = r.json()["block"]
    assert block["end_date"] is None
    far = TODAY + timedelta(days=60)
    assert client.post("/api/rides", json=shared(car["id"], far)).status_code == 409
    # Back early: it ends today, tomorrow is bookable.
    r = client.patch(f"/api/fleet/blocks/{block['id']}", json={"end_date": TODAY.isoformat()}, headers=admin_auth)
    assert r.json()["end_date"] == TODAY.isoformat()
    assert client.post("/api/rides", json=shared(car["id"], far)).status_code == 201
    bad = client.post(
        "/api/fleet/blocks",
        json={"car_id": car["id"], "start_date": far.isoformat(), "end_date": TODAY.isoformat()},
        headers=admin_auth,
    )
    assert bad.status_code == 422


# --- Paperwork and upkeep ----------------------------------------------------


def test_paperwork_is_kept_on_the_car_and_its_due_list_is_for_admins(client, admin_auth, car):
    r = client.patch(
        f"/api/cars/corporate/{car['id']}",
        json={
            "registration_until": (TODAY + timedelta(days=10)).isoformat(),
            "insurance_until": (TODAY - timedelta(days=1)).isoformat(),
            "service_due_km": 1500,
            "tyres": "winter",
        },
        headers=admin_auth,
    )
    assert r.status_code == 200, r.text
    assert r.json()["tyres"] == "winter"
    mine = next(s for s in client.get("/api/cars/corporate/state", headers=admin_auth).json() if s["car"]["id"] == car["id"])
    kinds = [(d["kind"], d["level"]) for d in mine["due"]]
    assert kinds[0] == ("insurance", "overdue")
    assert ("registration", "soon") in kinds
    # No odometer known yet: the service by km cannot be told.
    assert ("service", "ok") in kinds
    theirs = next(s for s in client.get("/api/cars/corporate/state").json() if s["car"]["id"] == car["id"])
    assert theirs["due"] == []
    # null clears; a cleared tyre field is "".
    r = client.patch(f"/api/cars/corporate/{car['id']}", json={"insurance_until": None, "tyres": None}, headers=admin_auth)
    assert r.json()["insurance_until"] is None and r.json()["tyres"] == ""


def test_due_items():
    from app.models import CorporateCar

    car = CorporateCar(name="Mazda", plate="BG1", passenger_seats=4, service_due_km=10_000, tyres="summer")
    nov = date(2026, 11, 5)
    items = {d.kind: d for d in fleet.due_items(car, 9_500, nov)}
    assert items["service"].level == "soon" and items["service"].km_left == 500
    assert items["tyres"].level == "overdue"
    oct_ = date(2026, 10, 15)
    assert {d.kind: d for d in fleet.due_items(car, 1000, oct_)}["tyres"].level == "soon"
    assert "tyres" not in {d.kind for d in fleet.due_items(car, 1000, date(2026, 6, 1))}
    assert fleet.winter_season(date(2027, 4, 1)) and not fleet.winter_season(date(2027, 4, 2))


def test_the_admins_are_pushed_each_step_once(engine, client, admin_auth, car, pushed):
    client.patch(
        f"/api/cars/corporate/{car['id']}",
        json={"registration_until": (TODAY + timedelta(days=5)).isoformat()},
        headers=admin_auth,
    )
    with Session(engine) as session:
        assert fleet.send_fleet_reminders(session, TODAY) == 1
        session.commit()
        assert fleet.send_fleet_reminders(session, TODAY) == 0
        # The 1-day step is a new one.
        assert fleet.send_fleet_reminders(session, TODAY + timedelta(days=4)) == 1
        session.commit()
    kinds = [k for k, _, _ in pushed]
    assert kinds == ["fleet_registration", "fleet_registration"]
    assert pushed[0][2]["days"] == 5


def test_a_problem_has_a_status(client, admin_auth, car):
    report = client.post(f"/api/cars/corporate/{car['id']}/reports", json={"issues": "Flat tyre"}).json()
    assert client.put(f"/api/cars/corporate/reports/{report['id']}/status", json={"status": "garage"}).status_code == 403
    r = client.put(f"/api/cars/corporate/reports/{report['id']}/status", json={"status": "garage"}, headers=admin_auth)
    assert r.status_code == 200 and r.json()["issue_status"] == "garage"
    state = next(s for s in client.get("/api/cars/corporate/state").json() if s["car"]["id"] == car["id"])
    assert state["issue_status"] == "garage" and state["issue_report_id"] == report["id"]
    # Fixed: a newer report saying nothing is wrong, and the status goes with it.
    client.post(f"/api/cars/corporate/{car['id']}/reports", json={"issues": ""})
    state = next(s for s in client.get("/api/cars/corporate/state").json() if s["car"]["id"] == car["id"])
    assert state["issue_status"] == "" and state["issue_report_id"] is None
    fine = client.post(f"/api/cars/corporate/{car['id']}/reports", json={"clean": True}).json()
    assert client.put(f"/api/cars/corporate/reports/{fine['id']}/status", json={"status": "seen"}, headers=admin_auth).status_code == 409


# --- The odometer's gaps -----------------------------------------------------


def test_km_nobody_logged_between_two_rides_show_in_all_rides(client, admin_auth, car):
    ana = {"X-User-Name": "Ana Petrović"}
    first = client.post("/api/rides", json=shared(car["id"], TODAY - timedelta(days=2), departure_time="08:00")).json()
    client.post(f"/api/rides/{first['id']}/legs", json={"km": 1000}, headers=ana)
    client.post(f"/api/rides/{first['id']}/legs/end", json={"km": 1180}, headers=ana)
    mila = {"X-User-Name": "Mila Milić"}
    second = client.post("/api/rides", json=shared(car["id"], TODAY - timedelta(days=1), driver_name="Mila Milić")).json()
    client.post(f"/api/rides/{second['id']}/legs", json={"km": 1230}, headers=mila)
    client.post(f"/api/rides/{second['id']}/legs/end", json={"km": 1400}, headers=mila)

    rows = client.get(
        "/api/admin/rides", params={"from": (TODAY - timedelta(days=1)).isoformat(), "to": TODAY.isoformat()}, headers=admin_auth
    ).json()
    assert [(r["id"], r["km_gap"]) for r in rows] == [(second["id"], 50)]

    over = client.get(
        "/api/fleet/overview", params={"from": (TODAY - timedelta(days=7)).isoformat(), "to": TODAY.isoformat()}, headers=admin_auth
    ).json()
    mine = next(c for c in over["cars"] if c["car_id"] == car["id"])
    assert mine["km"] == 350 and mine["unlogged_km"] == 50


# --- Costs and the fuel price ------------------------------------------------


def test_costs_are_kept_per_car_with_dinars_a_km(client, admin_auth, car):
    ana = {"X-User-Name": "Ana Petrović"}
    ride = client.post("/api/rides", json=shared(car["id"], TODAY - timedelta(days=1))).json()
    client.post(f"/api/rides/{ride['id']}/legs", json={"km": 500}, headers=ana)
    client.post(f"/api/rides/{ride['id']}/legs/end", json={"km": 700}, headers=ana)
    payload = {"car_id": car["id"], "day": TODAY.isoformat(), "kind": "fuel", "amount": 4720, "litres": 20}
    assert client.post("/api/fleet/costs", json=payload).status_code == 403
    cost = client.post("/api/fleet/costs", json=payload, headers=admin_auth)
    assert cost.status_code == 201, cost.text
    client.post("/api/fleet/costs", json={**payload, "kind": "toll", "amount": 680, "litres": None}, headers=admin_auth)
    listed = client.get("/api/fleet/costs", headers=admin_auth).json()
    assert [c["kind"] for c in listed] == ["toll", "fuel"]

    over = client.get("/api/fleet/overview", headers=admin_auth).json()
    mine = next(c for c in over["cars"] if c["car_id"] == car["id"])
    assert mine["total"] == 5400 and mine["by_kind"] == {"fuel": 4720, "toll": 680}
    assert mine["km"] == 200 and mine["per_km"] == 27.0

    assert client.delete(f"/api/fleet/costs/{cost.json()['id']}", headers=admin_auth).status_code == 204
    # A car with costs is retired, not deleted.
    retired = client.post("/api/cars/corporate", json={"name": "Old Clio", "plate": "BG-9", "passenger_seats": 4}, headers=admin_auth).json()
    client.post("/api/fleet/costs", json={**payload, "car_id": retired["id"]}, headers=admin_auth)
    assert client.delete(f"/api/cars/corporate/{retired['id']}", headers=admin_auth).status_code == 409


def test_the_official_fuel_price_is_seeded_and_a_new_week_added(engine, client, admin_auth):
    with Session(engine) as session:
        assert fleet.seed_fuel_prices(session) == 1
        assert fleet.seed_fuel_prices(session) == 0
        ref = fleet.FUEL_REFERENCE[0]
        assert fleet.price_on(session, ref["valid_from"], "diesel") == 236.0
        assert fleet.price_on(session, ref["valid_from"], "petrol") == 207.0
        # Before the first price known: the first price.
        assert fleet.price_on(session, date(2020, 1, 1), "petrol") == 207.0
    nxt = ref["valid_from"] + timedelta(days=7)
    r = client.post("/api/fleet/fuel", json={"valid_from": nxt.isoformat(), "diesel": 238, "petrol": 208}, headers=admin_auth)
    assert r.status_code == 201
    assert client.post("/api/fleet/fuel", json={"valid_from": nxt.isoformat(), "diesel": 1, "petrol": 1}, headers=admin_auth).status_code == 409
    prices = client.get("/api/fleet/fuel").json()
    assert [p["diesel"] for p in prices] == [238, 236]
    with Session(engine) as session:
        assert fleet.price_on(session, nxt + timedelta(days=2), "diesel") == 238
        assert fleet.price_on(session, nxt - timedelta(days=1), "diesel") == 236


# --- The month summary -------------------------------------------------------


def test_the_month_summary_adds_up_per_person_with_the_allowance(engine, client, admin_auth, car):
    with Session(engine) as session:
        session.add(FuelPrice(valid_from=date(2020, 1, 1), diesel=200, petrol=200))
        session.commit()
    day = TODAY - timedelta(days=1) if TODAY.day > 1 else TODAY
    month = day.strftime("%Y-%m")
    # Own car, office to office and back: 92 + 90 km.
    mine = client.post("/api/rides", json=own(day)).json()
    client.post(f"/api/rides/{mine['id']}/bookings", json={"passenger_name": "Bojan Babić"})
    shared_ride = client.post("/api/rides", json=shared(car["id"], day, driver_name="Ana Petrović")).json()
    ana = {"X-User-Name": "Ana Petrović"}
    client.post(f"/api/rides/{shared_ride['id']}/legs", json={"km": 100}, headers=ana)
    client.post(f"/api/rides/{shared_ride['id']}/legs/end", json={"km": 250}, headers=ana)
    nina_id = mine["driver_id"]
    client.patch(f"/api/admin/users/{nina_id}", json={"department": " Sales "}, headers=admin_auth)

    assert client.get("/api/admin/summary", params={"month": month}).status_code == 403
    assert client.get("/api/admin/summary", params={"month": "2026-13"}, headers=admin_auth).status_code == 422
    s = client.get("/api/admin/summary", params={"month": month}, headers=admin_auth).json()
    people = {p["name"]: p for p in s["people"]}
    nina = people["Nina Nikolić"]
    assert nina["department"] == "Sales"
    assert nina["own_rides"] == 1 and nina["own_km"] == 182
    # 30 % of a litre at 200 dinars, for every km: 60 a km.
    assert nina["allowance"] == 182 * 60 and nina["over_cap"] is True
    assert people["Ana Petrović"]["shared_rides"] == 1 and people["Ana Petrović"]["shared_km"] == 150
    assert people["Bojan Babić"]["passenger_rides"] == 1


# --- The share as a setting --------------------------------------------------


def test_the_share_is_a_setting_and_a_person_can_have_their_own(client, admin_auth, car):
    monday = TODAY + timedelta(days=7 - TODAY.weekday())
    first = client.post("/api/rides", json=shared(car["id"], monday))
    assert first.status_code == 201
    second = shared(car["id"], monday + timedelta(days=1))
    assert client.post("/api/rides", json=second).status_code == 409

    # Ana does field visits: three a week for her.
    client.patch(f"/api/admin/users/{first.json()['driver_id']}", json={"shared_per_week": 3}, headers=admin_auth)
    assert client.post("/api/rides", json=second).status_code == 201
    # Back to the office's share.
    client.patch(f"/api/admin/users/{first.json()['driver_id']}", json={"shared_per_week": None}, headers=admin_auth)
    third = shared(car["id"], monday + timedelta(days=2))
    assert client.post("/api/rides", json=third).status_code == 409

    settings = client.get("/api/fleet/settings", headers=admin_auth).json()
    assert settings == {"share_per_week": 1, "share_per_day": 1, "share_max_hours": 24, "allowance_fuel": "petrol", "allowance_cap": 10121}
    r = client.put("/api/fleet/settings", json={**settings, "share_per_week": 5, "share_max_hours": 12}, headers=admin_auth)
    assert r.json()["share_per_week"] == 5
    assert client.post("/api/rides", json=third).status_code == 201
    # 12 hours at most: two rides back to back over 12 hours are past the share.
    late = shared(car["id"], monday + timedelta(days=4), departure_time="14:00", return_time=None)
    assert client.post("/api/rides", json=late).status_code == 201
    on = shared(car["id"], monday + timedelta(days=5), departure_time="00:00", return_time="03:00")
    r = client.post("/api/rides", json=on)
    assert r.status_code == 409
    assert r.json()["detail"] == "That keeps a shared car with you for more than 12 hours in a row. An admin can approve it"


# --- Switched-off accounts ---------------------------------------------------


def test_someone_who_left_is_switched_off(client, admin_auth, monkeypatch):
    monkeypatch.setattr(auth, "PBKDF2_ROUNDS", 200)
    auth._decoy_hash.cache_clear()
    reg = client.anon.post(
        "/api/auth/register",
        json={"username": "lena", "first_name": "Lena", "last_name": "Lazić", "password": "one-two-three-four"},
    ).json()
    token = reg["token"]
    lena = {"Authorization": f"Bearer {token}"}
    uid = reg["user"]["id"]
    ride = client.anon.post("/api/rides", json=own(driver_name="Lena Lazić"), headers=lena).json()
    past = client.anon.post("/api/rides", json=own(TODAY - timedelta(days=3), driver_name="Lena Lazić"), headers=lena).json()

    r = client.patch(f"/api/admin/users/{uid}", json={"disabled": True}, headers=admin_auth)
    assert r.status_code == 200 and r.json()["disabled"] is True
    # Signed out everywhere, and cannot sign in again.
    assert client.anon.get("/api/rides", headers=lena).status_code == 401
    login = client.anon.post("/api/auth/login", json={"login": "lena", "password": "one-two-three-four"})
    assert login.status_code == 403
    assert login.json()["detail"] == "This account is switched off. Ask an admin"
    # Not offered as a colleague; the coming ride is gone, the past one still theirs.
    assert "Lena Lazić" not in [p["display_name"] for p in client.get("/api/people").json()]
    rows = client.get(
        "/api/admin/rides", params={"from": (TODAY - timedelta(days=7)).isoformat(), "to": (TODAY + timedelta(days=7)).isoformat()}, headers=admin_auth
    ).json()
    ids = [r["id"] for r in rows]
    assert ride["id"] not in ids and past["id"] in ids
    assert next(r for r in rows if r["id"] == past["id"])["driver_id"] == uid

    # Back on: the same password works again.
    client.patch(f"/api/admin/users/{uid}", json={"disabled": False}, headers=admin_auth)
    assert client.anon.post("/api/auth/login", json={"login": "lena", "password": "one-two-three-four"}).status_code == 200


def test_an_admin_cannot_switch_themself_off(client, admin_auth):
    me = client.anon.get("/api/auth/me", headers=admin_auth).json()
    r = client.patch(f"/api/admin/users/{me['id']}", json={"disabled": True}, headers=admin_auth)
    assert r.status_code == 409


# --- The garage's standing list ----------------------------------------------


def test_a_plate_let_in_for_good_is_never_asked_about_again(client, admin_auth, pushed):
    first = client.post("/api/rides", json=own(plate="ns 123-ab")).json()
    assert first["plate_registered"] is False
    second = client.post("/api/rides", json=own(SOON + timedelta(days=7), plate="NS 123-AB")).json()
    r = client.put(f"/api/admin/garage/{first['id']}", json={"registered": True, "standing": True}, headers=admin_auth)
    assert r.status_code == 200 and r.json()["plate_registered"] is True
    # Its other coming ride is ticked too, and a new one starts on the list.
    garage = {g["id"]: g["plate_registered"] for g in client.get("/api/admin/garage", headers=admin_auth).json()}
    assert garage[second["id"]] is True
    pushed.clear()
    third = client.post("/api/rides", json=own(SOON + timedelta(days=14), plate="NS 123-AB")).json()
    assert third["plate_registered"] is True
    assert "garage_plate" not in [k for k, _, _ in pushed]

    plates = client.get("/api/admin/garage/plates", headers=admin_auth).json()
    assert [(p["plate"], p["owner_name"]) for p in plates] == [(first["plate"], "Nina Nikolić")]
    assert client.delete(f"/api/admin/garage/plates/{plates[0]['id']}", headers=admin_auth).status_code == 204
    fourth = client.post("/api/rides", json=own(SOON + timedelta(days=21), plate="NS 123-AB")).json()
    assert fourth["plate_registered"] is False


# --- A pending ask the admins have not decided -------------------------------


def test_the_admins_are_reminded_of_a_pending_ask_before_it_leaves(engine, client, admin_auth, car, pushed):
    monday = TODAY + timedelta(days=7 - TODAY.weekday())
    client.post("/api/rides", json=shared(car["id"], monday))
    asked = client.post("/api/rides", json=shared(car["id"], monday + timedelta(days=1), request_approval=True)).json()
    assert asked["approval"] == "pending"
    leaves = datetime.combine(monday + timedelta(days=1), datetime.strptime("08:00", "%H:%M").time())
    with Session(engine) as session:
        assert send_approval_nudges(session, leaves - timedelta(hours=20)) == 0
        assert send_approval_nudges(session, leaves - timedelta(hours=10)) == 1
        session.commit()
        assert send_approval_nudges(session, leaves - timedelta(hours=9)) == 0
    assert [k for k, _, _ in pushed].count("approval_waiting") == 1
