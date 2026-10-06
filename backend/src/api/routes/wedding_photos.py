"""婚礼档案照片接口：API-043～API-047。"""

from __future__ import annotations

from fastapi import Depends, File, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response
from pycore.api import APIRouter, success_response
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import ApiError, get_current_user
from src.db.models import User
from src.db.session import get_db
from src.services import wedding_service

router = APIRouter(prefix="/api/wedding_photos", tags=["wedding_photos"])


def _json_ok(data: object, message: str | None, status_code: int) -> JSONResponse:
    payload = success_response(data=data, message=message)
    return JSONResponse(status_code=status_code, content=jsonable_encoder(payload))


async def _require_wedding_or_conflict(db: AsyncSession, user_id: int):
    try:
        return await wedding_service.require_wedding(db, user_id)
    except wedding_service.WeddingNotFoundError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc


async def _read_upload(file: UploadFile) -> bytes:
    return await file.read()


@router.get("")
async def list_wedding_photos(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding_or_conflict(db, user.id)
    photos = await wedding_service.list_photos(db, wedding.id)
    return _json_ok([wedding_service.photo_to_public(item) for item in photos], None, 200)


@router.post("", status_code=201)
async def upload_wedding_photo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding_or_conflict(db, user.id)
    data = await _read_upload(file)
    try:
        photo = await wedding_service.create_photo(db, wedding, data)
    except wedding_service.PhotoValidationError as exc:
        raise ApiError(str(exc), "VALIDATION_ERROR", 400) from exc
    except wedding_service.PhotoConflictError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc
    return _json_ok(wedding_service.photo_to_public(photo), None, 201)


@router.get("/{photo_id}")
async def read_wedding_photo(
    photo_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    wedding = await _require_wedding_or_conflict(db, user.id)
    try:
        photo = await wedding_service.get_project_photo(db, wedding.id, photo_id)
    except wedding_service.PhotoNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    path = wedding_service.photo_file_path(photo)
    if not path.exists():
        raise ApiError("找不到这张照片", "NOT_FOUND", 404)
    return Response(content=path.read_bytes(), media_type=photo.content_type)


@router.delete("/{photo_id}")
async def delete_wedding_photo(
    photo_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding_or_conflict(db, user.id)
    try:
        photo = await wedding_service.get_project_photo(db, wedding.id, photo_id)
    except wedding_service.PhotoNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    await wedding_service.delete_photo(db, photo)
    return _json_ok({"ok": True}, None, 200)


@router.put("/{photo_id}")
async def replace_wedding_photo(
    photo_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    wedding = await _require_wedding_or_conflict(db, user.id)
    try:
        photo = await wedding_service.get_project_photo(db, wedding.id, photo_id)
    except wedding_service.PhotoNotFoundError as exc:
        raise ApiError(str(exc), "NOT_FOUND", 404) from exc
    data = await _read_upload(file)
    try:
        photo = await wedding_service.replace_photo(db, photo, data)
    except wedding_service.PhotoValidationError as exc:
        raise ApiError(str(exc), "VALIDATION_ERROR", 400) from exc
    return _json_ok(wedding_service.photo_to_public(photo), None, 200)
