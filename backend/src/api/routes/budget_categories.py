"""预算分类接口：API-014～API-017。"""

from __future__ import annotations

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
from src.services import budget_service, wedding_service

router = APIRouter(prefix="/api/budget_categories", tags=["budget_categories"])

BudgetStatus = Literal["未确定", "已确定", "已支付"]


class BudgetCategoryCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    amount_fen: int = Field(default=0, ge=0)
    status: BudgetStatus = "未确定"
    note: str | None = None


class BudgetCategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    amount_fen: int | None = Field(default=None, ge=0)
    status: BudgetStatus | None = None
    note: str | None = None
    sort_order: int | None = Field(default=None, ge=0)


class BudgetCategoryPublic(BaseModel):
    id: int
    name: str
    amount_fen: int
    status: BudgetStatus
    note: str
    sort_order: int


class BudgetListData(BaseModel):
    total_budget_fen: int
    allocated_fen: int
    unallocated_fen: int
    is_over_allocated: bool
    categories: list[BudgetCategoryPublic]


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
async def list_budget_categories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        payload = await budget_service.get_budget(db, user.id)
    except wedding_service.WeddingNotFoundError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc
    BudgetListData.model_validate(payload)
    return _json_ok(payload, None, 200)


@router.post("", status_code=201)
async def create_budget_category(
    body: BudgetCategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        category = await budget_service.create_category(
            db,
            wedding,
            name=body.name,
            amount_fen=body.amount_fen,
            status=body.status,
            note=body.note,
        )
    except budget_service.BudgetValidationError as exc:
        raise ApiError(str(exc), "VALIDATION_ERROR", 400) from exc
    public = budget_service.category_to_public(category)
    BudgetCategoryPublic.model_validate(public)
    return _json_ok(public, None, 201)


@router.patch("/{category_id}")
async def update_budget_category(
    category_id: int,
    body: BudgetCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        category = await budget_service.get_category_for_wedding(db, wedding.id, category_id)
        category = await budget_service.update_category(
            db, category, body.model_dump(exclude_unset=True)
        )
    except budget_service.BudgetNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    except budget_service.BudgetValidationError as exc:
        raise ApiError(str(exc), "VALIDATION_ERROR", 400) from exc
    public = budget_service.category_to_public(category)
    BudgetCategoryPublic.model_validate(public)
    return _json_ok(public, None, 200)


@router.delete("/{category_id}")
async def delete_budget_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        category = await budget_service.get_category_for_wedding(db, wedding.id, category_id)
        await budget_service.delete_category(db, category)
    except budget_service.BudgetNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    payload = {"ok": True}
    DeleteOk.model_validate(payload)
    return _json_ok(payload, None, 200)
