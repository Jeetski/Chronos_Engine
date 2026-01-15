import os
import sqlite3
from datetime import datetime
from typing import Dict, Any, List

import yaml

from Modules.Sequence.registry import ensure_data_home, update_database_entry, load_registry

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
USER_DIR = os.path.join(ROOT_DIR, "User")
LOGS_DIR = os.path.join(USER_DIR, "Logs")
LISTENER_LOG = os.path.join(LOGS_DIR, "listener.log")
DATA_DIR = os.path.join(USER_DIR, "Data")
EVENTS_DB_PATH = os.path.join(DATA_DIR, "chronos_events.db")


def _timestamp() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _parse_listener_log() -> List[Dict[str, Any]]:
    if not os.path.exists(LISTENER_LOG):
        return []
    events: List[Dict[str, Any]] = []
    with open(LISTENER_LOG, "r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            line = line.strip()
            if not line.startswith("[") or "]" not in line:
                continue
            ts, message = line.split("]", 1)
            events.append(
                {
                    "timestamp": ts.lstrip("["),
                    "event_type": "listener",
                    "message": message.strip(),
                    "payload": {"source": "listener.log"},
                }
            )
    return events


def _collect_command_runs(registry: Dict[str, Any]) -> List[Dict[str, Any]]:
    databases = registry.get("databases") or {}
    runs: List[Dict[str, Any]] = []
    for key, meta in databases.items():
        ts = meta.get("last_sync") or meta.get("last_attempt")
        if not ts:
            continue
        runs.append(
            {
                "timestamp": ts,
                "command": "sequence sync",
                "target": key,
                "status": meta.get("status", "unknown"),
                "records": meta.get("records", 0),
                "notes": meta.get("notes"),
            }
        )
    return runs


def _collect_trigger_logs() -> List[Dict[str, Any]]:
    triggers: List[Dict[str, Any]] = []
    for filename in os.listdir(LOGS_DIR):
        if not filename.lower().startswith("conflict_log_"):
            continue
        path = os.path.join(LOGS_DIR, filename)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or {}
        except Exception:
            continue
        parts = filename.replace("conflict_log_", "").split(".")[0]
        triggers.append(
            {
                "timestamp": parts,
                "trigger_type": "conflict_log",
                "name": filename,
                "payload": data,
            }
        )
    return triggers


def _create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS events;
        DROP TABLE IF EXISTS command_runs;
        DROP TABLE IF EXISTS trigger_log;

        CREATE TABLE events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            event_type TEXT,
            message TEXT,
            payload_json TEXT
        );

        CREATE TABLE command_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            command TEXT,
            target TEXT,
            status TEXT,
            records INTEGER,
            notes TEXT
        );

        CREATE TABLE trigger_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            trigger_type TEXT,
            name TEXT,
            payload_json TEXT
        );
        """
    )


def _insert_events(conn: sqlite3.Connection, events: List[Dict[str, Any]]) -> None:
    for event in events:
        conn.execute(
            """
            INSERT INTO events (timestamp, event_type, message, payload_json)
            VALUES (?, ?, ?, ?)
            """,
            (
                event.get("timestamp"),
                event.get("event_type"),
                event.get("message"),
                yaml.safe_dump(event.get("payload") or {}, sort_keys=True),
            ),
        )


def _insert_command_runs(conn: sqlite3.Connection, runs: List[Dict[str, Any]]) -> None:
    for run in runs:
        conn.execute(
            """
            INSERT INTO command_runs (timestamp, command, target, status, records, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                run.get("timestamp"),
                run.get("command"),
                run.get("target"),
                run.get("status"),
                run.get("records"),
                run.get("notes"),
            ),
        )


def _insert_triggers(conn: sqlite3.Connection, triggers: List[Dict[str, Any]]) -> None:
    for entry in triggers:
        conn.execute(
            """
            INSERT INTO trigger_log (timestamp, trigger_type, name, payload_json)
            VALUES (?, ?, ?, ?)
            """,
            (
                entry.get("timestamp"),
                entry.get("trigger_type"),
                entry.get("name"),
                yaml.safe_dump(entry.get("payload") or {}, sort_keys=True),
            ),
        )


def build_events_db(registry: Dict[str, Any]) -> None:
    ensure_data_home()
    entry = registry.get("databases", {}).get("events")
    if not entry:
        entry = update_database_entry(registry, "events")
    target_path = entry.get("path")
    if not target_path:
        raise ValueError("Events database path is not configured.")
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    tmp_path = f"{target_path}.tmp"
    if os.path.exists(tmp_path):
        os.remove(tmp_path)

    listener_events = _parse_listener_log()
    command_runs = _collect_command_runs(registry)
    trigger_logs = _collect_trigger_logs()

    conn = sqlite3.connect(tmp_path)
    try:
        _create_schema(conn)
        _insert_events(conn, listener_events)
        _insert_command_runs(conn, command_runs)
        _insert_triggers(conn, trigger_logs)
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
            "events",
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
            "events",
            last_sync=_timestamp(),
            status="ready",
            records=len(listener_events),
            notes="",
        )


def sync_events_db() -> None:
    registry = load_registry()
    build_events_db(registry)
