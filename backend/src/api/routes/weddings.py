"""婚礼档案接口：API-007～API-009。"""

from __future__ import annotations

from datetime import date

from fastapi import Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pycore.api import APIRouter, success_response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import ApiError, get_current_user
from src.db.models import User
from src.db.session import get_db
from src.services import wedding_service

router = APIRouter(prefix="/api/weddings", tags=["weddings"])


class WeddingCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    start_date: date
    wedding_date: date
    city: str
    total_budget_fen: int = Field(ge=0)
    guest_estimate: int = Field(ge=0)


class WeddingUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    start_date: date | None = None
    wedding_date: date | None = None
    city: str | None = None
    total_budget_fen: int | None = Field(default=None, ge=0)
    guest_estimate: int | None = Field(default=None, ge=0)
    groom_nickname: str | None = None
    groom_birthday: date | None = None
    bride_nickname: str | None = None
    bride_birthday: date | None = None
    other_preference: str | None = None
    canvas_scale: float | None = Field(default=None, gt=0)
    canvas_offset_x: float | None = None
    canvas_offset_y: float | None = None

    @field_validator("groom_birthday", "bride_birthday", mode="before")
    @classmethod
    def empty_birthday_as_none(cls, value: object) -> object:
        if value == "":
            return None
        return value


class WeddingPublic(BaseModel):
    id: int
    start_date: date
    wedding_date: date
    city: str
    total_budget_fen: int
    guest_estimate: int
    groom_nickname: str | None
    groom_birthday: date | None
    bride_nickname: str | None
    bride_birthday: date | None
    other_preference: str | None
    canvas_scale: float
    canvas_offset_x: float
    canvas_offset_y: float


class SeatingStatsPublic(BaseModel):
    guest_total: int
    confirmed_count: int
    seated_count: int
    unseated_count: int


class WeddingCurrentData(WeddingPublic):
    seating_stats: SeatingStatsPublic


def _json_ok(data: object, message: str | None, status_code: int) -> JSONResponse:
    payload = success_response(data=data, message=message)
    return JSONResponse(status_code=status_code, content=jsonable_encoder(payload))


def _optional_nickname(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def _validate_create(body: WeddingCreate) -> tuple[date, date, str, int, int]:
    city = body.city.strip()
    if not city:
        raise ApiError("请填写城市", "VALIDATION_ERROR", 400)
    if body.wedding_date < body.start_date:
        raise ApiError("婚礼日期不能早于开始备婚日期", "VALIDATION_ERROR", 400)
    return body.start_date, body.wedding_date, city, body.total_budget_fen, body.guest_estimate


def _patch_fields(body: WeddingUpdate, wedding) -> dict:
    data = body.model_dump(exclude_unset=True)
    fields: dict = {}
    if "start_date" in data:
        if data["start_date"] is None:
            raise ApiError("请填写开始备婚日期", "VALIDATION_ERROR", 400)
        fields["start_date"] = data["start_date"]
    if "wedding_date" in data:
        if data["wedding_date"] is None:
            raise ApiError("请填写婚礼日期", "VALIDATION_ERROR", 400)
        fields["wedding_date"] = data["wedding_date"]
    start_date = fields.get("start_date", wedding.start_date)
    wedding_date = fields.get("wedding_date", wedding.wedding_date)
    if wedding_date < start_date:
        raise ApiError("婚礼日期不能早于开始备婚日期", "VALIDATION_ERROR", 400)
    if "city" in data:
        city = (data["city"] or "").strip()
        if not city:
            raise ApiError("请填写城市", "VALIDATION_ERROR", 400)
        fields["city"] = city
    if "total_budget_fen" in data:
        if data["total_budget_fen"] is None:
            raise ApiError("请填写总预算", "VALIDATION_ERROR", 400)
        fields["total_budget_fen"] = data["total_budget_fen"]
    if "guest_estimate" in data:
        if data["guest_estimate"] is None:
            raise ApiError("请填写总人数", "VALIDATION_ERROR", 400)
        fields["guest_estimate"] = data["guest_estimate"]
    if "groom_nickname" in data:
        fields["groom_nickname"] = _optional_nickname(data["groom_nickname"])
    if "bride_nickname" in data:
        fields["bride_nickname"] = _optional_nickname(data["bride_nickname"])
    if "groom_birthday" in data:
        fields["groom_birthday"] = data["groom_birthday"]
    if "bride_birthday" in data:
        fields["bride_birthday"] = data["bride_birthday"]
    if "other_preference" in data:
        fields["other_preference"] = data["other_preference"]
    if "canvas_scale" in data:
        if data["canvas_scale"] is None:
            raise ApiError("缩放必须为正数", "VALIDATION_ERROR", 400)
        fields["canvas_scale"] = data["canvas_scale"]
    if "canvas_offset_x" in data:
        fields["canvas_offset_x"] = data["canvas_offset_x"]
    if "canvas_offset_y" in data:
        fields["canvas_offset_y"] = data["canvas_offset_y"]
    return fields


@router.post("", status_code=201)
async def create_wedding(
    body: WeddingCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    start_date, wedding_date, city, total_budget_fen, guest_estimate = _validate_create(body)
    try:
        wedding = await wedding_service.create_wedding(
            db,
            user.id,
            start_date=start_date,
            wedding_date=wedding_date,
            city=city,
            total_budget_fen=total_budget_fen,
            guest_estimate=guest_estimate,
        )
    except wedding_service.WeddingAlreadyExistsError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc
    return _json_ok(wedding_service.wedding_to_public(wedding), "创建成功", 201)


@router.get("/current")
async def read_current_wedding(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        wedding = await wedding_service.require_wedding(db, user.id)
    except wedding_service.WeddingNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    payload = wedding_service.wedding_to_public(wedding)
    payload["seating_stats"] = await wedding_service.seating_stats(db, wedding.id)
    return _json_ok(payload, None, 200)


@router.patch("/current")
async def update_current_wedding(
    body: WeddingUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        wedding = await wedding_service.require_wedding(db, user.id)
    except wedding_service.WeddingNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    fields = _patch_fields(body, wedding)
    wedding = await wedding_service.update_wedding(db, wedding, fields)
    return _json_ok(wedding_service.wedding_to_public(wedding), None, 200)
