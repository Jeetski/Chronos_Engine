import json
import os
import sqlite3
from datetime import datetime
from typing import Dict, Any, List, Iterable, Tuple

from Modules.ItemManager import list_all_items
from Modules.Sequence.registry import (
    ensure_data_home,
    update_database_entry,
    load_registry,
)
from Utilities import dashboard_matrix as matrix_utils  # type: ignore

DEFAULT_ITEM_TYPES = matrix_utils.DEFAULT_ITEM_TYPES
BUILTIN_DIMENSION_IDS = set(matrix_utils.BUILTIN_DIMENSION_IDS)
BUILTIN_DIMENSION_IDS.add("template_type")
DIMENSION_LABELS = matrix_utils.DIMENSIONS

DIMENSION_TARGETS = [
    "item_type",
    "item_status",
    "priority",
    "project",
    "category",
    "status_tag",
    "tag",
    "template_type",
]


def _timestamp() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _normalize_value(value: Any) -> str:
    return matrix_utils._normalize_value(value)


def _normalize_key(value: Any) -> str:
    return matrix_utils._normalize_key(value)


def _format_title(value: Any) -> str:
    return matrix_utils._format_title(value)


def _duration_minutes(value: Any) -> int:
    return matrix_utils._duration_minutes(value)


def _points_value(value: Any) -> float:
    return matrix_utils._points_value(value)


def _ensure_dimension_values(value: Any) -> List[str]:
    return matrix_utils._ensure_dimension_values(value)


def _canonical_field_key(value: Any) -> str:
    return matrix_utils._canonical_field_key(value)


def _extract_tags(data: Dict[str, Any]) -> List[str]:
    return matrix_utils._extract_tags(data)


def _extract_status_tags(data: Dict[str, Any]) -> List[str]:
    return matrix_utils._extract_status_tags(data)


def _dimension_display(dim_id: str, raw_value: str) -> str:
    if not raw_value:
        return "Unspecified"
    if dim_id == "status_tag" and ":" in raw_value:
        left, right = raw_value.split(":", 1)
        return f"{_format_title(left)}: {_format_title(right)}"
    if dim_id == "tag":
        return _format_title(raw_value)
    definition = DIMENSION_LABELS.get(dim_id)
    if definition:
        formatter = definition.get("format")
        if callable(formatter):
            try:
                return formatter(raw_value)
            except Exception:
                pass
    return _format_title(raw_value)


def _collect_property_dimensions(data: Dict[str, Any]) -> Iterable[Tuple[str, str, str]]:
    seen: set[Tuple[str, str]] = set()
    for raw_key, raw_val in data.items():
        canonical = _canonical_field_key(raw_key)
        if not canonical or canonical in BUILTIN_DIMENSION_IDS:
            continue
        if isinstance(raw_val, dict):
            continue
        for value in _ensure_dimension_values(raw_val):
            normalized = _normalize_key(value)
            if not normalized:
                continue
            slug = (canonical, normalized)
            if slug in seen:
                continue
            seen.add(slug)
            display = _format_title(value)
            yield canonical, normalized, display


def _collect_dimensions(source_type: str, data: Dict[str, Any]) -> List[Tuple[str, str, str, str]]:
    entries: List[Tuple[str, str, str, str]] = []

    def add(dim_id: str, raw_value: Any, *, kind: str = "dimension") -> None:
        normalized = _normalize_key(raw_value)
        if not normalized:
            return
        display = _dimension_display(dim_id, raw_value)
        entries.append((dim_id, normalized, display, kind))

    if data.get("dataset"):
        add("dataset", data.get("dataset"))
    add("item_type", data.get("type") or source_type)
    if data.get("status"):
        add("item_status", data["status"])
    if data.get("planned_status"):
        add("planned_status", data["planned_status"])
    if data.get("priority"):
        add("priority", data["priority"])
    if data.get("project"):
        add("project", data["project"])
    if data.get("category"):
        add("category", data["category"])
    if data.get("template_type"):
        add("template_type", data["template_type"])
    if data.get("schedule_date"):
        add("schedule_date", data["schedule_date"])
    if data.get("schedule_weekday"):
        add("schedule_weekday", data["schedule_weekday"])
    if data.get("schedule_start_time"):
        add("schedule_start_time", data["schedule_start_time"])
    if data.get("schedule_start_hour"):
        add("schedule_start_hour", data["schedule_start_hour"])
    if data.get("schedule_end_time"):
        add("schedule_end_time", data["schedule_end_time"])
    if data.get("schedule_end_hour"):
        add("schedule_end_hour", data["schedule_end_hour"])
    if data.get("actual_start_time"):
        add("actual_start_time", data["actual_start_time"])
    if data.get("actual_start_hour"):
        add("actual_start_hour", data["actual_start_hour"])
    if data.get("actual_end_time"):
        add("actual_end_time", data["actual_end_time"])
    if data.get("actual_end_hour"):
        add("actual_end_hour", data["actual_end_hour"])
    if data.get("schedule_parent"):
        add("schedule_parent", data["schedule_parent"])
    if data.get("schedule_depth") is not None:
        add("schedule_depth", data["schedule_depth"])
    if data.get("schedule_window"):
        add("schedule_window", data["schedule_window"])
    if data.get("schedule_is_parallel") is not None:
        add("schedule_is_parallel", data["schedule_is_parallel"])
    if data.get("schedule_is_buffer") is not None:
        add("schedule_is_buffer", data["schedule_is_buffer"])

    for tag in _extract_tags(data):
        add("tag", tag)
    for status_tag in _extract_status_tags(data):
        add("status_tag", status_tag)

    for key, value, display in _collect_property_dimensions(data):
        entries.append((key, value, display, "property"))

    return entries


def _create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode=OFF;
        PRAGMA synchronous=OFF;
        DROP TABLE IF EXISTS dimension_entries;
        DROP TABLE IF EXISTS items;
        CREATE TABLE items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT,
            name TEXT,
            type TEXT,
            source_type TEXT,
            status TEXT,
            priority TEXT,
            category TEXT,
            project TEXT,
            template_type TEXT,
            duration_minutes INTEGER,
            points_value REAL,
            raw_json TEXT
        );
        CREATE TABLE dimension_entries (
            item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            dimension TEXT NOT NULL,
            value TEXT NOT NULL,
            display TEXT,
            kind TEXT NOT NULL DEFAULT 'dimension'
        );
        CREATE INDEX idx_items_type ON items(type);
        CREATE INDEX idx_dim_dimension_value ON dimension_entries(dimension, value);
        CREATE INDEX idx_dim_kind ON dimension_entries(kind);
        """
    )


def _load_source_data() -> List[Tuple[str, Dict[str, Any]]]:
    payload: List[Tuple[str, Dict[str, Any]]] = []
    for item_type in DEFAULT_ITEM_TYPES:
        try:
            entries = list_all_items(item_type) or []
        except Exception:
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            data = dict(entry)
            data.setdefault("dataset", "item")
            payload.append((item_type, data))
    try:
        schedule_entries = matrix_utils.load_schedule_dataset(past_only=True, include_parents=False) or []
    except Exception:
        schedule_entries = []
    for record in schedule_entries:
        if not isinstance(record, dict):
            continue
        data = record.get("data")
        if not isinstance(data, dict):
            continue
        merged = dict(data)
        merged.setdefault("dataset", "schedule")
        if record.get("name") and not merged.get("name"):
            merged["name"] = record.get("name")
        if record.get("type") and not merged.get("type"):
            merged["type"] = record.get("type")
        source_type = record.get("source_type") or "schedule"
        payload.append((source_type, merged))
    return payload


def _build_slug(source_type: str, data: Dict[str, Any]) -> str:
    name = data.get("name") or "Unnamed"
    normalized = _normalize_value(name) or name
    if data.get("dataset") == "schedule":
        schedule_date = _normalize_value(data.get("schedule_date")) or "unknown-date"
        scheduled_start = _normalize_value(data.get("schedule_start_time") or "")
        if scheduled_start:
            return f"{source_type}:{schedule_date}:{scheduled_start}:{normalized}"
        return f"{source_type}:{schedule_date}:{normalized}"
    return f"{source_type}:{normalized}"


def _populate(conn: sqlite3.Connection, dataset: List[Tuple[str, Dict[str, Any]]]) -> int:
    records = 0
    for source_type, data in dataset:
        name = data.get("name") or "Unnamed"
        slug = _build_slug(source_type, data)
        duration = _duration_minutes(data.get("duration"))
        points = _points_value(data.get("points"))
        fields = (
            slug,
            name,
            _normalize_key(data.get("type") or source_type),
            _normalize_key(source_type),
            _normalize_key(data.get("status")),
            _normalize_key(data.get("priority")),
            _normalize_key(data.get("category")),
            _normalize_key(data.get("project")),
            _normalize_key(data.get("template_type")),
            duration,
            points,
            json.dumps(data, ensure_ascii=False, default=str),
        )
        cursor = conn.execute(
            """
            INSERT INTO items (
                slug, name, type, source_type, status, priority, category, project,
                template_type, duration_minutes, points_value, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            fields,
        )
        item_id = cursor.lastrowid
        dimensions = _collect_dimensions(source_type, data)
        if not dimensions:
            dimensions = [("item_type", _normalize_key(source_type), _format_title(source_type), "dimension")]
        conn.executemany(
            """
            INSERT INTO dimension_entries (item_id, dimension, value, display, kind)
            VALUES (?, ?, ?, ?, ?)
            """,
            [(item_id, dim, value, display, kind) for dim, value, display, kind in dimensions],
        )
        records += 1
    return records


def build_matrix_cache(registry: Dict[str, Any]) -> None:
    ensure_data_home()
    entry = registry.get("databases", {}).get("matrix")
    if not entry:
        entry = update_database_entry(registry, "matrix")
    target_path = entry.get("path")
    if not target_path:
        raise ValueError("Matrix cache path is not configured.")
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    tmp_path = f"{target_path}.tmp"
    if os.path.exists(tmp_path):
        os.remove(tmp_path)

    dataset = _load_source_data()
    conn = sqlite3.connect(tmp_path)
    try:
        _create_schema(conn)
        records = _populate(conn, dataset)
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
            "matrix",
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
            "matrix",
            last_sync=_timestamp(),
            status="ready",
            records=records,
            notes="",
        )


def sync_matrix_cache() -> None:
    registry = load_registry()
    build_matrix_cache(registry)
