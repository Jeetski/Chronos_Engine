import os
from datetime import datetime, timedelta
from Modules.ItemManager import read_item_data, write_item_data


# Whitelist of item types that are trackable by default
TRACKABLE_TYPES = {
    "habit",           # already has bespoke tracking
    "task",
    "routine",
    "subroutine",
    "microroutine",
    "ritual",
    "commitment",
    "appointment",
}


def is_trackable(item_type: str) -> bool:
    return (item_type or "").lower() in TRACKABLE_TYPES


def _ensure_tracking_fields(data: dict) -> dict:
    if data is None:
        data = {}
    if "completion_dates" not in data or data.get("completion_dates") is None:
        data["completion_dates"] = []
    if "last_completed" not in data:
        data["last_completed"] = None
    if "current_streak" not in data or data.get("current_streak") is None:
        data["current_streak"] = 0
    if "longest_streak" not in data or data.get("longest_streak") is None:
        data["longest_streak"] = 0
    if "sessions" not in data or data.get("sessions") is None:
        data["sessions"] = []  # list of {date, minutes?, count?}
    if "totals" not in data or data.get("totals") is None:
        data["totals"] = {"sessions": 0, "minutes": 0}
    if "missed_dates" not in data or data.get("missed_dates") is None:
        data["missed_dates"] = []
    return data


def mark_complete(item_type: str, item_name: str, minutes: int | None = None, count: int | None = None, *, outcome: str | None = None, count_as_completion: bool = True) -> bool:
    """
    Marks the given item as completed for today and updates streak and session totals.
    Returns True if updated, False if item not found.
    """
    item_type = (item_type or "").lower()
    data = read_item_data(item_type, item_name)
    if not data:
        print(f"{item_type.capitalize()} '{item_name}' not found.")
        return False

    data = _ensure_tracking_fields(data)

    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    # Handle completion vs non-completion outcomes (e.g., appointment no-show)
    if count_as_completion:
        # Update completion dates (avoid duplicates for the same day)
        if today not in data["completion_dates"]:
            data["completion_dates"].append(today)

        last_completed = data.get("last_completed")
        if last_completed == yesterday:
            data["current_streak"] = int(data.get("current_streak", 0)) + 1
        elif last_completed == today:
            # already counted today; keep current_streak as-is
            data["current_streak"] = int(data.get("current_streak", 0)) or 1
        else:
            data["current_streak"] = 1

        if data["current_streak"] > int(data.get("longest_streak", 0)):
            data["longest_streak"] = data["current_streak"]

        data["last_completed"] = today
    else:
        # Do not adjust completion dates or streaks
        pass

    # Log session data if provided
    session_entry = {"date": today}
    if minutes is not None:
        try:
            minutes_val = int(minutes)
            if minutes_val > 0:
                session_entry["minutes"] = minutes_val
                data["totals"]["minutes"] = int(data["totals"].get("minutes", 0)) + minutes_val
        except Exception:
            pass
    if count is not None:
        try:
            count_val = int(count)
            if count_val > 0:
                session_entry["count"] = count_val
        except Exception:
            pass

    # Only add a session record if any detail or the completion event counts as a session
    # Outcome tagging (useful for appointments)
    if outcome:
        session_entry["outcome"] = outcome

    data["sessions"].append(session_entry)
    data["totals"]["sessions"] = int(data["totals"].get("sessions", 0)) + 1

    # Appointment-specific aggregates
    if item_type == "appointment":
        if "attended" not in data["totals"]:
            data["totals"]["attended"] = 0
        if "no_shows" not in data["totals"]:
            data["totals"]["no_shows"] = 0
        if outcome == "attended" and count_as_completion:
            data["totals"]["attended"] += 1
        elif outcome == "no_show":
            data["totals"]["no_shows"] += 1

    write_item_data(item_type, item_name, data)

    # Friendly output
    minutes_str = f", minutes: {session_entry.get('minutes')}" if "minutes" in session_entry else ""
    count_str = f", count: {session_entry.get('count')}" if "count" in session_entry else ""
    outcome_str = f", outcome: {session_entry.get('outcome')}" if "outcome" in session_entry else ""
    extras = f"{minutes_str}{count_str}"
    if count_as_completion:
        print(f"Marked '{item_name}' ({item_type}) complete for today{extras}{outcome_str}.")
        print(f"Current streak: {data['current_streak']}  |  Longest: {data['longest_streak']}")
    else:
        print(f"Recorded '{item_name}' ({item_type}) session{extras}{outcome_str} (not counted as completion).")
    return True


def show_tracking(item_type: str, item_name: str) -> bool:
    """
    Displays tracking summary for the item: streaks, last completion, and totals.
    Returns True if shown, False if item not found.
    """
    item_type = (item_type or "").lower()
    data = read_item_data(item_type, item_name)
    if not data:
        print(f"{item_type.capitalize()} '{item_name}' not found.")
        return False

    data = _ensure_tracking_fields(data)

    print(f"--- Tracking for {item_type.capitalize()}: {item_name} ---")
    print(f"  Current Streak: {data.get('current_streak', 0)}")
    print(f"  Longest Streak: {data.get('longest_streak', 0)}")
    print(f"  Last Completed: {data.get('last_completed') or 'N/A'}")
    totals = data.get("totals", {})
    print(f"  Sessions: {int(totals.get('sessions', 0))}  |  Minutes: {int(totals.get('minutes', 0))}")
    if "missed" in totals:
        print(f"  Missed: {int(totals.get('missed', 0))}")

    # Appointment-specific summary
    if item_type == "appointment":
        attended = int(totals.get("attended", 0))
        no_shows = int(totals.get("no_shows", 0))
        total_occ = attended + no_shows
        rate = f"{(attended / total_occ * 100):.0f}%" if total_occ > 0 else "N/A"
        print(f"  Attendance: attended {attended}, no-shows {no_shows}, rate {rate}")

    # Commitment period summaries (weekly/monthly)
    if item_type == "commitment":
        from datetime import date
        dates = [d for d in data.get("completion_dates", []) if isinstance(d, str)]
        today_dt = datetime.now().date()
        year, week_num, _ = today_dt.isocalendar()
        this_month = today_dt.strftime("%Y-%m")
        weekly = 0
        monthly = 0
        for ds in dates:
            try:
                ddt = datetime.strptime(ds, "%Y-%m-%d").date()
            except Exception:
                continue
            y, w, _ = ddt.isocalendar()
            if (y, w) == (year, week_num):
                weekly += 1
            if ds.startswith(this_month):
                monthly += 1
        print(f"  This week completions: {weekly}  |  This month: {monthly}")

    # Show a short recent history list (last 10 entries)
    dates = list(data.get("completion_dates", []))
    if dates:
        recent = ", ".join(dates[-10:])
        print(f"  Recent Completions: {recent}")
    else:
        print("  No completion history yet.")

    return True


def mark_missed(item_type: str, item_name: str, *, outcome: str | None = None) -> bool:
    """
    Records a missed occurrence for the item (does not count as a completion),
    resets the current streak, and tracks totals. For appointments, defaults to no_show.
    """
    item_type = (item_type or "").lower()
    data = read_item_data(item_type, item_name)
    if not data:
        print(f"{item_type.capitalize()} '{item_name}' not found.")
        return False

    data = _ensure_tracking_fields(data)

    today = datetime.now().strftime("%Y-%m-%d")

    # Record missed date (avoid duplicates)
    if today not in data["missed_dates"]:
        data["missed_dates"].append(today)

    # Reset current streak on a miss (do not change longest)
    data["current_streak"] = 0

    # Session entry with outcome
    sess = {"date": today, "outcome": outcome or ("no_show" if item_type == "appointment" else "missed")}
    data["sessions"].append(sess)
    data["totals"]["sessions"] = int(data["totals"].get("sessions", 0)) + 1

    # Totals
    if item_type == "appointment":
        if "no_shows" not in data["totals"]:
            data["totals"]["no_shows"] = 0
        data["totals"]["no_shows"] += 1
    else:
        data["totals"]["missed"] = int(data["totals"].get("missed", 0)) + 1

    write_item_data(item_type, item_name, data)
    print(f"Recorded missed: '{item_name}' ({item_type}). Streak reset.")
    return True
