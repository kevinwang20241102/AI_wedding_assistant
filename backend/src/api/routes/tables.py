"""桌位接口：API-024～API-027。"""

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
from src.services import table_service, wedding_service

router = APIRouter(prefix="/api/tables", tags=["tables"])


class TableCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    capacity: int | None = Field(default=None, ge=1)
    is_head: bool = False
    pos_x: float = 0
    pos_y: float = 0


class TableUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    capacity: int | None = Field(default=None, ge=1)
    is_head: bool | None = None
    pos_x: float | None = None
    pos_y: float | None = None


class TablePublic(BaseModel):
    id: int
    table_number: int
    name: str
    capacity: int
    is_head: bool
    pos_x: float
    pos_y: float
    seated_count: int


class SeatingStatsPublic(BaseModel):
    guest_total: int
    confirmed_count: int
    seated_count: int
    unseated_count: int


class DeleteTableData(BaseModel):
    ok: bool
    seating_stats: SeatingStatsPublic


def _json_ok(data: object, message: str | None, status_code: int) -> JSONResponse:
    payload = success_response(data=data, message=message)
    return JSONResponse(status_code=status_code, content=jsonable_encoder(payload))


async def _require_wedding(db: AsyncSession, user_id: int):
    try:
        return await wedding_service.require_wedding(db, user_id)
    except wedding_service.WeddingNotFoundError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc


@router.get("")
async def list_tables(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        payload = await table_service.list_tables_payload(db, user.id)
    except wedding_service.WeddingNotFoundError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc
    for item in payload:
        TablePublic.model_validate(item)
    return _json_ok(payload, None, 200)


@router.post("", status_code=201)
async def create_table(
    body: TableCreate = Body(default_factory=TableCreate),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        table = await table_service.create_table(
            db,
            wedding,
            name=body.name,
            capacity=body.capacity,
            is_head=body.is_head,
            pos_x=body.pos_x,
            pos_y=body.pos_y,
        )
    except table_service.TableValidationError as exc:
        raise ApiError(str(exc), "VALIDATION_ERROR", 400) from exc
    public = await table_service.table_to_public(db, table)
    TablePublic.model_validate(public)
    return _json_ok(public, None, 201)


@router.patch("/{table_id}")
async def update_table(
    table_id: int,
    body: TableUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        table = await table_service.get_table_for_wedding(db, wedding.id, table_id)
        table = await table_service.update_table(
            db, table, body.model_dump(exclude_unset=True)
        )
    except table_service.TableNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    except table_service.TableValidationError as exc:
        raise ApiError(str(exc), "VALIDATION_ERROR", 400) from exc
    public = await table_service.table_to_public(db, table)
    TablePublic.model_validate(public)
    return _json_ok(public, None, 200)


@router.delete("/{table_id}")
async def delete_table(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        table = await table_service.get_table_for_wedding(db, wedding.id, table_id)
        stats = await table_service.delete_table(db, table)
    except table_service.TableNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    payload = {"ok": True, "seating_stats": stats}
    DeleteTableData.model_validate(payload)
    return _json_ok(payload, None, 200)
