"""Profile photos: uploaded by their owner, served by a key that changes, listed by name."""

from app.routers.photos import MAX_PHOTO_BYTES

WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 24
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 40
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40


def upload(client, name, data, content_type="image/webp"):
    return client.put("/api/auth/me/photo", content=data, headers={**client.auth(name), "Content-Type": content_type})


def test_a_photo_is_listed_by_name_and_served_without_a_token(client):
    r = upload(client, "Ana Petrović", WEBP)
    assert r.status_code == 200
    url = r.json()["url"]
    assert r.json()["name"] == "Ana Petrović" and url.startswith("/api/avatars/")

    listed = client.get("/api/avatars", headers=client.auth("Marko Marković")).json()
    assert [(p["name"], p["url"]) for p in listed] == [("Ana Petrović", url)]

    img = client.anon.get(url)
    assert img.status_code == 200 and img.content == WEBP
    assert img.headers["content-type"] == "image/webp"
    assert "immutable" in img.headers["cache-control"]
    assert img.headers["x-content-type-options"] == "nosniff"


def test_the_list_needs_a_session(client):
    assert client.anon.get("/api/avatars").status_code == 401


def test_a_new_photo_gets_a_new_address_and_the_old_one_dies(client):
    first = upload(client, "Ana Petrović", WEBP).json()["url"]
    second = upload(client, "Ana Petrović", JPEG).json()["url"]
    assert first != second
    assert client.anon.get(first).status_code == 404
    got = client.anon.get(second)
    assert got.content == JPEG and got.headers["content-type"] == "image/jpeg"
    assert len(client.get("/api/avatars").json()) == 1


def test_png_is_taken_too(client):
    assert upload(client, "Ana Petrović", PNG, "image/png").status_code == 200


def test_only_images_are_taken(client):
    r = upload(client, "Ana Petrović", b"<svg onload=alert(1)></svg>", "image/svg+xml")
    assert r.status_code == 422 and "JPEG, PNG or WebP" in r.json()["detail"]
    assert upload(client, "Ana Petrović", b"").status_code == 422
    assert client.get("/api/avatars").json() == []


def test_a_big_photo_is_refused(client):
    r = upload(client, "Ana Petrović", WEBP + b"\x00" * MAX_PHOTO_BYTES)
    assert r.status_code == 413 and r.json()["detail"] == "The photo is too big"


def test_uploading_needs_a_session(client):
    r = client.anon.put("/api/auth/me/photo", content=WEBP)
    assert r.status_code == 401


def test_removing_your_photo(client):
    url = upload(client, "Ana Petrović", WEBP).json()["url"]
    assert client.delete("/api/auth/me/photo", headers=client.auth("Ana Petrović")).status_code == 204
    assert client.anon.get(url).status_code == 404
    assert client.get("/api/avatars").json() == []
    # Nothing to remove is fine too.
    assert client.delete("/api/auth/me/photo", headers=client.auth("Ana Petrović")).status_code == 204


def test_an_admin_takes_a_photo_down_and_it_is_logged(client, admin_auth):
    url = upload(client, "Ana Petrović", WEBP).json()["url"]
    ana_id = client.get("/api/auth/me", headers=client.auth("Ana Petrović")).json()["id"]
    marko = client.auth("Marko Marković")
    assert client.delete(f"/api/admin/users/{ana_id}/photo", headers=marko).status_code == 403
    assert client.delete(f"/api/admin/users/{ana_id}/photo", headers=admin_auth).status_code == 204
    assert client.anon.get(url).status_code == 404
    log = client.get("/api/admin/log", headers=admin_auth).json()
    assert (log[0]["action"], log[0]["subject"]) == ("photo_removed", "Ana Petrović")
    assert client.delete("/api/admin/users/9999/photo", headers=admin_auth).status_code == 404


def test_a_rename_carries_the_photo_and_tells_the_tabs(client):
    upload(client, "Ana Petrović", WEBP)
    with client.websocket_connect("/api/ws") as ws:
        ws.receive_json()  # hello
        r = client.patch("/api/auth/me", json={"last_name": "Jovanović"}, headers=client.auth("Ana Petrović"))
        assert r.status_code == 200
        assert ws.receive_json() == {"type": "photos.changed"}
    assert [p["name"] for p in client.get("/api/avatars").json()] == ["Ana Jovanović"]


def test_an_upload_is_announced(client):
    with client.websocket_connect("/api/ws") as ws:
        ws.receive_json()  # hello
        upload(client, "Ana Petrović", WEBP)
        assert ws.receive_json() == {"type": "photos.changed"}


def test_a_deleted_account_takes_its_photo(client, admin_auth):
    url = upload(client, "Ana Petrović", WEBP).json()["url"]
    ana_id = client.get("/api/auth/me", headers=client.auth("Ana Petrović")).json()["id"]
    assert client.delete(f"/api/admin/users/{ana_id}", headers=admin_auth).status_code == 204
    assert client.anon.get(url).status_code == 404
    assert client.get("/api/avatars", headers=admin_auth).json() == []
