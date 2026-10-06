"""宾客分组接口：API-018、API-019。"""

from __future__ import annotations

from fastapi import Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pycore.api import APIRouter, success_response
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import ApiError, get_current_user
from src.db.models import User
from src.db.session import get_db
from src.services import guest_service, wedding_service

router = APIRouter(prefix="/api/guest_groups", tags=["guest_groups"])


class GuestGroupCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str


class GuestGroupPublic(BaseModel):
    id: int
    name: str
    is_preset: bool


def _json_ok(data: object, message: str | None, status_code: int) -> JSONResponse:
    payload = success_response(data=data, message=message)
    return JSONResponse(status_code=status_code, content=jsonable_encoder(payload))


async def _require_wedding(db: AsyncSession, user_id: int):
    try:
        return await wedding_service.require_wedding(db, user_id)
    except wedding_service.WeddingNotFoundError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc


@router.get("")
async def list_guest_groups(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    try:
        payload = await guest_service.list_groups_payload(db, user.id)
    except wedding_service.WeddingNotFoundError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc
    for item in payload:
        GuestGroupPublic.model_validate(item)
    return _json_ok(payload, None, 200)


@router.post("", status_code=201)
async def create_guest_group(
    body: GuestGroupCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding(db, user.id)
    try:
        group = await guest_service.create_group(db, wedding, body.name)
    except guest_service.GuestValidationError as exc:
        raise ApiError(str(exc), "VALIDATION_ERROR", 400) from exc
    except guest_service.GroupConflictError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc
    public = guest_service.group_to_public(group)
    GuestGroupPublic.model_validate(public)
    return _json_ok(public, None, 201)
