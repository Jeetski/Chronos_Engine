from datetime import datetime, timedelta

from Modules.Scheduler import display_schedule
from Modules.Planner import build_preview_for_date
from Commands.Next import WEEKDAYS


def _resolve_weekday(token):
    key = token.lower()
    if key not in WEEKDAYS:
        print(f"Unknown weekday: {token}")
        return None
    base = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    weekday = WEEKDAYS[key]
    delta = (weekday - base.weekday()) % 7
    if delta == 0:
        target = base
    else:
        target = base + timedelta(days=delta)
    label = f"This {target.strftime('%A')}"
    return target, label


def run(args, properties):
    """
    Preview the nearest occurrence of a weekday in the current week (uses 'this' semantics).
    """
    if not args:
        print("Usage: this <weekday>")
        return
    target_info = _resolve_weekday(args[0])
    if not target_info:
        return
    target_date, label = target_info
    schedule, conflicts = build_preview_for_date(target_date)
    if schedule is None:
        return
    display_schedule(
        schedule,
        conflicts,
        indent=0,
        display_level=float("inf"),
        today_completion_data={},
        color_override="future",
        title=f"--- {label} ---",
    )
