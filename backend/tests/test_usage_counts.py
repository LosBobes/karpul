"""Which screens get opened (routers/usage.py): counted per day with no one's name."""

from sqlmodel import Session, select

from app.models import UsageCount


def test_screens_are_counted_per_day_without_anyone_on_the_row(client, engine):
    assert client.post("/api/usage", json={"keys": ["view.week", "sheet.myRides", "view.week"]}, headers={"X-User-Name": "Ana"}).status_code == 204
    assert client.post("/api/usage", json={"keys": ["view.week"]}, headers={"X-User-Name": "Bojan"}).status_code == 204
    with Session(engine) as session:
        rows = {r.key: r.count for r in session.exec(select(UsageCount)).all()}
    assert rows == {"view.week": 3, "sheet.myRides": 1}
    # The row holds the day, the name and the count, nothing else.
    assert set(UsageCount.model_fields) == {"id", "day", "key", "count"}


def test_only_screen_names_go_in(client):
    for bad in ["hello", "view.", "view.week/../x", "sheet." + "a" * 41, "user.Ana"]:
        assert client.post("/api/usage", json={"keys": [bad]}).status_code == 422, bad
    assert client.post("/api/usage", json={"keys": ["view.week"] * 51}).status_code == 422
    assert client.anon.post("/api/usage", json={"keys": ["view.week"]}).status_code == 401


def test_admins_read_the_totals(client, admin_auth):
    client.post("/api/usage", json={"keys": ["sheet.carGuide", "view.day", "view.day"]})
    assert client.get("/api/admin/usage").status_code == 403
    body = client.get("/api/admin/usage", params={"days": 7}, headers=admin_auth).json()
    assert body["screens"][0] == {"key": "view.day", "count": 2, "days": 1}
    assert {"key": "sheet.carGuide", "count": 1, "days": 1} in body["screens"]
