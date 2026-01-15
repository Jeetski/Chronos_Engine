import os
from datetime import datetime, timedelta

from Modules.Scheduler import display_schedule, schedule_path_for_date
from Modules.Planner import build_preview_for_date


def run(args, properties):
    """
    Preview the schedule for tomorrow (or a specified offset via days:<n>).
    """
    days_ahead = int(properties.get("days", 1))
    if days_ahead < 1:
        days_ahead = 1
    target_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=days_ahead)

    schedule_path = schedule_path_for_date(target_date)
    schedule, conflicts = build_preview_for_date(target_date, save_path=schedule_path)
    if schedule is None:
        return

    completions = {}  # Tomorrow has no completion data yet
    display_schedule(
        schedule,
        conflicts,
        indent=0,
        display_level=float("inf"),
        today_completion_data=completions,
        color_override="future",
        title="--- Tomorrow's Schedule ---",
    )
