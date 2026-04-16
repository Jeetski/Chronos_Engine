import json
import os
import sqlite3
from collections import defaultdict
from datetime import datetime
from typing import Dict, Any, Iterable, List, Tuple, Optional

import yaml

from modules.item_manager import get_user_dir, get_item_path
from modules.sequence.registry import (
    ensure_data_home,
    update_database_entry,
    load_registry,
)
from modules.scheduler import build_block_key, load_schedule_payload_for_date, schedule_path_for_date  # type: ignore
from utilities.duration_parser import parse_duration_string  # type: ignore

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
USER_DIR = get_user_dir()
COMPLETIONS_DIR = os.path.join(USER_DIR, "schedules", "completions")

SKIP_DIRS = {
    "archive",
    "backups",
    "examples",
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


def _slug_item_type(slug: str) -> str:
    raw = str(slug or "")
    if "::" not in raw:
        return ""
    return raw.split("::", 1)[0].split("#", 1)[0]


def _resolve_candidate_slug(
    block_name: str,
    name_index: Dict[str, List[str]],
    type_lookup: Dict[str, str],
    preferred_type: Optional[str] = None,
) -> Tuple[str, Optional[str], bool]:
    candidates = list(name_index.get(_slugify(block_name)) or [])
    if not candidates:
        return "", None, False

    normalized_type = _slugify(preferred_type or "")
    if normalized_type:
        typed = [slug for slug in candidates if _slugify(type_lookup.get(slug) or _slug_item_type(slug)) == normalized_type]
        if len(typed) == 1:
            slug = typed[0]
            return slug, type_lookup.get(slug), False
        if len(typed) > 1:
            return "", normalized_type or None, True

    if len(candidates) == 1:
        slug = candidates[0]
        return slug, type_lookup.get(slug), False

    candidate_types = {_slugify(type_lookup.get(slug) or _slug_item_type(slug)) for slug in candidates}
    if len(candidate_types) == 1:
        only_type = next(iter(candidate_types)) if candidate_types else None
        return "", only_type or None, True
    return "", None, True


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


def _parse_completion_file(path: str, name_index: Dict[str, List[str]], type_lookup: Dict[str, str]) -> List[Dict[str, Any]]:
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
        preferred_type = entry.get("type")
        slug, matched_type, ambiguous = _resolve_candidate_slug(block_name, name_index, type_lookup, preferred_type)
        completions.append(
            {
                "source_date": source_date,
                "block_key": block_key,
                "name": block_name,
                "item_slug": slug,
                "item_type": matched_type,
                "match_ambiguous": bool(ambiguous),
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


def _collect_completions(name_index: Dict[str, List[str]], type_lookup: Dict[str, str]) -> List[Dict[str, Any]]:
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


def _collect_schedule_entries(name_index: Dict[str, List[str]], type_lookup: Dict[str, str]) -> List[Dict[str, Any]]:
    schedule_path = schedule_path_for_date(datetime.now())
    if not os.path.exists(schedule_path):
        return []
    schedule = load_schedule_payload_for_date(datetime.now(), path=schedule_path)
    if isinstance(schedule, dict):
        schedule = schedule.get("items") or schedule.get("children") or []
    if not isinstance(schedule, list):
        return []
    entries: List[Dict[str, Any]] = []
    fallback_date = datetime.now().date().isoformat()
    for record in _flatten_schedule(schedule):
        slug = record["item_slug"]
        if not slug and record["name"]:
            candidate, matched_type, ambiguous = _resolve_candidate_slug(record["name"], name_index, type_lookup, record.get("type"))
            if candidate:
                slug = candidate
            if ambiguous:
                record["match_ambiguous"] = True
            if matched_type and not record.get("item_type"):
                record["item_type"] = matched_type
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

    relations = _collect_relations(records)
    completions = _collect_completions(name_map, type_lookup)
    schedules = _collect_schedule_entries(name_map, type_lookup)

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


def _core_db_path(registry: Dict[str, Any]) -> str:
    ensure_data_home()
    entry = registry.get("databases", {}).get("core")
    if not entry:
        entry = update_database_entry(registry, "core")
    path = entry.get("path")
    if not path:
        raise ValueError("Core database path is not configured.")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def _ensure_incremental_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS items (
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
        CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
        CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);

        CREATE TABLE IF NOT EXISTS relations (
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
        CREATE INDEX IF NOT EXISTS idx_rel_parent ON relations(parent_slug);

        CREATE TABLE IF NOT EXISTS completions (
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
        CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(source_date);
        CREATE INDEX IF NOT EXISTS idx_completions_slug ON completions(item_slug);

        CREATE TABLE IF NOT EXISTS schedules (
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
        CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(schedule_date);
        CREATE INDEX IF NOT EXISTS idx_schedules_slug ON schedules(item_slug);
        """
    )


def _record_from_payload(item_type: str, name: str, data: Dict[str, Any]) -> Dict[str, Any]:
    payload = data if isinstance(data, dict) else {}
    normalized_type = (payload.get("type") or item_type or "").strip()
    normalized_name = (payload.get("name") or name or "").strip()
    if not normalized_type or not normalized_name:
        raise ValueError("Item type and name are required for core mirror upsert.")

    path = get_item_path(normalized_type, normalized_name)
    now_iso = datetime.now().isoformat(timespec="seconds")
    created_at = now_iso
    updated_at = now_iso
    try:
        if os.path.exists(path):
            stat = os.stat(path)
            created_at = datetime.fromtimestamp(stat.st_ctime).isoformat(timespec="seconds")
            updated_at = datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds")
    except Exception:
        pass

    return {
        "slug": _item_slug(normalized_type, normalized_name),
        "name": normalized_name,
        "type": normalized_type,
        "category": payload.get("category"),
        "status": payload.get("status"),
        "priority": payload.get("priority"),
        "due_date": payload.get("due_date"),
        "duration_minutes": _duration_minutes(payload.get("duration")),
        "points_value": float(payload.get("points") or 0),
        "tags": _normalize_tags(payload.get("tags")),
        "path": path,
        "relative_path": os.path.relpath(path, ROOT_DIR),
        "created_at": created_at,
        "updated_at": updated_at,
        "raw": payload,
    }


def _refresh_relations_for_record(conn: sqlite3.Connection, record: Dict[str, Any], parent_id: int) -> None:
    parent_slug = record.get("slug") or ""
    conn.execute("DELETE FROM relations WHERE parent_slug = ?", (parent_slug,))

    rels = _collect_relations([record])
    for rel in rels:
        child_id = None
        child_slug = rel.get("child_slug") or ""
        if child_slug:
            row = conn.execute("SELECT id FROM items WHERE slug = ?", (child_slug,)).fetchone()
            if row:
                child_id = row["id"]
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
                rel.get("parent_slug"),
                rel.get("child_slug"),
                rel.get("child_name"),
                rel.get("child_type"),
                rel.get("relation_type"),
                rel.get("order_index"),
            ),
        )


def _update_core_registry_state(registry: Dict[str, Any], conn: sqlite3.Connection, *, notes: str = "") -> None:
    row = conn.execute("SELECT COUNT(*) AS c FROM items").fetchone()
    count = int(row["c"]) if row and row["c"] is not None else 0
    update_database_entry(
        registry,
        "core",
        last_sync=_timestamp(),
        status="ready",
        records=count,
        notes=notes,
    )


def upsert_item_in_core_db(item_type: str, name: str, data: Dict[str, Any]) -> None:
    registry = load_registry()
    db_path = _core_db_path(registry)

    # First run should remain authoritative: bootstrap from a full mirror.
    if not os.path.exists(db_path):
        build_core_db(registry)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        _ensure_incremental_schema(conn)
        record = _record_from_payload(item_type, name, data)
        slug = record["slug"]

        existing = conn.execute(
            "SELECT id, created_at FROM items WHERE slug = ?",
            (slug,),
        ).fetchone()
        created_at = record["created_at"]
        if existing and existing["created_at"]:
            created_at = existing["created_at"]

        if existing:
            conn.execute(
                """
                UPDATE items
                SET name = ?, type = ?, category = ?, status = ?, priority = ?,
                    due_date = ?, duration_minutes = ?, points_value = ?, tags = ?,
                    path = ?, relative_path = ?, created_at = ?, updated_at = ?, raw_json = ?
                WHERE slug = ?
                """,
                (
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
                    created_at,
                    record.get("updated_at"),
                    _safe_json(record.get("raw")),
                    slug,
                ),
            )
            parent_id = int(existing["id"])
        else:
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
                    slug,
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
                    created_at,
                    record.get("updated_at"),
                    _safe_json(record.get("raw")),
                ),
            )
            parent_id = int(cursor.lastrowid)

        _refresh_relations_for_record(conn, record, parent_id)
        _update_core_registry_state(registry, conn)
        conn.commit()
    except Exception as exc:
        conn.rollback()
        update_database_entry(
            registry,
            "core",
            last_attempt=_timestamp(),
            status="error",
            notes=str(exc),
        )
        raise
    finally:
        conn.close()


def delete_item_from_core_db(item_type: str, name: str) -> None:
    registry = load_registry()
    db_path = _core_db_path(registry)
    if not os.path.exists(db_path):
        return

    slug = _item_slug(item_type, name)
    if not slug:
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        _ensure_incremental_schema(conn)
        conn.execute("DELETE FROM relations WHERE parent_slug = ? OR child_slug = ?", (slug, slug))
        conn.execute("DELETE FROM items WHERE slug = ?", (slug,))
        _update_core_registry_state(registry, conn)
        conn.commit()
    except Exception as exc:
        conn.rollback()
        update_database_entry(
            registry,
            "core",
            last_attempt=_timestamp(),
            status="error",
            notes=str(exc),
        )
        raise
    finally:
        conn.close()

