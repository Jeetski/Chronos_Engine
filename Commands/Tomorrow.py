import os
from datetime import datetime, timedelta

from Modules.Scheduler import USER_DIR, display_schedule
from Modules.Planner import build_preview_for_date


TOMORROW_SCHEDULE_PATH = os.path.join(USER_DIR, "Schedules", "tomorrow_schedule.yml")


def run(args, properties):
    """
    Preview the schedule for tomorrow (or a specified offset via days:<n>).
    """
    days_ahead = int(properties.get("days", 1))
    if days_ahead < 1:
        days_ahead = 1
    target_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=days_ahead)

    schedule, conflicts = build_preview_for_date(target_date, save_path=TOMORROW_SCHEDULE_PATH)
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
