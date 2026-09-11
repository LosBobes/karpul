"""The built frontend is served by the API process: hashed bundles forever, the
unhashed files (shell, service worker, manifest, icons) revalidated every time."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import mount_frontend


def make_client(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><div id='root'></div>")
    (dist / "assets" / "index-abc123.js").write_text("console.log('bundle')")
    (dist / "sw.js").write_text("self.addEventListener('fetch', () => {})")
    (dist / "manifest.webmanifest").write_text('{"name": "Karpul"}')
    app = FastAPI()

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    mount_frontend(app, dist)
    return TestClient(app)


def test_unknown_path_falls_back_to_the_shell(tmp_path):
    client = make_client(tmp_path)
    for path in ("/", "/some/deep/link"):
        r = client.get(path)
        assert r.status_code == 200
        assert "id='root'" in r.text
        assert r.headers["cache-control"] == "no-cache"


def test_api_routes_win_over_the_fallback(tmp_path):
    r = make_client(tmp_path).get("/api/health")
    assert r.json() == {"status": "ok"}


def test_hashed_bundles_are_immutable(tmp_path):
    r = make_client(tmp_path).get("/assets/index-abc123.js")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_service_worker_is_revalidated(tmp_path):
    r = make_client(tmp_path).get("/sw.js")
    assert r.status_code == 200
    assert "fetch" in r.text
    assert r.headers["content-type"].startswith("text/javascript")
    assert r.headers["cache-control"] == "no-cache"


def test_manifest_has_its_media_type(tmp_path):
    r = make_client(tmp_path).get("/manifest.webmanifest")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/manifest+json")
    assert r.json()["name"] == "Karpul"
