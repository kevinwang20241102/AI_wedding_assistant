"""账号资源接口：API-001～API-006。"""

from __future__ import annotations

import math
import re
from datetime import UTC, datetime, timedelta

from fastapi import Depends, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pycore.api import APIRouter, error_response, success_response
from pycore.core.logger import get_logger
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import (
    ACCESS_TOKEN_COOKIE,
    ApiError,
    create_access_token,
    get_current_user,
    hash_password,
    user_has_wedding,
    verify_password,
)
from src.config.settings import get_settings
from src.db.models import User
from src.db.session import get_db
from src.db.users import AccountConflictError, PasswordResetCodeRepository, UserRepository
from src.services import sms_sender

logger = get_logger()

router = APIRouter(prefix="/api/users", tags=["users"])

PHONE_PATTERN = re.compile(r"^1[3-9]\d{9}$")
USERNAME_MIN_LEN = 2
USERNAME_MAX_LEN = 32
PASSWORD_MIN_LEN = 8


class UserCreate(BaseModel):
    username: str
    password: str
    phone: str


class UserLogin(BaseModel):
    username: str
    password: str
    remember: bool


class PasswordResetSendCode(BaseModel):
    phone: str


class PasswordResetConfirm(BaseModel):
    phone: str
    code: str
    new_password: str


class UserSession(BaseModel):
    id: int
    username: str
    phone: str
    has_wedding: bool


def _json_ok(data: object, message: str | None, status_code: int) -> JSONResponse:
    payload = success_response(data=data, message=message)
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder(payload),
    )


def _json_err(error: str, error_code: str, status_code: int) -> JSONResponse:
    payload, status = error_response(
        error=error, error_code=error_code, status_code=status_code
    )
    return JSONResponse(status_code=status, content=jsonable_encoder(payload))


def _set_access_cookie(response: Response, token: str, max_age: int | None) -> None:
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=max_age,
        secure=False,
    )


def _clear_access_cookie(response: Response) -> None:
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value="",
        httponly=True,
        samesite="lax",
        path="/",
        max_age=0,
        expires=0,
        secure=False,
    )


def normalize_username(raw: str) -> str:
    trimmed = raw.strip()
    if any(ord(ch) < 32 for ch in trimmed):
        raise ApiError("用户名不能包含换行或控制字符", "VALIDATION_ERROR", 400)
    if len(trimmed) < USERNAME_MIN_LEN or len(trimmed) > USERNAME_MAX_LEN:
        raise ApiError("用户名去掉首尾空白后须为 2 至 32 个字符", "VALIDATION_ERROR", 400)
    for ch in trimmed:
        if ch == " ":
            continue
        if ch.isalpha() or ch.isdigit():
            continue
        raise ApiError("用户名只允许汉字、字母、数字和中间空格", "VALIDATION_ERROR", 400)
    return trimmed


def validate_password(password: str) -> None:
    reasons: list[str] = []
    if len(password) < PASSWORD_MIN_LEN:
        reasons.append("密码至少 8 位")
    if not any(ch.isupper() for ch in password):
        reasons.append("密码缺少大写字母")
    if not any(ch.islower() for ch in password):
        reasons.append("密码缺少小写字母")
    if not any(ch.isdigit() for ch in password):
        reasons.append("密码缺少数字")
    if reasons:
        raise ApiError("，".join(reasons), "VALIDATION_ERROR", 400)


def normalize_phone(phone: str | None) -> str:
    if phone is None or not str(phone).strip():
        raise ApiError("未填手机号", "VALIDATION_ERROR", 400)
    value = str(phone).strip()
    if not PHONE_PATTERN.fullmatch(value):
        raise ApiError("手机号格式不正确", "VALIDATION_ERROR", 400)
    return value


async def _session_payload(db: AsyncSession, user: User) -> dict:
    session = UserSession(
        id=user.id,
        username=user.username,
        phone=user.phone,
        has_wedding=await user_has_wedding(db, user.id),
    )
    return session.model_dump()


@router.post("", status_code=201)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    username = normalize_username(body.username)
    phone = normalize_phone(body.phone)
    validate_password(body.password)
    repo = UserRepository(db)
    if await repo.get_by_phone(phone):
        raise ApiError("该手机号已被注册", "CONFLICT", 409)
    if await repo.get_by_username(username):
        raise ApiError("该用户名已被占用", "CONFLICT", 409)
    try:
        user = await repo.create(username, phone, hash_password(body.password))
    except AccountConflictError as exc:
        raise ApiError(str(exc), "CONFLICT", 409) from exc
    token, max_age = create_access_token(user, remember=False)
    logger.info("用户注册成功", user_id=user.id)
    response = _json_ok(await _session_payload(db, user), "注册成功", 201)
    _set_access_cookie(response, token, max_age)
    return response


@router.post("/login")
async def login(body: UserLogin, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    username = body.username.strip()
    repo = UserRepository(db)
    user = await repo.get_by_username(username)
    if user is None or not verify_password(body.password, user.hashed_password):
        raise ApiError("用户名或密码错误", "UNAUTHORIZED", 401)
    token, max_age = create_access_token(user, remember=body.remember)
    logger.info("用户登录成功", user_id=user.id, remember=body.remember)
    response = _json_ok(await _session_payload(db, user), "登录成功", 200)
    _set_access_cookie(response, token, max_age)
    return response


@router.post("/password-reset/send-code")
async def send_password_reset_code(
    body: PasswordResetSendCode,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    settings = get_settings()
    phone = normalize_phone(body.phone)
    users = UserRepository(db)
    if await users.get_by_phone(phone) is None:
        raise ApiError("该手机号未注册", "NOT_FOUND", 404)
    codes = PasswordResetCodeRepository(db)
    latest = await codes.latest_for_phone(phone)
    now = datetime.now(UTC)
    if latest is not None:
        elapsed = (now - _as_utc(latest.sent_at)).total_seconds()
        wait = settings.password_reset_resend_seconds
        if elapsed < wait:
            remaining = max(1, math.ceil(wait - elapsed))
            raise ApiError(
                f"发送过于频繁，请 {remaining} 秒后再试",
                "VALIDATION_ERROR",
                400,
            )
    code = sms_sender.generate_numeric_code()
    try:
        await sms_sender.send_reset_code(phone, code)
    except sms_sender.SmsChannelError as exc:
        raise ApiError(str(exc), "INTERNAL_ERROR", 500) from exc
    expires_at = now + timedelta(seconds=settings.password_reset_ttl_seconds)
    await codes.replace_code(
        phone=phone,
        code_hash=hash_password(code),
        expires_at=expires_at,
        sent_at=now,
    )
    logger.info("找回密码验证码已保存", phone_suffix=phone[-4:])
    return _json_ok(
        {
            "expires_in_seconds": settings.password_reset_ttl_seconds,
            "resend_after_seconds": settings.password_reset_resend_seconds,
        },
        None,
        200,
    )


@router.post("/password-reset/confirm")
async def confirm_password_reset(
    body: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    phone = normalize_phone(body.phone)
    validate_password(body.new_password)
    users = UserRepository(db)
    user = await users.get_by_phone(phone)
    if user is None:
        raise ApiError("验证码错误或已过期", "VALIDATION_ERROR", 400)
    codes = PasswordResetCodeRepository(db)
    latest = await codes.latest_for_phone(phone)
    now = datetime.now(UTC)
    if (
        latest is None
        or _as_utc(latest.expires_at) < now
        or not verify_password(body.code, latest.code_hash)
    ):
        raise ApiError("验证码错误或已过期", "VALIDATION_ERROR", 400)
    await users.update_password(
        user,
        hashed_password=hash_password(body.new_password),
        credential_version=user.credential_version + 1,
    )
    await codes.delete_for_phone(phone)
    logger.info("用户已重置密码", user_id=user.id)
    return _json_ok({"ok": True}, None, 200)


@router.get("/me")
async def read_me(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JSONResponse:
    return _json_ok(await _session_payload(db, user), None, 200)


@router.post("/logout")
async def logout() -> JSONResponse:
    response = _json_ok({"ok": True}, None, 200)
    _clear_access_cookie(response)
    logger.info("用户已退出登录")
    return response


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
