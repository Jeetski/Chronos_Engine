import json
import os
import sqlite3
import yaml
from datetime import datetime, timedelta
from typing import Dict, Any, Tuple, List

from Modules.Sequence.registry import ensure_data_home, update_database_entry, load_registry
from Modules.Sequence.memory_builder import build_memory_db

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
USER_DIR = os.path.join(ROOT_DIR, "User")
DATA_DIR = os.path.join(USER_DIR, "Data")
MEMORY_DB_PATH = os.path.join(DATA_DIR, "chronos_memory.db")
TRENDS_DB_PATH = os.path.join(DATA_DIR, "chronos_trends.db")
TRENDS_MD_PATH = os.path.join(DATA_DIR, "trends.md")

_STANDARD_COMPLETION_KEYS = {
    "name",
    "status",
    "scheduled_start",
    "scheduled_end",
    "actual_start",
    "actual_end",
    "logged_at",
    "note",
    "quality",
}


def _timestamp() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _ensure_memory(registry: Dict[str, Any]) -> None:
    if not os.path.exists(MEMORY_DB_PATH) or not _memory_has_completion_columns():
        build_memory_db(registry)


def _memory_has_completion_columns() -> bool:
    try:
        conn = sqlite3.connect(MEMORY_DB_PATH)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(activity_facts)").fetchall()}
        conn.close()
        return {"completion_quality", "completion_json"}.issubset(columns)
    except Exception:
        return False


def _fetch_memory_stats() -> Dict[str, Any]:
    conn = sqlite3.connect(MEMORY_DB_PATH)
    cursor = conn.cursor()
    stats = {}
    stats["blocks_total"] = cursor.execute("SELECT COUNT(*) FROM activity_facts").fetchone()[0]
    stats["blocks_completed"] = cursor.execute(
        "SELECT COUNT(*) FROM activity_facts WHERE LOWER(status) = 'completed'"
    ).fetchone()[0]
    stats["blocks_in_progress"] = cursor.execute(
        "SELECT COUNT(*) FROM activity_facts WHERE LOWER(status) = 'in_progress'"
    ).fetchone()[0]
    stats["average_variance"] = cursor.execute(
        "SELECT COALESCE(AVG(variance_minutes), 0) FROM activity_facts"
    ).fetchone()[0] or 0
    stats["latest_status_snapshot"] = cursor.execute(
        "SELECT payload_json FROM status_snapshots ORDER BY timestamp DESC LIMIT 1"
    ).fetchone()
    quality_counts, custom_property_counts = _collect_completion_property_stats(cursor)
    stats["quality_counts"] = quality_counts
    stats["custom_property_counts"] = custom_property_counts
    conn.close()
    return stats


def _collect_completion_property_stats(cursor: sqlite3.Cursor) -> Tuple[Dict[str, int], Dict[str, int]]:
    quality_counts: Dict[str, int] = {}
    custom_property_counts: Dict[str, int] = {}
    try:
        rows = cursor.execute(
            """
            SELECT completion_quality, completion_json
            FROM activity_facts
            WHERE completion_quality IS NOT NULL OR completion_json IS NOT NULL
            """
        ).fetchall()
    except sqlite3.OperationalError:
        return {}, {}
    for completion_quality, completion_json in rows:
        quality_value = completion_quality
        payload = None
        if completion_json:
            try:
                payload = json.loads(completion_json)
            except Exception:
                payload = None
        if not quality_value and isinstance(payload, dict):
            quality_value = payload.get("quality")
        if quality_value:
            key = str(quality_value)
            quality_counts[key] = quality_counts.get(key, 0) + 1
        if isinstance(payload, dict):
            for key in payload.keys():
                if key in _STANDARD_COMPLETION_KEYS:
                    continue
                custom_property_counts[key] = custom_property_counts.get(key, 0) + 1
    return quality_counts, custom_property_counts


def _fetch_habit_stats() -> Dict[str, Any]:
    """Collect metrics from all habit files."""
    habits_dir = os.path.join(USER_DIR, "Habits")
    stats = {
        "total_habits": 0,
        "habits_with_current_streak": 0,
        "total_current_streak_days": 0,
        "longest_streak_overall": 0,
        "completion_rate_today": 0.0,
        "bad_habits_total_clean_days": 0,
        "bad_habits_count": 0,
    }
    
    if not os.path.isdir(habits_dir):
        return stats
    
    today = datetime.now().strftime("%Y-%m-%d")
    completed_today = 0
    
    for filename in os.listdir(habits_dir):
        if not filename.lower().endswith(".yml"):
            continue
        
        filepath = os.path.join(habits_dir, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            
            stats["total_habits"] += 1
            polarity = str(data.get("polarity", "good")).lower()
            
            if polarity == "bad":
                stats["bad_habits_count"] += 1
                # Calculate clean streak for bad habits
                last_incident = data.get("last_incident")
                if last_incident:
                    try:
                        last_dt = datetime.strptime(str(last_incident), "%Y-%m-%d").date()
                        clean_days = (datetime.now().date() - last_dt).days - 1
                        stats["bad_habits_total_clean_days"] += max(0, clean_days)
                    except Exception:
                        stats["bad_habits_total_clean_days"] += int(data.get("clean_current_streak", 0))
                else:
                    # No incidents ever
                    creation_date = data.get("creation_date")
                    if creation_date:
                        try:
                            created_dt = datetime.strptime(str(creation_date), "%Y-%m-%d").date()
                            clean_days = (datetime.now().date() - created_dt).days
                            stats["bad_habits_total_clean_days"] += max(0, clean_days)
                        except Exception:
                            pass
            else:
                # Good habit streaks
                current_streak = int(data.get("current_streak", 0))
                longest_streak = int(data.get("longest_streak", 0))
                
                if current_streak > 0:
                    stats["habits_with_current_streak"] += 1
                    stats["total_current_streak_days"] += current_streak
                
                if longest_streak > stats["longest_streak_overall"]:
                    stats["longest_streak_overall"] = longest_streak
            
            # Check if completed today
            completion_dates = data.get("completion_dates", [])
            if isinstance(completion_dates, list) and today in completion_dates:
                completed_today += 1
        except Exception:
            continue
    
    if stats["total_habits"] > 0:
        stats["completion_rate_today"] = (completed_today / stats["total_habits"]) * 100
    
    return stats


def _fetch_goal_stats() -> Dict[str, Any]:
    """Collect metrics from goals and milestones."""
    goals_dir = os.path.join(USER_DIR, "Goals")
    milestones_dir = os.path.join(USER_DIR, "Milestones")
    stats = {
        "total_goals": 0,
        "goals_in_progress": 0,
        "total_progress": 0.0,
        "milestones_completed_this_week": 0,
        "milestones_pending": 0,
        "milestones_total": 0,
    }
    
    # Load all milestones
    milestones = []
    if os.path.isdir(milestones_dir):
        for filename in os.listdir(milestones_dir):
            if not filename.lower().endswith(".yml"):
                continue
            filepath = os.path.join(milestones_dir, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
                    milestones.append(data)
                    stats["milestones_total"] += 1
            except Exception:
                continue
    
    # Process goals
    if os.path.isdir(goals_dir):
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        for filename in os.listdir(goals_dir):
            if not filename.lower().endswith(".yml"):
                continue
            
            filepath = os.path.join(goals_dir, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    goal_data = yaml.safe_load(f) or {}
                
                stats["total_goals"] += 1
                goal_name = goal_data.get("name", os.path.splitext(filename)[0]).strip().lower()
                
                # Find related milestones
                goal_milestones = [
                    m for m in milestones
                    if str(m.get("goal", "")).strip().lower() == goal_name
                ]
                
                if goal_milestones:
                    # Calculate progress from milestones
                    total_weight = 0
                    weighted_sum = 0
                    
                    for milestone in goal_milestones:
                        weight = int(milestone.get("weight", 1) or 1)
                        progress = milestone.get("progress") or {}
                        percent = float(progress.get("percent", 0) or 0)
                        
                        weighted_sum += percent * weight
                        total_weight += weight
                        
                        status = str(milestone.get("status", "pending")).lower()
                        if status == "completed":
                            # Check if completed this week
                            completed_date = milestone.get("completed_date")
                            if completed_date and completed_date >= week_ago:
                                stats["milestones_completed_this_week"] += 1
                        elif status in ("pending", "in-progress"):
                            stats["milestones_pending"] += 1
                    
                    if total_weight > 0:
                        goal_progress = weighted_sum / total_weight
                        stats["total_progress"] += goal_progress
                        if goal_progress > 0 and goal_progress < 100:
                            stats["goals_in_progress"] += 1
            except Exception:
                continue
    
    return stats


def _fetch_timer_stats() -> Dict[str, Any]:
    """Collect metrics from timer session logs."""
    sessions_dir = os.path.join(USER_DIR, "Timers", "sessions")
    stats = {
        "sessions_total": 0,
        "focus_minutes": 0,
        "break_minutes": 0,
        "profile_usage": {},
    }
    
    if not os.path.isdir(sessions_dir):
        return stats
    
    # Check last 7 days
    today = datetime.now()
    
    for i in range(7):
        date = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        session_file = os.path.join(sessions_dir, f"{date}.yml")
        
        if not os.path.exists(session_file):
            continue
        
        try:
            with open(session_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            
            entries = data.get("entries", [])
            if not isinstance(entries, list):
                continue
            
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                
                stats["sessions_total"] += 1
                phase = entry.get("phase", "focus")
                seconds = int(entry.get("seconds", 0))
                minutes = max(1, seconds // 60)
                
                if phase == "focus":
                    stats["focus_minutes"] += minutes
                elif phase in ("short_break", "long_break", "break"):
                    stats["break_minutes"] += minutes
                
                profile = entry.get("profile")
                if profile:
                    stats["profile_usage"][profile] = stats["profile_usage"].get(profile, 0) + 1
        except Exception:
            continue
    
    return stats


def _compute_adherence_stats(cursor: sqlite3.Cursor) -> Dict[str, Any]:
    """Compute adherence metrics from memory database."""
    stats = {
        "on_time_count": 0,
        "late_count": 0,
        "adherence_percentage": 0.0,
        "avg_delay_minutes": 0.0,
    }
    
    try:
        # Query variance from activity_facts
        rows = cursor.execute(
            """
            SELECT variance_minutes
            FROM activity_facts
            WHERE variance_minutes IS NOT NULL
            """
        ).fetchall()
        
        if not rows:
            return stats
        
        total = len(rows)
        on_time_threshold = 5  # minutes
        total_delay = 0
        
        for (variance,) in rows:
            try:
                variance_val = float(variance)
                if abs(variance_val) <= on_time_threshold:
                    stats["on_time_count"] += 1
                else:
                    stats["late_count"] += 1
                
                if variance_val > 0:
                    total_delay += variance_val
            except (ValueError, TypeError):
                continue
        
        if total > 0:
            stats["adherence_percentage"] = (stats["on_time_count"] / total) * 100
        
        if stats["late_count"] > 0:
            stats["avg_delay_minutes"] = total_delay / stats["late_count"]
    except sqlite3.OperationalError:
        pass
    
    return stats


def _create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS metrics;
        CREATE TABLE metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metric TEXT,
            value REAL,
            unit TEXT,
            extra_json TEXT,
            generated_at TEXT
        );
        """
    )


def _insert_metrics(conn: sqlite3.Connection, stats: Dict[str, Any]) -> None:
    generated_at = _timestamp()
    rows = [
        ("blocks_total", stats.get("blocks_total", 0), "count", None),
        ("blocks_completed", stats.get("blocks_completed", 0), "count", None),
        ("blocks_completion_rate", _completion_rate(stats), "percent", None),
        ("blocks_avg_variance_minutes", stats.get("average_variance", 0), "minutes", None),
    ]
    if stats.get("quality_counts"):
        rows.append(
            (
                "completion_quality_counts",
                sum(stats["quality_counts"].values()),
                "count",
                json.dumps(stats["quality_counts"], ensure_ascii=False),
            )
        )
    if stats.get("custom_property_counts"):
        rows.append(
            (
                "completion_custom_property_counts",
                len(stats["custom_property_counts"]),
                "count",
                json.dumps(stats["custom_property_counts"], ensure_ascii=False),
            )
        )
    
    # Habit metrics
    habit_stats = stats.get("habit_stats", {})
    if habit_stats:
        rows.extend([
            ("habits_total", habit_stats.get("total_habits", 0), "count", None),
            ("habits_with_streak", habit_stats.get("habits_with_current_streak", 0), "count", None),
            ("habits_avg_streak", 
             habit_stats.get("total_current_streak_days", 0) / max(1, habit_stats.get("habits_with_current_streak", 1)), 
             "days", None),
            ("habits_longest_streak", habit_stats.get("longest_streak_overall", 0), "days", None),
            ("habits_completion_today", habit_stats.get("completion_rate_today", 0), "percent", None),
            ("bad_habits_avg_clean_days",
             habit_stats.get("bad_habits_total_clean_days", 0) / max(1, habit_stats.get("bad_habits_count", 1)),
             "days", None),
        ])
    
    # Goal metrics
    goal_stats = stats.get("goal_stats", {})
    if goal_stats:
        avg_progress = 0.0
        if goal_stats.get("total_goals", 0) > 0:
            avg_progress = goal_stats.get("total_progress", 0) / goal_stats["total_goals"]
        rows.extend([
            ("goals_total", goal_stats.get("total_goals", 0), "count", None),
            ("goals_in_progress", goal_stats.get("goals_in_progress", 0), "count", None),
            ("goals_avg_progress", avg_progress, "percent", None),
            ("milestones_completed_week", goal_stats.get("milestones_completed_this_week", 0), "count", None),
            ("milestones_pending", goal_stats.get("milestones_pending", 0), "count", None),
        ])
    
    # Timer metrics
    timer_stats = stats.get("timer_stats", {})
    if timer_stats:
        rows.extend([
            ("timer_sessions_total", timer_stats.get("sessions_total", 0), "count", None),
            ("timer_focus_minutes", timer_stats.get("focus_minutes", 0), "minutes", None),
            ("timer_break_minutes", timer_stats.get("break_minutes", 0), "minutes", None),
        ])
        if timer_stats.get("profile_usage"):
            rows.append((
                "timer_profile_usage",
                len(timer_stats["profile_usage"]),
                "count",
                json.dumps(timer_stats["profile_usage"], ensure_ascii=False),
            ))
    
    # Adherence metrics
    adherence_stats = stats.get("adherence_stats", {})
    if adherence_stats:
        rows.extend([
            ("adherence_on_time", adherence_stats.get("on_time_count", 0), "count", None),
            ("adherence_late", adherence_stats.get("late_count", 0), "count", None),
            ("adherence_percentage", adherence_stats.get("adherence_percentage", 0), "percent", None),
            ("adherence_avg_delay", adherence_stats.get("avg_delay_minutes", 0), "minutes", None),
        ])
    
    for metric, value, unit, extra in rows:
        conn.execute(
            "INSERT INTO metrics (metric, value, unit, extra_json, generated_at) VALUES (?, ?, ?, ?, ?)",
            (metric, value, unit, extra, generated_at),
        )


def _completion_rate(stats: Dict[str, Any]) -> float:
    total = stats.get("blocks_total", 0)
    completed = stats.get("blocks_completed", 0)
    if not total:
        return 0.0
    return round((completed / total) * 100, 1)


def _format_duration_prose(minutes: int) -> str:
    """Convert minutes to natural language duration."""
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    hours = minutes // 60
    remaining = minutes % 60
    if remaining == 0:
        return f"{hours} hour{'s' if hours != 1 else ''}"
    return f"{hours} hour{'s' if hours != 1 else ''} {remaining} minute{'s' if remaining != 1 else ''}"


def _superlative_habit(habit_stats: Dict[str, Any]) -> str:
    """Find the habit with the longest current streak."""
    habits_dir = os.path.join(USER_DIR, "Habits")
    if not os.path.isdir(habits_dir):
        return "your habits"
    
    best_name = None
    best_streak = 0
    
    for filename in os.listdir(habits_dir):
        if not filename.lower().endswith(".yml"):
            continue
        filepath = os.path.join(habits_dir, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            polarity = str(data.get("polarity", "good")).lower()
            if polarity != "bad":
                streak = int(data.get("current_streak", 0))
                if streak > best_streak:
                    best_streak = streak
                    best_name = data.get("name", os.path.splitext(filename)[0])
        except Exception:
            continue
    
    return f'"{best_name}"' if best_name else "your habits"


def _productivity_peak_day(timer_stats: Dict[str, Any]) -> tuple:
    """Find the most productive day by timer minutes."""
    sessions_dir = os.path.join(USER_DIR, "Timers", "sessions")
    if not os.path.isdir(sessions_dir):
        return ("this week", 0)
    
    daily_minutes = {}
    today = datetime.now()
    
    for i in range(7):
        date = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        session_file = os.path.join(sessions_dir, f"{date}.yml")
        
        if not os.path.exists(session_file):
            continue
        
        try:
            with open(session_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            
            entries = data.get("entries", [])
            if not isinstance(entries, list):
                continue
            
            total = 0
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                phase = entry.get("phase", "focus")
                if phase == "focus":
                    seconds = int(entry.get("seconds", 0))
                    total += max(1, seconds // 60)
            
            if total > 0:
                daily_minutes[date] = total
        except Exception:
            continue
    
    if not daily_minutes:
        return ("this week", 0)
    
    best_date, best_minutes = max(daily_minutes.items(), key=lambda x: x[1])
    
    try:
        best_dt = datetime.strptime(best_date, "%Y-%m-%d")
        day_name = best_dt.strftime("%A")
    except Exception:
        day_name = "this week"
    
    return (day_name, best_minutes)


def _generate_narrative(stats: Dict[str, Any]) -> str:
    """Generate natural language narrative from all collected stats."""
    now = datetime.now()
    day_name = now.strftime("%A")
    month_name = now.strftime("%B")
    day = now.day
    year = now.year
    time = now.strftime("%I:%M %p").lstrip("0")
    
    lines = [
        "# Chronos Performance Report",
        "",
        f"*Generated on {day_name}, {month_name} {day}, {year} at {time}*",
        "",
    ]
    
    # Summary Section
    blocks_total = stats.get("blocks_total", 0)
    blocks_completed = stats.get("blocks_completed", 0)
    completion_rate = _completion_rate(stats)
    avg_variance = stats.get("average_variance", 0)
    adherence_stats = stats.get("adherence_stats", {})
    adherence_pct = adherence_stats.get("adherence_percentage", 0)
    
    lines.append("## Summary")
    if blocks_total > 0:
        lines.append(
            f"You completed **{blocks_completed} of {blocks_total}** scheduled blocks this period, "
            f"achieving a **{completion_rate:.0f}% completion rate**. "
            f"On average, you started tasks **{abs(avg_variance):.0f} minutes {'later' if avg_variance > 0 else 'earlier'}** than planned, "
            f"with **{adherence_pct:.0f}% adherence** to your schedule."
        )
    else:
        lines.append("No scheduled blocks tracked for this period.")
    lines.append("")
    
    # Habits Section
    habit_stats = stats.get("habit_stats", {})
    total_habits = habit_stats.get("total_habits", 0)
    
    if total_habits > 0:
        lines.append("## Habits")
        
        habits_with_streak = habit_stats.get("habits_with_current_streak", 0)
        longest_streak = habit_stats.get("longest_streak_overall", 0)
        completion_today = habit_stats.get("completion_rate_today", 0)
        best_habit = _superlative_habit(habit_stats)
        
        if habits_with_streak > 0:
            lines.append(
                f"You're maintaining **{habits_with_streak} active streak{'s' if habits_with_streak != 1 else ''}** "
                f"across your habits, with your longest current run at **{longest_streak} days**. "
                f"Your {best_habit} habit has the strongest momentum."
            )
        
        if completion_today > 0:
            lines.append(f"You completed **{completion_today:.0f}% of your daily habits** today.")
        
        # Bad habits clean days
        bad_habits_count = habit_stats.get("bad_habits_count", 0)
        if bad_habits_count > 0:
            avg_clean = habit_stats.get("bad_habits_total_clean_days", 0) / max(1, bad_habits_count)
            lines.append(
                f"You're averaging **{avg_clean:.0f} clean days** across {bad_habits_count} habit{'s' if bad_habits_count != 1 else ''} you're avoiding."
            )
        
        lines.append("")
    
    # Goals Section
    goal_stats = stats.get("goal_stats", {})
    total_goals = goal_stats.get("total_goals", 0)
    
    if total_goals > 0:
        lines.append("## Goals & Milestones")
        
        goals_in_progress = goal_stats.get("goals_in_progress", 0)
        avg_progress = 0.0
        if total_goals > 0:
            avg_progress = goal_stats.get("total_progress", 0) / total_goals
        milestones_completed = goal_stats.get("milestones_completed_this_week", 0)
        milestones_pending = goal_stats.get("milestones_pending", 0)
        
        lines.append(
            f"You have **{goals_in_progress} goal{'s' if goals_in_progress != 1 else ''} in progress** "
            f"with an average completion of **{avg_progress:.0f}%**."
        )
        
        if milestones_completed > 0:
            lines.append(
                f"This week, you completed **{milestones_completed} milestone{'s' if milestones_completed != 1 else ''}**."
            )
        
        if milestones_pending > 0:
            lines.append(
                f"You have **{milestones_pending} milestone{'s' if milestones_pending != 1 else ''} pending** for this sprint."
            )
        
        lines.append("")
    
    # Focus Time Section
    timer_stats = stats.get("timer_stats", {})
    sessions_total = timer_stats.get("sessions_total", 0)
    
    if sessions_total > 0:
        lines.append("## Focus Time")
        
        focus_minutes = timer_stats.get("focus_minutes", 0)
        focus_duration = _format_duration_prose(focus_minutes)
        profile_usage = timer_stats.get("profile_usage", {})
        
        lines.append(
            f"You logged **{sessions_total} timer session{'s' if sessions_total != 1 else ''}** this week, "
            f"totaling **{focus_duration}** of focused work."
        )
        
        peak_day, peak_minutes = _productivity_peak_day(timer_stats)
        if peak_minutes > 0:
            peak_duration = _format_duration_prose(peak_minutes)
            lines.append(
                f"Your most productive day was {peak_day} with **{peak_duration}**."
            )
        
        if profile_usage:
            top_profile = max(profile_usage.items(), key=lambda x: x[1])[0]
            lines.append(f"Your preferred timer profile is \"{top_profile}\".")
        
        lines.append("")
    
    # Quality Section
    quality_counts = stats.get("quality_counts", {})
    
    if quality_counts:
        lines.append("## Quality & Consistency")
        
        # Calculate average quality
        total_count = sum(quality_counts.values())
        weighted_sum = sum(float(k) * v for k, v in quality_counts.items() if str(k).replace(".", "").isdigit())
        avg_quality = weighted_sum / total_count if total_count > 0 else 0
        
        lines.append(
            f"Your completion quality averages **{avg_quality:.1f} out of 5** across all tasks."
        )
        
        # Note about quality distribution
        best_quality = max(quality_counts.items(), key=lambda x: float(x[0]) if str(x[0]).replace(".", "").isdigit() else 0)
        if best_quality:
            lines.append(
                f"Most of your completions were rated **{best_quality[0]}** ({best_quality[1]} task{'s' if best_quality[1] != 1 else ''})."
            )
        
        lines.append("")
    
    # Footer
    lines.append("---")
    lines.append("*Next sync: Tomorrow at 6:00 AM*")
    
    return "\n".join(lines) + "\n"


def _write_digest(stats: Dict[str, Any]) -> None:
    """Write natural language performance report."""
    narrative = _generate_narrative(stats)
    with open(TRENDS_MD_PATH, "w", encoding="utf-8") as fh:
        fh.write(narrative)


def _format_counts(counts: Dict[str, int], limit: int = 8) -> str:
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    sliced = ordered[:limit]
    rendered = ", ".join(f"{key}={value}" for key, value in sliced)
    if len(ordered) > limit:
        rendered = f"{rendered}, ..."
    return rendered


def build_trends_report(registry: Dict[str, Any]) -> None:
    ensure_data_home()
    _ensure_memory(registry)
    entry = registry.get("databases", {}).get("trends")
    if not entry:
        entry = update_database_entry(registry, "trends")
    target_path = entry.get("path")
    if not target_path:
        raise ValueError("Trends database path is not configured.")
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    tmp_path = f"{target_path}.tmp"
    if os.path.exists(tmp_path):
        os.remove(tmp_path)

    # Collect all stats
    stats = _fetch_memory_stats()
    stats["habit_stats"] = _fetch_habit_stats()
    stats["goal_stats"] = _fetch_goal_stats()
    stats["timer_stats"] = _fetch_timer_stats()
    
    # Get adherence stats from memory DB cursor
    conn_mem = sqlite3.connect(MEMORY_DB_PATH)
    cursor_mem = conn_mem.cursor()
    stats["adherence_stats"] = _compute_adherence_stats(cursor_mem)
    conn_mem.close()

    conn = sqlite3.connect(tmp_path)
    try:
        _create_schema(conn)
        _insert_metrics(conn, stats)
        conn.commit()
    except Exception as exc:
        conn.rollback()
        conn.close()
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        update_database_entry(
            registry,
            "trends",
            last_attempt=_timestamp(),
            status="error",
            notes=str(exc),
        )
        raise
    else:
        conn.close()
        os.replace(tmp_path, target_path)
        _write_digest(stats)
        update_database_entry(
            registry,
            "trends",
            last_sync=_timestamp(),
            status="ready",
            records=len(stats),
            notes="",
        )
        update_database_entry(
            registry,
            "trends_digest",
            last_sync=_timestamp(),
            status="ready",
            records=1,
            notes="Digest refreshed",
        )


def sync_trends() -> None:
    registry = load_registry()
    build_trends_report(registry)
