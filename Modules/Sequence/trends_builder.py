import json
import os
import sqlite3
from datetime import datetime
from typing import Dict, Any, Tuple

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
        ("blocks_total", stats["blocks_total"], "count", None),
        ("blocks_completed", stats["blocks_completed"], "count", None),
        ("blocks_completion_rate", _completion_rate(stats), "percent", None),
        ("blocks_avg_variance_minutes", stats["average_variance"], "minutes", None),
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
    for metric, value, unit, extra in rows:
        conn.execute(
            "INSERT INTO metrics (metric, value, unit, extra_json, generated_at) VALUES (?, ?, ?, ?, ?)",
            (metric, value, unit, extra, generated_at),
        )


def _completion_rate(stats: Dict[str, Any]) -> float:
    total = stats["blocks_total"]
    completed = stats["blocks_completed"]
    if not total:
        return 0.0
    return round((completed / total) * 100, 1)


def _write_digest(stats: Dict[str, Any]) -> None:
    completion_rate = _completion_rate(stats)
    lines = [
        "# Chronos Trends Digest",
        "",
        f"Generated at: {_timestamp()}",
        "",
        f"- Total blocks tracked: {stats['blocks_total']}",
        f"- Completed blocks: {stats['blocks_completed']}",
        f"- Completion rate: {completion_rate}%",
        f"- Average start variance: {round(stats['average_variance'], 2)} minutes",
    ]
    quality_counts = stats.get("quality_counts") or {}
    if quality_counts:
        breakdown = _format_counts(quality_counts)
        lines.append(f"- Quality breakdown: {breakdown}")
    custom_property_counts = stats.get("custom_property_counts") or {}
    if custom_property_counts:
        breakdown = _format_counts(custom_property_counts)
        lines.append(f"- Custom completion properties: {breakdown}")
    with open(TRENDS_MD_PATH, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


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

    stats = _fetch_memory_stats()

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
