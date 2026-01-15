import json
import os
import sqlite3
from collections import defaultdict
from datetime import datetime
from typing import Dict, Any, Iterable, List, Tuple, Optional

import yaml

from Modules.ItemManager import get_user_dir, get_item_path
from Modules.Sequence.registry import (
    ensure_data_home,
    update_database_entry,
    load_registry,
)
from Modules.Scheduler import build_block_key, schedule_path_for_date  # type: ignore
from Utilities.duration_parser import parse_duration_string  # type: ignore

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
USER_DIR = get_user_dir()
SCHEDULE_PATH = schedule_path_for_date(datetime.now())
COMPLETIONS_DIR = os.path.join(USER_DIR, "Schedules", "completions")

SKIP_DIRS = {
    "settings",
    "profile",
    "schedules",
    "logs",
    "data",
    "exports",
    "ideas",
    "scripts",
    "temp",
}


def _timestamp() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _slugify(value: str) -> str:
    if not value:
        return ""
    return str(value).strip().lower()


def _item_slug(item_type: Optional[str], name: Optional[str]) -> str:
    if not item_type or not name:
        return ""
    return f"{_slugify(item_type)}::{_slugify(name)}"


def _infer_type_from_dir(dir_name: str) -> str:
    slug = dir_name.replace(" ", "_").lower()
    if slug.endswith("ies"):
        slug = slug[:-3] + "y"
    elif slug.endswith("s"):
        slug = slug[:-1]
    return slug


def _normalize_tags(raw) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(value).strip() for value in raw if value is not None]
    return [str(raw).strip()]


def _duration_minutes(value) -> int:
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    try:
        parsed = parse_duration_string(str(value))
        if parsed is not None:
            return int(parsed)
    except Exception:
        pass
    try:
        return int(float(value))
    except Exception:
        return 0


def _to_serializable(value):
    if isinstance(value, dict):
        return {
            key: _to_serializable(val)
            for key, val in value.items()
            if key != "parent"
        }
    if isinstance(value, list):
        return [_to_serializable(entry) for entry in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _safe_json(payload: Any) -> str:
    return json.dumps(_to_serializable(payload), ensure_ascii=False, default=str)


def _walk_item_files() -> Iterable[Tuple[str, str]]:
    for root, dirs, files in os.walk(USER_DIR):
        relative = os.path.relpath(root, USER_DIR)
        if relative == ".":
            dirs[:] = [d for d in dirs if d.lower() not in SKIP_DIRS]
            continue
        top = relative.split(os.sep)[0]
        if top.lower() in SKIP_DIRS:
            dirs[:] = []
            continue
        for filename in files:
            if not filename.lower().endswith((".yml", ".yaml")):
                continue
            yield os.path.join(root, filename), relative


def _collect_items() -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    for path, relative in _walk_item_files():
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or {}
        except Exception:
            continue

        if not isinstance(data, dict):
            continue

        name = data.get("name") or os.path.splitext(os.path.basename(path))[0]
        item_type = data.get("type") or _infer_type_from_dir(relative.split(os.sep)[0])
        if not item_type:
            continue

        slug = _item_slug(item_type, name)
        stat = os.stat(path)
        created_at = datetime.fromtimestamp(stat.st_ctime).isoformat(timespec="seconds")
        updated_at = datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds")
        tags = _normalize_tags(data.get("tags"))
        record = {
            "slug": slug,
            "name": name,
            "type": item_type,
            "category": data.get("category"),
            "status": data.get("status"),
            "priority": data.get("priority"),
            "due_date": data.get("due_date"),
            "duration_minutes": _duration_minutes(data.get("duration")),
            "points_value": float(data.get("points") or 0),
            "tags": tags,
            "path": path,
            "relative_path": os.path.relpath(path, ROOT_DIR),
            "created_at": created_at,
            "updated_at": updated_at,
            "raw": data,
        }
        records.append(record)
    return records


def _ensure_unique_slugs(records: List[Dict[str, Any]]) -> None:
    counts: Dict[str, int] = {}
    for record in records:
        slug = record.get("slug")
        if not slug:
            continue
        counts[slug] = counts.get(slug, 0) + 1
        if counts[slug] > 1:
            record["slug"] = f"{slug}#{counts[slug]}"


def _collect_relations(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    relations: List[Dict[str, Any]] = []
    for record in records:
        data = record["raw"]
        for key in ("children", "sequence"):
            nodes = data.get(key)
            if not isinstance(nodes, list):
                continue
            for index, entry in enumerate(nodes):
                if isinstance(entry, dict):
                    child_type = entry.get("type")
                    child_name = entry.get("name")
                else:
                    child_type = None
                    child_name = entry
                slug = _item_slug(child_type, child_name)
                relations.append(
                    {
                        "parent_slug": record["slug"],
                        "child_slug": slug,
                        "child_name": child_name,
                        "child_type": child_type,
                        "relation_type": key,
                        "order_index": index,
                    }
                )
    return relations


def _parse_completion_file(path: str, name_index: Dict[str, str], type_lookup: Dict[str, str]) -> List[Dict[str, Any]]:
    completions: List[Dict[str, Any]] = []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            raw = yaml.safe_load(fh) or {}
    except Exception:
        return completions
    entries = raw.get("entries") if isinstance(raw, dict) else None
    if not isinstance(entries, dict):
        return completions
    source_date = os.path.splitext(os.path.basename(path))[0]
    for key, payload in entries.items():
        entry = payload if isinstance(payload, dict) else {"status": payload}
        block_key = key
        block_name = entry.get("name")
        scheduled_start = entry.get("scheduled_start")
        if "@" in block_key:
            parts = block_key.rsplit("@", 1)
            block_name = block_name or parts[0]
            scheduled_start = scheduled_start or parts[1]
        block_name = block_name or block_key
        slug = ""
        matched_type = None
        candidates = name_index.get(_slugify(block_name))
        if candidates:
            slug = candidates
            matched_type = type_lookup.get(slug)
        completions.append(
            {
                "source_date": source_date,
                "block_key": block_key,
                "name": block_name,
                "item_slug": slug,
                "item_type": matched_type,
                "status": entry.get("status"),
                "quality": entry.get("quality"),
                "scheduled_start": scheduled_start,
                "scheduled_end": entry.get("scheduled_end"),
                "actual_start": entry.get("actual_start"),
                "actual_end": entry.get("actual_end"),
                "logged_at": entry.get("logged_at"),
                "note": entry.get("note"),
                "raw": entry,
            }
        )
    return completions


def _collect_completions(name_index: Dict[str, str], type_lookup: Dict[str, str]) -> List[Dict[str, Any]]:
    if not os.path.isdir(COMPLETIONS_DIR):
        return []
    completions: List[Dict[str, Any]] = []
    for filename in os.listdir(COMPLETIONS_DIR):
        if not filename.lower().endswith(".yml"):
            continue
        path = os.path.join(COMPLETIONS_DIR, filename)
        completions.extend(_parse_completion_file(path, name_index, type_lookup))
    return completions


def _flatten_schedule(items: List[Dict[str, Any]], *, depth=0, parent_slug="") -> Iterable[Dict[str, Any]]:
    for index, entry in enumerate(items):
        name = entry.get("name", "Unnamed")
        item_type = entry.get("type")
        slug = _item_slug(item_type, name)
        start_time = entry.get("start_time")
        if isinstance(start_time, datetime):
            start_iso = start_time.isoformat()
            schedule_date = start_time.date().isoformat()
        else:
            start_iso = str(start_time) if start_time else None
            schedule_date = None
        end_time = entry.get("end_time")
        end_iso = end_time.isoformat() if isinstance(end_time, datetime) else str(end_time) if end_time else None
        block_key = build_block_key(name, entry.get("start_time"))
        yield {
            "schedule_date": schedule_date,
            "name": name,
            "type": item_type,
            "item_slug": slug,
            "parent_slug": parent_slug,
            "block_key": block_key,
            "start_time": start_iso,
            "end_time": end_iso,
            "duration_minutes": entry.get("duration"),
            "status": entry.get("status"),
            "importance_score": entry.get("importance_score"),
            "is_parallel": bool(entry.get("is_parallel_item")),
            "depth": depth,
            "order_index": index,
            "raw": entry,
        }
        children = entry.get("children") or []
        if isinstance(children, list) and children:
            yield from _flatten_schedule(children, depth=depth + 1, parent_slug=slug or parent_slug)


def _collect_schedule_entries(name_index: Dict[str, str], type_lookup: Dict[str, str]) -> List[Dict[str, Any]]:
    if not os.path.exists(SCHEDULE_PATH):
        return []
    try:
        with open(SCHEDULE_PATH, "r", encoding="utf-8") as fh:
            schedule = yaml.safe_load(fh) or []
    except Exception:
        return []
    if not isinstance(schedule, list):
        return []
    entries: List[Dict[str, Any]] = []
    fallback_date = datetime.now().date().isoformat()
    for record in _flatten_schedule(schedule):
        slug = record["item_slug"]
        if not slug and record["name"]:
            candidate = name_index.get(_slugify(record["name"]))
            if candidate:
                slug = candidate
        record["item_slug"] = slug
        record["item_type"] = type_lookup.get(slug) if slug else record.get("type")
        record["schedule_date"] = record["schedule_date"] or fallback_date
        entries.append(record)
    return entries


def _create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS items;
        DROP TABLE IF EXISTS relations;
        DROP TABLE IF EXISTS completions;
        DROP TABLE IF EXISTS schedules;

        CREATE TABLE items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE,
            name TEXT,
            type TEXT,
            category TEXT,
            status TEXT,
            priority TEXT,
            due_date TEXT,
            duration_minutes INTEGER,
            points_value REAL,
            tags TEXT,
            path TEXT,
            relative_path TEXT,
            created_at TEXT,
            updated_at TEXT,
            raw_json TEXT
        );
        CREATE INDEX idx_items_type ON items(type);
        CREATE INDEX idx_items_status ON items(status);

        CREATE TABLE relations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER,
            child_id INTEGER,
            parent_slug TEXT,
            child_slug TEXT,
            child_name TEXT,
            child_type TEXT,
            relation_type TEXT,
            order_index INTEGER,
            FOREIGN KEY(parent_id) REFERENCES items(id) ON DELETE CASCADE,
            FOREIGN KEY(child_id) REFERENCES items(id) ON DELETE SET NULL
        );
        CREATE INDEX idx_rel_parent ON relations(parent_slug);

        CREATE TABLE completions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            block_key TEXT,
            source_date TEXT,
            name TEXT,
            item_slug TEXT,
            item_type TEXT,
            status TEXT,
            quality TEXT,
            scheduled_start TEXT,
            scheduled_end TEXT,
            actual_start TEXT,
            actual_end TEXT,
            logged_at TEXT,
            note TEXT,
            raw_json TEXT
        );
        CREATE INDEX idx_completions_date ON completions(source_date);
        CREATE INDEX idx_completions_slug ON completions(item_slug);

        CREATE TABLE schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_date TEXT,
            name TEXT,
            type TEXT,
            item_slug TEXT,
            item_type TEXT,
            parent_slug TEXT,
            block_key TEXT,
            start_time TEXT,
            end_time TEXT,
            duration_minutes INTEGER,
            status TEXT,
            importance_score REAL,
            is_parallel INTEGER,
            depth INTEGER,
            order_index INTEGER,
            raw_json TEXT
        );
        CREATE INDEX idx_schedules_date ON schedules(schedule_date);
        CREATE INDEX idx_schedules_slug ON schedules(item_slug);
        """
    )


def _insert_items(conn: sqlite3.Connection, records: List[Dict[str, Any]]) -> Dict[str, int]:
    slug_to_id: Dict[str, int] = {}
    for record in records:
        cursor = conn.execute(
            """
            INSERT INTO items (
                slug, name, type, category, status, priority, due_date,
                duration_minutes, points_value, tags, path, relative_path,
                created_at, updated_at, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["slug"],
                record["name"],
                record["type"],
                record.get("category"),
                record.get("status"),
                record.get("priority"),
                record.get("due_date"),
                record.get("duration_minutes"),
                record.get("points_value"),
                json.dumps(record.get("tags") or []),
                record.get("path"),
                record.get("relative_path"),
                record.get("created_at"),
                record.get("updated_at"),
                _safe_json(record.get("raw")),
            ),
        )
        slug_to_id[record["slug"]] = cursor.lastrowid
    return slug_to_id


def _insert_relations(conn: sqlite3.Connection, relations: List[Dict[str, Any]], slug_to_id: Dict[str, int]) -> None:
    for rel in relations:
        parent_id = slug_to_id.get(rel["parent_slug"])
        child_id = slug_to_id.get(rel["child_slug"])
        conn.execute(
            """
            INSERT INTO relations (
                parent_id, child_id, parent_slug, child_slug,
                child_name, child_type, relation_type, order_index
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                parent_id,
                child_id,
                rel["parent_slug"],
                rel["child_slug"],
                rel.get("child_name"),
                rel.get("child_type"),
                rel.get("relation_type"),
                rel.get("order_index"),
            ),
        )


def _insert_completions(conn: sqlite3.Connection, completions: List[Dict[str, Any]]) -> None:
    for entry in completions:
        conn.execute(
            """
            INSERT INTO completions (
                block_key, source_date, name, item_slug, item_type, status,
                quality, scheduled_start, scheduled_end, actual_start, actual_end,
                logged_at, note, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.get("block_key"),
                entry.get("source_date"),
                entry.get("name"),
                entry.get("item_slug") or None,
                entry.get("item_type"),
                entry.get("status"),
                entry.get("quality"),
                entry.get("scheduled_start"),
                entry.get("scheduled_end"),
                entry.get("actual_start"),
                entry.get("actual_end"),
                entry.get("logged_at"),
                entry.get("note"),
                _safe_json(entry.get("raw")),
            ),
        )


def _insert_schedules(conn: sqlite3.Connection, schedules: List[Dict[str, Any]]) -> None:
    for entry in schedules:
        conn.execute(
            """
            INSERT INTO schedules (
                schedule_date, name, type, item_slug, item_type, parent_slug,
                block_key, start_time, end_time, duration_minutes, status,
                importance_score, is_parallel, depth, order_index, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.get("schedule_date"),
                entry.get("name"),
                entry.get("type"),
                entry.get("item_slug") or None,
                entry.get("item_type"),
                entry.get("parent_slug"),
                entry.get("block_key"),
                entry.get("start_time"),
                entry.get("end_time"),
                entry.get("duration_minutes"),
                entry.get("status"),
                entry.get("importance_score"),
                1 if entry.get("is_parallel") else 0,
                entry.get("depth"),
                entry.get("order_index"),
                _safe_json(entry.get("raw")),
            ),
        )


def build_core_db(registry: Dict[str, Any]) -> None:
    ensure_data_home()
    entry = registry.get("databases", {}).get("core")
    if not entry:
        entry = update_database_entry(registry, "core")
    target_path = entry.get("path")
    if not target_path:
        raise ValueError("Core database path is not configured.")
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    tmp_path = f"{target_path}.tmp"
    if os.path.exists(tmp_path):
        os.remove(tmp_path)

    records = _collect_items()
    _ensure_unique_slugs(records)
    name_map = defaultdict(list)
    type_lookup = {}
    for record in records:
        slug = record.get("slug")
        if not slug:
            continue
        type_lookup[slug] = record["type"]
        key = _slugify(record.get("name"))
        if key:
            name_map[key].append(slug)

    unique_name_index = {
        name: slugs[0] for name, slugs in name_map.items() if len(slugs) == 1
    }

    relations = _collect_relations(records)
    completions = _collect_completions(unique_name_index, type_lookup)
    schedules = _collect_schedule_entries(unique_name_index, type_lookup)

    conn = sqlite3.connect(tmp_path)
    try:
        _create_schema(conn)
        slug_to_id = _insert_items(conn, records)
        _insert_relations(conn, relations, slug_to_id)
        _insert_completions(conn, completions)
        _insert_schedules(conn, schedules)
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
            "core",
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
            "core",
            last_sync=_timestamp(),
            status="ready",
            records=len(records),
            notes="",
        )


def sync_core_db() -> None:
    registry = load_registry()
    build_core_db(registry)
