"""KARPUL_ALLOWED_COUNTRIES: the shell, the API and the socket only answer
from the listed countries (app/geofence.py)."""

import pytest
from starlette.websockets import WebSocketDisconnect

from app import geofence


@pytest.fixture()
def located(monkeypatch):
    """The test client's address looked up as whatever country `where[0]` says."""
    where = ["RS"]
    monkeypatch.setattr(geofence, "country_of", lambda ip: where[0])
    monkeypatch.setenv("KARPUL_ALLOWED_COUNTRIES", "de, rs")
    return where


def test_off_unless_configured(client, monkeypatch):
    monkeypatch.delenv("KARPUL_ALLOWED_COUNTRIES", raising=False)
    monkeypatch.setattr(geofence, "country_of", lambda ip: "US")
    assert client.anon.get("/api/health").status_code == 200


def test_listed_countries_get_in_and_the_rest_do_not(client, located):
    assert client.anon.get("/api/health").status_code == 200
    located[0] = "DE"
    assert client.get("/api/rides").status_code == 200
    for elsewhere in ("US", None):
        located[0] = elsewhere
        r = client.anon.get("/api/health")
        assert r.status_code == 403 and "not available in your country" in r.text
        assert client.get("/api/rides").status_code == 403


def test_the_socket_is_refused_too(client, located):
    located[0] = "US"
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect("/api/ws") as ws:
            ws.receive_json()
    assert closed.value.code == geofence.CLOSE_FORBIDDEN


def test_private_addresses_always_pass_and_a_missing_database_lets_everyone_in(monkeypatch):
    allowed = frozenset({"RS"})
    for ip in ("127.0.0.1", "10.0.0.7", "172.18.0.1", "::1"):
        assert geofence.admits(ip, allowed)
    assert not geofence.admits(None, allowed)

    def no_database(ip):
        raise LookupError

    monkeypatch.setattr(geofence, "country_of", no_database)
    assert geofence.admits("8.8.8.8", allowed)
