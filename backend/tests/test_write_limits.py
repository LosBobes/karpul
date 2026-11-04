"""The writes that reach other people are throttled per account, and every
write per browser (app/ratelimit.py, main.throttle_writes)."""

from datetime import date, timedelta

from app import ratelimit

TOMORROW = date.today() + timedelta(days=1)


def own_ride(**overrides):
    base = {
        "ride_date": TOMORROW.isoformat(),
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


def test_a_flood_of_thread_lines_is_a_429(client):
    ride = client.post("/api/rides", json=own_ride()).json()
    for i in range(ratelimit.WRITES["message"].limit):
        r = client.post(f"/api/rides/{ride['id']}/messages", json={"body": f"line {i}"}, headers={"X-User-Name": "Bojan"})
        assert r.status_code == 201, r.text
    r = client.post(f"/api/rides/{ride['id']}/messages", json={"body": "one more"}, headers={"X-User-Name": "Bojan"})
    assert r.status_code == 429
    assert r.headers["Retry-After"] == "60"
    assert r.json()["detail"] == "Too many attempts; try again in 1 min"
    # Someone else is not held to Bojan's count.
    r = client.post(f"/api/rides/{ride['id']}/messages", json={"body": "hi"}, headers={"X-User-Name": "Mila"})
    assert r.status_code == 201


def test_ride_requests_are_rationed_per_account(client):
    day = (date.today() + timedelta(days=2)).isoformat()
    ask = {"request_date": day, "origin": "Novi Sad", "destination": "Beograd", "departure_time": "08:00"}
    for _ in range(ratelimit.WRITES["request"].limit):
        r = client.post("/api/requests", json=ask, headers={"X-User-Name": "Vuk"})
        assert r.status_code in (201, 409), r.text
    assert client.post("/api/requests", json=ask, headers={"X-User-Name": "Vuk"}).status_code == 429


def test_every_write_has_a_ceiling_per_browser(client, monkeypatch):
    monkeypatch.setattr(ratelimit.writes_by_token, "limit", 3)
    ride = client.post("/api/rides", json=own_ride()).json()  # 1
    headers = client.auth("Ana")
    assert client.patch(f"/api/rides/{ride['id']}", json={"notes": "a"}, headers=headers).status_code == 200  # 2
    assert client.patch(f"/api/rides/{ride['id']}", json={"notes": "b"}, headers=headers).status_code == 200  # 3
    r = client.patch(f"/api/rides/{ride['id']}", json={"notes": "c"}, headers=headers)
    assert r.status_code == 429 and r.json()["detail"].startswith("Too many attempts")
    # Reads are never counted.
    assert client.get("/api/rides", headers=headers).status_code == 200
