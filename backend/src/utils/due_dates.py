"""建议截止日期：建项与改婚礼日重算共用。规则见技术方案 §五。"""

from __future__ import annotations

import calendar
from datetime import date, timedelta

WINDOW_START = "start"
WINDOW_MID = "mid"
WINDOW_RUSH = "rush"
WINDOW_MONTH = "month"
WINDOW_WEEK = "week"

DEFAULT_STAGE_WINDOWS: tuple[tuple[str, str], ...] = (
    ("备婚启动期", WINDOW_START),
    ("正式筹备期", WINDOW_MID),
    ("婚前冲刺期", WINDOW_RUSH),
    ("婚礼月", WINDOW_MONTH),
    ("婚礼周", WINDOW_WEEK),
)

_STAGE_NAME_TO_WINDOW: dict[str, str] = {
    name: window for name, window in DEFAULT_STAGE_WINDOWS
}
_STAGE_NAME_TO_WINDOW.update(
    {
        "备婚启动": WINDOW_START,
        "中期筹备": WINDOW_MID,
        "婚前冲刺": WINDOW_RUSH,
    }
)


def subtract_calendar_months(value: date, months: int) -> date:
    """回推日历月，日号不变；目标月无该日则落到该月最后一天。"""
    year = value.year
    month = value.month - months
    while month <= 0:
        month += 12
        year -= 1
    last_day = calendar.monthrange(year, month)[1]
    day = min(value.day, last_day)
    return date(year, month, day)


def window_for_stage_name(stage_name: str) -> str | None:
    return _STAGE_NAME_TO_WINDOW.get(stage_name)


def suggested_due_date(wedding_date: date, window: str) -> date:
    """按阶段窗口从婚礼日回推建议截止日期。"""
    if window == WINDOW_START:
        return subtract_calendar_months(wedding_date, 6)
    if window == WINDOW_MID:
        return subtract_calendar_months(wedding_date, 3)
    if window == WINDOW_RUSH:
        return subtract_calendar_months(wedding_date, 1)
    if window == WINDOW_MONTH:
        return wedding_date - timedelta(days=7)
    if window == WINDOW_WEEK:
        return wedding_date
    raise ValueError(f"未知阶段窗口: {window}")


def suggested_due_date_for_stage(wedding_date: date, stage_name: str) -> date | None:
    window = window_for_stage_name(stage_name)
    if window is None:
        return None
    return suggested_due_date(wedding_date, window)
