from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pycore.core import ConfigManager
from src.config.settings import load_config_from_mapping
from src.db.session import reset_engine
from src.services.wedding_service import DEFAULT_BUDGET_CATEGORIES

PASSWORD = "Passw0rd1"
PHONE_A = "13800138400"
PHONE_B = "13800138401"

CREATE_BODY = {
    "start_date": "2026-10-02",
    "wedding_date": "2027-10-20",
    "city": "杭州",
    "total_budget_fen": 20000000,
    "guest_estimate": 80,
}

LIST_KEYS = {
    "total_budget_fen",
    "allocated_fen",
    "unallocated_fen",
    "is_over_allocated",
    "categories",
}
CATEGORY_KEYS = {"id", "name", "amount_fen", "status", "note", "sort_order"}
EXPENSE_MARKERS = (
    "支出",
    "付款",
    "actual",
    "spent",
    "expense",
    "payment",
    "paid_fen",
    "actual_fen",
)


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


def _budget(client: TestClient) -> dict:
    response = client.get("/api/budget_categories")
    assert response.status_code == 200, response.text
    return _envelope(response)["data"]


def _assert_no_expense_fields(payload: object) -> None:
    text = str(payload)
    for marker in EXPENSE_MARKERS:
        assert marker not in text
    if isinstance(payload, dict):
        lowered = {str(key).lower() for key in payload}
        assert lowered.isdisjoint({item.lower() for item in EXPENSE_MARKERS})
        for value in payload.values():
            _assert_no_expense_fields(value)
    elif isinstance(payload, list):
        for item in payload:
            _assert_no_expense_fields(item)


def test_list_matches_preset_order_and_zero_amounts(client: TestClient) -> None:
    _register(client)
    wedding = _create_wedding(client)
    data = _budget(client)
    assert set(data.keys()) == LIST_KEYS
    names = [item["name"] for item in data["categories"]]
    assert names == list(DEFAULT_BUDGET_CATEGORIES)
    assert len(names) == 17
    assert all(item["amount_fen"] == 0 for item in data["categories"])
    assert all(item["status"] == "未确定" for item in data["categories"])
    assert all(item["note"] == "" for item in data["categories"])
    assert [item["sort_order"] for item in data["categories"]] == list(range(17))
    assert data["total_budget_fen"] == wedding["total_budget_fen"]
    assert data["allocated_fen"] == 0
    assert data["unallocated_fen"] == wedding["total_budget_fen"]
    assert data["is_over_allocated"] is False
    _assert_no_expense_fields(data)
    for item in data["categories"]:
        assert set(item.keys()) == CATEGORY_KEYS


def test_patch_one_category_leaves_others_and_allows_over_allocate(
    client: TestClient,
) -> None:
    _register(client)
    wedding = _create_wedding(client)
    before = _budget(client)
    target = before["categories"][0]
    other_amounts = {item["id"]: item["amount_fen"] for item in before["categories"][1:]}
    over_amount = wedding["total_budget_fen"] + 12345
    patched = client.patch(
        f"/api/budget_categories/{target['id']}",
        json={"amount_fen": over_amount, "status": "已确定", "note": "场地定金"},
    )
    assert patched.status_code == 200, patched.text
    body = _envelope(patched)["data"]
    assert body["id"] == target["id"]
    assert body["amount_fen"] == over_amount
    assert body["status"] == "已确定"
    assert body["note"] == "场地定金"
    assert body["name"] == target["name"]
    after = _budget(client)
    assert after["categories"][0]["amount_fen"] == over_amount
    for item in after["categories"][1:]:
        assert item["amount_fen"] == other_amounts[item["id"]]
    expected_unallocated = wedding["total_budget_fen"] - over_amount
    assert after["allocated_fen"] == over_amount
    assert after["unallocated_fen"] == expected_unallocated
    assert after["unallocated_fen"] < 0
    assert after["is_over_allocated"] is True
    _assert_no_expense_fields(after)


def test_create_empty_note_and_reject_invalid_name_or_amount(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    created = client.post(
        "/api/budget_categories",
        json={"name": "备用金", "note": ""},
    )
    assert created.status_code == 201, created.text
    public = _envelope(created)["data"]
    assert public["name"] == "备用金"
    assert public["amount_fen"] == 0
    assert public["status"] == "未确定"
    assert public["note"] == ""
    assert public["sort_order"] == 17
    after = _budget(client)
    assert after["categories"][-1]["id"] == public["id"]
    empty = client.post("/api/budget_categories", json={"name": "   "})
    assert empty.status_code == 400
    assert empty.json()["error_code"] == "VALIDATION_ERROR"
    missing = client.post("/api/budget_categories", json={"amount_fen": 100})
    assert missing.status_code == 400
    negative = client.patch(
        f"/api/budget_categories/{public['id']}",
        json={"amount_fen": -1},
    )
    assert negative.status_code == 400
    assert negative.json()["error_code"] == "VALIDATION_ERROR"
    not_int = client.patch(
        f"/api/budget_categories/{public['id']}",
        json={"amount_fen": "abc"},
    )
    assert not_int.status_code == 400
    unchanged = _budget(client)
    custom = next(item for item in unchanged["categories"] if item["id"] == public["id"])
    assert custom["amount_fen"] == 0


def test_delete_preset_and_custom_then_reindex(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    listed = _budget(client)
    preset_id = listed["categories"][0]["id"]
    created = client.post(
        "/api/budget_categories",
        json={"name": "自定义彩妆", "amount_fen": 50000, "status": "已支付"},
    )
    custom_id = _envelope(created)["data"]["id"]
    deleted_preset = client.delete(f"/api/budget_categories/{preset_id}")
    assert deleted_preset.status_code == 200
    assert _envelope(deleted_preset)["data"] == {"ok": True}
    after_preset = _budget(client)
    names = [item["name"] for item in after_preset["categories"]]
    assert "婚礼场地费" not in names
    assert names[0] == "婚宴餐费"
    assert [item["sort_order"] for item in after_preset["categories"]] == list(
        range(len(after_preset["categories"]))
    )
    deleted_custom = client.delete(f"/api/budget_categories/{custom_id}")
    assert deleted_custom.status_code == 200
    after_custom = _budget(client)
    assert all(item["id"] != custom_id for item in after_custom["categories"])
    missing = client.delete(f"/api/budget_categories/{custom_id}")
    assert missing.status_code == 404
    assert missing.json()["error_code"] == "NOT_FOUND"


def test_reorder_keeps_amounts_and_total_budget_change_recomputes(
    client: TestClient,
) -> None:
    _register(client)
    _create_wedding(client)
    listed = _budget(client)
    first = listed["categories"][0]
    last = listed["categories"][-1]
    client.patch(
        f"/api/budget_categories/{first['id']}",
        json={"amount_fen": 10000},
    )
    moved = client.patch(
        f"/api/budget_categories/{last['id']}",
        json={"sort_order": 0},
    )
    assert moved.status_code == 200, moved.text
    after_move = _budget(client)
    assert after_move["categories"][0]["id"] == last["id"]
    assert after_move["categories"][0]["amount_fen"] == 0
    assert after_move["categories"][0]["name"] == last["name"]
    assert after_move["categories"][0]["status"] == last["status"]
    moved_first = next(item for item in after_move["categories"] if item["id"] == first["id"])
    assert moved_first["amount_fen"] == 10000
    assert moved_first["name"] == first["name"]
    assert [item["sort_order"] for item in after_move["categories"]] == list(range(17))
    patched_wedding = client.patch("/api/weddings/current", json={"total_budget_fen": 8000})
    assert patched_wedding.status_code == 200, patched_wedding.text
    after_total = _budget(client)
    assert after_total["total_budget_fen"] == 8000
    assert after_total["allocated_fen"] == 10000
    assert after_total["unallocated_fen"] == -2000
    assert after_total["is_over_allocated"] is True
    by_id = {item["id"]: item["amount_fen"] for item in after_total["categories"]}
    assert by_id[first["id"]] == 10000
    assert by_id[last["id"]] == 0


def test_no_project_conflict_auth_and_isolation(client: TestClient) -> None:
    _register(client)
    missing = client.get("/api/budget_categories")
    assert missing.status_code == 409
    assert missing.json()["error_code"] == "CONFLICT"
    _create_wedding(client)
    category_id = _budget(client)["categories"][0]["id"]
    client.post("/api/users/logout")
    unauth = client.get("/api/budget_categories")
    assert unauth.status_code == 401
    _register(client, username="bob", phone=PHONE_B)
    _create_wedding(client, city="上海", total_budget_fen=1000000)
    other = client.patch(
        f"/api/budget_categories/{category_id}",
        json={"amount_fen": 1},
    )
    assert other.status_code == 404
    bob_data = _budget(client)
    assert all(item["amount_fen"] == 0 for item in bob_data["categories"])
    assert bob_data["total_budget_fen"] == 1000000
