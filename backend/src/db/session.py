"""数据库会话。从 pycore 模板复制后改为本项目配置与懒加载引擎。"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from pycore.core.logger import get_logger
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from src.config.settings import backend_dir, get_settings

logger = get_logger()

_engine: AsyncEngine | None = None
_session_maker: async_sessionmaker[AsyncSession] | None = None


def resolve_sqlite_path(database_path: str) -> Path:
    path = Path(database_path)
    if not path.is_absolute():
        path = backend_dir() / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path.resolve()


def sqlite_url(database_path: str) -> str:
    absolute = resolve_sqlite_path(database_path)
    return "sqlite+aiosqlite:///" + absolute.as_posix()


def get_engine() -> AsyncEngine:
    global _engine, _session_maker
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            sqlite_url(settings.database_path),
            echo=False,
            future=True,
        )
        _session_maker = async_sessionmaker(
            _engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _engine


def get_session_maker() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _session_maker is not None
    return _session_maker


def reset_engine() -> None:
    global _engine, _session_maker
    _engine = None
    _session_maker = None


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with get_session_maker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    async with get_session_maker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    from src.db.models import Base

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("数据库已初始化")


async def close_db() -> None:
    global _engine, _session_maker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_maker = None
    logger.info("数据库连接已关闭")
