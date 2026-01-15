import os
from datetime import datetime
from typing import Dict, Any, List

import yaml

# Paths
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
USER_DIR = os.path.join(ROOT_DIR, "User")
DATA_DIR = os.path.join(USER_DIR, "Data")
REGISTRY_PATH = os.path.join(DATA_DIR, "databases.yml")


def _db_path(filename: str) -> str:
    return os.path.join(DATA_DIR, filename)


DEFAULT_DATABASES: Dict[str, Dict[str, Any]] = {
    "matrix": {
        "name": "Matrix Cache",
        "filename": "chronos_matrix.db",
        "type": "sqlite",
        "description": "Lightweight cache for dashboard analytics and cockpit matrix presets.",
    },
    "core": {
        "name": "Chronos Core",
        "filename": "chronos_core.db",
        "type": "sqlite",
        "description": "Structured mirror of YAML items plus relations for fast lookups.",
    },
    "events": {
        "name": "Event Log",
        "filename": "chronos_events.db",
        "type": "sqlite",
        "description": "Command/event log for automation triggers and retrospectives.",
    },
    "memory": {
        "name": "Behavioral Memory",
        "filename": "chronos_memory.db",
        "type": "sqlite",
        "description": "Schedule adherence, status snapshots, and qualitative notes.",
    },
    "trends": {
        "name": "Trends Warehouse",
        "filename": "chronos_trends.db",
        "type": "sqlite",
        "description": "Aggregated metastudy metrics derived from memory/events.",
    },
    "trends_digest": {
        "name": "Behavior Trends Digest",
        "filename": "trends.md",
        "type": "markdown",
        "description": "Human-readable summary consumed by pilots and agents.",
    },
}


def _timestamp() -> str:
    return datetime.now().isoformat(timespec="seconds")


def ensure_data_home() -> str:
    os.makedirs(DATA_DIR, exist_ok=True)
    return DATA_DIR


def _default_entry(key: str, meta: Dict[str, Any]) -> Dict[str, Any]:
    entry = {
        "key": key,
        "name": meta.get("name", key),
        "path": _db_path(meta["filename"]),
        "filename": meta["filename"],
        "type": meta.get("type", "sqlite"),
        "description": meta.get("description"),
        "status": "pending",
        "last_sync": None,
        "last_attempt": None,
        "records": 0,
        "notes": None,
        "version": 1,
    }
    return entry


def _bootstrap_registry() -> Dict[str, Any]:
    ensure_data_home()
    registry = {
        "version": 1,
        "generated_at": _timestamp(),
        "databases": {},
    }
    for key, meta in DEFAULT_DATABASES.items():
        registry["databases"][key] = _default_entry(key, meta)
    return registry


def _write_registry(payload: Dict[str, Any]) -> None:
    ensure_data_home()
    with open(REGISTRY_PATH, "w", encoding="utf-8") as fh:
        yaml.safe_dump(payload, fh, sort_keys=True)


def load_registry() -> Dict[str, Any]:
    ensure_data_home()
    if os.path.exists(REGISTRY_PATH):
        with open(REGISTRY_PATH, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
    else:
        data = _bootstrap_registry()
        _write_registry(data)
        return data

    if "databases" not in data or not isinstance(data["databases"], dict):
        data["databases"] = {}

    updated = False
    for key, meta in DEFAULT_DATABASES.items():
        if key not in data["databases"]:
            data["databases"][key] = _default_entry(key, meta)
            updated = True
        else:
            entry = data["databases"][key]
            if "path" not in entry:
                entry["path"] = _db_path(meta["filename"])
                updated = True
            if "filename" not in entry:
                entry["filename"] = meta["filename"]
                updated = True
            if "type" not in entry:
                entry["type"] = meta.get("type", "sqlite")
                updated = True
            if "version" not in entry:
                entry["version"] = 1
                updated = True

    if updated:
        _write_registry(data)
    return data


def save_registry(registry: Dict[str, Any]) -> None:
    _write_registry(registry)


def update_database_entry(registry: Dict[str, Any], key: str, **updates: Any) -> Dict[str, Any]:
    if "databases" not in registry:
        registry["databases"] = {}
    entry = registry["databases"].get(key)
    if not entry:
        meta = DEFAULT_DATABASES.get(key, {"filename": f"{key}.db"})
        entry = _default_entry(key, meta)
        registry["databases"][key] = entry
    entry.update({k: v for k, v in updates.items() if v is not None})
    registry["databases"][key] = entry
    save_registry(registry)
    return entry


def describe_registry(registry: Dict[str, Any]) -> List[str]:
    if not registry:
        return ["No registry data found."]
    databases = registry.get("databases") or {}
    if not databases:
        return ["No databases registered yet."]

    lines: List[str] = []
    for key in sorted(databases.keys()):
        entry = databases[key] or {}
        name = entry.get("name") or key
        status = entry.get("status") or "pending"
        last_sync = entry.get("last_sync") or entry.get("last_attempt") or "never"
        path = entry.get("path") or entry.get("filename")
        lines.append(f"- {name} [{key}]")
        lines.append(f"  status     : {status}")
        lines.append(f"  last sync  : {last_sync}")
        if entry.get("records") is not None:
            lines.append(f"  records    : {entry.get('records')}")
        if entry.get("description"):
            lines.append(f"  details    : {entry.get('description')}")
        if path:
            lines.append(f"  path       : {path}")
        if entry.get("notes"):
            lines.append(f"  notes      : {entry.get('notes')}")
    return lines
