"""账号表数据访问。"""

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from src.db.models import PasswordResetCode, User


class AccountConflictError(ValueError):
    def __init__(self, message: str, field: str) -> None:
        super().__init__(message)
        self.field = field


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, user_id: int) -> User | None:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_username(self, username: str) -> User | None:
        result = await self.db.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()

    async def get_by_phone(self, phone: str) -> User | None:
        result = await self.db.execute(select(User).where(User.phone == phone))
        return result.scalar_one_or_none()

    async def create(self, username: str, phone: str, hashed_password: str) -> User:
        user = User(
            username=username,
            phone=phone,
            hashed_password=hashed_password,
            credential_version=0,
        )
        self.db.add(user)
        try:
            await self.db.flush()
        except IntegrityError as exc:
            detail = str(getattr(exc, "orig", exc)).lower()
            if "phone" in detail:
                raise AccountConflictError("该手机号已被注册", "phone") from exc
            raise AccountConflictError("该用户名已被占用", "username") from exc
        await self.db.refresh(user)
        return user

    async def update_password(
        self, user: User, hashed_password: str, credential_version: int
    ) -> User:
        user.hashed_password = hashed_password
        user.credential_version = credential_version
        await self.db.flush()
        await self.db.refresh(user)
        return user


class PasswordResetCodeRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def latest_for_phone(self, phone: str) -> PasswordResetCode | None:
        result = await self.db.execute(
            select(PasswordResetCode)
            .where(PasswordResetCode.phone == phone)
            .order_by(PasswordResetCode.sent_at.desc())
        )
        return result.scalars().first()

    async def list_for_phone(self, phone: str) -> Sequence[PasswordResetCode]:
        result = await self.db.execute(
            select(PasswordResetCode).where(PasswordResetCode.phone == phone)
        )
        return result.scalars().all()

    async def replace_code(
        self,
        phone: str,
        code_hash: str,
        expires_at: datetime,
        sent_at: datetime,
    ) -> PasswordResetCode:
        await self.db.execute(
            delete(PasswordResetCode).where(PasswordResetCode.phone == phone)
        )
        row = PasswordResetCode(
            phone=phone,
            code_hash=code_hash,
            expires_at=expires_at,
            sent_at=sent_at,
        )
        self.db.add(row)
        await self.db.flush()
        await self.db.refresh(row)
        return row

    async def delete_for_phone(self, phone: str) -> None:
        await self.db.execute(
            delete(PasswordResetCode).where(PasswordResetCode.phone == phone)
        )
        await self.db.flush()
