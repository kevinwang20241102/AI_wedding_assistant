"""宾客接口：API-020～API-023、API-028。"""

from __future__ import annotations

from typing import Annotated, Literal, NoReturn

from fastapi import Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pycore.api import APIRouter, success_response
from pydantic import BaseModel, BeforeValidator, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import ApiError, get_current_user
from src.db.models import User
from src.db.session import get_db
from src.services import guest_service, table_service, wedding_service

router = APIRouter(prefix="/api/guests", tags=["guests"])

Attendance = Literal["待定", "已确认", "已婉拒"]
SeqValue = Annotated[int, BeforeValidator(guest_service.coerce_seq)]


class GuestCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    group_id: int | None = None
    attendance: Attendance | None = None
    seq: SeqValue = 0
    note: str | None = None


class GuestPaste(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str


class GuestUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    group_id: int | None = None
    attendance: Attendance | None = None
    seq: SeqValue | None = None
    table_id: int | None = None


class GuestPublic(BaseModel):
    id: int
    name: str
    group_id: int
    attendance: Attendance
    seq: int
    note: str
    table_id: int | None


class SeatingStatsPublic(BaseModel):
    guest_total: int
    confirmed_count: int
    seated_count: int
    unseated_count: int


class TablePublic(BaseModel):
    id: int
    table_number: int
    name: str
    capacity: int
    is_head: bool
    pos_x: float
    pos_y: float
    seated_count: int


class GuestListData(BaseModel):
    seating_stats: SeatingStatsPublic
    guests: list[GuestPublic]


class GuestPasteData(BaseModel):
    created_count: int
    guests: list[GuestPublic]


class GuestPatchData(BaseModel):
    guest: GuestPublic
    seating_stats: SeatingStatsPublic
    table: TablePublic | None


class DeleteGuestData(BaseModel):
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


def _raise_guest_errors(exc: Exception) -> NoReturn:
    if isinstance(exc, wedding_service.WeddingNotFoundError):
        raise ApiError(str(exc), "CONFLICT", 409) from exc
    if isinstance(exc, guest_service.GuestValidationError):
        raise ApiError(str(exc), "VALIDATION_ERROR", 400) from exc
    if isinstance(exc, guest_service.GuestNotFoundError):
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    if isinstance(exc, guest_service.GroupNotFoundError):
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    if isinstance(exc, table_service.TableNotFoundError):
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    raise exc


@router.get("")
async def list_guests(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        payload = await guest_service.list_guests_payload(db, user.id)
    except wedding_service.WeddingNotFoundError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc
    GuestListData.model_validate(payload)
    return _json_ok(payload, None, 200)


@router.post("", status_code=201)
async def create_guest(
    body: GuestCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        guest = await guest_service.create_guest(
            db,
            wedding,
            name=body.name,
            group_id=body.group_id,
            attendance=body.attendance,
            seq=body.seq,
            note=body.note,
        )
    except (
        guest_service.GuestValidationError,
        guest_service.GroupNotFoundError,
    ) as exc:
        _raise_guest_errors(exc)
    public = guest_service.guest_to_public(guest)
    GuestPublic.model_validate(public)
    return _json_ok(public, None, 201)


@router.post("/paste", status_code=201)
async def paste_guests(
    body: GuestPaste,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        guests = await guest_service.paste_guests(db, wedding, body.text)
    except (
        guest_service.GuestValidationError,
        guest_service.GroupNotFoundError,
    ) as except_exc:
        _raise_guest_errors(except_exc)
    payload = {
        "created_count": len(guests),
        "guests": [guest_service.guest_to_public(item) for item in guests],
    }
    GuestPasteData.model_validate(payload)
    return _json_ok(payload, None, 201)


@router.patch("/{guest_id}")
async def update_guest(
    guest_id: int,
    body: GuestUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        guest = await guest_service.get_guest_for_wedding(db, wedding.id, guest_id)
        guest, table_payload = await guest_service.update_guest(
            db, guest, body.model_dump(exclude_unset=True)
        )
        stats = await wedding_service.seating_stats(db, wedding.id)
    except (
        guest_service.GuestValidationError,
        guest_service.GuestNotFoundError,
        guest_service.GroupNotFoundError,
        table_service.TableNotFoundError,
    ) as exc:
        _raise_guest_errors(exc)
    payload = {
        "guest": guest_service.guest_to_public(guest),
        "seating_stats": stats,
        "table": table_payload,
    }
    GuestPatchData.model_validate(payload)
    return _json_ok(payload, None, 200)


@router.delete("/{guest_id}")
async def delete_guest(
    guest_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        guest = await guest_service.get_guest_for_wedding(db, wedding.id, guest_id)
        stats = await guest_service.delete_guest(db, guest)
    except guest_service.GuestNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    payload = {"ok": True, "seating_stats": stats}
    DeleteGuestData.model_validate(payload)
    return _json_ok(payload, None, 200)
