from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pycore.core import ConfigManager
from src.config.settings import load_config_from_mapping
from src.db.session import reset_engine
from src.services.wedding_service import DEFAULT_GUEST_GROUPS

PASSWORD = "Passw0rd1"
PHONE_A = "13800138500"
PHONE_B = "13800138501"

CREATE_BODY = {
    "start_date": "2026-10-02",
    "wedding_date": "2027-10-20",
    "city": "杭州",
    "total_budget_fen": 20000000,
    "guest_estimate": 80,
}

GUEST_KEYS = {"id", "name", "group_id", "attendance", "seq", "note", "table_id"}
STATS_KEYS = {"guest_total", "confirmed_count", "seated_count", "unseated_count"}


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


def _groups(client: TestClient) -> list[dict]:
    response = client.get("/api/guest_groups")
    assert response.status_code == 200, response.text
    data = _envelope(response)["data"]
    assert isinstance(data, list)
    return data


def _guests(client: TestClient) -> dict:
    response = client.get("/api/guests")
    assert response.status_code == 200, response.text
    return _envelope(response)["data"]


def _group_id(groups: list[dict], name: str) -> int:
    return next(item["id"] for item in groups if item["name"] == name)


def test_preset_groups_and_custom_unique_in_project(client: TestClient) -> None:
    _register(client)
    missing = client.get("/api/guest_groups")
    assert missing.status_code == 409
    assert missing.json()["error_code"] == "CONFLICT"
    _create_wedding(client)
    groups = _groups(client)
    assert [item["name"] for item in groups] == list(DEFAULT_GUEST_GROUPS)
    assert all(item["is_preset"] is True for item in groups)
    created = client.post("/api/guest_groups", json={"name": "同学"})
    assert created.status_code == 201, created.text
    custom = _envelope(created)["data"]
    assert custom["name"] == "同学"
    assert custom["is_preset"] is False
    duplicate = client.post("/api/guest_groups", json={"name": "同学"})
    assert duplicate.status_code == 409
    assert duplicate.json()["error_code"] == "CONFLICT"
    preset_dup = client.post("/api/guest_groups", json={"name": "新郎"})
    assert preset_dup.status_code == 409
    empty = client.post("/api/guest_groups", json={"name": "   "})
    assert empty.status_code == 400
    after = _groups(client)
    assert [item["name"] for item in after].count("同学") == 1


def test_guest_seq_default_zero_and_default_group(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    groups = _groups(client)
    groom_id = _group_id(groups, "新郎")
    created = client.post("/api/guests", json={"name": "张三"})
    assert created.status_code == 201, created.text
    guest = _envelope(created)["data"]
    assert set(guest.keys()) == GUEST_KEYS
    assert guest["name"] == "张三"
    assert guest["group_id"] == groom_id
    assert guest["attendance"] == "待定"
    assert guest["seq"] == 0
    assert guest["note"] == ""
    assert guest["table_id"] is None
    numeric = client.post(
        "/api/guests",
        json={"name": "李四", "seq": "", "attendance": "已确认"},
    )
    assert numeric.status_code == 201, numeric.text
    assert _envelope(numeric)["data"]["seq"] == 0
    assert _envelope(numeric)["data"]["attendance"] == "已确认"
    garbage = client.post("/api/guests", json={"name": "王五", "seq": "abc"})
    assert garbage.status_code == 201
    assert _envelope(garbage)["data"]["seq"] == 0
    ordered = client.post("/api/guests", json={"name": "赵六", "seq": 3})
    assert _envelope(ordered)["data"]["seq"] == 3
    listed = _guests(client)
    assert set(listed.keys()) == {"seating_stats", "guests"}
    assert set(listed["seating_stats"].keys()) == STATS_KEYS
    names = [item["name"] for item in listed["guests"]]
    assert names == ["张三", "李四", "王五", "赵六"]
    assert listed["seating_stats"]["guest_total"] == 4
    assert listed["seating_stats"]["confirmed_count"] == 1
    assert listed["seating_stats"]["seated_count"] == 0
    assert listed["seating_stats"]["unseated_count"] == 4
    missing_name = client.post("/api/guests", json={"seq": 1})
    assert missing_name.status_code == 400
    blank = client.post("/api/guests", json={"name": "  "})
    assert blank.status_code == 400
    missing_group = client.post("/api/guests", json={"name": "钱七", "group_id": 99999})
    assert missing_group.status_code == 404


def test_paste_assigns_known_group_suffix_and_rejects_empty(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    groups = _groups(client)
    bride_id = _group_id(groups, "新娘")
    groom_id = _group_id(groups, "新郎")
    relative_id = _group_id(groups, "男方亲属")
    pasted = client.post(
        "/api/guests/paste",
        json={"text": "只贴姓名\n周八 新娘\n吴九 男方亲属\n\n"},
    )
    assert pasted.status_code == 201, pasted.text
    data = _envelope(pasted)["data"]
    assert data["created_count"] == 3
    by_name = {item["name"]: item for item in data["guests"]}
    assert by_name["只贴姓名"]["group_id"] == groom_id
    assert by_name["只贴姓名"]["seq"] == 0
    assert by_name["周八"]["group_id"] == bride_id
    assert by_name["吴九"]["group_id"] == relative_id
    empty = client.post("/api/guests/paste", json={"text": "\n  \n"})
    assert empty.status_code == 400
    listed = _guests(client)
    assert listed["seating_stats"]["guest_total"] == 3


def test_delete_guest_and_patch_fields(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    groups = _groups(client)
    bride_id = _group_id(groups, "新娘")
    first = _envelope(client.post("/api/guests", json={"name": "甲", "seq": 1}))["data"]
    second = _envelope(client.post("/api/guests", json={"name": "乙", "seq": 2}))["data"]
    patched = client.patch(
        f"/api/guests/{first['id']}",
        json={"name": "甲改", "group_id": bride_id, "attendance": "已婉拒", "seq": 9},
    )
    assert patched.status_code == 200, patched.text
    body = _envelope(patched)["data"]
    assert body["guest"]["name"] == "甲改"
    assert body["guest"]["group_id"] == bride_id
    assert body["guest"]["attendance"] == "已婉拒"
    assert body["guest"]["seq"] == 9
    assert body["table"] is None
    deleted = client.delete(f"/api/guests/{first['id']}")
    assert deleted.status_code == 200
    delete_data = _envelope(deleted)["data"]
    assert delete_data["ok"] is True
    assert delete_data["seating_stats"]["guest_total"] == 1
    remaining = _guests(client)
    assert [item["id"] for item in remaining["guests"]] == [second["id"]]
    missing = client.delete(f"/api/guests/{first['id']}")
    assert missing.status_code == 404
    client.post("/api/users/logout")
    unauth = client.get("/api/guests")
    assert unauth.status_code == 401
    _register(client, username="bob", phone=PHONE_B)
    _create_wedding(client, city="上海")
    other = client.patch(f"/api/guests/{second['id']}", json={"name": "越权"})
    assert other.status_code == 404
    bob_list = _guests(client)
    assert bob_list["guests"] == []
    assert bob_list["seating_stats"]["guest_total"] == 0
