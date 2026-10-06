from __future__ import annotations

from collections.abc import Generator
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pycore.core import ConfigManager
from src.config.settings import load_config_from_mapping
from src.db.session import reset_engine
from src.utils import current_stage

PASSWORD = "Passw0rd1"
PHONE_A = "13800138310"

CREATE_BODY = {
    "start_date": "2026-10-02",
    "wedding_date": "2027-10-20",
    "city": "杭州",
    "total_budget_fen": 20000000,
    "guest_estimate": 80,
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
    return body


def _register(client: TestClient) -> None:
    created = client.post(
        "/api/users",
        json={"username": "alice", "password": PASSWORD, "phone": PHONE_A},
    )
    assert created.status_code == 201


def _create_wedding(client: TestClient) -> dict:
    response = client.post("/api/weddings", json=CREATE_BODY)
    assert response.status_code == 201, response.text
    return _envelope(response)["data"]


def _plan(client: TestClient) -> dict:
    response = client.get("/api/tasks")
    assert response.status_code == 200, response.text
    return _envelope(response)["data"]


def test_create_stage_appends_default_name(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    created = client.post("/api/stages", json={})
    assert created.status_code == 201, created.text
    stage = _envelope(created)["data"]
    assert stage["name"] == "新阶段"
    assert stage["sort_order"] == 5
    plan = _plan(client)
    assert plan["stages"][-1]["id"] == stage["id"]
    assert plan["stages"][-1]["name"] == "新阶段"


def test_empty_stage_name_rejected(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    stage_id = _plan(client)["stages"][0]["id"]
    empty = client.patch(f"/api/stages/{stage_id}", json={"name": "   "})
    assert empty.status_code == 400
    assert empty.json()["error_code"] == "VALIDATION_ERROR"
    assert _plan(client)["stages"][0]["name"] == "备婚启动期"
    created = client.post("/api/stages", json={"name": ""})
    assert created.status_code == 400


def test_rename_and_reorder_stage(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    plan = _plan(client)
    last = plan["stages"][-1]
    renamed = client.patch(f"/api/stages/{last['id']}", json={"name": "典礼周"})
    assert renamed.status_code == 200
    assert renamed.json()["data"]["name"] == "典礼周"
    moved = client.patch(f"/api/stages/{last['id']}", json={"sort_order": 0})
    assert moved.status_code == 200
    names = [stage["name"] for stage in _plan(client)["stages"]]
    assert names[0] == "典礼周"
    assert names[1] == "备婚启动期"
    assert [stage["sort_order"] for stage in _plan(client)["stages"]] == list(range(5))


def test_delete_stage_cascades_tasks_after_confirm_request(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(current_stage, "shanghai_today", lambda: date(2027, 10, 13))
    _register(client)
    _create_wedding(client)
    plan = _plan(client)
    week = next(stage for stage in plan["stages"] if stage["name"] == "婚礼周")
    week_task_ids = [task["id"] for task in plan["tasks"] if task["stage_id"] == week["id"]]
    assert week_task_ids
    assert plan["current_stage"] == week["id"]
    kept = client.get("/api/tasks")
    assert any(task["id"] in week_task_ids for task in kept.json()["data"]["tasks"])
    deleted = client.delete(f"/api/stages/{week['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["data"] == {"ok": True}
    after = _plan(client)
    names = [stage["name"] for stage in after["stages"]]
    assert "婚礼周" not in names
    assert all(task["id"] not in week_task_ids for task in after["tasks"])
    assert after["current_stage"] is None
    assert [stage["sort_order"] for stage in after["stages"]] == list(range(4))
    missing = client.delete(f"/api/stages/{week['id']}")
    assert missing.status_code == 404
