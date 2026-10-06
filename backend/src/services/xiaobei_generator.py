"""备备对话与 EXT-002 Deepseek 代理。mock 或缺密钥时不访问公网。"""

from __future__ import annotations

import asyncio
import base64
import json
import math
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta, timezone, tzinfo
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from pycore.core.logger import get_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.config.settings import backend_dir, get_settings
from src.db.models import Conversation, ConversationImage, ConversationMessage, Wedding
from src.db.session import get_db_context
from src.services import wedding_service

logger = get_logger()

PRO_MODEL_ID = "deepseek-v4-pro"
IMAGE_ONLY_TITLE = "图片"
PRO_IMAGE_ERROR = "当前模型看不了图片，请改用 Flash 后再发送图片。"
TEXT_TOO_LONG_ERROR = "您输入的文案太长了，请您缩减后再次发送。"
IMAGE_TOO_LARGE_ERROR = "您上传的图片超过5M，请压缩后再发送。"
IMAGE_UNRECOGNIZED_ERROR = "您上传的图片无法识别，请换一张再发送。"
OUT_OF_SCOPE = (
    "对不起，您的问题在我的知识库之外，我只能回答结婚、婚礼、备婚、礼仪、流程、预算思路，"
    "以及宾客和座位思路相关问题。"
)
LINK_PLAN = "[[xiaobei_link:plan]]"
LINK_BUDGET = "[[xiaobei_link:budget]]"
LINK_SEATING = "[[xiaobei_link:seating]]"
ALLOWED_LINKS = {"plan", "budget", "seating"}
BELOW_BUDGET_SENTENCE = re.compile(
    r"按您提问的标准，您档案中的总预算是 (\d+\.\d{2})\s*元?，远低于这个标准。"
)
BELOW_BUDGET_CANONICAL = r"按您提问的标准，您档案中的总预算是 \1，远低于这个标准。"
USER_SPEND_STANDARD_WAN = re.compile(r"(\d+)\s*万")
WAN_TO_FEN = 1_000_000
SYSTEM_PROMPT_RESERVE_TOKENS = 2000
IMAGE_TOKEN_COST = 1024
CHARS_PER_TOKEN = 1.5
MODEL_CONTEXT_TOKENS = 1_000_000
MOCK_CHUNK_INTERVAL = 0.02
TEST_FAULT_HOLD_FIRST = "hold-first"
TEST_FAULT_TIMEOUT = "timeout"
TEST_FAULT_RATE_LIMITED = "rate_limited"
TEST_FAULT_MID_FAIL = "mid-fail"
ALLOWED_TEST_FAULTS = frozenset(
    {
        TEST_FAULT_HOLD_FIRST,
        TEST_FAULT_TIMEOUT,
        TEST_FAULT_RATE_LIMITED,
        TEST_FAULT_MID_FAIL,
    }
)
HOLD_FIRST_DELAY_SECONDS = 2.5
MID_FAIL_PARTIAL_TEXT = "先把场地和档期口径定下来"
MID_FAIL_PAUSE_SECONDS = 0.3
STATUS_COMPLETE = "complete"
STATUS_GENERATING = "generating"
STATUS_FAILED = "failed"
STATUS_STOPPED = "stopped"
ROLE_USER = "user"
ROLE_ASSISTANT = "assistant"
JPEG_PREFIX = b"\xff\xd8\xff"
PNG_PREFIX = b"\x89PNG"
GIF_PREFIX = b"GIF8"
WEBP_RIFF = b"RIFF"
WEBP_MARK = b"WEBP"
_CONTENT_TYPES = {
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
}

SYSTEM_PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "xiaobei_system.md"

_subscribers: dict[int, list[asyncio.Queue]] = {}
_message_created_at: dict[int, datetime] = {}


@dataclass
class GenerationJob:
    conversation_id: int
    user_id: int
    user_message_id: int
    assistant_message_id: int
    model_id: str
    wedding_date: str
    city: str
    total_budget_fen: int
    guest_estimate: int
    cancel: asyncio.Event = field(default_factory=asyncio.Event)
    queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    finished: asyncio.Event = field(default_factory=asyncio.Event)
    task: asyncio.Task | None = None
    final_assistant: dict | None = None
    kept: bool = False
    test_fault: str | None = None


_jobs: dict[int, GenerationJob] = {}


class XiaobeiValidationError(Exception):
    def __init__(self, error: str) -> None:
        super().__init__(error)
        self.error = error


class XiaobeiNotFoundError(Exception):
    def __init__(self, error: str = "找不到这段对话") -> None:
        super().__init__(error)
        self.error = error


class XiaobeiConflictError(Exception):
    def __init__(self, error: str) -> None:
        super().__init__(error)
        self.error = error


class CompletionFailedError(Exception):
    def __init__(self, kind: str) -> None:
        super().__init__(kind)
        self.kind = kind


def shanghai_tz() -> tzinfo:
    settings = get_settings()
    try:
        return ZoneInfo(settings.timezone)
    except ZoneInfoNotFoundError:
        return timezone(timedelta(hours=8))


def shanghai_now() -> datetime:
    return datetime.now(shanghai_tz())


def format_shanghai(dt: datetime | None) -> str:
    if dt is None:
        dt = shanghai_now()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(shanghai_tz()).isoformat()


def codepoint_len(text: str) -> int:
    return len(text)


def context_input_budget() -> int:
    settings = get_settings()
    return MODEL_CONTEXT_TOKENS - settings.deepseek_max_tokens - SYSTEM_PROMPT_RESERVE_TOKENS


def estimate_tokens(text: str, image_count: int) -> int:
    text_tokens = math.ceil(codepoint_len(text) / CHARS_PER_TOKEN) if text else 0
    return text_tokens + image_count * IMAGE_TOKEN_COST


def load_system_prompt() -> str:
    return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()


def archive_block(
    wedding_date: str, city: str, total_budget_fen: int, guest_estimate: int
) -> str:
    yuan = f"{total_budget_fen / 100:.2f}"
    return (
        "当前婚礼档案（仅这四项，不要读取或编造计划任务、预算分类、宾客、座位或照片）：\n"
        f"- 婚礼日期：{wedding_date}\n"
        f"- 城市：{city}\n"
        f"- 总预算：{yuan} 元\n"
        f"- 总人数：{guest_estimate}"
    )


def model_supports_vision(model_id: str) -> bool:
    return model_id != PRO_MODEL_ID


def resolve_image_dir() -> Path:
    settings = get_settings()
    path = Path(settings.xiaobei_image_dir)
    if not path.is_absolute():
        path = backend_dir() / path
    path.mkdir(parents=True, exist_ok=True)
    return path.resolve()


def image_file_path(image: ConversationImage) -> Path:
    return resolve_image_dir() / image.stored_name


def image_url(image_id: int) -> str:
    return f"/api/conversation_images/{image_id}"


def detect_image_kind(data: bytes) -> str | None:
    if len(data) >= 3 and data[:3] == JPEG_PREFIX:
        return "jpeg"
    if len(data) >= 4 and data[:4] == PNG_PREFIX:
        return "png"
    if len(data) >= 4 and data[:4] == GIF_PREFIX:
        return "gif"
    if len(data) >= 12 and data[:4] == WEBP_RIFF and data[8:12] == WEBP_MARK:
        return "webp"
    return None


def validate_image_bytes(data: bytes) -> tuple[str, str]:
    settings = get_settings()
    if len(data) > settings.xiaobei_max_image_bytes:
        raise XiaobeiValidationError(IMAGE_TOO_LARGE_ERROR)
    kind = detect_image_kind(data)
    if kind is None:
        raise XiaobeiValidationError(IMAGE_UNRECOGNIZED_ERROR)
    return kind, _CONTENT_TYPES[kind]


def conversation_to_public(item: Conversation) -> dict:
    created = item.last_message_at
    return {
        "id": item.id,
        "title": item.title,
        "title_customized": item.title_customized,
        "model_id": item.model_id,
        "created_at": format_shanghai(created),
        "updated_at": format_shanghai(created),
        "last_message_at": format_shanghai(item.last_message_at),
    }


def image_to_public(image: ConversationImage) -> dict:
    return {"id": image.id, "url": image_url(image.id)}


def message_to_public(message: ConversationMessage, images: list[ConversationImage]) -> dict:
    created = _message_created_at.get(message.id)
    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "role": message.role,
        "status": message.status,
        "error_kind": message.error_kind,
        "content": message.content,
        "earlier_unused": message.earlier_unused,
        "module_link": message.module_link,
        "feedback": message.feedback,
        "images": [image_to_public(image) for image in images],
        "model_id": message.model_id,
        "created_at": format_shanghai(created),
    }


def remember_created(message_id: int, when: datetime | None = None) -> None:
    _message_created_at[message_id] = when or shanghai_now()


def format_sse(event: str, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False, default=str)
    return f"event: {event}\ndata: {payload}\n\n"


def publish_user_event(user_id: int, event: str, data: dict) -> None:
    for queue in list(_subscribers.get(user_id, [])):
        try:
            queue.put_nowait((event, data))
        except asyncio.QueueFull:
            logger.warning("跨页事件队列已满，已丢弃", user_id=user_id, event_name=event)


def subscribe_user_events(user_id: int) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue()
    _subscribers.setdefault(user_id, []).append(queue)
    return queue


def unsubscribe_user_events(user_id: int, queue: asyncio.Queue) -> None:
    buckets = _subscribers.get(user_id)
    if not buckets:
        return
    if queue in buckets:
        buckets.remove(queue)
    if not buckets:
        _subscribers.pop(user_id, None)


def create_http_client(timeout: httpx.Timeout) -> httpx.AsyncClient:
    return httpx.AsyncClient(trust_env=False, timeout=timeout)


def should_use_mock() -> bool:
    return get_settings().deepseek_mode != "live"


def live_key_missing() -> bool:
    settings = get_settings()
    return settings.deepseek_mode == "live" and not settings.deepseek_api_key


def resolve_test_fault(raw: str | None) -> str | None:
    if not get_settings().xiaobei_fault_injection:
        return None
    if raw is None:
        return None
    value = raw.strip()
    if value in ALLOWED_TEST_FAULTS:
        return value
    return None


def normalize_below_budget_sentence(text: str) -> str:
    return BELOW_BUDGET_SENTENCE.sub(BELOW_BUDGET_CANONICAL, text)


def parse_user_spend_standard_fen(user_text: str) -> int | None:
    match = USER_SPEND_STANDARD_WAN.search(user_text)
    if match is None:
        return None
    return int(match.group(1)) * WAN_TO_FEN


def drop_unwarranted_below_budget_sentence(
    text: str, *, user_text: str, total_budget_fen: int
) -> str:
    standard_fen = parse_user_spend_standard_fen(user_text)
    if standard_fen is None:
        return text
    if total_budget_fen < standard_fen:
        return text
    cleaned = BELOW_BUDGET_SENTENCE.sub("", text)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.rstrip("\n")


def parse_assistant_output(raw: str) -> tuple[str, str | None]:
    stripped = raw.strip()
    if stripped == OUT_OF_SCOPE or stripped.replace("\n", "") == OUT_OF_SCOPE:
        return OUT_OF_SCOPE, None
    lines = raw.splitlines()
    link_lines = []
    for index, line in enumerate(lines):
        text = line.strip()
        if text.startswith("[[xiaobei_link:") and text.endswith("]]"):
            link_lines.append((index, text[15:-2]))
    if len(link_lines) != 1:
        content = "\n".join(
            line
            for index, line in enumerate(lines)
            if index not in {item[0] for item in link_lines}
        )
        return normalize_below_budget_sentence(content), None
    index, kind = link_lines[0]
    if kind not in ALLOWED_LINKS or index != len(lines) - 1:
        content = "\n".join(
            line for line_index, line in enumerate(lines) if line_index != index
        )
        return normalize_below_budget_sentence(content), None
    body = "\n".join(lines[:-1]).rstrip()
    return normalize_below_budget_sentence(body), kind


def mock_reply_for(user_text: str) -> str:
    text = user_text.strip()
    lowered = text.lower()
    if any(token in lowered for token in ("编程", "python", "javascript", "sql 查询")):
        return OUT_OF_SCOPE
    if any(token in text for token in ("我的任务", "做到哪", "下一步做什么")):
        return "先看备婚计划书里当前阶段的任务，按截止日期逐项推进。\n" + LINK_PLAN
    if any(token in text for token in ("餐饮现在分了", "分类预算", "还剩多少预算")):
        return "分类金额在预算管理本里查看，备备这里只给分配思路。\n" + LINK_BUDGET
    if any(token in text for token in ("谁还没入座", "我的宾客", "哪张桌")):
        return "具体名单和空位请到婚宴座位表查看。\n" + LINK_SEATING
    return (
        "## 备婚安排建议\n\n"
        "先把场地和预算口径定下来，再排宾客与座位。\n\n"
        "**可先做：**\n\n"
        "1. 确认婚礼日与城市档期\n"
        "2. 按总预算拆出餐费与场地费\n\n"
        "| 项目 | 思路 |\n"
        "| --- | --- |\n"
        "| 场地 | 按人数和仪式流程问档期 |\n"
        "| 餐费 | 按桌数估，不报具体商家价 |\n"
    )


def split_mock_chunks(text: str) -> list[str]:
    if len(text) <= 8:
        return [text]
    size = max(8, math.ceil(len(text) / 6))
    return [text[index : index + size] for index in range(0, len(text), size)]


def build_chat_request_body(model_id: str, messages: list[dict]) -> dict:
    settings = get_settings()
    return {
        "model": model_id,
        "messages": messages,
        "stream": True,
        "max_tokens": settings.deepseek_max_tokens,
        "thinking": {"type": settings.deepseek_thinking_type},
        "reasoning_effort": settings.deepseek_reasoning_effort,
    }


async def require_wedding_profile(db: AsyncSession, user_id: int) -> Wedding:
    try:
        return await wedding_service.require_wedding(db, user_id)
    except wedding_service.WeddingNotFoundError as exc:
        raise XiaobeiConflictError(str(exc)) from exc


async def get_owned_conversation(
    db: AsyncSession, user_id: int, conversation_id: int
) -> Conversation:
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise XiaobeiNotFoundError()
    return item


async def list_conversations(db: AsyncSession, user_id: int) -> list[Conversation]:
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.last_message_at.desc(), Conversation.id.desc())
    )
    return list(result.scalars().all())


async def list_messages(db: AsyncSession, conversation_id: int) -> list[ConversationMessage]:
    result = await db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.id.asc())
    )
    return list(result.scalars().all())


async def images_for_message(
    db: AsyncSession, message_id: int
) -> list[ConversationImage]:
    result = await db.execute(
        select(ConversationImage)
        .where(ConversationImage.message_id == message_id)
        .order_by(ConversationImage.id.asc())
    )
    return list(result.scalars().all())


async def images_for_ids(
    db: AsyncSession, user_id: int, image_ids: list[int]
) -> list[ConversationImage]:
    if not image_ids:
        return []
    result = await db.execute(
        select(ConversationImage).where(
            ConversationImage.id.in_(image_ids), ConversationImage.user_id == user_id
        )
    )
    found = {item.id: item for item in result.scalars().all()}
    ordered: list[ConversationImage] = []
    for image_id in image_ids:
        item = found.get(image_id)
        if item is None:
            raise XiaobeiValidationError("图片不属于本账号或尚未上传")
        ordered.append(item)
    return ordered


async def message_public(db: AsyncSession, message: ConversationMessage) -> dict:
    images = await images_for_message(db, message.id) if message.role == ROLE_USER else []
    return message_to_public(message, images)


async def generating_assistant(
    db: AsyncSession, conversation_id: int
) -> ConversationMessage | None:
    result = await db.execute(
        select(ConversationMessage).where(
            ConversationMessage.conversation_id == conversation_id,
            ConversationMessage.role == ROLE_ASSISTANT,
            ConversationMessage.status == STATUS_GENERATING,
        )
    )
    return result.scalar_one_or_none()


def validate_send_payload(text: str, image_ids: list[int], model_id: str) -> str:
    settings = get_settings()
    stripped = text.strip()
    if not stripped and not image_ids:
        raise XiaobeiValidationError("请输入文字或添加图片后再发送")
    if codepoint_len(text) > settings.xiaobei_max_text_chars:
        raise XiaobeiValidationError(TEXT_TOO_LONG_ERROR)
    if not model_supports_vision(model_id) and image_ids:
        raise XiaobeiValidationError(PRO_IMAGE_ERROR)
    allowed = set(settings.deepseek_allowed_models)
    if model_id not in allowed:
        raise XiaobeiValidationError("请选择可用的 Deepseek 模型")
    return stripped


def default_model_id() -> str:
    return get_settings().deepseek_default_model


def auto_title(stripped_text: str, image_ids: list[int]) -> str:
    if stripped_text:
        return stripped_text
    if image_ids:
        return IMAGE_ONLY_TITLE
    return stripped_text


async def create_image(db: AsyncSession, user: int, data: bytes) -> ConversationImage:
    _kind, content_type = validate_image_bytes(data)
    image = ConversationImage(
        user_id=user,
        message_id=None,
        stored_name="",
        byte_size=len(data),
        content_type=content_type,
    )
    db.add(image)
    await db.flush()
    stored_name = f"{user}_{image.id}_{uuid4().hex}"
    path = resolve_image_dir() / stored_name
    path.write_bytes(data)
    image.stored_name = stored_name
    await db.flush()
    await db.refresh(image)
    logger.info("对话图片已上传", image_id=image.id)
    return image


async def get_owned_image(
    db: AsyncSession, user_id: int, image_id: int
) -> ConversationImage:
    result = await db.execute(
        select(ConversationImage).where(
            ConversationImage.id == image_id, ConversationImage.user_id == user_id
        )
    )
    image = result.scalar_one_or_none()
    if image is None:
        raise XiaobeiNotFoundError("找不到这张图片")
    return image


async def attach_images(
    db: AsyncSession, images: list[ConversationImage], message_id: int
) -> None:
    for image in images:
        if image.message_id not in (None, message_id):
            raise XiaobeiValidationError("图片已用于其他消息")
        image.message_id = message_id
    await db.flush()


async def replace_message_images(
    db: AsyncSession,
    user_id: int,
    message: ConversationMessage,
    image_ids: list[int],
) -> list[ConversationImage]:
    current = await images_for_message(db, message.id)
    incoming = await images_for_ids(db, user_id, image_ids)
    incoming_ids = {item.id for item in incoming}
    for image in current:
        if image.id not in incoming_ids:
            image.message_id = None
    await attach_images(db, incoming, message.id)
    return incoming


async def conversation_bundle(db: AsyncSession, conversation: Conversation) -> dict:
    messages = await list_messages(db, conversation.id)
    public_messages = [await message_public(db, item) for item in messages]
    return {
        "conversation": conversation_to_public(conversation),
        "messages": public_messages,
    }


async def patch_conversation(
    db: AsyncSession,
    conversation: Conversation,
    *,
    title: str | None,
    model_id: str | None,
) -> Conversation:
    if title is not None:
        stripped = title.strip()
        length = codepoint_len(stripped)
        if length < 1 or length > 200:
            raise XiaobeiValidationError("对话名称需要 1 到 200 个字符")
        conversation.title = stripped
        conversation.title_customized = True
    if model_id is not None:
        allowed = set(get_settings().deepseek_allowed_models)
        if model_id not in allowed:
            raise XiaobeiValidationError("请选择可用的 Deepseek 模型")
        conversation.model_id = model_id
    await db.flush()
    await db.refresh(conversation)
    publish_user_event(
        conversation.user_id, "conversation.upserted", conversation_to_public(conversation)
    )
    logger.info("对话已更新", conversation_id=conversation.id)
    return conversation


async def delete_conversation(db: AsyncSession, conversation: Conversation) -> None:
    generating = await generating_assistant(db, conversation.id)
    if generating is not None:
        job = _jobs.get(generating.id)
        if job is not None:
            job.cancel.set()
    messages = await list_messages(db, conversation.id)
    message_ids = [item.id for item in messages]
    image_rows: list[ConversationImage] = []
    if message_ids:
        result = await db.execute(
            select(ConversationImage).where(ConversationImage.message_id.in_(message_ids))
        )
        image_rows = list(result.scalars().all())
    user_id = conversation.user_id
    conversation_id = conversation.id
    for image in image_rows:
        path = image_file_path(image)
        await db.delete(image)
        if path.exists():
            path.unlink()
    await db.delete(conversation)
    await db.flush()
    publish_user_event(user_id, "conversation.deleted", {"id": conversation_id})
    logger.info("对话已删除", conversation_id=conversation_id)


async def set_feedback(
    db: AsyncSession, message: ConversationMessage, feedback: str
) -> ConversationMessage:
    if message.role != ROLE_ASSISTANT:
        raise XiaobeiValidationError("只能为助手回复点赞或点踩")
    if feedback not in {"like", "dislike", "none"}:
        raise XiaobeiValidationError("反馈只能是赞、踩或取消")
    message.feedback = feedback
    await db.flush()
    await db.refresh(message)
    public = await message_public(db, message)
    conversation = await db.get(Conversation, message.conversation_id)
    if conversation is not None:
        publish_user_event(conversation.user_id, "message.upserted", public)
    return message


def image_data_url(image: ConversationImage) -> str | None:
    path = image_file_path(image)
    if not path.exists():
        return None
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{image.content_type};base64,{encoded}"


async def _user_payload(
    db: AsyncSession, message: ConversationMessage, vision: bool
) -> tuple[dict, int]:
    images = await images_for_message(db, message.id) if vision else []
    cost = estimate_tokens(message.content, len(images) if vision else 0)
    if vision and images:
        parts: list[dict] = []
        if message.content:
            parts.append({"type": "text", "text": message.content})
        for image in images:
            url = image_data_url(image)
            if url is None:
                continue
            parts.append(
                {"type": "image_url", "image_url": {"url": url, "detail": "auto"}}
            )
        content: str | list[dict] = parts if parts else message.content
    else:
        content = message.content
    return {"role": "user", "content": content}, cost


async def pack_model_messages(
    db: AsyncSession,
    conversation: Conversation,
    *,
    current_user_message: ConversationMessage,
    model_id: str,
    wedding: Wedding,
) -> tuple[list[dict], bool]:
    system = (
        load_system_prompt()
        + "\n\n"
        + archive_block(
            wedding.wedding_date.isoformat(),
            wedding.city,
            wedding.total_budget_fen,
            wedding.guest_estimate,
        )
    )
    history = await list_messages(db, conversation.id)
    vision = model_supports_vision(model_id)
    current_payload, current_cost = await _user_payload(db, current_user_message, vision)
    used = estimate_tokens(system, 0) + current_cost
    budget = context_input_budget()
    earlier_unused = False
    older: list[dict] = []
    for message in reversed(history):
        if message.id == current_user_message.id:
            continue
        if message.role == ROLE_ASSISTANT:
            if message.status != STATUS_COMPLETE:
                continue
            cost = estimate_tokens(message.content, 0)
            payload = {"role": "assistant", "content": message.content}
        elif message.role == ROLE_USER:
            payload, cost = await _user_payload(db, message, vision)
        else:
            continue
        if used + cost > budget:
            earlier_unused = True
            break
        older.append(payload)
        used += cost
    older.reverse()
    return [{"role": "system", "content": system}, *older, current_payload], earlier_unused


async def stream_mock_output(user_text: str, cancel: asyncio.Event) -> AsyncIterator[dict]:
    reply = mock_reply_for(user_text)
    for chunk in split_mock_chunks(reply):
        if cancel.is_set():
            return
        await asyncio.sleep(MOCK_CHUNK_INTERVAL)
        if cancel.is_set():
            return
        yield {"type": "delta", "text": chunk}
    if cancel.is_set():
        return
    yield {"type": "finish", "finish_reason": "stop"}


def map_http_error(status_code: int) -> str:
    if status_code in {429, 503}:
        return "rate_limited"
    return "other"


async def stream_live_output(
    model_id: str,
    messages: list[dict],
    cancel: asyncio.Event,
) -> AsyncIterator[dict]:
    settings = get_settings()
    timeout = httpx.Timeout(
        timeout=settings.deepseek_timeout_seconds,
        connect=settings.deepseek_timeout_seconds,
        read=settings.deepseek_idle_timeout_seconds,
        write=settings.deepseek_timeout_seconds,
        pool=settings.deepseek_timeout_seconds,
    )
    url = settings.deepseek_base_url.rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    body = build_chat_request_body(model_id, messages)
    logger.info("开始调用 Deepseek Chat Completions", model_id=model_id)
    try:
        async with create_http_client(timeout) as client:
            async with client.stream("POST", url, headers=headers, json=body) as response:
                if response.status_code != 200:
                    kind = map_http_error(response.status_code)
                    logger.error(
                        "Deepseek 调用失败",
                        status_code=response.status_code,
                        error_kind=kind,
                    )
                    raise CompletionFailedError(kind)
                async for line in response.aiter_lines():
                    if cancel.is_set():
                        await response.aclose()
                        return
                    if not line:
                        continue
                    if line.startswith("data:"):
                        data = line[5:].strip()
                    else:
                        data = line.strip()
                    if data == "[DONE]":
                        break
                    try:
                        parsed = json.loads(data)
                    except json.JSONDecodeError as exc:
                        logger.error("Deepseek 流式 JSON 解析失败")
                        raise CompletionFailedError("other") from exc
                    choices = parsed.get("choices") or []
                    if not choices:
                        continue
                    choice = choices[0]
                    finish_reason = choice.get("finish_reason")
                    delta = choice.get("delta") or {}
                    content = delta.get("content")
                    if content:
                        yield {"type": "delta", "text": content}
                    if finish_reason == "length":
                        raise CompletionFailedError("other")
                    if finish_reason:
                        yield {"type": "finish", "finish_reason": finish_reason}
                        return
    except CompletionFailedError:
        raise
    except httpx.TimeoutException as exc:
        logger.error("Deepseek 调用超时", detail=str(exc))
        raise CompletionFailedError("timeout") from exc
    except httpx.HTTPError as exc:
        logger.error("Deepseek 调用中途失败", detail=str(exc))
        raise CompletionFailedError("other") from exc
    yield {"type": "finish", "finish_reason": "stop"}


async def stream_model_output(
    *,
    model_id: str,
    messages: list[dict],
    user_text: str,
    cancel: asyncio.Event,
) -> AsyncIterator[dict]:
    if should_use_mock():
        logger.info("Deepseek 走 mock，不访问公网", model_id=model_id)
        async for item in stream_mock_output(user_text, cancel):
            yield item
        return
    if live_key_missing():
        logger.error("Deepseek 为 live 但未配置密钥，按其他失败处理")
        raise CompletionFailedError("other")
    async for item in stream_live_output(model_id, messages, cancel):
        yield item


async def persist_assistant(
    db: AsyncSession,
    assistant: ConversationMessage,
    *,
    status: str,
    content: str,
    error_kind: str | None,
    earlier_unused: bool,
    module_link: str | None,
) -> ConversationMessage:
    assistant.status = status
    assistant.content = content
    assistant.error_kind = error_kind
    assistant.earlier_unused = earlier_unused
    assistant.module_link = module_link
    await db.flush()
    await db.refresh(assistant)
    return assistant


async def _load_generation_context(job: GenerationJob) -> tuple[list[dict], bool, str]:
    async with get_db_context() as db:
        conversation = await get_owned_conversation(db, job.user_id, job.conversation_id)
        user_message = await db.get(ConversationMessage, job.user_message_id)
        assistant = await db.get(ConversationMessage, job.assistant_message_id)
        wedding = await require_wedding_profile(db, job.user_id)
        if user_message is None or assistant is None:
            raise XiaobeiNotFoundError()
        messages, earlier_unused = await pack_model_messages(
            db,
            conversation,
            current_user_message=user_message,
            model_id=job.model_id,
            wedding=wedding,
        )
        return messages, earlier_unused, user_message.content


async def _finish_generation(
    job: GenerationJob,
    *,
    collected: str,
    earlier_unused: bool,
    failed_kind: str | None,
) -> None:
    async with get_db_context() as db:
        assistant = await db.get(ConversationMessage, job.assistant_message_id)
        if assistant is None:
            job.kept = False
            job.final_assistant = None
            if job.cancel.is_set():
                job.queue.put_nowait(
                    (
                        "stopped",
                        {
                            "conversation_id": job.conversation_id,
                            "message_id": job.assistant_message_id,
                            "kept": False,
                            "content": "",
                        },
                    )
                )
            return
        if failed_kind is not None:
            assistant = await persist_assistant(
                db,
                assistant,
                status=STATUS_FAILED,
                content="",
                error_kind=failed_kind,
                earlier_unused=earlier_unused,
                module_link=None,
            )
            public = await message_public(db, assistant)
            publish_user_event(job.user_id, "message.upserted", public)
            job.final_assistant = public
            job.queue.put_nowait(
                (
                    "failed",
                    {
                        "conversation_id": job.conversation_id,
                        "message_id": job.assistant_message_id,
                        "error_kind": failed_kind,
                    },
                )
            )
            logger.info(
                "备备生成失败",
                conversation_id=job.conversation_id,
                error_kind=failed_kind,
            )
            return
        if job.cancel.is_set():
            if collected:
                assistant = await persist_assistant(
                    db,
                    assistant,
                    status=STATUS_STOPPED,
                    content=collected,
                    error_kind=None,
                    earlier_unused=earlier_unused,
                    module_link=None,
                )
                job.kept = True
                public = await message_public(db, assistant)
                publish_user_event(job.user_id, "message.upserted", public)
                job.final_assistant = public
                job.queue.put_nowait(
                    (
                        "stopped",
                        {
                            "conversation_id": job.conversation_id,
                            "message_id": job.assistant_message_id,
                            "kept": True,
                            "content": collected,
                        },
                    )
                )
            else:
                await db.delete(assistant)
                await db.flush()
                job.kept = False
                job.final_assistant = None
                job.queue.put_nowait(
                    (
                        "stopped",
                        {
                            "conversation_id": job.conversation_id,
                            "message_id": job.assistant_message_id,
                            "kept": False,
                            "content": "",
                        },
                    )
                )
                logger.info(
                    "已停止生成且无文字，已删除空助手消息",
                    conversation_id=job.conversation_id,
                )
            return
        content, module_link = parse_assistant_output(collected)
        user_message = await db.get(ConversationMessage, job.user_message_id)
        user_text = user_message.content if user_message is not None else ""
        content = drop_unwarranted_below_budget_sentence(
            content, user_text=user_text, total_budget_fen=job.total_budget_fen
        )
        assistant = await persist_assistant(
            db,
            assistant,
            status=STATUS_COMPLETE,
            content=content,
            error_kind=None,
            earlier_unused=earlier_unused,
            module_link=module_link,
        )
        public = await message_public(db, assistant)
        publish_user_event(job.user_id, "message.upserted", public)
        job.final_assistant = public
        job.queue.put_nowait(
            (
                "done",
                {
                    "conversation_id": job.conversation_id,
                    "message_id": job.assistant_message_id,
                    "earlier_unused": earlier_unused,
                    "module_link": module_link,
                    "content": content,
                },
            )
        )
        logger.info("备备生成完成", conversation_id=job.conversation_id)


async def run_generation(job: GenerationJob) -> None:
    collected = ""
    earlier_unused = False
    try:
        failed_kind: str | None = None
        try:
            if job.test_fault == TEST_FAULT_HOLD_FIRST:
                try:
                    await asyncio.wait_for(
                        job.cancel.wait(), timeout=HOLD_FIRST_DELAY_SECONDS
                    )
                except TimeoutError:
                    pass
                if job.cancel.is_set():
                    await _finish_generation(
                        job,
                        collected="",
                        earlier_unused=False,
                        failed_kind=None,
                    )
                    return
            if job.test_fault == TEST_FAULT_TIMEOUT:
                failed_kind = "timeout"
            elif job.test_fault == TEST_FAULT_RATE_LIMITED:
                failed_kind = "rate_limited"
            elif job.test_fault == TEST_FAULT_MID_FAIL:
                collected = MID_FAIL_PARTIAL_TEXT
                job.queue.put_nowait(
                    (
                        "delta",
                        {
                            "conversation_id": job.conversation_id,
                            "message_id": job.assistant_message_id,
                            "text": MID_FAIL_PARTIAL_TEXT,
                        },
                    )
                )
                await asyncio.sleep(MID_FAIL_PAUSE_SECONDS)
                if job.cancel.is_set():
                    await _finish_generation(
                        job,
                        collected=collected,
                        earlier_unused=False,
                        failed_kind=None,
                    )
                    return
                failed_kind = "other"
            else:
                messages, earlier_unused, user_text = await _load_generation_context(job)
                async for item in stream_model_output(
                    model_id=job.model_id,
                    messages=messages,
                    user_text=user_text,
                    cancel=job.cancel,
                ):
                    if job.cancel.is_set():
                        break
                    if item.get("type") == "delta":
                        text = str(item.get("text") or "")
                        if not text:
                            continue
                        collected += text
                        job.queue.put_nowait(
                            (
                                "delta",
                                {
                                    "conversation_id": job.conversation_id,
                                    "message_id": job.assistant_message_id,
                                    "text": text,
                                },
                            )
                        )
        except CompletionFailedError as exc:
            failed_kind = exc.kind
        await _finish_generation(
            job,
            collected=collected,
            earlier_unused=earlier_unused,
            failed_kind=failed_kind,
        )
    except Exception as exc:
        logger.error("备备生成任务异常", detail=str(exc))
        try:
            async with get_db_context() as db:
                assistant = await db.get(ConversationMessage, job.assistant_message_id)
                if assistant is not None and assistant.status == STATUS_GENERATING:
                    assistant = await persist_assistant(
                        db,
                        assistant,
                        status=STATUS_FAILED,
                        content="",
                        error_kind="other",
                        earlier_unused=False,
                        module_link=None,
                    )
                    public = await message_public(db, assistant)
                    publish_user_event(job.user_id, "message.upserted", public)
                    job.final_assistant = public
        except Exception as persist_exc:
            logger.error("写入生成失败状态时再次出错", detail=str(persist_exc))
        job.queue.put_nowait(
            (
                "failed",
                {
                    "conversation_id": job.conversation_id,
                    "message_id": job.assistant_message_id,
                    "error_kind": "other",
                },
            )
        )
    finally:
        job.queue.put_nowait(None)
        job.finished.set()
        _jobs.pop(job.assistant_message_id, None)


async def iter_generation_sse(job: GenerationJob, accepted: dict) -> AsyncIterator[str]:
    yield format_sse("accepted", accepted)
    while True:
        item = await job.queue.get()
        if item is None:
            break
        event, data = item
        yield format_sse(event, data)


def start_job(job: GenerationJob) -> GenerationJob:
    _jobs[job.assistant_message_id] = job
    job.task = asyncio.create_task(run_generation(job))
    return job


async def create_user_and_assistant(
    db: AsyncSession,
    conversation: Conversation,
    *,
    text: str,
    images: list[ConversationImage],
    model_id: str,
    reuse_user: ConversationMessage | None = None,
    reuse_assistant: ConversationMessage | None = None,
) -> tuple[ConversationMessage, ConversationMessage]:
    now = shanghai_now()
    conversation.last_message_at = now
    if reuse_user is None:
        user_message = ConversationMessage(
            conversation_id=conversation.id,
            role=ROLE_USER,
            status=STATUS_COMPLETE,
            error_kind=None,
            content=text,
            earlier_unused=False,
            module_link=None,
            feedback="none",
            model_id=None,
        )
        db.add(user_message)
        await db.flush()
        remember_created(user_message.id, now)
    else:
        reuse_user.content = text
        user_message = reuse_user
        await db.flush()
    await attach_images(db, images, user_message.id)
    if reuse_assistant is None:
        assistant = ConversationMessage(
            conversation_id=conversation.id,
            role=ROLE_ASSISTANT,
            status=STATUS_GENERATING,
            error_kind=None,
            content="",
            earlier_unused=False,
            module_link=None,
            feedback="none",
            model_id=model_id,
        )
        db.add(assistant)
        await db.flush()
        remember_created(assistant.id, now)
    else:
        reuse_assistant.status = STATUS_GENERATING
        reuse_assistant.content = ""
        reuse_assistant.error_kind = None
        reuse_assistant.earlier_unused = False
        reuse_assistant.module_link = None
        reuse_assistant.feedback = "none"
        reuse_assistant.model_id = model_id
        assistant = reuse_assistant
        await db.flush()
    await db.refresh(conversation)
    await db.refresh(user_message)
    await db.refresh(assistant)
    return user_message, assistant


async def begin_generation(
    db: AsyncSession,
    user_id: int,
    conversation: Conversation,
    wedding: Wedding,
    *,
    text: str,
    image_ids: list[int],
    model_id: str,
    reuse_user: ConversationMessage | None = None,
    reuse_assistant: ConversationMessage | None = None,
    test_fault: str | None = None,
) -> tuple[dict, GenerationJob]:
    if await generating_assistant(db, conversation.id) and reuse_assistant is None:
        raise XiaobeiConflictError("这段对话正在生成，请稍候")
    images = await images_for_ids(db, user_id, image_ids)
    user_message, assistant = await create_user_and_assistant(
        db,
        conversation,
        text=text,
        images=images,
        model_id=model_id,
        reuse_user=reuse_user,
        reuse_assistant=reuse_assistant,
    )
    await db.commit()
    await db.refresh(conversation)
    await db.refresh(user_message)
    await db.refresh(assistant)
    conv_public = conversation_to_public(conversation)
    user_public = await message_public(db, user_message)
    asst_public = await message_public(db, assistant)
    publish_user_event(user_id, "conversation.upserted", conv_public)
    publish_user_event(user_id, "message.upserted", user_public)
    publish_user_event(user_id, "message.upserted", asst_public)
    job = GenerationJob(
        conversation_id=conversation.id,
        user_id=user_id,
        user_message_id=user_message.id,
        assistant_message_id=assistant.id,
        model_id=model_id,
        wedding_date=wedding.wedding_date.isoformat(),
        city=wedding.city,
        total_budget_fen=wedding.total_budget_fen,
        guest_estimate=wedding.guest_estimate,
        test_fault=resolve_test_fault(test_fault),
    )
    start_job(job)
    accepted = {
        "conversation": conv_public,
        "user_message": user_public,
        "assistant_message": asst_public,
    }
    return accepted, job


async def start_new_conversation(
    db: AsyncSession,
    user_id: int,
    *,
    text: str,
    image_ids: list[int],
    model_id: str | None,
    test_fault: str | None = None,
) -> tuple[dict, GenerationJob]:
    wedding = await require_wedding_profile(db, user_id)
    chosen = model_id or default_model_id()
    stripped = validate_send_payload(text, image_ids, chosen)
    conversation = Conversation(
        user_id=user_id,
        title=auto_title(stripped, image_ids),
        title_customized=False,
        model_id=chosen,
        last_message_at=shanghai_now(),
    )
    db.add(conversation)
    await db.flush()
    return await begin_generation(
        db,
        user_id,
        conversation,
        wedding,
        text=stripped,
        image_ids=image_ids,
        model_id=chosen,
        test_fault=test_fault,
    )


async def start_followup(
    db: AsyncSession,
    user_id: int,
    conversation: Conversation,
    *,
    text: str,
    image_ids: list[int],
    test_fault: str | None = None,
) -> tuple[dict, GenerationJob]:
    wedding = await require_wedding_profile(db, user_id)
    stripped = validate_send_payload(text, image_ids, conversation.model_id)
    return await begin_generation(
        db,
        user_id,
        conversation,
        wedding,
        text=stripped,
        image_ids=image_ids,
        model_id=conversation.model_id,
        test_fault=test_fault,
    )


async def retry_failed(
    db: AsyncSession,
    user_id: int,
    conversation: Conversation,
    message_id: int,
    test_fault: str | None = None,
) -> tuple[dict, GenerationJob]:
    wedding = await require_wedding_profile(db, user_id)
    assistant = await db.get(ConversationMessage, message_id)
    if (
        assistant is None
        or assistant.conversation_id != conversation.id
        or assistant.role != ROLE_ASSISTANT
    ):
        raise XiaobeiNotFoundError("找不到这条回复")
    if assistant.status != STATUS_FAILED:
        raise XiaobeiValidationError("只能重试失败的回答")
    messages = await list_messages(db, conversation.id)
    user_message = None
    for item in reversed(messages):
        if item.id == assistant.id:
            continue
        if item.role == ROLE_USER:
            user_message = item
            break
    if user_message is None:
        raise XiaobeiValidationError("找不到可重试的用户消息")
    images = await images_for_message(db, user_message.id)
    return await begin_generation(
        db,
        user_id,
        conversation,
        wedding,
        text=user_message.content,
        image_ids=[image.id for image in images],
        model_id=conversation.model_id,
        reuse_user=user_message,
        reuse_assistant=assistant,
        test_fault=test_fault,
    )


async def regenerate_assistant(
    db: AsyncSession, user_id: int, conversation: Conversation, message_id: int
) -> tuple[dict, GenerationJob]:
    wedding = await require_wedding_profile(db, user_id)
    messages = await list_messages(db, conversation.id)
    if not messages:
        raise XiaobeiValidationError("没有可重新生成的回复")
    latest = messages[-1]
    if latest.id != message_id or latest.role != ROLE_ASSISTANT:
        raise XiaobeiValidationError("只能重新生成最新一条助手回复")
    if latest.status not in {STATUS_COMPLETE, STATUS_STOPPED}:
        raise XiaobeiValidationError("正在生成时不能重新生成")
    user_message = None
    for item in reversed(messages[:-1]):
        if item.role == ROLE_USER:
            user_message = item
            break
    if user_message is None:
        raise XiaobeiValidationError("找不到对应的用户消息")
    images = await images_for_message(db, user_message.id)
    return await begin_generation(
        db,
        user_id,
        conversation,
        wedding,
        text=user_message.content,
        image_ids=[image.id for image in images],
        model_id=conversation.model_id,
        reuse_user=user_message,
        reuse_assistant=latest,
    )


async def edit_and_resend(
    db: AsyncSession,
    user_id: int,
    conversation: Conversation,
    message_id: int,
    *,
    text: str,
    image_ids: list[int],
) -> tuple[dict, GenerationJob]:
    if await generating_assistant(db, conversation.id):
        raise XiaobeiConflictError("这段对话正在生成，请稍候")
    wedding = await require_wedding_profile(db, user_id)
    stripped = validate_send_payload(text, image_ids, conversation.model_id)
    messages = await list_messages(db, conversation.id)
    user_candidates = [item for item in messages if item.role == ROLE_USER]
    if not user_candidates or user_candidates[-1].id != message_id:
        raise XiaobeiValidationError("只能编辑最新一条用户消息")
    user_message = user_candidates[-1]
    following = None
    for item in messages:
        if item.id > user_message.id and item.role == ROLE_ASSISTANT:
            following = item
    await replace_message_images(db, user_id, user_message, image_ids)
    return await begin_generation(
        db,
        user_id,
        conversation,
        wedding,
        text=stripped,
        image_ids=image_ids,
        model_id=conversation.model_id,
        reuse_user=user_message,
        reuse_assistant=following,
    )


async def stop_generation(
    db: AsyncSession, conversation: Conversation, message_id: int
) -> dict:
    assistant = await db.get(ConversationMessage, message_id)
    if (
        assistant is None
        or assistant.conversation_id != conversation.id
        or assistant.role != ROLE_ASSISTANT
    ):
        raise XiaobeiNotFoundError("找不到这条回复")
    if assistant.status != STATUS_GENERATING:
        raise XiaobeiValidationError("当前没有正在生成的回复")
    snapshot = await message_public(db, assistant)
    job = _jobs.get(message_id)
    if job is not None:
        job.cancel.set()
        await db.commit()
        try:
            await asyncio.wait_for(job.finished.wait(), timeout=5)
        except TimeoutError:
            logger.error("停止生成等待超时", message_id=message_id)
        if job.final_assistant is not None:
            return job.final_assistant
        if job.kept is False:
            snapshot["status"] = STATUS_STOPPED
            snapshot["content"] = ""
            return snapshot
        refreshed = await db.get(ConversationMessage, message_id)
        if refreshed is None:
            snapshot["status"] = STATUS_STOPPED
            snapshot["content"] = ""
            return snapshot
        await db.refresh(refreshed)
        return await message_public(db, refreshed)
    if assistant.content:
        assistant.status = STATUS_STOPPED
        await db.flush()
        await db.refresh(assistant)
        public = await message_public(db, assistant)
        publish_user_event(conversation.user_id, "message.upserted", public)
        return public
    await db.delete(assistant)
    await db.flush()
    snapshot["status"] = STATUS_STOPPED
    snapshot["content"] = ""
    return snapshot


async def iter_user_events(user_id: int) -> AsyncIterator[str]:
    queue = subscribe_user_events(user_id)
    try:
        while True:
            event, data = await queue.get()
            yield format_sse(event, data)
    finally:
        unsubscribe_user_events(user_id, queue)
