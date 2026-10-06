"""计划书任务接口：API-010～API-013。"""

from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pycore.api import APIRouter, success_response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import ApiError, get_current_user
from src.db.models import User
from src.db.session import get_db
from src.services import task_service, wedding_service

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

TaskStatus = Literal["未开始", "进行中", "已完成", "已超期"]


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    stage_id: int
    due_date: date


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    stage_id: int | None = None
    due_date: date | None = None
    status: TaskStatus | None = None
    sort_order: int | None = Field(default=None, ge=0)


class TaskPublic(BaseModel):
    id: int
    name: str
    stage_id: int
    due_date: date
    status: TaskStatus
    due_date_customized: bool
    sort_order: int


class StagePublic(BaseModel):
    id: int
    name: str
    sort_order: int


class PlanProgress(BaseModel):
    completed: int
    in_progress: int
    total: int


class PlanAggregate(BaseModel):
    wedding_date: date
    countdown_days: int
    progress: PlanProgress
    current_stage: int | None
    stages: list[StagePublic]
    tasks: list[TaskPublic]


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


@router.get("")
async def read_plan(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        payload = await task_service.get_plan(db, user.id)
    except wedding_service.WeddingNotFoundError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc
    PlanAggregate.model_validate(payload)
    return _json_ok(payload, None, 200)


@router.post("", status_code=201)
async def create_task(
    body: TaskCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        task = await task_service.create_task(
            db,
            wedding,
            name=body.name,
            stage_id=body.stage_id,
            due_date=body.due_date,
        )
    except task_service.TaskValidationError as exc:
        raise ApiError(str(exc), "VALIDATION_ERROR", 400) from exc
    public = task_service.task_to_public(task)
    TaskPublic.model_validate(public)
    return _json_ok(public, None, 201)


@router.patch("/{task_id}")
async def update_task(
    task_id: int,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        task = await task_service.get_task_for_wedding(db, wedding.id, task_id)
        task = await task_service.update_task(db, task, body.model_dump(exclude_unset=True))
    except task_service.TaskNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    except task_service.TaskValidationError as exc:
        raise ApiError(str(exc), "VALIDATION_ERROR", 400) from exc
    public = task_service.task_to_public(task)
    TaskPublic.model_validate(public)
    return _json_ok(public, None, 200)


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        task = await task_service.get_task_for_wedding(db, wedding.id, task_id)
        await task_service.delete_task(db, task)
    except task_service.TaskNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    payload = {"ok": True}
    DeleteOk.model_validate(payload)
    return _json_ok(payload, None, 200)
