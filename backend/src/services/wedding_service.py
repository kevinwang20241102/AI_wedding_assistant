"""婚礼项目、档案与合影：建项种子、档案读写、改婚礼日重算。"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from uuid import uuid4

from pycore.core.logger import get_logger
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from src.config.settings import backend_dir, get_settings
from src.db.models import (
    BudgetCategory,
    Guest,
    GuestGroup,
    Stage,
    Task,
    Wedding,
    WeddingPhoto,
)
from src.utils.due_dates import DEFAULT_STAGE_WINDOWS, suggested_due_date

logger = get_logger()

TASK_STATUS_TODO = "未开始"
BUDGET_STATUS_UNSET = "未确定"
ATTENDANCE_CONFIRMED = "已确认"
PHOTO_MAX_COUNT = 1

DEFAULT_STAGE_TASKS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "备婚启动期",
        (
            "确定婚礼日期",
            "选择婚礼策划师",
            "制定婚礼预算及预算划分",
            "估算宾客人数",
            "选择婚礼场地",
            "预定婚礼场地",
            "选择四大专业人员（摄影、摄像、主持、化妆）",
            "搜集婚礼灵感",
            "测量婚礼场地",
        ),
    ),
    (
        "正式筹备期",
        (
            "制定婚宴设计初稿",
            "确定婚宴设计终稿",
            "租赁 / 定做新娘婚纱",
            "租赁 / 定制新郎西装",
            "确定伴郎 / 伴娘服饰",
            "购买 / 定制父母服饰",
            "拍摄婚纱照",
            "购买婚礼对戒",
            "甜品方案确定",
        ),
    ),
    (
        "婚前冲刺期",
        (
            "设计婚礼邀请函",
            "发邀请函正式邀请宾客",
            "购买 / 定制婚礼纸品（誓言本 / 桌号牌 / 宾客名牌 / 菜单 / 感谢卡等）",
            "购买喜糖盒",
            "购买 / 定制伴手礼",
            "购买新人物品（签到本、签到笔、新娘房装饰物品、堵门道具、烟酒茶糖等）",
            "确定婚宴菜单和试菜",
        ),
    ),
    (
        "婚礼月",
        (
            "见主持人确定婚礼流程",
            "选择婚礼暖场 / 仪式 / 用餐音乐",
            "与摄影师沟通拍摄方案",
            "与摄像师沟通拍摄方案",
            "确定婚礼当日流程",
            "写誓词",
            "确定宾客名单",
            "安排宾客交通 / 住宿",
            "安排宾客座位",
        ),
    ),
    (
        "婚礼周",
        (
            "新娘试妆",
            "新娘做指甲 / 染发",
            "新郎修剪头发",
            "确定现场工作人员的工作职责",
            "取婚纱礼服西装",
            "运送新人方物料到酒店",
            "彩排",
        ),
    ),
)

DEFAULT_BUDGET_CATEGORIES: tuple[str, ...] = (
    "婚礼场地费",
    "婚宴餐费",
    "策划设计费",
    "四大-摄影师费",
    "四大-摄像师费",
    "四大-主持人费",
    "四大-化妆师费",
    "甜品台费",
    "现场布置费",
    "新娘婚纱费",
    "新娘婚鞋费",
    "新郎西服费",
    "新郎皮鞋费",
    "宾客伴手礼费",
    "宾客邀请函费",
    "烟/酒/茶/喜糖费",
    "宾客住宿费",
)

DEFAULT_GUEST_GROUPS: tuple[str, ...] = (
    "新郎",
    "新娘",
    "男方亲属",
    "女方亲属",
    "男方朋友",
    "女方朋友",
    "男方同事",
    "女方同事",
)

JPEG_PREFIX = b"\xff\xd8\xff"
PNG_PREFIX = b"\x89PNG"
GIF_PREFIX = b"GIF8"
WEBP_RIFF = b"RIFF"
WEBP_MARK = b"WEBP"

_CONTENT_TYPES = {
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
}


class WeddingAlreadyExistsError(Exception):
    """该账号已有婚礼项目。"""


class WeddingNotFoundError(Exception):
    """尚无婚礼项目。"""


class PhotoValidationError(Exception):
    """照片格式或大小不符合约定。"""


class PhotoConflictError(Exception):
    """已有 1 张合影。"""


class PhotoNotFoundError(Exception):
    """找不到这张照片。"""


def _stage_window_by_name() -> dict[str, str]:
    return {name: window for name, window in DEFAULT_STAGE_WINDOWS}


def wedding_to_public(wedding: Wedding) -> dict:
    return {
        "id": wedding.id,
        "start_date": wedding.start_date.isoformat(),
        "wedding_date": wedding.wedding_date.isoformat(),
        "city": wedding.city,
        "total_budget_fen": wedding.total_budget_fen,
        "guest_estimate": wedding.guest_estimate,
        "groom_nickname": wedding.groom_nickname,
        "groom_birthday": (
            wedding.groom_birthday.isoformat() if wedding.groom_birthday else None
        ),
        "bride_nickname": wedding.bride_nickname,
        "bride_birthday": (
            wedding.bride_birthday.isoformat() if wedding.bride_birthday else None
        ),
        "other_preference": wedding.other_preference,
        "canvas_scale": wedding.canvas_scale,
        "canvas_offset_x": wedding.canvas_offset_x,
        "canvas_offset_y": wedding.canvas_offset_y,
    }


async def get_wedding_by_user(db: AsyncSession, user_id: int) -> Wedding | None:
    result = await db.execute(select(Wedding).where(Wedding.user_id == user_id))
    return result.scalar_one_or_none()


async def seating_stats(db: AsyncSession, wedding_id: int) -> dict:
    total = await db.scalar(
        select(func.count()).select_from(Guest).where(Guest.wedding_id == wedding_id)
    )
    confirmed = await db.scalar(
        select(func.count())
        .select_from(Guest)
        .where(Guest.wedding_id == wedding_id, Guest.attendance == ATTENDANCE_CONFIRMED)
    )
    seated = await db.scalar(
        select(func.count())
        .select_from(Guest)
        .where(Guest.wedding_id == wedding_id, Guest.table_id.is_not(None))
    )
    guest_total = int(total or 0)
    seated_count = int(seated or 0)
    return {
        "guest_total": guest_total,
        "confirmed_count": int(confirmed or 0),
        "seated_count": seated_count,
        "unseated_count": guest_total - seated_count,
    }


async def seed_wedding_template(
    db: AsyncSession, wedding: Wedding, wedding_date: date
) -> None:
    windows = _stage_window_by_name()
    stage_ids: dict[str, int] = {}
    for order, (stage_name, task_names) in enumerate(DEFAULT_STAGE_TASKS):
        stage = Stage(wedding_id=wedding.id, name=stage_name, sort_order=order)
        db.add(stage)
        await db.flush()
        stage_ids[stage_name] = stage.id
        due = suggested_due_date(wedding_date, windows[stage_name])
        for task_order, task_name in enumerate(task_names):
            db.add(
                Task(
                    wedding_id=wedding.id,
                    name=task_name,
                    stage_id=stage.id,
                    due_date=due,
                    status=TASK_STATUS_TODO,
                    due_date_customized=False,
                    sort_order=task_order,
                )
            )
    for order, name in enumerate(DEFAULT_BUDGET_CATEGORIES):
        db.add(
            BudgetCategory(
                wedding_id=wedding.id,
                name=name,
                amount_fen=0,
                status=BUDGET_STATUS_UNSET,
                note=None,
                sort_order=order,
            )
        )
    for name in DEFAULT_GUEST_GROUPS:
        db.add(GuestGroup(wedding_id=wedding.id, name=name, is_preset=True))
    await db.flush()
    logger.info(
        "婚礼项目种子已写入",
        wedding_id=wedding.id,
        stages=len(DEFAULT_STAGE_TASKS),
        tasks=sum(len(items) for _, items in DEFAULT_STAGE_TASKS),
        categories=len(DEFAULT_BUDGET_CATEGORIES),
        groups=len(DEFAULT_GUEST_GROUPS),
    )


async def create_wedding(
    db: AsyncSession,
    user_id: int,
    *,
    start_date: date,
    wedding_date: date,
    city: str,
    total_budget_fen: int,
    guest_estimate: int,
) -> Wedding:
    existing = await get_wedding_by_user(db, user_id)
    if existing is not None:
        raise WeddingAlreadyExistsError("你已经有一个婚礼项目")
    wedding = Wedding(
        user_id=user_id,
        start_date=start_date,
        wedding_date=wedding_date,
        city=city,
        total_budget_fen=total_budget_fen,
        guest_estimate=guest_estimate,
        groom_nickname=None,
        groom_birthday=None,
        bride_nickname=None,
        bride_birthday=None,
        other_preference=None,
        canvas_scale=1,
        canvas_offset_x=0,
        canvas_offset_y=0,
    )
    db.add(wedding)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise WeddingAlreadyExistsError("你已经有一个婚礼项目") from exc
    await seed_wedding_template(db, wedding, wedding_date)
    await db.refresh(wedding)
    logger.info("婚礼项目创建成功", user_id=user_id, wedding_id=wedding.id)
    return wedding


async def require_wedding(db: AsyncSession, user_id: int) -> Wedding:
    wedding = await get_wedding_by_user(db, user_id)
    if wedding is None:
        raise WeddingNotFoundError("尚无婚礼项目")
    return wedding


async def recalculate_uncustomized_due_dates(
    db: AsyncSession, wedding: Wedding, wedding_date: date
) -> None:
    windows = _stage_window_by_name()
    stages = (
        await db.execute(select(Stage).where(Stage.wedding_id == wedding.id))
    ).scalars().all()
    stage_window = {stage.id: windows.get(stage.name) for stage in stages}
    tasks = (
        await db.execute(select(Task).where(Task.wedding_id == wedding.id))
    ).scalars().all()
    updated = 0
    for task in tasks:
        if task.due_date_customized:
            continue
        window = stage_window.get(task.stage_id)
        if window is None:
            continue
        task.due_date = suggested_due_date(wedding_date, window)
        updated += 1
    await db.flush()
    logger.info(
        "未手改任务截止日期已按新年礼日重算",
        wedding_id=wedding.id,
        updated=updated,
    )


async def update_wedding(db: AsyncSession, wedding: Wedding, fields: dict) -> Wedding:
    wedding_date_changed = False
    if "wedding_date" in fields and fields["wedding_date"] != wedding.wedding_date:
        wedding_date_changed = True
    for key, value in fields.items():
        setattr(wedding, key, value)
    if wedding_date_changed:
        await recalculate_uncustomized_due_dates(db, wedding, wedding.wedding_date)
    await db.flush()
    await db.refresh(wedding)
    logger.info("婚礼档案已更新", wedding_id=wedding.id)
    return wedding


def photo_url(photo_id: int) -> str:
    return f"/api/wedding_photos/{photo_id}"


def resolve_photo_dir() -> Path:
    settings = get_settings()
    path = Path(settings.wedding_photo_dir)
    if not path.is_absolute():
        path = backend_dir() / path
    path.mkdir(parents=True, exist_ok=True)
    return path.resolve()


def detect_image_kind(data: bytes) -> str | None:
    if len(data) >= 3 and data[:3] == JPEG_PREFIX:
        return "jpeg"
    if len(data) >= 4 and data[:4] == PNG_PREFIX:
        return "png"
    if len(data) >= 4 and data[:4] == GIF_PREFIX:
        return "gif"
    if (
        len(data) >= 12
        and data[:4] == WEBP_RIFF
        and data[8:12] == WEBP_MARK
    ):
        return "webp"
    return None


def validate_photo_bytes(data: bytes) -> tuple[str, str]:
    settings = get_settings()
    if len(data) == 0:
        raise PhotoValidationError("请上传 JPEG、PNG、GIF 或 WebP 图片。")
    if len(data) > settings.wedding_photo_max_bytes:
        raise PhotoValidationError("这张照片超过 5MB，请压缩后再上传。")
    kind = detect_image_kind(data)
    if kind is None:
        raise PhotoValidationError("请上传 JPEG、PNG、GIF 或 WebP 图片。")
    return kind, _CONTENT_TYPES[kind]


async def list_photos(db: AsyncSession, wedding_id: int) -> list[WeddingPhoto]:
    result = await db.execute(
        select(WeddingPhoto)
        .where(WeddingPhoto.wedding_id == wedding_id)
        .order_by(WeddingPhoto.id.asc())
    )
    return list(result.scalars().all())


def photo_to_public(photo: WeddingPhoto) -> dict:
    return {"id": photo.id, "url": photo_url(photo.id)}


async def create_photo(db: AsyncSession, wedding: Wedding, data: bytes) -> WeddingPhoto:
    existing = await list_photos(db, wedding.id)
    if len(existing) >= PHOTO_MAX_COUNT:
        raise PhotoConflictError("已有 1 张合影")
    _kind, content_type = validate_photo_bytes(data)
    photo = WeddingPhoto(
        wedding_id=wedding.id,
        stored_name="",
        byte_size=len(data),
        content_type=content_type,
    )
    db.add(photo)
    await db.flush()
    stored_name = f"{wedding.id}_{photo.id}_{uuid4().hex}"
    path = resolve_photo_dir() / stored_name
    path.write_bytes(data)
    photo.stored_name = stored_name
    await db.flush()
    await db.refresh(photo)
    logger.info("婚礼档案照片已上传", wedding_id=wedding.id, photo_id=photo.id)
    return photo


def photo_file_path(photo: WeddingPhoto) -> Path:
    return resolve_photo_dir() / photo.stored_name


async def get_project_photo(
    db: AsyncSession, wedding_id: int, photo_id: int
) -> WeddingPhoto:
    result = await db.execute(
        select(WeddingPhoto).where(
            WeddingPhoto.id == photo_id, WeddingPhoto.wedding_id == wedding_id
        )
    )
    photo = result.scalar_one_or_none()
    if photo is None:
        raise PhotoNotFoundError("找不到这张照片")
    return photo


async def replace_photo(
    db: AsyncSession, photo: WeddingPhoto, data: bytes
) -> WeddingPhoto:
    _kind, content_type = validate_photo_bytes(data)
    path = photo_file_path(photo)
    path.write_bytes(data)
    photo.byte_size = len(data)
    photo.content_type = content_type
    await db.flush()
    await db.refresh(photo)
    logger.info("婚礼档案照片已更换", photo_id=photo.id)
    return photo


async def delete_photo(db: AsyncSession, photo: WeddingPhoto) -> None:
    path = photo_file_path(photo)
    await db.delete(photo)
    await db.flush()
    if path.exists():
        path.unlink()
    logger.info("婚礼档案照片已删除", photo_id=photo.id)
