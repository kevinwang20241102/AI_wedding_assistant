"""认证与数据库依赖。从 pycore 模板复制后改为 Cookie JWT。"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import bcrypt
import jwt
from fastapi import Cookie, Depends
from pycore.core.logger import get_logger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from src.config.settings import get_settings
from src.db.models import User
from src.db.session import get_db
from src.db.users import UserRepository

logger = get_logger()

ACCESS_TOKEN_COOKIE = "access_token"


class ApiError(Exception):
    def __init__(self, error: str, error_code: str, status_code: int) -> None:
        super().__init__(error)
        self.error = error
        self.error_code = error_code
        self.status_code = status_code


def hash_password(plain: str) -> str:
    settings = get_settings()
    hashed = bcrypt.hashpw(
        plain.encode("utf-8"),
        bcrypt.gensalt(rounds=settings.bcrypt_rounds),
    )
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user: User, remember: bool) -> tuple[str, int | None]:
    settings = get_settings()
    now = datetime.now(UTC)
    if remember:
        expire_delta = timedelta(days=settings.jwt_expire_days_remember)
        max_age = int(expire_delta.total_seconds())
    else:
        expire_delta = timedelta(minutes=settings.jwt_expire_minutes_session)
        max_age = None
    payload = {
        "sub": str(user.id),
        "credential_version": user.credential_version,
        "jti": str(uuid4()),
        "iat": int(now.timestamp()),
        "exp": int((now + expire_delta).timestamp()),
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)
    return token, max_age


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.PyJWTError as exc:
        raise ApiError("登录态无效或已过期", "UNAUTHORIZED", 401) from exc
    return payload


async def user_has_wedding(db: AsyncSession, user_id: int) -> bool:
    table_result = await db.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='weddings'")
    )
    if table_result.scalar() is None:
        return False
    row = await db.execute(
        text("SELECT 1 FROM weddings WHERE user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    return row.scalar() is not None


async def get_current_user(
    access_token: str | None = Cookie(default=None, alias=ACCESS_TOKEN_COOKIE),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not access_token:
        raise ApiError("请先登录", "UNAUTHORIZED", 401)
    payload = decode_access_token(access_token)
    try:
        user_id = int(payload.get("sub", ""))
    except (TypeError, ValueError) as exc:
        raise ApiError("登录态无效或已过期", "UNAUTHORIZED", 401) from exc
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if user is None:
        raise ApiError("登录态无效或已过期", "UNAUTHORIZED", 401)
    token_version = payload.get("credential_version")
    if token_version != user.credential_version:
        raise ApiError("登录态无效或已过期", "UNAUTHORIZED", 401)
    return user
