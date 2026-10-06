"""计划书阶段接口：增删改与排序。"""

from __future__ import annotations

from fastapi import Body, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pycore.api import APIRouter, success_response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import ApiError, get_current_user
from src.db.models import User
from src.db.session import get_db
from src.services import stage_service, wedding_service

router = APIRouter(prefix="/api/stages", tags=["stages"])


class StageCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = "新阶段"


class StageUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    sort_order: int | None = Field(default=None, ge=0)


class StagePublic(BaseModel):
    id: int
    name: str
    sort_order: int


class DeleteOk(BaseModel):
    ok: bool


def _json_ok(data: object, message: str | None, status_code: int) -> JSONResponse:
    payload = success_response(data=data, message=message)
    return JSONResponse(status_code=status_code, content=jsonable_encoder(payload))


async def _require_wedding(db: AsyncSession, user_id: int):
    try:
        return await wedding_service.require_wedding(db, user_id)
    except wedding_service.WeddingNotFoundError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc


@router.post("", status_code=201)
async def create_stage(
    body: StageCreate = Body(default_factory=StageCreate),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        stage = await stage_service.create_stage(db, wedding, body.name)
    except stage_service.StageValidationError as exc:
        raise ApiError(str(exc), "VALIDATION_ERROR", 400) from exc
    public = stage_service.public_stage(stage)
    StagePublic.model_validate(public)
    return _json_ok(public, None, 201)


@router.patch("/{stage_id}")
async def update_stage(
    stage_id: int,
    body: StageUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        stage = await stage_service.get_stage_for_wedding(db, wedding.id, stage_id)
        stage = await stage_service.update_stage(db, stage, body.model_dump(exclude_unset=True))
    except stage_service.StageNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    except stage_service.StageValidationError as exc:
        raise ApiError(str(exc), "VALIDATION_ERROR", 400) from exc
    public = stage_service.public_stage(stage)
    StagePublic.model_validate(public)
    return _json_ok(public, None, 200)


@router.delete("/{stage_id}")
async def delete_stage(
    stage_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        stage = await stage_service.get_stage_for_wedding(db, wedding.id, stage_id)
        await stage_service.delete_stage(db, stage)
    except stage_service.StageNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    payload = {"ok": True}
    DeleteOk.model_validate(payload)
    return _json_ok(payload, None, 200)
