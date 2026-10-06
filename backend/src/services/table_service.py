"""桌位：新增、改名改容量、主桌标记与删桌回池。"""

from __future__ import annotations

from pycore.core.logger import get_logger
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from src.db.models import Guest, Table, Wedding
from src.services import wedding_service

logger = get_logger()

DEFAULT_TABLE_CAPACITY = 10
DEFAULT_TABLE_NAME_TEMPLATE = "第 {n} 桌"


class TableNotFoundError(Exception):
    """找不到本账号的桌。"""


class TableValidationError(Exception):
    """桌位参数不符合约定。"""


def default_table_name(table_number: int) -> str:
    return DEFAULT_TABLE_NAME_TEMPLATE.format(n=table_number)


async def seated_count(db: AsyncSession, table_id: int) -> int:
    total = await db.scalar(
        select(func.count()).select_from(Guest).where(Guest.table_id == table_id)
    )
    return int(total or 0)


async def table_to_public(db: AsyncSession, table: Table) -> dict:
    return {
        "id": table.id,
        "table_number": table.table_number,
        "name": table.name,
        "capacity": table.capacity,
        "is_head": table.is_head,
        "pos_x": table.pos_x,
        "pos_y": table.pos_y,
        "seated_count": await seated_count(db, table.id),
    }


async def table_public_for_wedding(
    db: AsyncSession, wedding_id: int, table_id: int
) -> dict | None:
    result = await db.execute(
        select(Table).where(Table.id == table_id, Table.wedding_id == wedding_id)
    )
    table = result.scalar_one_or_none()
    if table is None:
        return None
    return await table_to_public(db, table)


def _trim_name(name: object) -> str:
    trimmed = str(name).strip()
    if not trimmed:
        raise TableValidationError("请填写桌名")
    return trimmed


def _validate_capacity(capacity: object) -> int:
    if isinstance(capacity, bool) or not isinstance(capacity, int):
        raise TableValidationError("容量不合法")
    if capacity < 1:
        raise TableValidationError("容量至少为 1")
    return capacity


async def list_tables(db: AsyncSession, wedding_id: int) -> list[Table]:
    result = await db.execute(
        select(Table)
        .where(Table.wedding_id == wedding_id)
        .order_by(Table.is_head.desc(), Table.table_number.asc(), Table.id.asc())
    )
    return list(result.scalars().all())


async def get_table_for_wedding(
    db: AsyncSession, wedding_id: int, table_id: int
) -> Table:
    result = await db.execute(
        select(Table).where(Table.id == table_id, Table.wedding_id == wedding_id)
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise TableNotFoundError("找不到该桌")
    return table


async def next_table_number(db: AsyncSession, wedding_id: int) -> int:
    current = await db.scalar(
        select(func.max(Table.table_number)).where(Table.wedding_id == wedding_id)
    )
    return int(current or 0) + 1


async def clear_other_heads(db: AsyncSession, wedding_id: int, keep_id: int) -> None:
    await db.execute(
        update(Table)
        .where(Table.wedding_id == wedding_id, Table.id != keep_id)
        .values(is_head=False)
    )


async def list_tables_payload(db: AsyncSession, user_id: int) -> list[dict]:
    wedding = await wedding_service.require_wedding(db, user_id)
    tables = await list_tables(db, wedding.id)
    payload = [await table_to_public(db, item) for item in tables]
    logger.info("桌位列表已读取", wedding_id=wedding.id, table_count=len(tables))
    return payload


async def create_table(
    db: AsyncSession,
    wedding: Wedding,
    *,
    name: str | None = None,
    capacity: int | None = None,
    is_head: bool = False,
    pos_x: float = 0,
    pos_y: float = 0,
) -> Table:
    table_number = await next_table_number(db, wedding.id)
    checked_capacity = (
        DEFAULT_TABLE_CAPACITY if capacity is None else _validate_capacity(capacity)
    )
    table_name = default_table_name(table_number) if name is None else _trim_name(name)
    table = Table(
        wedding_id=wedding.id,
        table_number=table_number,
        name=table_name,
        capacity=checked_capacity,
        is_head=bool(is_head),
        pos_x=pos_x,
        pos_y=pos_y,
    )
    db.add(table)
    await db.flush()
    if table.is_head:
        await clear_other_heads(db, wedding.id, table.id)
    await db.refresh(table)
    logger.info(
        "桌位已新增",
        table_id=table.id,
        wedding_id=wedding.id,
        table_number=table.table_number,
        capacity=table.capacity,
    )
    return table


async def update_table(db: AsyncSession, table: Table, fields: dict) -> Table:
    if "name" in fields:
        table.name = _trim_name(fields["name"])
    if "capacity" in fields:
        table.capacity = _validate_capacity(fields["capacity"])
    if "pos_x" in fields:
        table.pos_x = float(fields["pos_x"])
    if "pos_y" in fields:
        table.pos_y = float(fields["pos_y"])
    if "is_head" in fields:
        table.is_head = bool(fields["is_head"])
        if table.is_head:
            await clear_other_heads(db, table.wedding_id, table.id)
    await db.flush()
    await db.refresh(table)
    logger.info("桌位已修改", table_id=table.id, wedding_id=table.wedding_id)
    return table


async def delete_table(db: AsyncSession, table: Table) -> dict:
    wedding_id = table.wedding_id
    table_id = table.id
    await db.execute(
        update(Guest).where(Guest.table_id == table_id).values(table_id=None)
    )
    await db.delete(table)
    await db.flush()
    stats = await wedding_service.seating_stats(db, wedding_id)
    logger.info(
        "桌位已删除，入座宾客已回未排座",
        table_id=table_id,
        wedding_id=wedding_id,
        guest_total=stats["guest_total"],
        unseated_count=stats["unseated_count"],
    )
    return stats
