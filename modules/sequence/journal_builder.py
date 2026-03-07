import os
import sqlite3
from datetime import datetime
from typing import Dict, Any, List

import yaml

from modules.sequence.registry import ensure_data_home, update_database_entry, load_registry
from modules.sequence.behavior_builder import build_behavior_db
from modules.scheduler import status_current_path

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
USER_DIR = os.path.join(ROOT_DIR, "User")
DATA_DIR = os.path.join(USER_DIR, "Data")
BEHAVIOR_DB_PATH = os.path.join(DATA_DIR, "chronos_behavior.db")
JOURNAL_DB_PATH = os.path.join(DATA_DIR, "chronos_journal.db")
CURRENT_STATUS_PATH = status_current_path()


def _timestamp() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _ensure_behavior(registry: Dict[str, Any]) -> None:
    if not os.path.exists(BEHAVIOR_DB_PATH):
        build_behavior_db(registry)


def _load_current_status() -> Dict[str, Any]:
    if not os.path.exists(CURRENT_STATUS_PATH):
        return {}
    try:
        with open(CURRENT_STATUS_PATH, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
    except Exception:
        return {}
    if isinstance(data, dict) and "current_status" in data:
        return data["current_status"] or {}
    return data if isinstance(data, dict) else {}


def _fetch_behavior_summary() -> Dict[str, Any]:
    if not os.path.exists(BEHAVIOR_DB_PATH):
        return {"total": 0, "completed": 0}
    conn = sqlite3.connect(BEHAVIOR_DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT status
        FROM activity_facts
        """
    ).fetchall()
    conn.close()
    total = len(rows)
    completed = sum(1 for row in rows if (row["status"] or "").lower() == "completed")
    return {"total": total, "completed": completed}


def _create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS status_snapshots;
        DROP TABLE IF EXISTS narratives;
        DROP TABLE IF EXISTS reinforcements;

        CREATE TABLE status_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            payload_json TEXT
        );

        CREATE TABLE narratives (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            title TEXT,
            body TEXT
        );

        CREATE TABLE reinforcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            name TEXT,
            payload_json TEXT
        );
        """
    )


def _insert_status_snapshot(conn: sqlite3.Connection, payload: Dict[str, Any]) -> None:
    conn.execute(
        """
        INSERT INTO status_snapshots (timestamp, payload_json)
        VALUES (?, ?)
        """,
        (_timestamp(), yaml.safe_dump(payload or {}, sort_keys=True)),
    )


def _insert_narrative(conn: sqlite3.Connection, summary: Dict[str, Any]) -> None:
    total = summary.get("total", 0)
    completed = summary.get("completed", 0)
    completion_rate = 0 if total == 0 else round((completed / total) * 100, 1)
    body = [
        f"- Total blocks captured: {total}",
        f"- Completed blocks: {completed}",
        f"- Completion rate: {completion_rate}%",
    ]
    conn.execute(
        """
        INSERT INTO narratives (timestamp, title, body)
        VALUES (?, ?, ?)
        """,
        (_timestamp(), "Daily Behavior Snapshot", "\n".join(body)),
    )


def build_journal_db(registry: Dict[str, Any]) -> None:
    ensure_data_home()
    _ensure_behavior(registry)

    entry = registry.get("databases", {}).get("journal")
    if not entry:
        entry = update_database_entry(registry, "journal")
    target_path = entry.get("path")
    if not target_path:
        raise ValueError("Journal database path is not configured.")

    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    tmp_path = f"{target_path}.tmp"
    if os.path.exists(tmp_path):
        os.remove(tmp_path)

    status_payload = _load_current_status()
    summary = _fetch_behavior_summary()

    conn = sqlite3.connect(tmp_path)
    try:
        _create_schema(conn)
        if status_payload:
            _insert_status_snapshot(conn, status_payload)
        _insert_narrative(conn, summary)
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
            "journal",
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
            "journal",
            last_sync=_timestamp(),
            status="ready",
            records=1,
            notes="",
        )


def sync_journal_db() -> None:
    registry = load_registry()
    build_journal_db(registry)
