from __future__ import annotations

import sqlite3
from collections.abc import Generator
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pycore.core import ConfigManager
from src.config.settings import load_config_from_mapping
from src.db.session import reset_engine
from src.utils.due_dates import (
    WINDOW_MID,
    WINDOW_MONTH,
    WINDOW_RUSH,
    WINDOW_START,
    WINDOW_WEEK,
    suggested_due_date,
)

PASSWORD = "Passw0rd1"
PHONE_A = "13800138200"
PHONE_B = "13800138201"

CREATE_BODY = {
    "start_date": "2026-10-02",
    "wedding_date": "2027-10-20",
    "city": "杭州",
    "total_budget_fen": 20000000,
    "guest_estimate": 80,
    "groom_nickname": "不该写入",
    "other_preference": "建项不应接收",
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
        "wedding_photo_max_bytes": 5242880,
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


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "Wedding_Master.db"


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


def _table_count(db_file: Path, table: str, wedding_id: int) -> int:
    with sqlite3.connect(db_file) as conn:
        row = conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE wedding_id = ?",
            (wedding_id,),
        ).fetchone()
    return int(row[0])


def test_suggested_due_dates_match_spec() -> None:
    wedding = date(2027, 10, 20)
    assert suggested_due_date(wedding, WINDOW_START) == date(2027, 4, 20)
    assert suggested_due_date(wedding, WINDOW_MID) == date(2027, 7, 20)
    assert suggested_due_date(wedding, WINDOW_RUSH) == date(2027, 9, 20)
    assert suggested_due_date(wedding, WINDOW_MONTH) == date(2027, 10, 13)
    assert suggested_due_date(wedding, WINDOW_WEEK) == date(2027, 10, 20)
    leap = date(2027, 3, 31)
    assert suggested_due_date(leap, WINDOW_MID) == date(2026, 12, 31)
    assert suggested_due_date(leap, WINDOW_RUSH) == date(2027, 2, 28)


def test_create_wedding_once_then_conflict(client: TestClient, db_path: Path) -> None:
    _register(client)
    first = _create_wedding(client)
    assert first["city"] == "杭州"
    assert first["groom_nickname"] is None
    assert first["bride_nickname"] is None
    assert first["groom_birthday"] is None
    assert first["bride_birthday"] is None
    assert first["other_preference"] is None
    assert first["canvas_scale"] == 1
    assert first["canvas_offset_x"] == 0
    assert first["canvas_offset_y"] == 0
    assert "photos" not in first
    assert "url" not in first

    me = client.get("/api/users/me")
    assert me.status_code == 200
    assert me.json()["data"]["has_wedding"] is True

    wedding_id = first["id"]
    assert _table_count(db_path, "stages", wedding_id) == 5
    assert _table_count(db_path, "tasks", wedding_id) == 41
    assert _table_count(db_path, "budget_categories", wedding_id) == 17
    assert _table_count(db_path, "guest_groups", wedding_id) == 8

    with sqlite3.connect(db_path) as conn:
        dues = {
            name: due
            for name, due in conn.execute(
                """
                SELECT s.name, t.due_date
                FROM tasks t
                JOIN stages s ON s.id = t.stage_id
                GROUP BY s.name
                """
            )
        }
    assert dues["备婚启动期"] == "2027-04-20"
    assert dues["正式筹备期"] == "2027-07-20"
    assert dues["婚前冲刺期"] == "2027-09-20"
    assert dues["婚礼月"] == "2027-10-13"
    assert dues["婚礼周"] == "2027-10-20"

    again = client.post("/api/weddings", json=CREATE_BODY)
    assert again.status_code == 409
    body = _envelope(again)
    assert body["success"] is False
    assert body["error_code"] == "CONFLICT"
    assert "已经" in body["error"]
    assert _table_count(db_path, "stages", wedding_id) == 5


def test_create_validation_and_second_account(client: TestClient) -> None:
    _register(client)
    early = client.post(
        "/api/weddings",
        json={**CREATE_BODY, "wedding_date": "2026-01-01"},
    )
    assert early.status_code == 400
    assert early.json()["error_code"] == "VALIDATION_ERROR"

    missing = client.post("/api/weddings", json={"city": "杭州"})
    assert missing.status_code == 400

    client.post("/api/users/logout")
    _register(client, username="bob", phone=PHONE_B)
    created = _create_wedding(client, city="上海")
    assert created["city"] == "上海"


def test_patch_budget_and_guest_estimate_do_not_touch_lists(
    client: TestClient, db_path: Path
) -> None:
    _register(client)
    created = _create_wedding(client)
    wedding_id = created["id"]
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "UPDATE budget_categories SET amount_fen = 12345 WHERE wedding_id = ? AND name = ?",
            (wedding_id, "婚礼场地费"),
        )
        group_id = conn.execute(
            "SELECT id FROM guest_groups WHERE wedding_id = ? AND name = ?",
            (wedding_id, "新郎"),
        ).fetchone()[0]
        conn.execute(
            """
            INSERT INTO guests (wedding_id, name, group_id, attendance, seq)
            VALUES (?, '张三', ?, '已确认', 1)
            """,
            (wedding_id, group_id),
        )
        conn.commit()

    patched = client.patch(
        "/api/weddings/current",
        json={"total_budget_fen": 100000, "guest_estimate": 30},
    )
    assert patched.status_code == 200
    data = _envelope(patched)["data"]
    assert data["total_budget_fen"] == 100000
    assert data["guest_estimate"] == 30
    assert "photos" not in data

    with sqlite3.connect(db_path) as conn:
        amount = conn.execute(
            "SELECT amount_fen FROM budget_categories WHERE wedding_id = ? AND name = ?",
            (wedding_id, "婚礼场地费"),
        ).fetchone()[0]
        guests = conn.execute(
            "SELECT name, attendance FROM guests WHERE wedding_id = ?",
            (wedding_id,),
        ).fetchall()
    assert amount == 12345
    assert guests == [("张三", "已确认")]

    current = client.get("/api/weddings/current")
    assert current.status_code == 200
    stats = current.json()["data"]["seating_stats"]
    assert stats["guest_total"] == 1
    assert stats["confirmed_count"] == 1
    assert stats["seated_count"] == 0
    assert stats["unseated_count"] == 1


def test_empty_nickname_and_preference_newlines(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    saved = client.patch(
        "/api/weddings/current",
        json={
            "groom_nickname": "",
            "bride_nickname": "   ",
            "groom_birthday": "",
            "bride_birthday": "1999-08-08",
            "other_preference": "户外仪式\n不要司仪\n",
        },
    )
    assert saved.status_code == 200, saved.text
    data = _envelope(saved)["data"]
    assert data["groom_nickname"] is None
    assert data["bride_nickname"] is None
    assert data["groom_birthday"] is None
    assert data["bride_birthday"] == "1999-08-08"
    assert data["other_preference"] == "户外仪式\n不要司仪\n"

    again = client.get("/api/weddings/current")
    assert again.json()["data"]["other_preference"] == "户外仪式\n不要司仪\n"


def test_invalid_birthday_keeps_original(client: TestClient) -> None:
    _register(client)
    _create_wedding(client)
    client.patch("/api/weddings/current", json={"groom_birthday": "1990-01-01"})
    failed = client.patch("/api/weddings/current", json={"groom_birthday": "1990-13-40"})
    assert failed.status_code == 400
    assert failed.json()["error_code"] == "VALIDATION_ERROR"
    current = client.get("/api/weddings/current")
    assert current.json()["data"]["groom_birthday"] == "1990-01-01"


def test_change_wedding_date_recalculates_uncustomized_tasks(
    client: TestClient, db_path: Path
) -> None:
    _register(client)
    created = _create_wedding(client)
    wedding_id = created["id"]
    with sqlite3.connect(db_path) as conn:
        task_id, old_due = conn.execute(
            """
            SELECT t.id, t.due_date FROM tasks t
            JOIN stages s ON s.id = t.stage_id
            WHERE t.wedding_id = ? AND s.name = '备婚启动期'
            ORDER BY t.sort_order
            LIMIT 1
            """,
            (wedding_id,),
        ).fetchone()
        conn.execute(
            "UPDATE tasks SET due_date = '2027-05-01', due_date_customized = 1 WHERE id = ?",
            (task_id,),
        )
        conn.commit()
    assert old_due == "2027-04-20"

    patched = client.patch("/api/weddings/current", json={"wedding_date": "2027-11-20"})
    assert patched.status_code == 200
    assert patched.json()["data"]["wedding_date"] == "2027-11-20"

    with sqlite3.connect(db_path) as conn:
        customized = conn.execute(
            "SELECT due_date FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()[0]
        others = conn.execute(
            """
            SELECT DISTINCT t.due_date FROM tasks t
            JOIN stages s ON s.id = t.stage_id
            WHERE t.wedding_id = ? AND s.name = '备婚启动期' AND t.id != ?
            """,
            (wedding_id, task_id),
        ).fetchall()
    assert customized == "2027-05-01"
    assert others == [("2027-05-20",)]


def test_current_wedding_404_without_project(client: TestClient) -> None:
    _register(client)
    missing = client.get("/api/weddings/current")
    assert missing.status_code == 404
    assert missing.json()["error_code"] == "NOT_FOUND"
    client.post("/api/users/logout")
    unauth = client.get("/api/weddings/current")
    assert unauth.status_code == 401
