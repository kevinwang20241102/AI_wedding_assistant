"""对话图片接口：API-033、API-034。"""

from __future__ import annotations

from fastapi import Depends, File, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response
from pycore.api import APIRouter, success_response
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import ApiError, get_current_user
from src.db.models import User
from src.db.session import get_db
from src.services import xiaobei_generator

router = APIRouter(prefix="/api/conversation_images", tags=["conversation_images"])


def _json_ok(data: object, message: str | None, status_code: int) -> JSONResponse:
    payload = success_response(data=data, message=message)
    return JSONResponse(status_code=status_code, content=jsonable_encoder(payload))


async def _require_wedding(db: AsyncSession, user_id: int) -> None:
    try:
        await xiaobei_generator.require_wedding_profile(db, user_id)
    except xiaobei_generator.XiaobeiConflictError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc


@router.post("", status_code=201)
async def upload_conversation_image(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    await _require_wedding(db, user.id)
    data = await file.read()
    try:
        image = await xiaobei_generator.create_image(db, user.id, data)
    except xiaobei_generator.XiaobeiValidationError as exc:
        raise ApiError(exc.error, "VALIDATION_ERROR", 400) from exc
    return _json_ok(xiaobei_generator.image_to_public(image), None, 201)


@router.get("/{image_id}")
async def read_conversation_image(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    await _require_wedding(db, user.id)
    try:
        image = await xiaobei_generator.get_owned_image(db, user.id, image_id)
    except xiaobei_generator.XiaobeiNotFoundError as exc:
        raise ApiError(exc.error, "NOT_FOUND", 404) from exc
    path = xiaobei_generator.image_file_path(image)
    if not path.exists():
        raise ApiError("找不到这张图片", "NOT_FOUND", 404)
    return Response(content=path.read_bytes(), media_type=image.content_type)
