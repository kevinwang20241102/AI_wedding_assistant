from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pycore.core import ConfigManager
from src.config.settings import load_config_from_mapping
from src.db.session import reset_engine

PASSWORD = "Passw0rd1"
PHONE_A = "13800138300"
CREATE_BODY = {
    "start_date": "2026-10-02",
    "wedding_date": "2027-10-20",
    "city": "杭州",
    "total_budget_fen": 20000000,
    "guest_estimate": 80,
}

JPEG = bytes([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01])
PNG = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D])
WEBP = b"RIFF" + (12).to_bytes(4, "little") + b"WEBP" + b"\x00" * 4
TEXT_FILE = b"not-an-image"


def _settings(tmp_path: Path, **overrides: object) -> dict:
    data: dict = {
        "secret_key": "test-only-jwt-secret-key-32bytes-min",
        "database_path": str(tmp_path / "Wedding_Master.db"),
        "host": "127.0.0.1",
        "port": 8099,
        "sms_mode": "mock",
        "bcrypt_rounds": 4,
        "wedding_photo_dir": str(tmp_path / "wedding_photos"),
        "wedding_photo_max_bytes": 64,
        "aliyun_sms_access_key_id": "",
        "aliyun_sms_access_key_secret": "",
    }
    data.update(overrides)
    return data


def _client(tmp_path: Path, **overrides: object) -> Generator[TestClient, None, None]:
    ConfigManager.reset()
    load_config_from_mapping(_settings(tmp_path, **overrides))
    reset_engine()
    from src.main import app

    with TestClient(app) as client:
        yield client
    reset_engine()
    ConfigManager.reset()


@pytest.fixture
def client(tmp_path: Path) -> Generator[TestClient, None, None]:
    yield from _client(tmp_path)


def _envelope(response):
    body = response.json()
    assert "success" in body
    return body


def _login_with_wedding(client: TestClient) -> None:
    created = client.post(
        "/api/users",
        json={"username": "alice", "password": PASSWORD, "phone": PHONE_A},
    )
    assert created.status_code == 201
    wedding = client.post("/api/weddings", json=CREATE_BODY)
    assert wedding.status_code == 201


def test_photo_list_empty_then_upload_and_conflict(client: TestClient) -> None:
    _login_with_wedding(client)
    empty = client.get("/api/wedding_photos")
    assert empty.status_code == 200
    assert _envelope(empty)["data"] == []

    uploaded = client.post(
        "/api/wedding_photos",
        files={"file": ("couple.jpg", JPEG, "image/jpeg")},
    )
    assert uploaded.status_code == 201, uploaded.text
    photo = _envelope(uploaded)["data"]
    assert photo["id"] >= 1
    assert photo["url"] == f"/api/wedding_photos/{photo['id']}"

    listed = client.get("/api/wedding_photos")
    assert listed.status_code == 200
    assert listed.json()["data"] == [photo]

    raw = client.get(photo["url"])
    assert raw.status_code == 200
    assert raw.content == JPEG
    assert "image/jpeg" in raw.headers.get("content-type", "")

    current = client.get("/api/weddings/current")
    assert "photos" not in current.json()["data"]
    assert current.json()["data"]["city"] == "杭州"

    second = client.post(
        "/api/wedding_photos",
        files={"file": ("again.png", PNG, "image/png")},
    )
    assert second.status_code == 409
    assert second.json()["error_code"] == "CONFLICT"
    assert listed.json()["data"] == client.get("/api/wedding_photos").json()["data"]


def test_photo_400_invalid_and_oversize(client: TestClient) -> None:
    _login_with_wedding(client)
    text = client.post(
        "/api/wedding_photos",
        files={"file": ("note.txt", TEXT_FILE, "text/plain")},
    )
    assert text.status_code == 400
    assert text.json()["error_code"] == "VALIDATION_ERROR"
    assert client.get("/api/wedding_photos").json()["data"] == []

    huge = JPEG + b"\x00" * 80
    oversize = client.post(
        "/api/wedding_photos",
        files={"file": ("big.jpg", huge, "image/jpeg")},
    )
    assert oversize.status_code == 400
    assert oversize.json()["error_code"] == "VALIDATION_ERROR"
    assert client.get("/api/wedding_photos").json()["data"] == []


def test_photo_put_replaces_and_invalid_keeps_original(client: TestClient) -> None:
    _login_with_wedding(client)
    uploaded = client.post(
        "/api/wedding_photos",
        files={"file": ("couple.jpg", JPEG, "image/jpeg")},
    )
    photo_id = uploaded.json()["data"]["id"]

    replaced = client.put(
        f"/api/wedding_photos/{photo_id}",
        files={"file": ("new.webp", WEBP, "image/webp")},
    )
    assert replaced.status_code == 200
    body = _envelope(replaced)["data"]
    assert body["id"] == photo_id
    assert client.get(f"/api/wedding_photos/{photo_id}").content == WEBP
    assert len(client.get("/api/wedding_photos").json()["data"]) == 1

    failed = client.put(
        f"/api/wedding_photos/{photo_id}",
        files={"file": ("bad.txt", TEXT_FILE, "text/plain")},
    )
    assert failed.status_code == 400
    assert client.get(f"/api/wedding_photos/{photo_id}").content == WEBP


def test_photo_requires_login_and_wedding(tmp_path: Path) -> None:
    ConfigManager.reset()
    load_config_from_mapping(_settings(tmp_path))
    reset_engine()
    from src.main import app

    with TestClient(app) as client:
        anon = client.get("/api/wedding_photos")
        assert anon.status_code == 401
        client.post(
            "/api/users",
            json={"username": "alice", "password": PASSWORD, "phone": PHONE_A},
        )
        missing = client.get("/api/wedding_photos")
        assert missing.status_code == 409
        assert missing.json()["error_code"] == "CONFLICT"
        upload = client.post(
            "/api/wedding_photos",
            files={"file": ("couple.jpg", JPEG, "image/jpeg")},
        )
        assert upload.status_code == 409
    reset_engine()
    ConfigManager.reset()


def test_delete_photo_and_unknown_id(client: TestClient) -> None:
    _login_with_wedding(client)
    uploaded = client.post(
        "/api/wedding_photos",
        files={"file": ("couple.jpg", JPEG, "image/jpeg")},
    )
    photo_id = uploaded.json()["data"]["id"]
    deleted = client.delete(f"/api/wedding_photos/{photo_id}")
    assert deleted.status_code == 200
    assert deleted.json()["data"] == {"ok": True}
    assert client.get("/api/wedding_photos").json()["data"] == []
    missing = client.delete(f"/api/wedding_photos/{photo_id}")
    assert missing.status_code == 404
