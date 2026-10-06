"""计划书阶段：增删改与排序。删除阶段时级联删除其下任务。"""

from __future__ import annotations

from pycore.core.logger import get_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.db.models import Stage, Task, Wedding

logger = get_logger()

DEFAULT_NEW_STAGE_NAME = "新阶段"


class StageNotFoundError(Exception):
    """找不到本账号的阶段。"""


class StageValidationError(Exception):
    """阶段参数不符合约定。"""


async def list_stages(db: AsyncSession, wedding_id: int) -> list[Stage]:
    result = await db.execute(
        select(Stage).where(Stage.wedding_id == wedding_id).order_by(Stage.sort_order.asc())
    )
    return list(result.scalars().all())


async def get_stage_for_wedding(
    db: AsyncSession, wedding_id: int, stage_id: int
) -> Stage:
    result = await db.execute(
        select(Stage).where(Stage.id == stage_id, Stage.wedding_id == wedding_id)
    )
    stage = result.scalar_one_or_none()
    if stage is None:
        raise StageNotFoundError("找不到该阶段")
    return stage


async def reindex_stages(db: AsyncSession, wedding_id: int) -> None:
    stages = await list_stages(db, wedding_id)
    for index, stage in enumerate(stages):
        stage.sort_order = index
    await db.flush()


async def create_stage(db: AsyncSession, wedding: Wedding, name: str | None) -> Stage:
    trimmed = DEFAULT_NEW_STAGE_NAME if name is None else name.strip()
    if not trimmed:
        raise StageValidationError("阶段名称不能为空")
    stages = await list_stages(db, wedding.id)
    stage = Stage(
        wedding_id=wedding.id,
        name=trimmed,
        sort_order=len(stages),
    )
    db.add(stage)
    await db.flush()
    await db.refresh(stage)
    logger.info("阶段已新增", stage_id=stage.id, wedding_id=wedding.id, sort_order=stage.sort_order)
    return stage


async def move_stage(db: AsyncSession, stage: Stage, sort_order: int) -> None:
    stages = await list_stages(db, stage.wedding_id)
    stages = [item for item in stages if item.id != stage.id]
    index = max(0, min(sort_order, len(stages)))
    stages.insert(index, stage)
    for order, item in enumerate(stages):
        item.sort_order = order
    await db.flush()


async def update_stage(db: AsyncSession, stage: Stage, fields: dict) -> Stage:
    if "name" in fields:
        trimmed = str(fields["name"]).strip()
        if not trimmed:
            raise StageValidationError("阶段名称不能为空")
        stage.name = trimmed
    if "sort_order" in fields:
        if fields["sort_order"] is None:
            raise StageValidationError("排序不能为空")
        await move_stage(db, stage, int(fields["sort_order"]))
    await db.flush()
    await db.refresh(stage)
    logger.info("阶段已修改", stage_id=stage.id)
    return stage


async def delete_stage(db: AsyncSession, stage: Stage) -> None:
    wedding_id = stage.wedding_id
    tasks = (
        await db.execute(select(Task).where(Task.stage_id == stage.id))
    ).scalars().all()
    task_count = len(list(tasks))
    for task in tasks:
        await db.delete(task)
    await db.delete(stage)
    await db.flush()
    await reindex_stages(db, wedding_id)
    logger.info(
        "阶段已删除并级联删除任务",
        stage_id=stage.id,
        wedding_id=wedding_id,
        deleted_tasks=task_count,
    )


def public_stage(stage: Stage) -> dict:
    return {
        "id": stage.id,
        "name": stage.name,
        "sort_order": stage.sort_order,
    }
