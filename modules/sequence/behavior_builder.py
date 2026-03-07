import os
import sqlite3
from datetime import datetime
from typing import Dict, Any, List

from modules.sequence.registry import ensure_data_home, update_database_entry, load_registry
from modules.sequence.core_builder import build_core_db

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
USER_DIR = os.path.join(ROOT_DIR, "user")
DATA_DIR = os.path.join(USER_DIR, "Data")
CORE_DB_PATH = os.path.join(DATA_DIR, "chronos_core.db")
BEHAVIOR_DB_PATH = os.path.join(DATA_DIR, "chronos_behavior.db")


def _timestamp() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _ensure_core(registry: Dict[str, Any]) -> None:
    if not os.path.exists(CORE_DB_PATH):
        build_core_db(registry)


def _read_core_tables() -> Dict[str, List[Any]]:
    conn = sqlite3.connect(CORE_DB_PATH)
    conn.row_factory = sqlite3.Row
    schedules = conn.execute(
        """
        SELECT schedule_date, name, type, item_slug, item_type, parent_slug, block_key,
               start_time, end_time, duration_minutes, status, importance_score,
               is_parallel, depth, order_index, raw_json
        FROM schedules
        """
    ).fetchall()
    try:
        completions_rows = conn.execute(
            """
            SELECT block_key, source_date, name, item_slug, item_type, status,
                   quality, scheduled_start, scheduled_end, actual_start, actual_end,
                   logged_at, note, raw_json
            FROM completions
            ORDER BY logged_at DESC
            """
        ).fetchall()
        completions = [dict(row) for row in completions_rows]
    except sqlite3.OperationalError:
        completions_rows = conn.execute(
            """
            SELECT block_key, source_date, name, item_slug, item_type, status,
                   scheduled_start, scheduled_end, actual_start, actual_end,
                   logged_at, note, raw_json
            FROM completions
            ORDER BY logged_at DESC
            """
        ).fetchall()
        completions = []
        for row in completions_rows:
            entry = dict(row)
            entry["quality"] = None
            completions.append(entry)
    conn.close()
    return {
        "schedules": schedules,
        "completions": completions,
    }


def _variance_minutes(plan_start: Any, plan_end: Any, actual_start: Any, actual_end: Any) -> int:
    try:
        if plan_start and actual_start:
            plan = datetime.fromisoformat(str(plan_start))
            actual = datetime.fromisoformat(str(actual_start))
            return int((actual - plan).total_seconds() / 60)
    except Exception:
        pass
    return 0


def _prepare_activity_facts(schedules: List[sqlite3.Row], completions: List[Any]) -> List[Dict[str, Any]]:
    completion_index: Dict[str, sqlite3.Row] = {}
    for entry in completions:
        key = entry["block_key"]
        if key and key not in completion_index:
            completion_index[key] = entry

    facts: List[Dict[str, Any]] = []
    for schedule in schedules:
        block_key = schedule["block_key"]
        completion = completion_index.get(block_key) if block_key else None
        planned_start = schedule["start_time"]
        planned_end = schedule["end_time"]
        actual_start = completion["actual_start"] if completion else None
        actual_end = completion["actual_end"] if completion else None
        status = (completion["status"] if completion else schedule["status"]) or "pending"
        completion_quality = completion["quality"] if completion else None
        completion_json = completion["raw_json"] if completion else None
        facts.append(
            {
                "schedule_date": schedule["schedule_date"],
                "block_key": block_key,
                "name": schedule["name"],
                "item_slug": schedule["item_slug"],
                "item_type": schedule["item_type"],
                "planned_start": planned_start,
                "planned_end": planned_end,
                "actual_start": actual_start,
                "actual_end": actual_end,
                "planned_minutes": schedule["duration_minutes"],
                "importance_score": schedule["importance_score"],
                "status": status,
                "depth": schedule["depth"],
                "order_index": schedule["order_index"],
                "variance_minutes": _variance_minutes(planned_start, planned_end, actual_start, actual_end),
                "completion_quality": completion_quality,
                "completion_json": completion_json,
            }
        )
    return facts


def _create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS activity_facts;

        CREATE TABLE activity_facts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_date TEXT,
            block_key TEXT,
            name TEXT,
            item_slug TEXT,
            item_type TEXT,
            planned_start TEXT,
            planned_end TEXT,
            actual_start TEXT,
            actual_end TEXT,
            planned_minutes INTEGER,
            importance_score REAL,
            status TEXT,
            depth INTEGER,
            order_index INTEGER,
            variance_minutes INTEGER,
            completion_quality TEXT,
            completion_json TEXT
        );
        CREATE INDEX idx_activity_date ON activity_facts(schedule_date);
        """
    )


def _insert_activity_facts(conn: sqlite3.Connection, facts: List[Dict[str, Any]]) -> None:
    for fact in facts:
        conn.execute(
            """
            INSERT INTO activity_facts (
                schedule_date, block_key, name, item_slug, item_type,
                planned_start, planned_end, actual_start, actual_end,
                planned_minutes, importance_score, status, depth,
                order_index, variance_minutes, completion_quality, completion_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fact["schedule_date"],
                fact["block_key"],
                fact["name"],
                fact["item_slug"],
                fact["item_type"],
                fact["planned_start"],
                fact["planned_end"],
                fact["actual_start"],
                fact["actual_end"],
                fact["planned_minutes"],
                fact["importance_score"],
                fact["status"],
                fact["depth"],
                fact["order_index"],
                fact["variance_minutes"],
                fact.get("completion_quality"),
                fact.get("completion_json"),
            ),
        )


def build_behavior_db(registry: Dict[str, Any]) -> None:
    ensure_data_home()
    _ensure_core(registry)

    entry = registry.get("databases", {}).get("behavior")
    if not entry:
        entry = update_database_entry(registry, "behavior")
    target_path = entry.get("path")
    if not target_path:
        raise ValueError("Behavior database path is not configured.")

    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    tmp_path = f"{target_path}.tmp"
    if os.path.exists(tmp_path):
        os.remove(tmp_path)

    core_data = _read_core_tables()
    facts = _prepare_activity_facts(core_data["schedules"], core_data["completions"])

    conn = sqlite3.connect(tmp_path)
    try:
        _create_schema(conn)
        _insert_activity_facts(conn, facts)
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
            "behavior",
            last_attempt=_timestamp(),
            status="error",
            notes=str(exc),
        )
        raise
    else:
        conn.close()
        os.replace(tmp_path, target_path)
        update_database_entry(
            registry,
            "behavior",
            last_sync=_timestamp(),
            status="ready",
            records=len(facts),
            notes="",
        )


def sync_behavior_db() -> None:
    registry = load_registry()
    build_behavior_db(registry)

