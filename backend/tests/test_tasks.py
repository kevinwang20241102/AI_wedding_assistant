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
from src.utils.due_dates import WINDOW_MID, WINDOW_MONTH, WINDOW_RUSH, WINDOW_START, WINDOW_WEEK

PASSWORD = "Passw0rd1"
PHONE_A = "13800138300"
PHONE_B = "13800138301"

CREATE_BODY = {
    "start_date": "2026-10-02",
    "wedding_date": "2027-10-20",
    "city": "杭州",
    "total_budget_fen": 20000000,
    "guest_estimate": 80,
}

STAGE_ORDER = ["备婚启动期", "正式筹备期", "婚前冲刺期", "婚礼月", "婚礼周"]
DUE_BY_STAGE_OCT = {
    "备婚启动期": "2027-04-20",
    "正式筹备期": "2027-07-20",
    "婚前冲刺期": "2027-09-20",
    "婚礼月": "2027-10-13",
    "婚礼周": "2027-10-20",
}
PLAN_KEYS = {
    "wedding_date",
    "countdown_days",
    "progress",
    "current_stage",
    "stages",
    "tasks",
}
PUSH_KEYS = {
    "push",
    "email",
    "sms",
    "notification",
    "notifications",
    "today_todos",
    "overdue_tasks",
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


def _plan(client: TestClient) -> dict:
    response = client.get("/api/tasks")
    assert response.status_code == 200, response.text
    return _envelope(response)["data"]


def test_current_window_six_today_dates() -> None:
    wedding = date(2027, 10, 20)
    cases = [
        (date(2026, 1, 1), WINDOW_START),
        (date(2027, 4, 20), WINDOW_MID),
        (date(2027, 7, 20), WINDOW_RUSH),
        (date(2027, 10, 1), WINDOW_MONTH),
        (date(2027, 10, 13), WINDOW_WEEK),
        (date(2027, 10, 21), None),
    ]
    for today, expected in cases:
        assert current_stage.current_window(wedding, today) == expected


def test_seed_due_dates_and_template_count(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(current_stage, "shanghai_today", lambda: date(2026, 1, 1))
    _register(client)
    _create_wedding(client)
    data = _plan(client)
    assert len(data["tasks"]) == 41
    assert [stage["name"] for stage in data["stages"]] == STAGE_ORDER
    assert {task["status"] for task in data["tasks"]} == {"未开始"}
    assert all(task["due_date_customized"] is False for task in data["tasks"])
    dues = {stage["name"]: None for stage in data["stages"]}
    stage_ids = {stage["id"]: stage["name"] for stage in data["stages"]}
    for task in data["tasks"]:
        dues[stage_ids[task["stage_id"]]] = task["due_date"]
    assert dues == DUE_BY_STAGE_OCT
    assert set(data.keys()) == PLAN_KEYS
    assert PUSH_KEYS.isdisjoint(data.keys())
    assert "今日待办" not in str(data)
    assert "逾期任务" not in str(data)


def test_seed_due_dates_march_month_rollback(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(current_stage, "shanghai_today", lambda: date(2026, 1, 1))
    _register(client)
    _create_wedding(client, start_date="2026-01-01", wedding_date="2027-03-31")
    data = _plan(client)
    stage_ids = {stage["id"]: stage["name"] for stage in data["stages"]}
    dues = {}
    for task in data["tasks"]:
        dues[stage_ids[task["stage_id"]]] = task["due_date"]
    assert dues["正式筹备期"] == "2026-12-31"
    assert dues["婚前冲刺期"] == "2027-02-28"


def test_api010_current_stage_six_dates_keep_order(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _register(client)
    _create_wedding(client)
    mapping = [
        (date(2026, 1, 1), "备婚启动期"),
        (date(2027, 4, 20), "正式筹备期"),
        (date(2027, 7, 20), "婚前冲刺期"),
        (date(2027, 10, 1), "婚礼月"),
        (date(2027, 10, 13), "婚礼周"),
        (date(2027, 10, 21), None),
    ]
    for today, expected_name in mapping:
        monkeypatch.setattr(current_stage, "shanghai_today", lambda today=today: today)
        data = _plan(client)
        names = [stage["name"] for stage in data["stages"]]
        assert names == STAGE_ORDER
        if expected_name is None:
            assert data["current_stage"] is None
        else:
            expected_id = next(
                stage["id"] for stage in data["stages"] if stage["name"] == expected_name
            )
            assert data["current_stage"] == expected_id
            assert data["stages"][0]["name"] == "备婚启动期"


def test_create_task_customized_and_front_of_stage(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    plan = _plan(client)
    start = plan["stages"][0]
    created = client.post(
        "/api/tasks",
        json={"name": "新任务", "stage_id": start["id"], "due_date": "2027-05-01"},
    )
    assert created.status_code == 201, created.text
    task = _envelope(created)["data"]
    assert task["name"] == "新任务"
    assert task["status"] == "未开始"
    assert task["due_date_customized"] is True
    assert task["stage_id"] == start["id"]
    assert task["sort_order"] == 0
    refreshed = _plan(client)
    first = next(item for item in refreshed["tasks"] if item["stage_id"] == start["id"])
    assert first["id"] == task["id"]
    assert first["due_date_customized"] is True
    assert refreshed["progress"]["total"] == 42


def test_patch_due_date_marks_customized_and_status_flow(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    plan = _plan(client)
    target = plan["tasks"][0]
    assert target["due_date_customized"] is False
    patched = client.patch(
        f"/api/tasks/{target['id']}",
        json={"due_date": "2027-06-01"},
    )
    assert patched.status_code == 200, patched.text
    data = _envelope(patched)["data"]
    assert data["due_date"] == "2027-06-01"
    assert data["due_date_customized"] is True

    doing = client.patch(f"/api/tasks/{target['id']}", json={"status": "进行中"})
    assert doing.status_code == 200
    assert doing.json()["data"]["status"] == "进行中"
    mid = _plan(client)
    assert mid["progress"]["in_progress"] == 1
    assert mid["progress"]["completed"] == 0

    done = client.patch(f"/api/tasks/{target['id']}", json={"status": "已完成"})
    assert done.status_code == 200
    assert done.json()["data"]["status"] == "已完成"
    after = _plan(client)
    assert after["progress"]["completed"] == 1
    assert after["progress"]["in_progress"] == 0
    assert after["progress"]["total"] == 41


def test_delete_only_when_requested(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    plan = _plan(client)
    task_id = plan["tasks"][0]["id"]
    still_there = _plan(client)
    assert any(item["id"] == task_id for item in still_there["tasks"])
    deleted = client.delete(f"/api/tasks/{task_id}")
    assert deleted.status_code == 200
    assert deleted.json()["data"] == {"ok": True}
    after = _plan(client)
    assert all(item["id"] != task_id for item in after["tasks"])
    assert after["progress"]["total"] == 40
    missing = client.delete(f"/api/tasks/{task_id}")
    assert missing.status_code == 404


def test_overdue_rewrite_skips_completed(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(current_stage, "shanghai_today", lambda: date(2026, 1, 1))
    _register(client)
    _create_wedding(client)
    plan = _plan(client)
    first = plan["tasks"][0]
    second = plan["tasks"][1]
    client.patch(f"/api/tasks/{first['id']}", json={"due_date": "2025-12-01"})
    client.patch(
        f"/api/tasks/{second['id']}",
        json={"due_date": "2025-12-01", "status": "已完成"},
    )
    monkeypatch.setattr(current_stage, "shanghai_today", lambda: date(2026, 2, 1))
    data = _plan(client)
    by_id = {item["id"]: item for item in data["tasks"]}
    assert by_id[first["id"]]["status"] == "已超期"
    assert by_id[second["id"]]["status"] == "已完成"
    assert data["progress"]["completed"] == 1


def test_no_project_conflict_and_auth(client: TestClient) -> None:
    _register(client)
    missing = client.get("/api/tasks")
    assert missing.status_code == 409
    assert missing.json()["error_code"] == "CONFLICT"
    client.post("/api/users/logout")
    unauth = client.get("/api/tasks")
    assert unauth.status_code == 401


def test_task_isolated_between_accounts(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    task_id = _plan(client)["tasks"][0]["id"]
    client.post("/api/users/logout")
    _register(client, username="bob", phone=PHONE_B)
    _create_wedding(client, city="上海")
    other = client.patch(f"/api/tasks/{task_id}", json={"name": "不该改到"})
    assert other.status_code == 404
