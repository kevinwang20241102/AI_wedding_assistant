"""当前阶段：API-010 读取时按上海日历日先行命中。规则见技术方案 §五。"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from src.config.settings import get_settings
from src.utils.due_dates import (
    WINDOW_MID,
    WINDOW_MONTH,
    WINDOW_RUSH,
    WINDOW_START,
    WINDOW_WEEK,
    window_for_stage_name,
)

WEEK_MAX_DAYS = 7
RUSH_MAX_MONTHS = 3
MID_MAX_MONTHS = 6


def shanghai_today() -> date:
    settings = get_settings()
    tz: tzinfo
    try:
        tz = ZoneInfo(settings.timezone)
    except ZoneInfoNotFoundError:
        tz = timezone(timedelta(hours=8))
    return datetime.now(tz).date()


def days_until_wedding(wedding_date: date, today: date) -> int:
    return (wedding_date - today).days


def calendar_months_until(wedding_date: date, today: date) -> int:
    months = (wedding_date.year - today.year) * 12 + (wedding_date.month - today.month)
    if today.day > wedding_date.day:
        months -= 1
    return months


def current_window(wedding_date: date, today: date) -> str | None:
    days_until = days_until_wedding(wedding_date, today)
    if days_until < 0:
        return None
    if 0 <= days_until <= WEEK_MAX_DAYS:
        return WINDOW_WEEK
    if (
        wedding_date.year == today.year
        and wedding_date.month == today.month
        and days_until > WEEK_MAX_DAYS
    ):
        return WINDOW_MONTH
    months = calendar_months_until(wedding_date, today)
    if months <= RUSH_MAX_MONTHS and days_until > WEEK_MAX_DAYS:
        return WINDOW_RUSH
    if months <= MID_MAX_MONTHS:
        return WINDOW_MID
    return WINDOW_START


def current_stage_id(
    wedding_date: date,
    today: date,
    stages: list[tuple[int, str, int]],
) -> int | None:
    """stages 为 (id, name, sort_order)。命中的默认窗口已删除或改名后无法对应则返回 None。"""
    window = current_window(wedding_date, today)
    if window is None:
        return None
    ordered = sorted(stages, key=lambda item: item[2])
    for stage_id, name, _sort_order in ordered:
        if window_for_stage_name(name) == window:
            return stage_id
    return None
