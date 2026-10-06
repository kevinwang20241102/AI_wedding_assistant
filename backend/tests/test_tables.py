from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pycore.core import ConfigManager
from src.config.settings import load_config_from_mapping
from src.db.session import reset_engine
from src.services.table_service import DEFAULT_TABLE_CAPACITY

PASSWORD = "Passw0rd1"
PHONE_A = "13800138510"
PHONE_B = "13800138511"

CREATE_BODY = {
    "start_date": "2026-10-02",
    "wedding_date": "2027-10-20",
    "city": "杭州",
    "total_budget_fen": 20000000,
    "guest_estimate": 80,
}

TABLE_KEYS = {
    "id",
    "table_number",
    "name",
    "capacity",
    "is_head",
    "pos_x",
    "pos_y",
    "seated_count",
}


def _settings(tmp_path: Path, **overrides: object) -> dict:
    data: dict = {
        "secret_key": "test-only-jwt-secret-key-32bytes-min",
        "database_path": str(tmp_path / "Wedding_Master.db"),
        "host": "127.0.0.1",
        "port": 8099,
        "sms_mode": "mock",
        "bcrypt_rounds": 4,
        "wedding_photo_dir": str(tmp_path / "wedding_photos"),
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
    assert "data" in body
    assert "error" in body
    assert "error_code" in body
    return body


def _register(client: TestClient, username: str = "alice", phone: str = PHONE_A) -> None:
    created = client.post(
        "/api/users",
        json={"username": username, "password": PASSWORD, "phone": phone},
    )
    assert created.status_code == 201


def _create_wedding(client: TestClient, **overrides: object) -> dict:
    body = {**CREATE_BODY, **overrides}
    response = client.post("/api/weddings", json=body)
    assert response.status_code == 201, response.text
    return _envelope(response)["data"]


def _tables(client: TestClient) -> list[dict]:
    response = client.get("/api/tables")
    assert response.status_code == 200, response.text
    data = _envelope(response)["data"]
    assert isinstance(data, list)
    return data


def _add_guest(client: TestClient, name: str) -> dict:
    response = client.post("/api/guests", json={"name": name})
    assert response.status_code == 201, response.text
    return _envelope(response)["data"]


def test_new_table_default_name_capacity_and_head_mark(client: TestClient) -> None:
    _register(client)
    missing = client.get("/api/tables")
    assert missing.status_code == 409
    assert missing.json()["error_code"] == "CONFLICT"
    _create_wedding(client)
    first = client.post("/api/tables", json={})
    assert first.status_code == 201, first.text
    table_one = _envelope(first)["data"]
    assert set(table_one.keys()) == TABLE_KEYS
    assert table_one["table_number"] == 1
    assert table_one["name"] == "第 1 桌"
    assert table_one["capacity"] == DEFAULT_TABLE_CAPACITY
    assert table_one["is_head"] is False
    assert table_one["pos_x"] == 0
    assert table_one["pos_y"] == 0
    assert table_one["seated_count"] == 0
    second = client.post("/api/tables", json={})
    table_two = _envelope(second)["data"]
    assert table_two["table_number"] == 2
    assert table_two["name"] == "第 2 桌"
    assert table_two["capacity"] == DEFAULT_TABLE_CAPACITY
    marked = client.patch(f"/api/tables/{table_two['id']}", json={"is_head": True})
    assert marked.status_code == 200, marked.text
    assert _envelope(marked)["data"]["is_head"] is True
    listed = _tables(client)
    assert listed[0]["id"] == table_two["id"]
    assert listed[0]["is_head"] is True
    assert listed[1]["id"] == table_one["id"]
    assert listed[1]["is_head"] is False
    switched = client.patch(f"/api/tables/{table_one['id']}", json={"is_head": True})
    assert switched.status_code == 200
    after = _tables(client)
    assert after[0]["id"] == table_one["id"]
    assert after[0]["is_head"] is True
    assert after[1]["id"] == table_two["id"]
    assert after[1]["is_head"] is False
    renamed = client.patch(
        f"/api/tables/{table_two['id']}",
        json={"name": "亲友桌", "capacity": 1, "pos_x": 12.5, "pos_y": 40},
    )
    body = _envelope(renamed)["data"]
    assert body["name"] == "亲友桌"
    assert body["capacity"] == 1
    assert body["pos_x"] == 12.5
    assert body["pos_y"] == 40
    too_small = client.patch(f"/api/tables/{table_two['id']}", json={"capacity": 0})
    assert too_small.status_code == 400


def test_seat_over_capacity_still_ok_and_delete_occupied_table(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    guest_a = _add_guest(client, "甲")
    guest_b = _add_guest(client, "乙")
    created = client.post("/api/tables", json={"capacity": 1})
    table = _envelope(created)["data"]
    assert table["capacity"] == 1
    first_seat = client.patch(
        f"/api/guests/{guest_a['id']}",
        json={"table_id": table["id"]},
    )
    assert first_seat.status_code == 200, first_seat.text
    first_body = _envelope(first_seat)["data"]
    assert first_body["guest"]["table_id"] == table["id"]
    assert first_body["table"]["id"] == table["id"]
    assert first_body["table"]["seated_count"] == 1
    assert first_body["seating_stats"]["seated_count"] == 1
    assert first_body["seating_stats"]["unseated_count"] == 1
    second_seat = client.patch(
        f"/api/guests/{guest_b['id']}",
        json={"table_id": table["id"]},
    )
    assert second_seat.status_code == 200, second_seat.text
    second_body = _envelope(second_seat)["data"]
    assert second_body["guest"]["table_id"] == table["id"]
    assert second_body["table"]["seated_count"] == 2
    assert second_body["seating_stats"]["guest_total"] == 2
    assert second_body["seating_stats"]["seated_count"] == 2
    listed = _tables(client)
    assert listed[0]["seated_count"] == 2
    guests_before = client.get("/api/guests")
    before_data = _envelope(guests_before)["data"]
    assert before_data["seating_stats"]["guest_total"] == 2
    deleted = client.delete(f"/api/tables/{table['id']}")
    assert deleted.status_code == 200, deleted.text
    delete_data = _envelope(deleted)["data"]
    assert delete_data["ok"] is True
    assert delete_data["seating_stats"]["guest_total"] == 2
    assert delete_data["seating_stats"]["seated_count"] == 0
    assert delete_data["seating_stats"]["unseated_count"] == 2
    assert _tables(client) == []
    remaining = _envelope(client.get("/api/guests"))["data"]
    assert remaining["seating_stats"]["guest_total"] == 2
    names = {item["name"] for item in remaining["guests"]}
    assert names == {"甲", "乙"}
    assert all(item["table_id"] is None for item in remaining["guests"])
    missing = client.delete(f"/api/tables/{table['id']}")
    assert missing.status_code == 404
    unknown_table = client.patch(
        f"/api/guests/{guest_a['id']}",
        json={"table_id": table["id"]},
    )
    assert unknown_table.status_code == 404


def test_unseat_and_isolation(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    guest = _add_guest(client, "丙")
    table = _envelope(client.post("/api/tables", json={}))["data"]
    client.patch(f"/api/guests/{guest['id']}", json={"table_id": table["id"]})
    unseated = client.patch(f"/api/guests/{guest['id']}", json={"table_id": None})
    assert unseated.status_code == 200
    body = _envelope(unseated)["data"]
    assert body["guest"]["table_id"] is None
    assert body["table"]["id"] == table["id"]
    assert body["table"]["seated_count"] == 0
    assert body["seating_stats"]["seated_count"] == 0
    client.post("/api/users/logout")
    _register(client, username="bob", phone=PHONE_B)
    _create_wedding(client, city="上海")
    other = client.patch(f"/api/tables/{table['id']}", json={"is_head": True})
    assert other.status_code == 404
    assert _tables(client) == []
    bob_guest = _add_guest(client, "丁")
    stolen = client.patch(
        f"/api/guests/{bob_guest['id']}",
        json={"table_id": table["id"]},
    )
    assert stolen.status_code == 404
