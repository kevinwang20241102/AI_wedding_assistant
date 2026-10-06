"""备备对话接口：API-029～API-032、API-035～API-042。"""

from __future__ import annotations

from typing import Literal, NoReturn

from fastapi import Depends, Header
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, StreamingResponse
from pycore.api import APIRouter, success_response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import ApiError, get_current_user
from src.db.models import User
from src.db.session import get_db
from src.services import xiaobei_generator

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class SendFirstMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = ""
    image_ids: list[int] = Field(default_factory=list)
    model_id: str | None = None


class SendFollowup(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = ""
    image_ids: list[int] = Field(default_factory=list)


class ConversationPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = None
    model_id: str | None = None


class MessageEdit(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = ""
    image_ids: list[int] = Field(default_factory=list)


class FeedbackBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    feedback: Literal["like", "dislike", "none"]


def _json_ok(data: object, message: str | None, status_code: int) -> JSONResponse:
    payload = success_response(data=data, message=message)
    return JSONResponse(status_code=status_code, content=jsonable_encoder(payload))


def _raise_service_error(exc: Exception) -> NoReturn:
    if isinstance(exc, xiaobei_generator.XiaobeiValidationError):
        raise ApiError(exc.error, "VALIDATION_ERROR", 400) from exc
    if isinstance(exc, xiaobei_generator.XiaobeiNotFoundError):
        raise ApiError(exc.error, "NOT_FOUND", 404) from exc
    if isinstance(exc, xiaobei_generator.XiaobeiConflictError):
        raise ApiError(str(exc), "CONFLICT", 409) from exc
    raise exc


async def _require_wedding(db: AsyncSession, user_id: int) -> None:
    try:
        await xiaobei_generator.require_wedding_profile(db, user_id)
    except xiaobei_generator.XiaobeiConflictError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc


async def _owned_conversation(db: AsyncSession, user_id: int, conversation_id: int):
    try:
        return await xiaobei_generator.get_owned_conversation(db, user_id, conversation_id)
    except xiaobei_generator.XiaobeiNotFoundError as exc:
        raise ApiError(exc.error, "NOT_FOUND", 404) from exc


def _sse(job: xiaobei_generator.GenerationJob, accepted: dict) -> StreamingResponse:
    return StreamingResponse(
        xiaobei_generator.iter_generation_sse(job, accepted),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/events")
async def conversation_events(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    await _require_wedding(db, user.id)
    return StreamingResponse(
        xiaobei_generator.iter_user_events(user.id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("")
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    await _require_wedding(db, user.id)
    items = await xiaobei_generator.list_conversations(db, user.id)
    return _json_ok(
        [xiaobei_generator.conversation_to_public(item) for item in items], None, 200
    )


@router.post("")
async def create_conversation(
    body: SendFirstMessage,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    x_xiaobei_test_fault: str | None = Header(default=None),
) -> StreamingResponse:
    try:
        accepted, job = await xiaobei_generator.start_new_conversation(
            db,
            user.id,
            text=body.text,
            image_ids=body.image_ids,
            model_id=body.model_id,
            test_fault=x_xiaobei_test_fault,
        )
    except (
        xiaobei_generator.XiaobeiValidationError,
        xiaobei_generator.XiaobeiNotFoundError,
        xiaobei_generator.XiaobeiConflictError,
    ) as exc:
        _raise_service_error(exc)
    return _sse(job, accepted)


@router.get("/{conversation_id}")
async def read_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    await _require_wedding(db, user.id)
    conversation = await _owned_conversation(db, user.id, conversation_id)
    bundle = await xiaobei_generator.conversation_bundle(db, conversation)
    return _json_ok(bundle, None, 200)


@router.patch("/{conversation_id}")
async def patch_conversation(
    conversation_id: int,
    body: ConversationPatch,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    await _require_wedding(db, user.id)
    conversation = await _owned_conversation(db, user.id, conversation_id)
    try:
        updated = await xiaobei_generator.patch_conversation(
            db, conversation, title=body.title, model_id=body.model_id
        )
    except xiaobei_generator.XiaobeiValidationError as exc:
        raise ApiError(exc.error, "VALIDATION_ERROR", 400) from exc
    return _json_ok(xiaobei_generator.conversation_to_public(updated), None, 200)


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    await _require_wedding(db, user.id)
    conversation = await _owned_conversation(db, user.id, conversation_id)
    await xiaobei_generator.delete_conversation(db, conversation)
    return _json_ok({"ok": True}, None, 200)


@router.post("/{conversation_id}/messages")
async def send_followup(
    conversation_id: int,
    body: SendFollowup,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    x_xiaobei_test_fault: str | None = Header(default=None),
) -> StreamingResponse:
    await _require_wedding(db, user.id)
    conversation = await _owned_conversation(db, user.id, conversation_id)
    try:
        accepted, job = await xiaobei_generator.start_followup(
            db,
            user.id,
            conversation,
            text=body.text,
            image_ids=body.image_ids,
            test_fault=x_xiaobei_test_fault,
        )
    except (
        xiaobei_generator.XiaobeiValidationError,
        xiaobei_generator.XiaobeiNotFoundError,
        xiaobei_generator.XiaobeiConflictError,
    ) as exc:
        _raise_service_error(exc)
    return _sse(job, accepted)


@router.post("/{conversation_id}/messages/{message_id}/stop")
async def stop_generation(
    conversation_id: int,
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    await _require_wedding(db, user.id)
    conversation = await _owned_conversation(db, user.id, conversation_id)
    try:
        public = await xiaobei_generator.stop_generation(db, conversation, message_id)
    except (
        xiaobei_generator.XiaobeiValidationError,
        xiaobei_generator.XiaobeiNotFoundError,
    ) as exc:
        _raise_service_error(exc)
    return _json_ok({"message": public}, None, 200)


@router.post("/{conversation_id}/messages/{message_id}/retry")
async def retry_failed(
    conversation_id: int,
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    x_xiaobei_test_fault: str | None = Header(default=None),
) -> StreamingResponse:
    await _require_wedding(db, user.id)
    conversation = await _owned_conversation(db, user.id, conversation_id)
    try:
        accepted, job = await xiaobei_generator.retry_failed(
            db, user.id, conversation, message_id, test_fault=x_xiaobei_test_fault
        )
    except (
        xiaobei_generator.XiaobeiValidationError,
        xiaobei_generator.XiaobeiNotFoundError,
        xiaobei_generator.XiaobeiConflictError,
    ) as exc:
        _raise_service_error(exc)
    return _sse(job, accepted)


@router.post("/{conversation_id}/messages/{message_id}/regenerate")
async def regenerate_assistant(
    conversation_id: int,
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    await _require_wedding(db, user.id)
    conversation = await _owned_conversation(db, user.id, conversation_id)
    try:
        accepted, job = await xiaobei_generator.regenerate_assistant(
            db, user.id, conversation, message_id
        )
    except (
        xiaobei_generator.XiaobeiValidationError,
        xiaobei_generator.XiaobeiNotFoundError,
        xiaobei_generator.XiaobeiConflictError,
    ) as exc:
        _raise_service_error(exc)
    return _sse(job, accepted)


@router.patch("/{conversation_id}/messages/{message_id}")
async def edit_and_resend(
    conversation_id: int,
    message_id: int,
    body: MessageEdit,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    await _require_wedding(db, user.id)
    conversation = await _owned_conversation(db, user.id, conversation_id)
    try:
        accepted, job = await xiaobei_generator.edit_and_resend(
            db,
            user.id,
            conversation,
            message_id,
            text=body.text,
            image_ids=body.image_ids,
        )
    except (
        xiaobei_generator.XiaobeiValidationError,
        xiaobei_generator.XiaobeiNotFoundError,
        xiaobei_generator.XiaobeiConflictError,
    ) as exc:
        _raise_service_error(exc)
    return _sse(job, accepted)


@router.patch("/{conversation_id}/messages/{message_id}/feedback")
async def set_feedback(
    conversation_id: int,
    message_id: int,
    body: FeedbackBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    await _require_wedding(db, user.id)
    conversation = await _owned_conversation(db, user.id, conversation_id)
    messages = await xiaobei_generator.list_messages(db, conversation.id)
    target = next((item for item in messages if item.id == message_id), None)
    if target is None:
        raise ApiError("找不到这条消息", "NOT_FOUND", 404)
    try:
        updated = await xiaobei_generator.set_feedback(db, target, body.feedback)
    except xiaobei_generator.XiaobeiValidationError as exc:
        raise ApiError(exc.error, "VALIDATION_ERROR", 400) from exc
    public = await xiaobei_generator.message_public(db, updated)
    return _json_ok(public, None, 200)
