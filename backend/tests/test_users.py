from __future__ import annotations

import asyncio
import json
from collections.abc import Generator
from pathlib import Path
from urllib.parse import parse_qsl

import pytest
from fastapi.testclient import TestClient
from pycore.core import ConfigManager
from src.config.settings import load_config_from_mapping
from src.db.session import reset_engine
from src.services import sms_sender

PASSWORD = "Passw0rd1"
PHONE_A = "13800138000"
PHONE_B = "13800138001"


def _settings(tmp_path: Path, **overrides: object) -> dict:
    data: dict = {
        "secret_key": "test-only-jwt-secret-key-32bytes-min",
        "database_path": str(tmp_path / "Wedding_Master.db"),
        "host": "127.0.0.1",
        "port": 8099,
        "sms_mode": "mock",
        "bcrypt_rounds": 4,
        "jwt_expire_minutes_session": 720,
        "jwt_expire_days_remember": 30,
        "password_reset_ttl_seconds": 300,
        "password_reset_resend_seconds": 60,
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
def aliyun_client(tmp_path: Path) -> Generator[TestClient, None, None]:
    yield from _client(tmp_path, sms_mode="aliyun")


def _envelope(response):
    body = response.json()
    assert "success" in body
    assert "data" in body
    assert "error" in body
    assert "error_code" in body
    return body


def test_register_login_me_logout_success(client: TestClient) -> None:
    created = client.post(
        "/api/users",
        json={"username": "alice", "password": PASSWORD, "phone": PHONE_A},
    )
    assert created.status_code == 201
    body = _envelope(created)
    assert body["success"] is True
    assert body["data"]["username"] == "alice"
    assert body["data"]["phone"] == PHONE_A
    assert body["data"]["has_wedding"] is False
    cookie = created.headers.get("set-cookie", "")
    assert "access_token=" in cookie
    assert "HttpOnly" in cookie
    assert "Max-Age" not in cookie and "max-age" not in cookie.lower()

    me = client.get("/api/users/me")
    assert me.status_code == 200
    assert me.json()["data"]["username"] == "alice"

    logged_out = client.post("/api/users/logout")
    assert logged_out.status_code == 200
    assert logged_out.json()["data"] == {"ok": True}
    logout_cookie = logged_out.headers.get("set-cookie", "").lower()
    assert "max-age=0" in logout_cookie

    denied = client.get("/api/users/me")
    assert denied.status_code == 401
    assert denied.json()["error_code"] == "UNAUTHORIZED"

    login = client.post(
        "/api/users/login",
        json={"username": "alice", "password": PASSWORD, "remember": False},
    )
    assert login.status_code == 200
    assert login.json()["data"]["username"] == "alice"


def test_register_special_usernames(client: TestClient) -> None:
    cases = [
        ("Kevin Wang", "13800138100"),
        ("王恺博", "13800138101"),
        ("1号新人", "13800138102"),
    ]
    for username, phone in cases:
        response = client.post(
            "/api/users",
            json={"username": username, "password": PASSWORD, "phone": phone},
        )
        assert response.status_code == 201, response.text
        assert response.json()["data"]["username"] == username
        login = client.post(
            "/api/users/login",
            json={"username": username, "password": PASSWORD, "remember": False},
        )
        assert login.status_code == 200
        assert login.json()["data"]["username"] == username


def test_register_validation_400(client: TestClient) -> None:
    short = client.post(
        "/api/users",
        json={"username": "bob", "password": "Ab1", "phone": PHONE_A},
    )
    assert short.status_code == 400
    assert short.json()["error_code"] == "VALIDATION_ERROR"
    assert "8" in short.json()["error"]

    no_upper = client.post(
        "/api/users",
        json={"username": "bob", "password": "passw0rd", "phone": PHONE_A},
    )
    assert no_upper.status_code == 400
    assert "大写" in no_upper.json()["error"]

    no_lower = client.post(
        "/api/users",
        json={"username": "bob", "password": "PASSW0RD", "phone": PHONE_A},
    )
    assert no_lower.status_code == 400
    assert "小写" in no_lower.json()["error"]

    no_digit = client.post(
        "/api/users",
        json={"username": "bob", "password": "Password", "phone": PHONE_A},
    )
    assert no_digit.status_code == 400
    assert "数字" in no_digit.json()["error"]

    empty_phone = client.post(
        "/api/users",
        json={"username": "bob", "password": PASSWORD, "phone": ""},
    )
    assert empty_phone.status_code == 400
    assert empty_phone.json()["error"] == "未填手机号"

    missing_phone = client.post(
        "/api/users",
        json={"username": "bob", "password": PASSWORD},
    )
    assert missing_phone.status_code == 400
    assert missing_phone.json()["error_code"] == "VALIDATION_ERROR"
    assert missing_phone.json()["error"] == "未填手机号"


def test_register_conflict_409(client: TestClient) -> None:
    payload = {"username": "alice", "password": PASSWORD, "phone": PHONE_A}
    assert client.post("/api/users", json=payload).status_code == 201
    dup_phone = client.post(
        "/api/users",
        json={"username": "bob", "password": PASSWORD, "phone": PHONE_A},
    )
    assert dup_phone.status_code == 409
    assert dup_phone.json()["error_code"] == "CONFLICT"
    assert "手机号" in dup_phone.json()["error"]

    dup_name = client.post(
        "/api/users",
        json={"username": "alice", "password": PASSWORD, "phone": PHONE_B},
    )
    assert dup_name.status_code == 409
    assert dup_name.json()["error_code"] == "CONFLICT"


def test_login_unauthorized_401(client: TestClient) -> None:
    client.post(
        "/api/users",
        json={"username": "alice", "password": PASSWORD, "phone": PHONE_A},
    )
    client.post("/api/users/logout")
    wrong = client.post(
        "/api/users/login",
        json={"username": "alice", "password": "Wrongpass1", "remember": False},
    )
    assert wrong.status_code == 401
    assert wrong.json()["error_code"] == "UNAUTHORIZED"
    assert "用户名或密码" in wrong.json()["error"]
    missing = client.get("/api/users/me")
    assert missing.status_code == 401


def test_remember_cookie_max_age(client: TestClient) -> None:
    client.post(
        "/api/users",
        json={"username": "alice", "password": PASSWORD, "phone": PHONE_A},
    )
    client.post("/api/users/logout")
    remembered = client.post(
        "/api/users/login",
        json={"username": "alice", "password": PASSWORD, "remember": True},
    )
    assert remembered.status_code == 200
    header = remembered.headers.get("set-cookie", "")
    assert "Max-Age=2592000" in header or "max-age=2592000" in header.lower()

    session = client.post(
        "/api/users/login",
        json={"username": "alice", "password": PASSWORD, "remember": False},
    )
    session_header = session.headers.get("set-cookie", "").lower()
    assert "max-age=2592000" not in session_header


def test_multi_session_and_reset_invalidates_old_jwt(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.post(
        "/api/users",
        json={"username": "alice", "password": PASSWORD, "phone": PHONE_A},
    )
    client.post("/api/users/logout")
    first = client.post(
        "/api/users/login",
        json={"username": "alice", "password": PASSWORD, "remember": False},
    )
    token_one = first.cookies.get("access_token")
    client.cookies.clear()
    second = client.post(
        "/api/users/login",
        json={"username": "alice", "password": PASSWORD, "remember": False},
    )
    token_two = second.cookies.get("access_token")
    assert token_one
    assert token_two
    assert token_one != token_two
    assert (
        client.get("/api/users/me", cookies={"access_token": token_one}).status_code == 200
    )
    assert (
        client.get("/api/users/me", cookies={"access_token": token_two}).status_code == 200
    )

    monkeypatch.setattr(sms_sender, "generate_numeric_code", lambda: "123456")
    sent = client.post(
        "/api/users/password-reset/send-code",
        json={"phone": PHONE_A},
    )
    assert sent.status_code == 200
    confirmed = client.post(
        "/api/users/password-reset/confirm",
        json={"phone": PHONE_A, "code": "123456", "new_password": "N3wpass1"},
    )
    assert confirmed.status_code == 200
    assert (
        client.get("/api/users/me", cookies={"access_token": token_one}).status_code == 401
    )
    assert (
        client.get("/api/users/me", cookies={"access_token": token_two}).status_code == 401
    )
    old_login = client.post(
        "/api/users/login",
        json={"username": "alice", "password": PASSWORD, "remember": False},
    )
    assert old_login.status_code == 401
    new_login = client.post(
        "/api/users/login",
        json={"username": "alice", "password": "N3wpass1", "remember": False},
    )
    assert new_login.status_code == 200


def test_send_code_mock_does_not_return_code(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.post(
        "/api/users",
        json={"username": "alice", "password": PASSWORD, "phone": PHONE_A},
    )
    monkeypatch.setattr(sms_sender, "generate_numeric_code", lambda: "654321")
    sent = client.post(
        "/api/users/password-reset/send-code",
        json={"phone": PHONE_A},
    )
    assert sent.status_code == 200
    body = _envelope(sent)
    assert body["success"] is True
    assert body["data"] == {
        "expires_in_seconds": 300,
        "resend_after_seconds": 60,
    }
    assert "654321" not in sent.text
    assert "code" not in body["data"]

    again = client.post(
        "/api/users/password-reset/send-code",
        json={"phone": PHONE_A},
    )
    assert again.status_code == 400
    assert again.json()["error_code"] == "VALIDATION_ERROR"

    missing = client.post(
        "/api/users/password-reset/send-code",
        json={"phone": "13900001111"},
    )
    assert missing.status_code == 404
    assert missing.json()["error"] == "该手机号未注册"


def test_confirm_reset_400(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.post(
        "/api/users",
        json={"username": "alice", "password": PASSWORD, "phone": PHONE_A},
    )
    monkeypatch.setattr(sms_sender, "generate_numeric_code", lambda: "123456")
    client.post("/api/users/password-reset/send-code", json={"phone": PHONE_A})
    wrong = client.post(
        "/api/users/password-reset/confirm",
        json={"phone": PHONE_A, "code": "000000", "new_password": "N3wpass1"},
    )
    assert wrong.status_code == 400
    assert wrong.json()["error_code"] == "VALIDATION_ERROR"
    weak = client.post(
        "/api/users/password-reset/confirm",
        json={"phone": PHONE_A, "code": "123456", "new_password": "short"},
    )
    assert weak.status_code == 400
    still_old = client.post(
        "/api/users/login",
        json={"username": "alice", "password": PASSWORD, "remember": False},
    )
    assert still_old.status_code == 200


def test_logout_without_cookie_is_200(client: TestClient) -> None:
    response = client.post("/api/users/logout")
    assert response.status_code == 200
    assert response.json()["data"] == {"ok": True}


def test_aliyun_missing_keys_send_code_500_login_still_works(
    aliyun_client: TestClient,
) -> None:
    created = aliyun_client.post(
        "/api/users",
        json={"username": "alice", "password": PASSWORD, "phone": PHONE_A},
    )
    assert created.status_code == 201
    sent = aliyun_client.post(
        "/api/users/password-reset/send-code",
        json={"phone": PHONE_A},
    )
    assert sent.status_code == 500
    assert sent.json()["error_code"] == "INTERNAL_ERROR"
    aliyun_client.post("/api/users/logout")
    login = aliyun_client.post(
        "/api/users/login",
        json={"username": "alice", "password": PASSWORD, "remember": False},
    )
    assert login.status_code == 200
    me = aliyun_client.get("/api/users/me")
    assert me.status_code == 200


def test_aliyun_send_uses_personal_verify_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    ConfigManager.reset()
    load_config_from_mapping(
        _settings(
            tmp_path,
            sms_mode="aliyun",
            aliyun_sms_access_key_id="LTAI" + "a" * 20,
            aliyun_sms_access_key_secret="b" * 30,
            aliyun_sms_sign_name="恒创联众",
            aliyun_sms_template_code="100003",
            aliyun_sms_endpoint="https://dypnsapi.aliyuncs.com",
            aliyun_sms_region="cn-hangzhou",
            aliyun_sms_template_param_key="code",
            password_reset_ttl_seconds=300,
        )
    )
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {"Code": "OK", "Model": {"BizId": "biz-1"}}

    class FakeClient:
        def __init__(self, *_args: object, **kwargs: object) -> None:
            captured["client_kwargs"] = kwargs

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_exc: object) -> bool:
            return False

        async def post(self, url: str, headers: dict[str, str], content: bytes) -> FakeResponse:
            captured["url"] = url
            captured["headers"] = headers
            captured["content"] = content
            return FakeResponse()

    monkeypatch.setattr(sms_sender.httpx, "AsyncClient", FakeClient)
    asyncio.run(sms_sender.send_aliyun_sms(PHONE_A, "123456"))
    ConfigManager.reset()

    assert captured["url"] == "https://dypnsapi.aliyuncs.com/"
    headers = captured["headers"]
    assert isinstance(headers, dict)
    assert headers["x-acs-action"] == "SendSmsVerifyCode"
    client_kwargs = captured["client_kwargs"]
    assert isinstance(client_kwargs, dict)
    assert client_kwargs["trust_env"] is False
    content = captured["content"]
    assert isinstance(content, bytes)
    fields = dict(parse_qsl(content.decode()))
    assert fields["PhoneNumber"] == PHONE_A
    assert "PhoneNumbers" not in fields
    assert "RegionId" not in fields
    assert fields["SignName"] == "恒创联众"
    assert fields["TemplateCode"] == "100003"
    assert json.loads(fields["TemplateParam"]) == {"code": "123456", "min": "5"}
