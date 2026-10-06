from __future__ import annotations

import asyncio
import json
from collections.abc import Generator
from datetime import date
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from pycore.core import ConfigManager
from src.config.settings import load_config_from_mapping
from src.db.session import reset_engine
from src.services import xiaobei_generator

PASSWORD = "Passw0rd1"
PHONE_A = "13800138400"
CREATE_BODY = {
    "start_date": "2026-10-02",
    "wedding_date": "2027-10-20",
    "city": "杭州",
    "total_budget_fen": 20000000,
    "guest_estimate": 80,
}
JPEG = bytes([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01])
PRO_IMAGE_ERROR = "当前模型看不了图片，请改用 Flash 后再发送图片。"
TEXT_TOO_LONG_ERROR = "您输入的文案太长了，请您缩减后再次发送。"


def _settings(tmp_path: Path, **overrides: object) -> dict:
    data: dict = {
        "secret_key": "test-only-jwt-secret-key-32bytes-min",
        "database_path": str(tmp_path / "Wedding_Master.db"),
        "host": "127.0.0.1",
        "port": 8099,
        "sms_mode": "mock",
        "bcrypt_rounds": 4,
        "deepseek_mode": "mock",
        "deepseek_api_key": "",
        "xiaobei_image_dir": str(tmp_path / "xiaobei_images"),
        "xiaobei_max_text_chars": 4000,
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


def _login_with_wedding(client: TestClient, phone: str = PHONE_A, username: str = "alice") -> None:
    created = client.post(
        "/api/users",
        json={"username": username, "password": PASSWORD, "phone": phone},
    )
    assert created.status_code == 201
    wedding = client.post("/api/weddings", json=CREATE_BODY)
    assert wedding.status_code == 201


def _parse_sse(text: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    event_name = "message"
    data_lines: list[str] = []
    for line in text.splitlines():
        if line.startswith("event:"):
            event_name = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
        elif line == "":
            if data_lines:
                events.append((event_name, json.loads("\n".join(data_lines))))
            event_name = "message"
            data_lines = []
    if data_lines:
        events.append((event_name, json.loads("\n".join(data_lines))))
    return events


def _collect_sse(response) -> tuple[int, list[tuple[str, dict]]]:
    body = "".join(response.iter_text())
    return response.status_code, _parse_sse(body)


async def _seed_user_and_wedding(db):
    from src.api.deps import hash_password
    from src.db.users import UserRepository
    from src.services.wedding_service import create_wedding

    repo = UserRepository(db)
    user = await repo.create("alice", PHONE_A, hash_password(PASSWORD))
    await create_wedding(
        db,
        user.id,
        start_date=date(2026, 10, 2),
        wedding_date=date(2027, 10, 20),
        city="杭州",
        total_budget_fen=20000000,
        guest_estimate=80,
    )
    return user


def test_unauthorized_and_no_wedding_409(client: TestClient) -> None:
    denied = client.get("/api/conversations")
    assert denied.status_code == 401
    assert denied.json()["error_code"] == "UNAUTHORIZED"

    client.post(
        "/api/users",
        json={"username": "alice", "password": PASSWORD, "phone": PHONE_A},
    )
    missing = client.get("/api/conversations")
    assert missing.status_code == 409
    assert missing.json()["error_code"] == "CONFLICT"

    events = client.get("/api/conversations/events")
    assert events.status_code == 409


def test_list_empty_then_auto_title_and_rename(client: TestClient) -> None:
    _login_with_wedding(client)
    empty = client.get("/api/conversations")
    assert empty.status_code == 200
    assert _envelope(empty)["data"] == []

    with client.stream("POST", "/api/conversations", json={"text": "婚期怎么定"}) as response:
        status, events = _collect_sse(response)
    assert status == 200
    names = [name for name, _ in events]
    assert names[0] == "accepted"
    assert "done" in names
    assert "failed" not in names
    accepted = events[0][1]
    assert accepted["conversation"]["title"] == "婚期怎么定"
    assert accepted["conversation"]["title_customized"] is False
    conversation_id = accepted["conversation"]["id"]
    for _name, payload in events:
        if _name == "delta":
            assert "reasoning_content" not in payload
            assert "text" in payload

    listed = client.get("/api/conversations")
    assert listed.status_code == 200
    rows = listed.json()["data"]
    assert len(rows) == 1
    assert rows[0]["title"] == "婚期怎么定"

    renamed = client.patch(
        f"/api/conversations/{conversation_id}",
        json={"title": "婚期"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["data"]["title"] == "婚期"
    assert renamed.json()["data"]["title_customized"] is True

    too_long = client.patch(
        f"/api/conversations/{conversation_id}",
        json={"title": "标" * 201},
    )
    assert too_long.status_code == 400
    assert too_long.json()["error_code"] == "VALIDATION_ERROR"

    blank = client.patch(f"/api/conversations/{conversation_id}", json={"title": "   "})
    assert blank.status_code == 400


def test_first_message_title_can_exceed_200(client: TestClient) -> None:
    _login_with_wedding(client)
    title = "婚" * 210
    with client.stream("POST", "/api/conversations", json={"text": title}) as response:
        status, events = _collect_sse(response)
    assert status == 200
    accepted = events[0][1]
    assert accepted["conversation"]["title"] == title
    assert len(accepted["conversation"]["title"]) == 210


def test_text_over_limit_does_not_create_conversation(tmp_path: Path) -> None:
    for item in _client(tmp_path, xiaobei_max_text_chars=10):
        client = item
        _login_with_wedding(client)
        response = client.post("/api/conversations", json={"text": "一二三四五六七八九十再"})
        assert response.status_code == 400
        body = _envelope(response)
        assert body["error"] == TEXT_TOO_LONG_ERROR
        listed = client.get("/api/conversations")
        assert listed.json()["data"] == []


def test_blank_send_rejected(client: TestClient) -> None:
    _login_with_wedding(client)
    response = client.post("/api/conversations", json={"text": "   ", "image_ids": []})
    assert response.status_code == 400
    assert client.get("/api/conversations").json()["data"] == []


def test_pro_with_images_returns_ac087_and_skips_ext002(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    called = {"live": False}

    def boom(*_args, **_kwargs):
        called["live"] = True
        raise AssertionError("Pro 带图不得调用 EXT-002")

    monkeypatch.setattr(xiaobei_generator, "create_http_client", boom)
    monkeypatch.setattr(xiaobei_generator, "stream_model_output", boom)
    _login_with_wedding(client)
    uploaded = client.post(
        "/api/conversation_images",
        files={"file": ("a.jpg", JPEG, "image/jpeg")},
    )
    assert uploaded.status_code == 201
    image_id = uploaded.json()["data"]["id"]
    response = client.post(
        "/api/conversations",
        json={
            "text": "看看这张场地",
            "image_ids": [image_id],
            "model_id": "deepseek-v4-pro",
        },
    )
    assert response.status_code == 400
    assert response.json()["error"] == PRO_IMAGE_ERROR
    assert client.get("/api/conversations").json()["data"] == []
    assert called["live"] is False


def test_mock_stream_without_api_key(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*_args, **_kwargs):
        raise AssertionError("mock 路径不得访问公网")

    monkeypatch.setattr(xiaobei_generator, "create_http_client", boom)
    _login_with_wedding(client)
    with client.stream("POST", "/api/conversations", json={"text": "婚礼流程怎么排"}) as response:
        status, events = _collect_sse(response)
    assert status == 200
    names = [name for name, _ in events]
    assert names[0] == "accepted"
    assert "delta" in names
    assert names[-1] == "done"
    done = events[-1][1]
    assert done["content"]
    assert "reasoning" not in done["content"]
    thinking = xiaobei_generator.build_chat_request_body("deepseek-flash", [])
    assert thinking["thinking"] == {"type": "disabled"}
    assert thinking["reasoning_effort"] == "none"


@pytest.mark.asyncio
async def test_stop_drops_empty_assistant(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.db.session import close_db, get_db_context, init_db

    async def gated(*, model_id, messages, user_text, cancel):
        while not cancel.is_set():
            await asyncio.sleep(0.05)
        return
        yield {}

    monkeypatch.setattr(xiaobei_generator, "stream_model_output", gated)
    ConfigManager.reset()
    load_config_from_mapping(_settings(tmp_path))
    reset_engine()
    await init_db()
    try:
        async with get_db_context() as db:
            user = await _seed_user_and_wedding(db)
            accepted, job = await xiaobei_generator.start_new_conversation(
                db, user.id, text="婚期怎么定", image_ids=[], model_id=None
            )
            user_id = user.id
            conversation_id = accepted["conversation"]["id"]
            assistant_id = accepted["assistant_message"]["id"]
        async with get_db_context() as db:
            conversation = await xiaobei_generator.get_owned_conversation(
                db, user_id, conversation_id
            )
            await xiaobei_generator.stop_generation(db, conversation, assistant_id)
        await asyncio.wait_for(job.finished.wait(), timeout=5)
        async with get_db_context() as db:
            conversation = await xiaobei_generator.get_owned_conversation(
                db, user_id, conversation_id
            )
            bundle = await xiaobei_generator.conversation_bundle(db, conversation)
        users = [item for item in bundle["messages"] if item["role"] == "user"]
        assistants = [item for item in bundle["messages"] if item["role"] == "assistant"]
        assert len(users) == 1
        assert assistants == []
        assert job.kept is False
    finally:
        await close_db()
        reset_engine()
        ConfigManager.reset()


@pytest.mark.asyncio
async def test_stop_after_delta_keeps_text(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.db.session import close_db, get_db_context, init_db

    async def first_then_wait(*, model_id, messages, user_text, cancel):
        yield {"type": "delta", "text": "先看档期"}
        while not cancel.is_set():
            await asyncio.sleep(0.05)
        return

    monkeypatch.setattr(xiaobei_generator, "stream_model_output", first_then_wait)
    ConfigManager.reset()
    load_config_from_mapping(_settings(tmp_path))
    reset_engine()
    await init_db()
    try:
        async with get_db_context() as db:
            user = await _seed_user_and_wedding(db)
            accepted, job = await xiaobei_generator.start_new_conversation(
                db, user.id, text="档期怎么选", image_ids=[], model_id=None
            )
            user_id = user.id
            conversation_id = accepted["conversation"]["id"]
            assistant_id = accepted["assistant_message"]["id"]
        await asyncio.sleep(0.15)
        async with get_db_context() as db:
            conversation = await xiaobei_generator.get_owned_conversation(
                db, user_id, conversation_id
            )
            public = await xiaobei_generator.stop_generation(
                db, conversation, assistant_id
            )
        await asyncio.wait_for(job.finished.wait(), timeout=5)
        assert public["status"] == "stopped"
        assert public["content"] == "先看档期"
        async with get_db_context() as db:
            conversation = await xiaobei_generator.get_owned_conversation(
                db, user_id, conversation_id
            )
            bundle = await xiaobei_generator.conversation_bundle(db, conversation)
        assistants = [item for item in bundle["messages"] if item["role"] == "assistant"]
        assert len(assistants) == 1
        assert assistants[0]["status"] == "stopped"
        assert assistants[0]["content"] == "先看档期"
    finally:
        await close_db()
        reset_engine()
        ConfigManager.reset()


def test_stop_complete_message_rejected(client: TestClient) -> None:
    _login_with_wedding(client)
    with client.stream("POST", "/api/conversations", json={"text": "流程怎么排"}) as response:
        status, events = _collect_sse(response)
    assert status == 200
    conversation_id = events[0][1]["conversation"]["id"]
    assistant_id = events[-1][1]["message_id"]
    stopped = client.post(
        f"/api/conversations/{conversation_id}/messages/{assistant_id}/stop"
    )
    assert stopped.status_code == 400


def test_retry_failed_reuses_assistant_id(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fail_once(*_args, **_kwargs):
        raise xiaobei_generator.CompletionFailedError("timeout")
        yield {}

    monkeypatch.setattr(xiaobei_generator, "stream_model_output", fail_once)
    _login_with_wedding(client)
    with client.stream("POST", "/api/conversations", json={"text": "档期怎么选"}) as response:
        status, events = _collect_sse(response)
    assert status == 200
    names = [name for name, _ in events]
    assert "failed" in names
    failed = next(payload for name, payload in events if name == "failed")
    assert failed["error_kind"] == "timeout"
    conversation_id = events[0][1]["conversation"]["id"]
    assistant_id = failed["message_id"]
    user_id = events[0][1]["user_message"]["id"]

    async def succeed(*_args, **_kwargs):
        yield {"type": "delta", "text": "可以先看当地档期。"}
        yield {"type": "finish", "finish_reason": "stop"}

    monkeypatch.setattr(xiaobei_generator, "stream_model_output", succeed)
    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages/{assistant_id}/retry",
    ) as response:
        status, retry_events = _collect_sse(response)
    assert status == 200
    accepted = retry_events[0][1]
    assert accepted["user_message"]["id"] == user_id
    assert accepted["assistant_message"]["id"] == assistant_id
    assert retry_events[-1][0] == "done"
    detail = client.get(f"/api/conversations/{conversation_id}")
    messages = detail.json()["data"]["messages"]
    users = [item for item in messages if item["role"] == "user"]
    assistants = [item for item in messages if item["role"] == "assistant"]
    assert len(users) == 1
    assert len(assistants) == 1
    assert assistants[0]["status"] == "complete"


def test_rate_limited_and_other_mapping(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _login_with_wedding(client)

    async def rate_limited(*_args, **_kwargs):
        raise xiaobei_generator.CompletionFailedError("rate_limited")
        yield {}

    monkeypatch.setattr(xiaobei_generator, "stream_model_output", rate_limited)
    with client.stream("POST", "/api/conversations", json={"text": "预算怎么分"}) as response:
        _status, events = _collect_sse(response)
    failed = next(payload for name, payload in events if name == "failed")
    assert failed["error_kind"] == "rate_limited"

    conversation_id = events[0][1]["conversation"]["id"]

    async def other(*_args, **_kwargs):
        raise xiaobei_generator.CompletionFailedError("other")
        yield {}

    monkeypatch.setattr(xiaobei_generator, "stream_model_output", other)
    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages",
        json={"text": "再问一次"},
    ) as response:
        _status, follow_events = _collect_sse(response)
    follow_failed = next(payload for name, payload in follow_events if name == "failed")
    assert follow_failed["error_kind"] == "other"


def test_events_route_before_id_and_cross_page_upsert(client: TestClient) -> None:
    _login_with_wedding(client)
    spec = client.get("/openapi.json")
    assert spec.status_code == 200
    assert "/api/conversations/events" in spec.json()["paths"]
    me_id = client.get("/api/users/me").json()["data"]["id"]
    queue = xiaobei_generator.subscribe_user_events(me_id)
    with client.stream("POST", "/api/conversations", json={"text": "宾客怎么分组"}) as response:
        status, events = _collect_sse(response)
    assert status == 200
    pending: list[tuple[str, dict]] = []
    while True:
        try:
            pending.append(queue.get_nowait())
        except asyncio.QueueEmpty:
            break
    names = [name for name, _ in pending]
    assert "conversation.upserted" in names
    assert "message.upserted" in names
    conversation_id = events[0][1]["conversation"]["id"]
    client.patch(f"/api/conversations/{conversation_id}", json={"title": "分组"})
    renamed = queue.get_nowait()
    assert renamed[0] == "conversation.upserted"
    assert renamed[1]["title"] == "分组"
    deleted = client.delete(f"/api/conversations/{conversation_id}")
    assert deleted.status_code == 200
    removed = queue.get_nowait()
    assert removed[0] == "conversation.deleted"
    assert removed[1]["id"] == conversation_id
    xiaobei_generator.unsubscribe_user_events(me_id, queue)


def test_live_body_disables_thinking_and_drops_reasoning(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict = {}

    class FakeStream:
        status_code = 200

        async def aiter_lines(self):
            yield (
                'data: {"choices":[{"delta":{"content":"场地","reasoning_content":"内部思考"},'
                '"finish_reason":null}]}'
            )
            yield "data: [DONE]"

        async def aclose(self) -> None:
            return None

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    class FakeClient:
        def __init__(self, timeout) -> None:
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def stream(self, method: str, url: str, headers=None, json=None):
            captured["method"] = method
            captured["url"] = url
            captured["json"] = json
            captured["authorization_present"] = bool(
                headers and "Authorization" in headers
            )
            return FakeStream()

    monkeypatch.setattr(xiaobei_generator, "create_http_client", FakeClient)
    for item in _client(
        tmp_path,
        deepseek_mode="live",
        deepseek_api_key="placeholder-not-a-real-key",
    ):
        client = item
        _login_with_wedding(client)
        with client.stream("POST", "/api/conversations", json={"text": "场地怎么选"}) as response:
            status, events = _collect_sse(response)
        assert status == 200
        assert captured["json"]["thinking"] == {"type": "disabled"}
        assert captured["json"]["reasoning_effort"] == "none"
        assert captured["json"]["stream"] is True
        deltas = [payload["text"] for name, payload in events if name == "delta"]
        assert deltas == ["场地"]
        assert all("内部思考" not in text for text in deltas)
        assert events[-1][0] == "done"


def test_generation_does_not_read_plan_budget_or_guests(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict = {}

    async def capture(*, model_id, messages, user_text, cancel):
        captured["messages"] = messages
        captured["model_id"] = model_id
        yield {"type": "delta", "text": "通用建议"}
        yield {"type": "finish", "finish_reason": "stop"}

    monkeypatch.setattr(xiaobei_generator, "stream_model_output", capture)
    _login_with_wedding(client)
    groups = client.get("/api/guest_groups")
    group_id = groups.json()["data"][0]["id"]
    guest = client.post(
        "/api/guests",
        json={"name": "张三专测", "group_id": group_id},
    )
    assert guest.status_code == 201
    categories = client.get("/api/budget_categories")
    cat_id = categories.json()["data"]["categories"][0]["id"]
    patched = client.patch(f"/api/budget_categories/{cat_id}", json={"amount_fen": 8000000})
    assert patched.status_code == 200
    with client.stream("POST", "/api/conversations", json={"text": "当地婚礼怎么准备"}) as response:
        _collect_sse(response)
    blob = json.dumps(captured["messages"], ensure_ascii=False)
    assert "张三专测" not in blob
    assert "80000" not in blob
    assert "新郎昵称" not in blob
    system = captured["messages"][0]["content"]
    assert "杭州" in system
    assert "200000.00" in system
    assert captured["messages"][0]["role"] == "system"


def test_http_client_disables_env_trust() -> None:
    http_client = xiaobei_generator.create_http_client(httpx.Timeout(1.0))
    assert http_client.trust_env is False


def test_below_budget_sentence_strips_yuan_but_keeps_other_amounts() -> None:
    body = (
        "按 20 万来安排，其中场地和餐饮可按 50000.00 元量级拆分。\n\n"
        "按您提问的标准，您档案中的总预算是 50000.00 元，远低于这个标准。"
    )
    content, link = xiaobei_generator.parse_assistant_output(body)
    assert link is None
    assert "按您提问的标准，您档案中的总预算是 50000.00，远低于这个标准。" in content
    assert "50000.00 元，远低于" not in content
    assert "50000.00 元量级拆分" in content


def test_below_budget_sentence_strips_yuan_without_space() -> None:
    body = "按您提问的标准，您档案中的总预算是 50000.00元，远低于这个标准。"
    content, _ = xiaobei_generator.parse_assistant_output(body)
    assert content == "按您提问的标准，您档案中的总预算是 50000.00，远低于这个标准。"


def test_below_budget_sentence_strips_trailing_space_after_amount() -> None:
    body = "按您提问的标准，您档案中的总预算是 50000.00 ，远低于这个标准。"
    content, _ = xiaobei_generator.parse_assistant_output(body)
    assert content == "按您提问的标准，您档案中的总预算是 50000.00，远低于这个标准。"


def test_below_budget_sentence_already_canonical_stays() -> None:
    body = "按您提问的标准，您档案中的总预算是 50000.00，远低于这个标准。"
    content, _ = xiaobei_generator.parse_assistant_output(body)
    assert content == body


def test_parse_user_spend_standard_covers_wan_forms() -> None:
    assert xiaobei_generator.parse_user_spend_standard_fen("5 万的婚宴怎么省") == 5_000_000
    assert xiaobei_generator.parse_user_spend_standard_fen("5万的婚宴怎么省") == 5_000_000
    assert xiaobei_generator.parse_user_spend_standard_fen("20 万的婚宴怎么做") == 20_000_000
    assert xiaobei_generator.parse_user_spend_standard_fen("20万的婚宴怎么做") == 20_000_000
    assert xiaobei_generator.parse_user_spend_standard_fen("婚宴怎么省") is None


def test_drop_below_budget_when_question_standard_not_above_archive() -> None:
    body = (
        "按 5 万来省。餐饮可按 50000.00 元拆。\n"
        "按您提问的标准，您档案中的总预算是 200000.00，远低于这个标准。"
    )
    content, _ = xiaobei_generator.parse_assistant_output(body)
    dropped = xiaobei_generator.drop_unwarranted_below_budget_sentence(
        content, user_text="5 万的婚宴怎么省", total_budget_fen=20_000_000
    )
    assert "远低于" not in dropped
    assert "按 5 万来省" in dropped
    assert "50000.00 元拆" in dropped
    equal = xiaobei_generator.drop_unwarranted_below_budget_sentence(
        "按您提问的标准，您档案中的总预算是 200000.00，远低于这个标准。",
        user_text="20 万的婚宴怎么做",
        total_budget_fen=20_000_000,
    )
    assert "远低于" not in equal


def test_keep_below_budget_when_archive_below_question_standard() -> None:
    body = (
        "按 20 万来安排，其中场地和餐饮可按 50000.00 元量级拆分。\n\n"
        "按您提问的标准，您档案中的总预算是 50000.00 元，远低于这个标准。"
    )
    content, _ = xiaobei_generator.parse_assistant_output(body)
    kept = xiaobei_generator.drop_unwarranted_below_budget_sentence(
        content, user_text="20 万的婚宴怎么做", total_budget_fen=5_000_000
    )
    assert "按您提问的标准，您档案中的总预算是 50000.00，远低于这个标准。" in kept
    assert "50000.00 元，远低于" not in kept
    assert "50000.00 元量级拆分" in kept


def test_do_not_guess_drop_when_user_text_has_no_spend_standard() -> None:
    body = "按您提问的标准，您档案中的总预算是 200000.00，远低于这个标准。"
    dropped = xiaobei_generator.drop_unwarranted_below_budget_sentence(
        body, user_text="婚宴怎么省", total_budget_fen=20_000_000
    )
    assert dropped == body


def test_archive_block_keeps_yuan_on_total_budget() -> None:
    block = xiaobei_generator.archive_block("2027-10-20", "杭州", 5_000_000, 80)
    assert "- 总预算：50000.00 元" in block


def test_complete_reply_persists_below_budget_without_yuan(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    raw = (
        "按 20 万做。餐饮可按 50000.00 元拆。\n"
        "按您提问的标准，您档案中的总预算是 50000.00 元，远低于这个标准。"
    )

    async def fake_stream(*, model_id, messages, user_text, cancel):
        yield {"type": "delta", "text": raw}
        yield {"type": "finish", "finish_reason": "stop"}

    monkeypatch.setattr(xiaobei_generator, "stream_model_output", fake_stream)
    _login_with_wedding(client)
    patched = client.patch("/api/weddings/current", json={"total_budget_fen": 5_000_000})
    assert patched.status_code == 200
    payload = {"text": "20 万的婚宴怎么做"}
    with client.stream("POST", "/api/conversations", json=payload) as response:
        status, events = _collect_sse(response)
    assert status == 200
    done = [payload for name, payload in events if name == "done"][-1]
    content = done["content"]
    assert "按您提问的标准，您档案中的总预算是 50000.00，远低于这个标准。" in content
    assert "50000.00 元，远低于" not in content
    assert "50000.00 元拆" in content
    listed = client.get("/api/conversations")
    conversation_id = listed.json()["data"][0]["id"]
    detail = client.get(f"/api/conversations/{conversation_id}")
    assistants = [
        item for item in detail.json()["data"]["messages"] if item["role"] == "assistant"
    ]
    assert assistants[0]["content"] == content


def test_complete_reply_drops_below_budget_when_saving_five_wan(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    raw = (
        "按 5 万来省。餐饮可按 50000.00 元拆。\n"
        "按您提问的标准，您档案中的总预算是 200000.00，远低于这个标准。"
    )

    async def fake_stream(*, model_id, messages, user_text, cancel):
        yield {"type": "delta", "text": raw}
        yield {"type": "finish", "finish_reason": "stop"}

    monkeypatch.setattr(xiaobei_generator, "stream_model_output", fake_stream)
    _login_with_wedding(client)
    payload = {"text": "5 万的婚宴怎么省"}
    with client.stream("POST", "/api/conversations", json=payload) as response:
        status, events = _collect_sse(response)
    assert status == 200
    done = [payload for name, payload in events if name == "done"][-1]
    content = done["content"]
    assert "远低于" not in content
    assert "按 5 万来省" in content
    assert "50000.00 元拆" in content
    listed = client.get("/api/conversations")
    conversation_id = listed.json()["data"][0]["id"]
    detail = client.get(f"/api/conversations/{conversation_id}")
    assistants = [
        item for item in detail.json()["data"]["messages"] if item["role"] == "assistant"
    ]
    assert assistants[0]["content"] == content


def test_system_prompt_covers_budget_schedule_and_english_you() -> None:
    prompt = xiaobei_generator.load_system_prompt()
    assert "这句的金额不要带「元」" in prompt
    assert "只有档案总预算低于本轮问句里的花费标准时" in prompt
    assert "问句里的花费标准低于或等于档案总预算时不要写这句" in prompt
    assert "不要用百分比或其他阈值来判断是否写这句" in prompt
    assert "还有没有婚礼档期" in prompt
    assert "不得输出上面那句超出范围原句" in prompt
    assert "直接向该场地询问" in prompt
    assert "不要编造有档期或没档期" in prompt
    assert "不要再点名其他商家" in prompt
    assert "第一段短结论本身必须称呼用户为「你」" in prompt
    assert "固定文案里已经使用「您」的句子保持「您」" in prompt


def test_fault_header_ignored_when_injection_off(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    called = {"n": 0}
    original = xiaobei_generator.stream_model_output

    async def counted(*args, **kwargs):
        called["n"] += 1
        async for item in original(*args, **kwargs):
            yield item

    monkeypatch.setattr(xiaobei_generator, "stream_model_output", counted)
    _login_with_wedding(client)
    with client.stream(
        "POST",
        "/api/conversations",
        json={"text": "婚期怎么定"},
        headers={"X-Xiaobei-Test-Fault": "timeout"},
    ) as response:
        status, events = _collect_sse(response)
    assert status == 200
    names = [name for name, _ in events]
    assert names[0] == "accepted"
    assert "done" in names
    assert "failed" not in names
    assert called["n"] == 1


@pytest.mark.parametrize(
    ("fault", "error_kind"),
    [
        ("timeout", "timeout"),
        ("rate_limited", "rate_limited"),
        ("mid-fail", "other"),
    ],
)
def test_injected_faults_do_not_call_deepseek(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fault: str, error_kind: str
) -> None:
    called = {"model": False, "http": False}

    async def boom_model(*_args, **_kwargs):
        called["model"] = True
        raise AssertionError("fault 路径不得调用 Deepseek")
        yield {}

    def boom_http(*_args, **_kwargs):
        called["http"] = True
        raise AssertionError("fault 路径不得创建 httpx 客户端")

    monkeypatch.setattr(xiaobei_generator, "stream_model_output", boom_model)
    monkeypatch.setattr(xiaobei_generator, "create_http_client", boom_http)
    for client in _client(tmp_path, xiaobei_fault_injection=True):
        _login_with_wedding(client)
        with client.stream(
            "POST",
            "/api/conversations",
            json={"text": "档期怎么选"},
            headers={"X-Xiaobei-Test-Fault": fault},
        ) as response:
            status, events = _collect_sse(response)
        assert status == 200
        names = [name for name, _ in events]
        assert names[0] == "accepted"
        assert "failed" in names
        assert "done" not in names
        failed = next(payload for name, payload in events if name == "failed")
        assert failed["error_kind"] == error_kind
        if fault == "mid-fail":
            assert "delta" in names
        conversation_id = events[0][1]["conversation"]["id"]
        detail = client.get(f"/api/conversations/{conversation_id}")
        assistants = [
            item for item in detail.json()["data"]["messages"] if item["role"] == "assistant"
        ]
        assert len(assistants) == 1
        assert assistants[0]["status"] == "failed"
        assert assistants[0]["error_kind"] == error_kind
        assert assistants[0]["content"] == ""
        assert called["model"] is False
        assert called["http"] is False


def test_followup_and_retry_read_fault_header(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    called = {"n": 0}
    original = xiaobei_generator.stream_model_output

    async def counted(*args, **kwargs):
        called["n"] += 1
        async for item in original(*args, **kwargs):
            yield item

    monkeypatch.setattr(xiaobei_generator, "stream_model_output", counted)
    for client in _client(tmp_path, xiaobei_fault_injection=True):
        _login_with_wedding(client)
        with client.stream(
            "POST", "/api/conversations", json={"text": "婚期怎么定"}
        ) as response:
            status, events = _collect_sse(response)
        assert status == 200
        assert "done" in [name for name, _ in events]
        assert called["n"] == 1
        conversation_id = events[0][1]["conversation"]["id"]
        with client.stream(
            "POST",
            f"/api/conversations/{conversation_id}/messages",
            json={"text": "再问一次"},
            headers={"X-Xiaobei-Test-Fault": "timeout"},
        ) as response:
            status, follow_events = _collect_sse(response)
        assert status == 200
        failed = next(payload for name, payload in follow_events if name == "failed")
        assert failed["error_kind"] == "timeout"
        assert called["n"] == 1
        assistant_id = failed["message_id"]
        with client.stream(
            "POST",
            f"/api/conversations/{conversation_id}/messages/{assistant_id}/retry",
            headers={"X-Xiaobei-Test-Fault": "rate_limited"},
        ) as response:
            status, retry_fault_events = _collect_sse(response)
        assert status == 200
        retry_failed_event = next(
            payload for name, payload in retry_fault_events if name == "failed"
        )
        assert retry_failed_event["error_kind"] == "rate_limited"
        assert called["n"] == 1
        with client.stream(
            "POST",
            f"/api/conversations/{conversation_id}/messages/{assistant_id}/retry",
        ) as response:
            status, retry_events = _collect_sse(response)
        assert status == 200
        assert retry_events[-1][0] == "done"
        assert called["n"] == 2


def test_unknown_fault_value_ignored_when_injection_on(tmp_path: Path) -> None:
    for client in _client(tmp_path, xiaobei_fault_injection=True):
        _login_with_wedding(client)
        with client.stream(
            "POST",
            "/api/conversations",
            json={"text": "婚礼流程怎么排"},
            headers={"X-Xiaobei-Test-Fault": "explode"},
        ) as response:
            status, events = _collect_sse(response)
        assert status == 200
        names = [name for name, _ in events]
        assert "done" in names
        assert "failed" not in names


@pytest.mark.asyncio
async def test_hold_first_stop_during_wait_drops_empty(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.db.session import close_db, get_db_context, init_db

    async def boom(*_args, **_kwargs):
        raise AssertionError("hold-first 等待中停止不得调用 Deepseek")
        yield {}

    monkeypatch.setattr(xiaobei_generator, "stream_model_output", boom)
    ConfigManager.reset()
    load_config_from_mapping(_settings(tmp_path, xiaobei_fault_injection=True))
    reset_engine()
    await init_db()
    try:
        async with get_db_context() as db:
            user = await _seed_user_and_wedding(db)
            accepted, job = await xiaobei_generator.start_new_conversation(
                db,
                user.id,
                text="婚期怎么定",
                image_ids=[],
                model_id=None,
                test_fault="hold-first",
            )
            user_id = user.id
            conversation_id = accepted["conversation"]["id"]
            assistant_id = accepted["assistant_message"]["id"]
        async with get_db_context() as db:
            conversation = await xiaobei_generator.get_owned_conversation(
                db, user_id, conversation_id
            )
            await xiaobei_generator.stop_generation(db, conversation, assistant_id)
        await asyncio.wait_for(job.finished.wait(), timeout=5)
        async with get_db_context() as db:
            conversation = await xiaobei_generator.get_owned_conversation(
                db, user_id, conversation_id
            )
            bundle = await xiaobei_generator.conversation_bundle(db, conversation)
        users = [item for item in bundle["messages"] if item["role"] == "user"]
        assistants = [item for item in bundle["messages"] if item["role"] == "assistant"]
        assert len(users) == 1
        assert assistants == []
        assert job.kept is False
    finally:
        await close_db()
        reset_engine()
        ConfigManager.reset()
