"""计划书任务：聚合读取、增改删、已超期改写与进度。"""

from __future__ import annotations

from datetime import date

from pycore.core.logger import get_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.db.models import Stage, Task, Wedding
from src.services import wedding_service
from src.utils import current_stage

logger = get_logger()

STATUS_TODO = "未开始"
STATUS_DOING = "进行中"
STATUS_DONE = "已完成"
STATUS_OVERDUE = "已超期"
ALLOWED_STATUSES = {STATUS_TODO, STATUS_DOING, STATUS_DONE, STATUS_OVERDUE}


class TaskNotFoundError(Exception):
    """找不到本账号的任务。"""


class TaskValidationError(Exception):
    """任务参数不符合约定。"""


def task_to_public(task: Task) -> dict:
    return {
        "id": task.id,
        "name": task.name,
        "stage_id": task.stage_id,
        "due_date": task.due_date.isoformat(),
        "status": task.status,
        "due_date_customized": task.due_date_customized,
        "sort_order": task.sort_order,
    }


def stage_to_public(stage: Stage) -> dict:
    return {
        "id": stage.id,
        "name": stage.name,
        "sort_order": stage.sort_order,
    }


async def list_stages(db: AsyncSession, wedding_id: int) -> list[Stage]:
    result = await db.execute(
        select(Stage).where(Stage.wedding_id == wedding_id).order_by(Stage.sort_order.asc())
    )
    return list(result.scalars().all())


async def list_tasks(db: AsyncSession, wedding_id: int) -> list[Task]:
    result = await db.execute(select(Task).where(Task.wedding_id == wedding_id))
    return list(result.scalars().all())


async def get_stage_for_wedding(
    db: AsyncSession, wedding_id: int, stage_id: int
) -> Stage:
    result = await db.execute(
        select(Stage).where(Stage.id == stage_id, Stage.wedding_id == wedding_id)
    )
    stage = result.scalar_one_or_none()
    if stage is None:
        raise TaskValidationError("阶段不存在")
    return stage


async def get_task_for_wedding(
    db: AsyncSession, wedding_id: int, task_id: int
) -> Task:
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.wedding_id == wedding_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise TaskNotFoundError("找不到该任务")
    return task


def apply_overdue(task: Task, today: date) -> bool:
    if task.due_date < today and task.status != STATUS_DONE:
        if task.status != STATUS_OVERDUE:
            task.status = STATUS_OVERDUE
            return True
    return False


async def _tasks_in_stage(db: AsyncSession, stage_id: int) -> list[Task]:
    result = await db.execute(
        select(Task).where(Task.stage_id == stage_id).order_by(Task.sort_order.asc(), Task.id.asc())
    )
    return list(result.scalars().all())


async def reindex_stage_tasks(db: AsyncSession, stage_id: int) -> None:
    tasks = await _tasks_in_stage(db, stage_id)
    for index, task in enumerate(tasks):
        task.sort_order = index
    await db.flush()


def ordered_tasks(stages: list[Stage], tasks: list[Task]) -> list[Task]:
    by_stage: dict[int, list[Task]] = {stage.id: [] for stage in stages}
    for task in tasks:
        by_stage.setdefault(task.stage_id, []).append(task)
    ordered: list[Task] = []
    for stage in stages:
        group = by_stage.get(stage.id, [])
        group.sort(key=lambda item: (item.sort_order, item.id))
        ordered.extend(group)
    return ordered


def progress_counts(tasks: list[Task]) -> dict[str, int]:
    completed = sum(1 for task in tasks if task.status == STATUS_DONE)
    in_progress = sum(1 for task in tasks if task.status == STATUS_DOING)
    return {
        "completed": completed,
        "in_progress": in_progress,
        "total": len(tasks),
    }


async def get_plan(db: AsyncSession, user_id: int) -> dict:
    wedding = await wedding_service.require_wedding(db, user_id)
    today = current_stage.shanghai_today()
    stages = await list_stages(db, wedding.id)
    tasks = await list_tasks(db, wedding.id)
    overdue_count = 0
    for task in tasks:
        if apply_overdue(task, today):
            overdue_count += 1
    if overdue_count:
        await db.flush()
        logger.info(
            "计划书已超期任务已改写",
            wedding_id=wedding.id,
            overdue_count=overdue_count,
        )
    visible = ordered_tasks(stages, tasks)
    stage_tuples = [(stage.id, stage.name, stage.sort_order) for stage in stages]
    current_id = current_stage.current_stage_id(wedding.wedding_date, today, stage_tuples)
    payload = {
        "wedding_date": wedding.wedding_date.isoformat(),
        "countdown_days": current_stage.days_until_wedding(wedding.wedding_date, today),
        "progress": progress_counts(visible),
        "current_stage": current_id,
        "stages": [stage_to_public(stage) for stage in stages],
        "tasks": [task_to_public(task) for task in visible],
    }
    logger.info(
        "计划书聚合已读取",
        wedding_id=wedding.id,
        task_count=len(visible),
        current_stage=current_id,
    )
    return payload


async def create_task(
    db: AsyncSession,
    wedding: Wedding,
    *,
    name: str,
    stage_id: int,
    due_date: date,
) -> Task:
    trimmed = name.strip()
    if not trimmed:
        raise TaskValidationError("请填写任务名称")
    await get_stage_for_wedding(db, wedding.id, stage_id)
    existing = await _tasks_in_stage(db, stage_id)
    for task in existing:
        task.sort_order += 1
    task = Task(
        wedding_id=wedding.id,
        name=trimmed,
        stage_id=stage_id,
        due_date=due_date,
        status=STATUS_TODO,
        due_date_customized=True,
        sort_order=0,
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)
    logger.info("任务已新增", task_id=task.id, stage_id=stage_id, wedding_id=wedding.id)
    return task


async def insert_task_at(
    db: AsyncSession, task: Task, stage_id: int, sort_order: int
) -> None:
    siblings = await _tasks_in_stage(db, stage_id)
    siblings = [item for item in siblings if item.id != task.id]
    index = max(0, min(sort_order, len(siblings)))
    siblings.insert(index, task)
    task.stage_id = stage_id
    for order, item in enumerate(siblings):
        item.sort_order = order
    await db.flush()


async def update_task(db: AsyncSession, task: Task, fields: dict) -> Task:
    old_stage_id = task.stage_id
    moving = "stage_id" in fields or "sort_order" in fields
    if "name" in fields:
        trimmed = str(fields["name"]).strip()
        if not trimmed:
            raise TaskValidationError("请填写任务名称")
        task.name = trimmed
    if "due_date" in fields:
        if fields["due_date"] is None:
            raise TaskValidationError("请填写截止日期")
        task.due_date = fields["due_date"]
        task.due_date_customized = True
    if "status" in fields:
        status = fields["status"]
        if status not in ALLOWED_STATUSES:
            raise TaskValidationError("任务状态不支持")
        task.status = status
    if moving:
        target_stage_id = int(fields.get("stage_id", task.stage_id))
        await get_stage_for_wedding(db, task.wedding_id, target_stage_id)
        if "sort_order" in fields:
            target_index = int(fields["sort_order"])
        elif target_stage_id != old_stage_id:
            target_index = 0
        else:
            target_index = task.sort_order
        await insert_task_at(db, task, target_stage_id, target_index)
        if target_stage_id != old_stage_id:
            await reindex_stage_tasks(db, old_stage_id)
    await db.flush()
    await db.refresh(task)
    logger.info("任务已修改", task_id=task.id)
    return task


async def delete_task(db: AsyncSession, task: Task) -> None:
    stage_id = task.stage_id
    await db.delete(task)
    await db.flush()
    await reindex_stage_tasks(db, stage_id)
    logger.info("任务已删除", task_id=task.id, stage_id=stage_id)
