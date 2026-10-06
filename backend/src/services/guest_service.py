"""宾客与分组：名单、粘贴、排座与删除。不提供智能排座。"""

from __future__ import annotations

from typing import Any

from pycore.core.logger import get_logger
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from src.db.models import Guest, GuestGroup, Wedding
from src.services import table_service, wedding_service

logger = get_logger()

DEFAULT_GROUP_NAME = "新郎"
ATTENDANCE_PENDING = "待定"
ATTENDANCE_CONFIRMED = "已确认"
ATTENDANCE_DECLINED = "已婉拒"
ALLOWED_ATTENDANCES = {ATTENDANCE_PENDING, ATTENDANCE_CONFIRMED, ATTENDANCE_DECLINED}


class GuestNotFoundError(Exception):
    """找不到本账号的宾客。"""


class GuestValidationError(Exception):
    """宾客参数不符合约定。"""


class GroupNotFoundError(Exception):
    """找不到本账号的宾客分组。"""


class GroupConflictError(Exception):
    """同一项目内分组名称重复。"""


def coerce_seq(value: object) -> int:
    if value is None or isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value.is_integer():
            return int(value)
        return 0
    text = str(value).strip()
    if not text:
        return 0
    if text.lstrip("-").isdigit():
        return int(text)
    return 0


def guest_to_public(guest: Guest) -> dict:
    return {
        "id": guest.id,
        "name": guest.name,
        "group_id": guest.group_id,
        "attendance": guest.attendance,
        "seq": guest.seq,
        "note": guest.note or "",
        "table_id": guest.table_id,
    }


def group_to_public(group: GuestGroup) -> dict:
    return {
        "id": group.id,
        "name": group.name,
        "is_preset": group.is_preset,
    }


def _trim_name(name: object, empty_message: str) -> str:
    trimmed = str(name).strip()
    if not trimmed:
        raise GuestValidationError(empty_message)
    return trimmed


def _normalize_note(note: object | None) -> str | None:
    if note is None:
        return None
    trimmed = str(note).strip()
    return trimmed or None


def _validate_attendance(attendance: object) -> str:
    if attendance not in ALLOWED_ATTENDANCES:
        raise GuestValidationError("出席状态不支持")
    return str(attendance)


async def list_groups(db: AsyncSession, wedding_id: int) -> list[GuestGroup]:
    result = await db.execute(
        select(GuestGroup)
        .where(GuestGroup.wedding_id == wedding_id)
        .order_by(GuestGroup.id.asc())
    )
    return list(result.scalars().all())


async def get_group_for_wedding(
    db: AsyncSession, wedding_id: int, group_id: int
) -> GuestGroup:
    result = await db.execute(
        select(GuestGroup).where(
            GuestGroup.id == group_id,
            GuestGroup.wedding_id == wedding_id,
        )
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise GroupNotFoundError("找不到该分组")
    return group


async def get_group_by_name(
    db: AsyncSession, wedding_id: int, name: str
) -> GuestGroup | None:
    result = await db.execute(
        select(GuestGroup).where(
            GuestGroup.wedding_id == wedding_id,
            GuestGroup.name == name,
        )
    )
    return result.scalar_one_or_none()


async def resolve_group(
    db: AsyncSession, wedding_id: int, group_id: int | None
) -> GuestGroup:
    if group_id is None:
        group = await get_group_by_name(db, wedding_id, DEFAULT_GROUP_NAME)
        if group is None:
            raise GroupNotFoundError("找不到该分组")
        return group
    return await get_group_for_wedding(db, wedding_id, group_id)


async def list_guests(db: AsyncSession, wedding_id: int) -> list[Guest]:
    result = await db.execute(
        select(Guest)
        .where(Guest.wedding_id == wedding_id)
        .order_by(Guest.seq.asc(), Guest.id.asc())
    )
    return list(result.scalars().all())


async def get_guest_for_wedding(
    db: AsyncSession, wedding_id: int, guest_id: int
) -> Guest:
    result = await db.execute(
        select(Guest).where(Guest.id == guest_id, Guest.wedding_id == wedding_id)
    )
    guest = result.scalar_one_or_none()
    if guest is None:
        raise GuestNotFoundError("找不到该宾客")
    return guest


def parse_paste_lines(text: str, groups: list[GuestGroup]) -> list[tuple[str, GuestGroup]]:
    stripped = str(text).strip()
    if not stripped:
        raise GuestValidationError("请粘贴宾客名单")
    by_name = {group.name: group for group in groups}
    default = by_name.get(DEFAULT_GROUP_NAME)
    if default is None:
        raise GroupNotFoundError("找不到该分组")
    known_names = sorted(by_name, key=len, reverse=True)
    parsed: list[tuple[str, GuestGroup]] = []
    for raw in str(text).splitlines():
        line = raw.strip()
        if not line:
            continue
        name = line
        group = default
        for group_name in known_names:
            if not line.endswith(group_name):
                continue
            rest = line[: -len(group_name)]
            if rest and rest[-1].isspace():
                trimmed_name = rest.strip()
                if trimmed_name:
                    name = trimmed_name
                    group = by_name[group_name]
                    break
        parsed.append((name, group))
    if not parsed:
        raise GuestValidationError("请粘贴宾客名单")
    return parsed


async def list_groups_payload(db: AsyncSession, user_id: int) -> list[dict]:
    wedding = await wedding_service.require_wedding(db, user_id)
    groups = await list_groups(db, wedding.id)
    logger.info("宾客分组已读取", wedding_id=wedding.id, group_count=len(groups))
    return [group_to_public(item) for item in groups]


async def create_group(db: AsyncSession, wedding: Wedding, name: str) -> GuestGroup:
    trimmed = _trim_name(name, "请填写分组名称")
    existing = await get_group_by_name(db, wedding.id, trimmed)
    if existing is not None:
        raise GroupConflictError("该分组名称已存在")
    group = GuestGroup(wedding_id=wedding.id, name=trimmed, is_preset=False)
    db.add(group)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise GroupConflictError("该分组名称已存在") from exc
    await db.refresh(group)
    logger.info("宾客分组已新增", group_id=group.id, wedding_id=wedding.id)
    return group


async def list_guests_payload(db: AsyncSession, user_id: int) -> dict:
    wedding = await wedding_service.require_wedding(db, user_id)
    guests = await list_guests(db, wedding.id)
    stats = await wedding_service.seating_stats(db, wedding.id)
    logger.info(
        "宾客名单已读取",
        wedding_id=wedding.id,
        guest_total=stats["guest_total"],
        seated_count=stats["seated_count"],
    )
    return {
        "seating_stats": stats,
        "guests": [guest_to_public(item) for item in guests],
    }


async def create_guest(
    db: AsyncSession,
    wedding: Wedding,
    *,
    name: str,
    group_id: int | None = None,
    attendance: str | None = None,
    seq: object = None,
    note: str | None = None,
) -> Guest:
    trimmed = _trim_name(name, "请填写姓名")
    group = await resolve_group(db, wedding.id, group_id)
    checked_attendance = (
        ATTENDANCE_PENDING if attendance is None else _validate_attendance(attendance)
    )
    guest = Guest(
        wedding_id=wedding.id,
        name=trimmed,
        group_id=group.id,
        attendance=checked_attendance,
        seq=coerce_seq(seq),
        note=_normalize_note(note),
        table_id=None,
    )
    db.add(guest)
    await db.flush()
    await db.refresh(guest)
    logger.info("宾客已新增", guest_id=guest.id, wedding_id=wedding.id, seq=guest.seq)
    return guest


async def paste_guests(db: AsyncSession, wedding: Wedding, text: str) -> list[Guest]:
    groups = await list_groups(db, wedding.id)
    parsed = parse_paste_lines(text, groups)
    created: list[Guest] = []
    for name, group in parsed:
        guest = Guest(
            wedding_id=wedding.id,
            name=name,
            group_id=group.id,
            attendance=ATTENDANCE_PENDING,
            seq=0,
            note=None,
            table_id=None,
        )
        db.add(guest)
        created.append(guest)
    await db.flush()
    for guest in created:
        await db.refresh(guest)
    logger.info("宾客已批量粘贴", wedding_id=wedding.id, created_count=len(created))
    return created


async def _assign_table(
    db: AsyncSession, wedding_id: int, guest: Guest, table_id: int | None
) -> Any:
    previous_id = guest.table_id
    if table_id is None:
        guest.table_id = None
        await db.flush()
        if previous_id is None:
            return None
        return await table_service.table_public_for_wedding(db, wedding_id, previous_id)
    table = await table_service.get_table_for_wedding(db, wedding_id, table_id)
    guest.table_id = table.id
    await db.flush()
    return await table_service.table_to_public(db, table)


async def update_guest(db: AsyncSession, guest: Guest, fields: dict) -> tuple[Guest, Any]:
    table_payload = None
    if "name" in fields:
        guest.name = _trim_name(fields["name"], "请填写姓名")
    if "group_id" in fields:
        group = await resolve_group(db, guest.wedding_id, fields["group_id"])
        guest.group_id = group.id
    if "attendance" in fields:
        guest.attendance = _validate_attendance(fields["attendance"])
    if "seq" in fields:
        guest.seq = coerce_seq(fields["seq"])
    if "table_id" in fields:
        table_payload = await _assign_table(
            db, guest.wedding_id, guest, fields["table_id"]
        )
    await db.flush()
    await db.refresh(guest)
    logger.info("宾客已修改", guest_id=guest.id, wedding_id=guest.wedding_id)
    return guest, table_payload


async def delete_guest(db: AsyncSession, guest: Guest) -> dict:
    wedding_id = guest.wedding_id
    guest_id = guest.id
    await db.delete(guest)
    await db.flush()
    stats = await wedding_service.seating_stats(db, wedding_id)
    logger.info("宾客已删除", guest_id=guest_id, wedding_id=wedding_id)
    return stats
