"""预算分类：列表、增改删与合计。不记录实际支出。"""

from __future__ import annotations

from pycore.core.logger import get_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.db.models import BudgetCategory, Wedding
from src.services import wedding_service

logger = get_logger()

STATUS_UNSET = "未确定"
STATUS_CONFIRMED = "已确定"
STATUS_PAID = "已支付"
ALLOWED_STATUSES = {STATUS_UNSET, STATUS_CONFIRMED, STATUS_PAID}


class BudgetNotFoundError(Exception):
    """找不到本账号的预算分类。"""


class BudgetValidationError(Exception):
    """预算分类参数不符合约定。"""


def category_to_public(category: BudgetCategory) -> dict:
    return {
        "id": category.id,
        "name": category.name,
        "amount_fen": category.amount_fen,
        "status": category.status,
        "note": category.note or "",
        "sort_order": category.sort_order,
    }


def compute_totals(total_budget_fen: int, categories: list[BudgetCategory]) -> dict:
    allocated_fen = sum(item.amount_fen for item in categories)
    unallocated_fen = total_budget_fen - allocated_fen
    return {
        "total_budget_fen": total_budget_fen,
        "allocated_fen": allocated_fen,
        "unallocated_fen": unallocated_fen,
        "is_over_allocated": allocated_fen > total_budget_fen,
    }


def _trim_name(name: object) -> str:
    trimmed = str(name).strip()
    if not trimmed:
        raise BudgetValidationError("请填写预算名称")
    return trimmed


def _normalize_note(note: object | None) -> str | None:
    if note is None:
        return None
    trimmed = str(note).strip()
    return trimmed or None


def _validate_amount(amount_fen: object) -> int:
    if isinstance(amount_fen, bool) or not isinstance(amount_fen, int):
        raise BudgetValidationError("金额不合法")
    if amount_fen < 0:
        raise BudgetValidationError("金额不合法")
    return amount_fen


def _validate_status(status: object) -> str:
    if status not in ALLOWED_STATUSES:
        raise BudgetValidationError("预算状态不支持")
    return str(status)


async def list_categories(db: AsyncSession, wedding_id: int) -> list[BudgetCategory]:
    result = await db.execute(
        select(BudgetCategory)
        .where(BudgetCategory.wedding_id == wedding_id)
        .order_by(BudgetCategory.sort_order.asc(), BudgetCategory.id.asc())
    )
    return list(result.scalars().all())


async def get_category_for_wedding(
    db: AsyncSession, wedding_id: int, category_id: int
) -> BudgetCategory:
    result = await db.execute(
        select(BudgetCategory).where(
            BudgetCategory.id == category_id,
            BudgetCategory.wedding_id == wedding_id,
        )
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise BudgetNotFoundError("找不到该预算分类")
    return category


async def reindex_categories(db: AsyncSession, wedding_id: int) -> None:
    categories = await list_categories(db, wedding_id)
    for index, category in enumerate(categories):
        category.sort_order = index
    await db.flush()


async def move_category(db: AsyncSession, category: BudgetCategory, sort_order: int) -> None:
    categories = await list_categories(db, category.wedding_id)
    categories = [item for item in categories if item.id != category.id]
    index = max(0, min(sort_order, len(categories)))
    categories.insert(index, category)
    for order, item in enumerate(categories):
        item.sort_order = order
    await db.flush()


async def get_budget(db: AsyncSession, user_id: int) -> dict:
    wedding = await wedding_service.require_wedding(db, user_id)
    categories = await list_categories(db, wedding.id)
    payload = compute_totals(wedding.total_budget_fen, categories)
    payload["categories"] = [category_to_public(item) for item in categories]
    logger.info(
        "预算分类列表已读取",
        wedding_id=wedding.id,
        category_count=len(categories),
        allocated_fen=payload["allocated_fen"],
        is_over_allocated=payload["is_over_allocated"],
    )
    return payload


async def create_category(
    db: AsyncSession,
    wedding: Wedding,
    *,
    name: str,
    amount_fen: int = 0,
    status: str = STATUS_UNSET,
    note: str | None = None,
) -> BudgetCategory:
    trimmed = _trim_name(name)
    amount = _validate_amount(amount_fen)
    checked_status = _validate_status(status)
    existing = await list_categories(db, wedding.id)
    category = BudgetCategory(
        wedding_id=wedding.id,
        name=trimmed,
        amount_fen=amount,
        status=checked_status,
        note=_normalize_note(note),
        sort_order=len(existing),
    )
    db.add(category)
    await db.flush()
    await db.refresh(category)
    logger.info(
        "预算分类已新增",
        category_id=category.id,
        wedding_id=wedding.id,
        amount_fen=amount,
    )
    return category


async def update_category(
    db: AsyncSession, category: BudgetCategory, fields: dict
) -> BudgetCategory:
    if "name" in fields:
        category.name = _trim_name(fields["name"])
    if "amount_fen" in fields:
        category.amount_fen = _validate_amount(fields["amount_fen"])
    if "status" in fields:
        category.status = _validate_status(fields["status"])
    if "note" in fields:
        category.note = _normalize_note(fields["note"])
    if "sort_order" in fields:
        if fields["sort_order"] is None:
            raise BudgetValidationError("排序不能为空")
        await move_category(db, category, int(fields["sort_order"]))
    await db.flush()
    await db.refresh(category)
    logger.info("预算分类已修改", category_id=category.id, wedding_id=category.wedding_id)
    return category


async def delete_category(db: AsyncSession, category: BudgetCategory) -> None:
    wedding_id = category.wedding_id
    category_id = category.id
    await db.delete(category)
    await db.flush()
    await reindex_categories(db, wedding_id)
    logger.info("预算分类已删除", category_id=category_id, wedding_id=wedding_id)
