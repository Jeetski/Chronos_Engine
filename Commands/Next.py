import re
from datetime import datetime, timedelta

from Modules.Scheduler import display_schedule
from Modules.Planner import build_preview_for_date


WEEKDAYS = {
    "monday": 0,
    "mon": 0,
    "tuesday": 1,
    "tue": 1,
    "tues": 1,
    "wednesday": 2,
    "wed": 2,
    "thursday": 3,
    "thu": 3,
    "thur": 3,
    "thurs": 3,
    "friday": 4,
    "fri": 4,
    "saturday": 5,
    "sat": 5,
    "sunday": 6,
    "sun": 6,
}

MONTHS = {
    "january": 1,
    "jan": 1,
    "february": 2,
    "feb": 2,
    "march": 3,
    "mar": 3,
    "april": 4,
    "apr": 4,
    "may": 5,
    "june": 6,
    "jun": 6,
    "july": 7,
    "jul": 7,
    "august": 8,
    "aug": 8,
    "september": 9,
    "sep": 9,
    "sept": 9,
    "october": 10,
    "oct": 10,
    "november": 11,
    "nov": 11,
    "december": 12,
    "dec": 12,
}

ORDINAL_RE = re.compile(r"^(\d+)(st|nd|rd|th)$", re.IGNORECASE)


def _parse_ordinal(token):
    match = ORDINAL_RE.match(token)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _resolve_target(args):
    if not args:
        print("Usage: next day|<weekday>|<ordinal> [of] <month>")
        return None

    base = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    token0 = args[0].lower()

    if token0 == "day":
        target = base + timedelta(days=2)
        label = "Day After Tomorrow"
        return target, label

    if token0 in WEEKDAYS:
        weekday = WEEKDAYS[token0]
        # Jump to the same weekday in the following week
        days_ahead = ((weekday - base.weekday()) % 7) + 7
        candidate = base + timedelta(days=days_ahead)
        label = f"Next {candidate.strftime('%A')}"
        return candidate, label

    ordinal = _parse_ordinal(token0)
    if ordinal:
        remaining = args[1:]
        if remaining and remaining[0].lower() == "of":
            remaining = remaining[1:]
        if not remaining:
            print("Specify a month after the ordinal (e.g., next 12th of March).")
            return None
        month_token = remaining[0].lower()
        month = MONTHS.get(month_token)
        if not month:
            print(f"Unknown month: {remaining[0]}")
            return None
        year = base.year
        try:
            candidate = base.replace(year=year, month=month, day=ordinal)
        except ValueError:
            print(f"{ordinal} is not a valid day in {remaining[0].title()}.")
            return None
        if candidate <= base:
            # Move to next year
            year += 1
            try:
                candidate = candidate.replace(year=year)
            except ValueError:
                print(f"{ordinal} is not valid for {remaining[0].title()} {year}.")
                return None
        label = f"{candidate.strftime('%B %d, %Y')}"
        return candidate, label

    print("Could not understand the requested date. Try 'next day', 'next Tuesday', or 'next 12th of March'.")
    return None


def run(args, properties):
    """
    Preview a future schedule beyond tomorrow.
    """
    target_info = _resolve_target(args)
    if not target_info:
        return

    target_date, label = target_info
    schedule, conflicts = build_preview_for_date(target_date)
    if schedule is None:
        return

    completions = {}
    display_schedule(
        schedule,
        conflicts,
        indent=0,
        display_level=float("inf"),
        today_completion_data=completions,
        color_override="future",
        title=f"--- {label} ---",
    )
