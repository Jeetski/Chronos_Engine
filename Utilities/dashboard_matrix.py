import os
import sys
import json
import sqlite3
from collections import defaultdict
from itertools import product
from datetime import datetime, date
from typing import Dict, List, Any
import yaml

# Ensure project root is importable
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

USER_DIR = os.path.join(ROOT_DIR, "User")
SETTINGS_DIR = os.path.join(USER_DIR, "Settings")
PRESET_DIR = os.path.join(ROOT_DIR, "matrix", "presets")
DATA_DIR = os.path.join(USER_DIR, "Data")
MATRIX_DB_PATH = os.path.join(DATA_DIR, "chronos_matrix.db")
SCHEDULES_DIR = os.path.join(USER_DIR, "Schedules")
COMPLETIONS_DIR = os.path.join(SCHEDULES_DIR, "completions")
NAME_SEPARATOR = "\x1f"

from Modules.ItemManager import list_all_items  # type: ignore
from Utilities.duration_parser import parse_duration_string  # type: ignore

DEFAULT_ITEM_TYPES = [
    "achievement",
    "appointment",
    "canvas_board",
    "commitment",
    "goal",
    "habit",
    "milestone",
    "note",
    "project",
    "reminder",
    "reward",
    "routine",
    "subroutine",
    "microroutine",
    "task",
]

DEFAULT_SORT_MODE = "label-asc"
DEFAULT_METRIC = "count"
TEMPLATE_TYPE_HINTS = ["week", "day", "routine", "subroutine", "microroutine"]
MAX_PROPERTY_VALUES = 30

BUILTIN_MATRIX_PRESETS = [
    {
        "name": "status_by_type",
        "label": "Status x Type",
        "rows": ["item_type"],
        "cols": ["item_status"],
        "metric": "count",
        "filters": {"dataset": "item"},
        "row_sort": "metric-desc",
        "col_sort": "label-asc",
    },
    {
        "name": "task_priority_flow",
        "label": "Task Priority vs Status",
        "rows": ["priority"],
        "cols": ["item_status"],
        "metric": "count",
        "filters": {"dataset": "item", "type": "task"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "tag_duration_mix",
        "label": "Duration by Tag",
        "rows": ["tag"],
        "cols": ["item_type"],
        "metric": "duration",
        "filters": {"dataset": "item"},
        "row_sort": "metric-desc",
        "col_sort": "label-asc",
    },
    {
        "name": "points_by_category",
        "label": "Points by Category",
        "rows": ["category"],
        "cols": ["item_status"],
        "metric": "points",
        "filters": {"dataset": "item"},
        "row_sort": "metric-desc",
        "col_sort": "label-asc",
    },
    {
        "name": "category_status_mix",
        "label": "Category x Status",
        "rows": ["category"],
        "cols": ["item_status"],
        "metric": "count",
        "filters": {"dataset": "item"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "project_status_mix",
        "label": "Project x Status",
        "rows": ["project"],
        "cols": ["item_status"],
        "metric": "count",
        "filters": {"dataset": "item"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "status_tags_by_type",
        "label": "Status Tags x Type",
        "rows": ["status_tag"],
        "cols": ["item_type"],
        "metric": "count",
        "filters": {"dataset": "item"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "template_type_by_type",
        "label": "Template Type x Type",
        "rows": ["template_type"],
        "cols": ["item_type"],
        "metric": "count",
        "filters": {"dataset": "item"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "priority_by_type",
        "label": "Priority x Type",
        "rows": ["priority"],
        "cols": ["item_type"],
        "metric": "count",
        "filters": {"dataset": "item"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "priority_by_status",
        "label": "Priority x Status",
        "rows": ["priority"],
        "cols": ["item_status"],
        "metric": "count",
        "filters": {"dataset": "item"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "tag_status_mix",
        "label": "Tag x Status",
        "rows": ["tag"],
        "cols": ["item_status"],
        "metric": "count",
        "filters": {"dataset": "item"},
        "row_sort": "metric-desc",
        "col_sort": "label-asc",
    },
    {
        "name": "project_priority_mix",
        "label": "Project x Priority",
        "rows": ["project"],
        "cols": ["priority"],
        "metric": "count",
        "filters": {"dataset": "item"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "duration_project_status",
        "label": "Duration by Project x Status",
        "rows": ["project"],
        "cols": ["item_status"],
        "metric": "duration",
        "filters": {"dataset": "item"},
        "row_sort": "metric-desc",
        "col_sort": "label-asc",
    },
    {
        "name": "template_status_mix",
        "label": "Template Type x Status",
        "rows": ["template_type"],
        "cols": ["item_status"],
        "metric": "count",
        "filters": {"dataset": "item"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "points_status_by_type",
        "label": "Points by Status x Type",
        "rows": ["item_status"],
        "cols": ["item_type"],
        "metric": "points",
        "filters": {"dataset": "item"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_weekday_by_type",
        "label": "Schedule Weekday x Type",
        "rows": ["schedule_weekday"],
        "cols": ["item_type"],
        "metric": "count",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_start_hour_by_type",
        "label": "Schedule Start Hour x Type",
        "rows": ["schedule_start_hour"],
        "cols": ["item_type"],
        "metric": "count",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_minutes_weekday_category",
        "label": "Schedule Minutes by Weekday x Category",
        "rows": ["schedule_weekday"],
        "cols": ["category"],
        "metric": "duration",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_actual_status_by_type",
        "label": "Schedule Actual Status x Type",
        "rows": ["item_status"],
        "cols": ["item_type"],
        "metric": "count",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_planned_status_by_type",
        "label": "Schedule Planned Status x Type",
        "rows": ["planned_status"],
        "cols": ["item_type"],
        "metric": "count",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_start_vs_actual",
        "label": "Schedule Start Hour vs Actual Hour",
        "rows": ["schedule_start_hour"],
        "cols": ["actual_start_hour"],
        "metric": "count",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_window_by_type",
        "label": "Schedule Window x Type",
        "rows": ["schedule_window"],
        "cols": ["item_type"],
        "metric": "count",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_parent_status",
        "label": "Schedule Parent x Status",
        "rows": ["schedule_parent"],
        "cols": ["item_status"],
        "metric": "count",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_weekday_by_project",
        "label": "Schedule Weekday x Project",
        "rows": ["schedule_weekday"],
        "cols": ["project"],
        "metric": "count",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_weekday_by_priority",
        "label": "Schedule Weekday x Priority",
        "rows": ["schedule_weekday"],
        "cols": ["priority"],
        "metric": "count",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_status_start_hour",
        "label": "Schedule Status x Start Hour",
        "rows": ["item_status"],
        "cols": ["schedule_start_hour"],
        "metric": "count",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_planned_vs_actual",
        "label": "Schedule Planned vs Actual Status",
        "rows": ["planned_status"],
        "cols": ["item_status"],
        "metric": "count",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_parallel_weekday",
        "label": "Parallel Blocks x Weekday",
        "rows": ["schedule_is_parallel"],
        "cols": ["schedule_weekday"],
        "metric": "count",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_quality_weekday",
        "label": "Quality x Weekday",
        "rows": ["quality"],
        "cols": ["schedule_weekday"],
        "metric": "count",
        "filters": {"dataset": "schedule", "status": "completed"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
    {
        "name": "schedule_parent_type",
        "label": "Schedule Parent x Type",
        "rows": ["schedule_parent"],
        "cols": ["item_type"],
        "metric": "count",
        "filters": {"dataset": "schedule"},
        "row_sort": "label-asc",
        "col_sort": "label-asc",
    },
]

def _normalize_preset_dict(raw: Dict[str, Any]) -> Dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name") or raw.get("label") or "").strip()
    if not name:
        return None
    normalized = {
        "name": name,
        "label": raw.get("label") or name,
        "rows": raw.get("rows") or raw.get("row_dimensions"),
        "cols": raw.get("cols") or raw.get("col_dimensions"),
        "metric": raw.get("metric") or DEFAULT_METRIC,
        "filters": raw.get("filters") or raw.get("filter_map") or {},
        "row_sort": raw.get("row_sort") or DEFAULT_SORT_MODE,
        "col_sort": raw.get("col_sort") or DEFAULT_SORT_MODE,
    }
    return normalized


def _build_builtin_preset_index() -> Dict[str, Dict[str, Any]]:
    index: Dict[str, Dict[str, Any]] = {}
    for entry in BUILTIN_MATRIX_PRESETS:
        normalized = _normalize_preset_dict(entry)
        if not normalized:
            continue
        slug = _preset_slug(normalized["name"])
        index[slug] = normalized
    return index


def _load_status_keys() -> List[str]:
    path = os.path.join(SETTINGS_DIR, "Status_Settings.yml")
    if not os.path.exists(path):
        return []
    try:
        import yaml  # local import to avoid dependency at module load if unused

        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        entries = data.get("Status_Settings", [])
        keys = []
        for entry in entries or []:
            name = entry.get("Name")
            if name:
                keys.append(str(name).strip().lower())
        return keys
    except Exception:
        return []


STATUS_KEYS = _load_status_keys()


def _matrix_db_available() -> bool:
    return os.path.exists(MATRIX_DB_PATH)


def _connect_matrix_db() -> sqlite3.Connection:
    conn = sqlite3.connect(MATRIX_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 1500")
    conn.execute("PRAGMA synchronous = OFF")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA cache_size = -8192")
    conn.execute("PRAGMA journal_mode = OFF")
    conn.execute("PRAGMA mmap_size = 0")
    conn.execute("PRAGMA automatic_index = ON")
    conn.execute("PRAGMA case_sensitive_like = OFF")
    conn.execute("PRAGMA group_concat_max_len = 1048576")
    return conn


def _dimension_label(dim_id: str) -> str:
    definition = DIMENSIONS.get(dim_id)
    if definition:
        return definition.get("label") or _format_title(dim_id)
    pretty = _format_title(dim_id.replace("property:", ""))
    return f"Property: {pretty}"


def _compose_dimension_label(dim_ids: List[str], displays: List[str]) -> str:
    pieces = []
    for dim_id, display in zip(dim_ids, displays):
        label = _dimension_label(dim_id)
        prefix = _dimension_value_prefix(label)
        pieces.append(f"{prefix}: {display or 'Unspecified'}")
    return " | ".join(pieces)


def _resolve_dimension_display(dim_id: str, stored_display: Any, value: Any) -> str:
    if stored_display:
        return stored_display
    if not value:
        return "Unspecified"
    if dim_id == "status_tag" and isinstance(value, str) and ":" in value:
        left, right = value.split(":", 1)
        return f"{_format_title(left)}: {_format_title(right)}"
    return _format_title(value)


def _metric_payload(metric: str, row: sqlite3.Row, names: List[str]) -> Dict[str, Any]:
    if metric == "count":
        return {"value": row["metric_count"] or 0, "items": names}
    if metric == "duration":
        total = row["metric_duration"] or 0
        return {"value": total, "unit": "minutes", "items": names}
    if metric == "points":
        total = row["metric_points"] or 0.0
        return {"value": total, "unit": "points", "items": names}
    if metric == "list":
        sample = names[:5]
        return {"value": ", ".join(sample) if sample else "-", "items": names, "count": len(names)}
    return {"value": row["metric_count"] or 0, "items": names}


def _ensure_preset_dir():
    try:
        os.makedirs(PRESET_DIR, exist_ok=True)
    except Exception:
        pass


def _preset_slug(name: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_", " ") else "_" for ch in name or "")
    safe = "_".join(part for part in safe.strip().split())
    return safe.lower() or "preset"


BUILTIN_PRESET_INDEX = _build_builtin_preset_index()


def list_matrix_presets() -> List[Dict[str, Any]]:
    _ensure_preset_dir()
    presets: Dict[str, Dict[str, Any]] = {
        slug: _deepcopy_simple(payload) for slug, payload in BUILTIN_PRESET_INDEX.items()
    }
    if os.path.isdir(PRESET_DIR):
        for entry in os.listdir(PRESET_DIR):
            if not entry.lower().endswith((".yml", ".yaml")):
                continue
            path = os.path.join(PRESET_DIR, entry)
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    data = yaml.safe_load(fh) or {}
                normalized = _normalize_preset_dict(data)
                if normalized:
                    presets[_preset_slug(normalized["name"])] = normalized
            except Exception:
                continue
    return sorted(presets.values(), key=lambda item: (item.get("label") or "").lower())


def load_matrix_preset(name: str) -> Dict[str, Any]:
    if not name:
        raise ValueError("Missing preset name")
    _ensure_preset_dir()
    slug = _preset_slug(name)
    for ext in (".yml", ".yaml"):
        path = os.path.join(PRESET_DIR, f"{slug}{ext}")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or {}
            normalized = _normalize_preset_dict(data)
            if normalized:
                return normalized
    builtin = BUILTIN_PRESET_INDEX.get(slug)
    if builtin:
        return _deepcopy_simple(builtin)
    raise FileNotFoundError(f"Preset '{name}' not found")


def save_matrix_preset(preset: Dict[str, Any]) -> None:
    if not isinstance(preset, dict):
        raise ValueError("Preset payload must be a map")
    name = (preset.get("name") or preset.get("label") or "").strip()
    if not name:
        raise ValueError("Preset must include 'name'")
    slug = _preset_slug(name)
    _ensure_preset_dir()
    path = os.path.join(PRESET_DIR, f"{slug}.yml")
    payload = {
        "name": name,
        "label": preset.get("label") or name,
        "rows": preset.get("rows") or preset.get("row_dimensions"),
        "cols": preset.get("cols") or preset.get("col_dimensions"),
        "metric": preset.get("metric") or DEFAULT_METRIC,
        "filters": preset.get("filters") or preset.get("filter_map") or {},
        "row_sort": preset.get("row_sort") or DEFAULT_SORT_MODE,
        "col_sort": preset.get("col_sort") or DEFAULT_SORT_MODE,
    }
    with open(path, "w", encoding="utf-8") as fh:
        yaml.safe_dump(payload, fh, allow_unicode=True, sort_keys=False)


def delete_matrix_preset(name: str) -> bool:
    if not name:
        return False
    slug = _preset_slug(name)
    if slug in BUILTIN_PRESET_INDEX:
        raise ValueError("Built-in presets cannot be deleted")
    removed = False
    for ext in (".yml", ".yaml"):
        path = os.path.join(PRESET_DIR, f"{slug}{ext}")
        if os.path.exists(path):
            try:
                os.remove(path)
                removed = True
            except Exception:
                pass
    return removed

def _normalize_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _deepcopy_simple(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _deepcopy_simple(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_deepcopy_simple(entry) for entry in value]
    return value


def _normalize_key(value: Any) -> str:
    return _normalize_value(value).lower()


def _canonical_field_key(value: Any) -> str:
    text = _normalize_value(value).lower()
    text = text.replace("_", " ")
    text = " ".join(text.split())
    return text


def _ensure_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _format_title(value: str) -> str:
    return _normalize_value(value).replace("_", " ").title()


def _format_time(value: Any) -> str:
    if value is None:
        return "Unspecified"
    text = str(value).strip()
    if not text:
        return "Unspecified"
    if ":" in text:
        parts = text.split(":")
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            return f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"
    return text


def _format_hour(value: Any) -> str:
    if value is None:
        return "Unspecified"
    text = str(value).strip()
    if not text:
        return "Unspecified"
    if ":" in text:
        text = text.split(":", 1)[0]
    if text.isdigit():
        return f"{text.zfill(2)}:00"
    return text


def _format_bool(value: Any) -> str:
    text = _normalize_key(value)
    if text in ("true", "1", "yes", "y", "on"):
        return "Yes"
    if text in ("false", "0", "no", "n", "off"):
        return "No"
    return _format_title(text)


def _extract_tags(data: Dict[str, Any]) -> List[str]:
    raw = data.get("tags")
    if raw is None:
        return []
    if isinstance(raw, str):
        return [raw]
    if isinstance(raw, list):
        return [str(v) for v in raw if v is not None]
    return []


def _extract_status_tags(data: Dict[str, Any]) -> List[str]:
    tags: List[str] = []
    req = data.get("status_requirements")
    if isinstance(req, dict):
        for key, raw_val in req.items():
            for val in _ensure_list(raw_val):
                norm_key = _normalize_key(key)
                norm_val = _normalize_key(val)
                if norm_key and norm_val:
                    tags.append(f"{norm_key}:{norm_val}")
    for status_key in STATUS_KEYS:
        if status_key in data:
            val = _normalize_key(data.get(status_key))
            if val:
                tags.append(f"{status_key}:{val}")
    return tags


def _duration_minutes(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if not text:
            return 0
        try:
            parsed = parse_duration_string(text)
            if parsed is not None:
                return int(parsed)
        except Exception:
            pass
        try:
            return int(float(text))
        except Exception:
            return 0
    return 0


def _points_value(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except Exception:
        return 0.0


def _coerce_datetime(value: Any):
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return datetime.fromisoformat(text)
        except Exception:
            pass
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
            try:
                return datetime.strptime(text, fmt)
            except Exception:
                continue
    return None


def _normalize_time_str(value: Any):
    dt = _coerce_datetime(value)
    if dt:
        return dt.strftime("%H:%M")
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        parts = text.split(":")
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            return f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"
    return None


def _time_hour(value: Any):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if ":" in text:
        text = text.split(":", 1)[0]
    if text.isdigit():
        return text.zfill(2)
    return text


def _schedule_duration_minutes(item: Dict[str, Any], start_dt, end_dt) -> int:
    raw = item.get("duration")
    if raw is not None:
        duration = _duration_minutes(raw)
        if duration >= 0:
            return duration
    if start_dt and end_dt:
        return max(0, int((end_dt - start_dt).total_seconds() / 60))
    return 0


def _schedule_date_from_filename(filename: str):
    base, ext = os.path.splitext(filename)
    if ext.lower() not in (".yml", ".yaml"):
        return None
    if not base.lower().startswith("schedule_"):
        return None
    date_str = base[len("schedule_") :]
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        return None
    return date_obj, date_str


def _list_schedule_files(past_only: bool = True):
    if not os.path.isdir(SCHEDULES_DIR):
        return []
    entries = []
    today = date.today()
    for filename in os.listdir(SCHEDULES_DIR):
        parsed = _schedule_date_from_filename(filename)
        if not parsed:
            continue
        date_obj, date_str = parsed
        if past_only and date_obj >= today:
            continue
        entries.append((date_obj, date_str, os.path.join(SCHEDULES_DIR, filename)))
    entries.sort(key=lambda row: row[0])
    return entries


def _load_completions_for_date(date_str: str) -> Dict[str, Dict[str, Any]]:
    if not os.path.isdir(COMPLETIONS_DIR):
        return {}
    path = os.path.join(COMPLETIONS_DIR, f"{date_str}.yml")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
    except Exception:
        return {}
    entries = data.get("entries") if isinstance(data, dict) else None
    if not isinstance(entries, dict):
        return {}
    normalized: Dict[str, Dict[str, Any]] = {}
    for key, payload in entries.items():
        if isinstance(payload, dict):
            entry = payload
        else:
            entry = {"status": payload}
        normalized[key] = entry
        if isinstance(key, str):
            normalized.setdefault(key.lower(), entry)
    return normalized


def _flatten_schedule_items(items, parent_name=None, depth=0, include_parents=False):
    if not isinstance(items, list):
        return
    for item in items:
        if not isinstance(item, dict):
            continue
        children = item.get("children")
        has_children = isinstance(children, list) and len(children) > 0
        if include_parents or not has_children:
            yield item, parent_name, depth
        if has_children:
            next_parent = item.get("name") or parent_name
            yield from _flatten_schedule_items(children, next_parent, depth + 1, include_parents)


def load_schedule_dataset(past_only: bool = True, include_parents: bool = False):
    dataset: List[Dict[str, Any]] = []
    for date_obj, date_str, path in _list_schedule_files(past_only=past_only):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                schedule = yaml.safe_load(fh) or []
        except Exception:
            continue
        if not isinstance(schedule, list):
            continue
        completions = _load_completions_for_date(date_str)
        weekday = date_obj.strftime("%A")
        for item, parent_name, depth in _flatten_schedule_items(
            schedule, None, 0, include_parents=include_parents
        ):
            name = _normalize_value(item.get("name") or "")
            if not name:
                continue
            block_type = _normalize_key(item.get("type") or "")
            base = dict(item.get("original_item_data") or {}) if isinstance(item.get("original_item_data"), dict) else {}
            base["dataset"] = "schedule"
            base["name"] = name
            if block_type:
                base["type"] = block_type
            base["schedule_date"] = date_str
            base["schedule_weekday"] = weekday
            start_dt = _coerce_datetime(item.get("start_time"))
            end_dt = _coerce_datetime(item.get("end_time"))
            scheduled_start = _normalize_time_str(item.get("start_time"))
            scheduled_end = _normalize_time_str(item.get("end_time"))
            base["schedule_start_time"] = scheduled_start
            base["schedule_end_time"] = scheduled_end
            base["schedule_start_hour"] = _time_hour(scheduled_start)
            base["schedule_end_hour"] = _time_hour(scheduled_end)
            base["schedule_parent"] = parent_name
            base["schedule_depth"] = depth
            base["schedule_window"] = item.get("window")
            base["schedule_is_parallel"] = bool(item.get("is_parallel_item"))
            base["schedule_is_buffer"] = bool(item.get("is_buffer") or item.get("is_buffer_item"))
            base["planned_status"] = item.get("status")
            base["duration"] = _schedule_duration_minutes(item, start_dt, end_dt)

            block_key = f"{name}@{scheduled_start}" if scheduled_start else None
            completion = completions.get(block_key) if block_key else None
            actual_status = completion.get("status") if completion else None
            if actual_status:
                base["status"] = actual_status
            elif base.get("planned_status"):
                base["status"] = base.get("planned_status")

            if completion:
                actual_start = completion.get("actual_start")
                actual_end = completion.get("actual_end")
                if actual_start:
                    base["actual_start_time"] = actual_start
                    base["actual_start_hour"] = _time_hour(actual_start)
                if actual_end:
                    base["actual_end_time"] = actual_end
                    base["actual_end_hour"] = _time_hour(actual_end)
                skip_keys = {
                    "name",
                    "status",
                    "scheduled_start",
                    "scheduled_end",
                    "actual_start",
                    "actual_end",
                    "logged_at",
                }
                for key, value in completion.items():
                    if key in skip_keys or key in base:
                        continue
                    if isinstance(value, dict):
                        continue
                    base[key] = value

            dataset.append(
                {
                    "name": name,
                    "type": block_type or _normalize_key(base.get("type")),
                    "source_type": "schedule",
                    "data": base,
                }
            )
    return dataset


def _load_items() -> List[Dict[str, Any]]:
    dataset: List[Dict[str, Any]] = []
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
            record_type = _normalize_key(data.get("type")) or _normalize_key(item_type)
            dataset.append(
                {
                    "name": _normalize_value(data.get("name") or ""),
                    "type": record_type,
                    "source_type": item_type,
                    "data": data,
                }
            )
    dataset.extend(load_schedule_dataset(past_only=True, include_parents=False))
    return dataset


def _collect_item_types(dataset: List[Dict[str, Any]]) -> List[str]:
    types = {_normalize_key(item.get("type")) for item in dataset if item.get("type")}
    return sorted([value for value in types if value])


def _collect_template_types(dataset: List[Dict[str, Any]], item_types: List[str]) -> List[str]:
    discovered = set()
    for item in dataset:
        data = item.get("data") or {}
        for key in ("template_type", "template"):
            value = _normalize_key(data.get(key))
            if value:
                discovered.add(value)
        if data.get("is_template"):
            value = _normalize_key(item.get("type"))
            if value:
                discovered.add(value)
    for hint in TEMPLATE_TYPE_HINTS:
        if hint in item_types:
            discovered.add(hint)
    if not discovered:
        discovered.update(TEMPLATE_TYPE_HINTS)
    return sorted(discovered)


def _collect_property_catalog(dataset: List[Dict[str, Any]]):
    property_keys = set()
    property_values: Dict[str, set] = defaultdict(set)
    for item in dataset:
        data = item.get("data") or {}
        for raw_key, raw_val in data.items():
            canonical = _canonical_field_key(raw_key)
            if not canonical:
                continue
            property_keys.add(canonical)
            for value in _ensure_dimension_values(raw_val):
                property_values[canonical].add(value)
    sorted_keys = sorted(property_keys)
    trimmed_values = {
        key: sorted(list(values))[:MAX_PROPERTY_VALUES]
        for key, values in property_values.items()
        if values
    }
    return sorted_keys, trimmed_values


def _build_metadata_payload(dataset: List[Dict[str, Any]]):
    property_keys, property_values = _collect_property_catalog(dataset)
    item_types = _collect_item_types(dataset)
    template_types = _collect_template_types(dataset, item_types)
    return {
        "available_dimensions": _available_dimensions(dataset),
        "available_metrics": _available_metrics(),
        "item_types": item_types,
        "template_types": template_types,
        "properties": property_keys,
        "property_values": property_values,
    }


def _ensure_dimension_values(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        values = [_normalize_key(v) for v in value if _normalize_key(v)]
        return [v for v in values if v]
    norm = _normalize_key(value)
    return [norm] if norm else []


def _dimension_registry():
    return {
        "dataset": {
            "label": "Dataset",
            "extract": lambda item: [_normalize_key(item["data"].get("dataset"))]
            if item["data"].get("dataset")
            else [],
            "format": lambda key: _format_title(key),
        },
        "item_type": {
            "label": "Item Type",
            "extract": lambda item: [item["type"]] if item.get("type") else [],
            "format": lambda key: _format_title(key),
        },
        "item_status": {
            "label": "Item Status",
            "extract": lambda item: [_normalize_key(item["data"].get("status"))]
            if item["data"].get("status")
            else [],
            "format": lambda key: _format_title(key),
        },
        "planned_status": {
            "label": "Planned Status",
            "extract": lambda item: [_normalize_key(item["data"].get("planned_status"))]
            if item["data"].get("planned_status")
            else [],
            "format": lambda key: _format_title(key),
        },
        "priority": {
            "label": "Priority",
            "extract": lambda item: [_normalize_key(item["data"].get("priority"))]
            if item["data"].get("priority")
            else [],
            "format": lambda key: _format_title(key),
        },
        "project": {
            "label": "Project",
            "extract": lambda item: [_normalize_key(item["data"].get("project"))]
            if item["data"].get("project")
            else [],
            "format": lambda key: key.title(),
        },
        "category": {
            "label": "Category",
            "extract": lambda item: [_normalize_key(item["data"].get("category"))]
            if item["data"].get("category")
            else [],
            "format": lambda key: _format_title(key),
        },
        "status_tag": {
            "label": "Status Tag",
            "extract": lambda item: _extract_status_tags(item["data"]),
            "format": lambda key: key.replace(":", ": ").title() if ":" in key else _format_title(key),
        },
        "tag": {
            "label": "Tag",
            "extract": lambda item: [_normalize_key(tag) for tag in _extract_tags(item["data"]) if tag],
            "format": lambda key: _format_title(key),
        },
        "schedule_date": {
            "label": "Schedule Date",
            "extract": lambda item: [_normalize_key(item["data"].get("schedule_date"))]
            if item["data"].get("schedule_date")
            else [],
            "format": lambda key: key,
        },
        "schedule_weekday": {
            "label": "Schedule Weekday",
            "extract": lambda item: [_normalize_key(item["data"].get("schedule_weekday"))]
            if item["data"].get("schedule_weekday")
            else [],
            "format": lambda key: _format_title(key),
        },
        "schedule_start_time": {
            "label": "Scheduled Start Time",
            "extract": lambda item: [_normalize_key(item["data"].get("schedule_start_time"))]
            if item["data"].get("schedule_start_time")
            else [],
            "format": lambda key: _format_time(key),
        },
        "schedule_start_hour": {
            "label": "Scheduled Start Hour",
            "extract": lambda item: [_normalize_key(item["data"].get("schedule_start_hour"))]
            if item["data"].get("schedule_start_hour")
            else [],
            "format": lambda key: _format_hour(key),
        },
        "schedule_end_time": {
            "label": "Scheduled End Time",
            "extract": lambda item: [_normalize_key(item["data"].get("schedule_end_time"))]
            if item["data"].get("schedule_end_time")
            else [],
            "format": lambda key: _format_time(key),
        },
        "schedule_end_hour": {
            "label": "Scheduled End Hour",
            "extract": lambda item: [_normalize_key(item["data"].get("schedule_end_hour"))]
            if item["data"].get("schedule_end_hour")
            else [],
            "format": lambda key: _format_hour(key),
        },
        "actual_start_time": {
            "label": "Actual Start Time",
            "extract": lambda item: [_normalize_key(item["data"].get("actual_start_time"))]
            if item["data"].get("actual_start_time")
            else [],
            "format": lambda key: _format_time(key),
        },
        "actual_start_hour": {
            "label": "Actual Start Hour",
            "extract": lambda item: [_normalize_key(item["data"].get("actual_start_hour"))]
            if item["data"].get("actual_start_hour")
            else [],
            "format": lambda key: _format_hour(key),
        },
        "actual_end_time": {
            "label": "Actual End Time",
            "extract": lambda item: [_normalize_key(item["data"].get("actual_end_time"))]
            if item["data"].get("actual_end_time")
            else [],
            "format": lambda key: _format_time(key),
        },
        "actual_end_hour": {
            "label": "Actual End Hour",
            "extract": lambda item: [_normalize_key(item["data"].get("actual_end_hour"))]
            if item["data"].get("actual_end_hour")
            else [],
            "format": lambda key: _format_hour(key),
        },
        "schedule_parent": {
            "label": "Schedule Parent",
            "extract": lambda item: [_normalize_key(item["data"].get("schedule_parent"))]
            if item["data"].get("schedule_parent")
            else [],
            "format": lambda key: _format_title(key),
        },
        "schedule_depth": {
            "label": "Schedule Depth",
            "extract": lambda item: [_normalize_key(item["data"].get("schedule_depth"))]
            if item["data"].get("schedule_depth") is not None
            else [],
            "format": lambda key: key,
        },
        "schedule_window": {
            "label": "Schedule Window",
            "extract": lambda item: [_normalize_key(item["data"].get("schedule_window"))]
            if item["data"].get("schedule_window")
            else [],
            "format": lambda key: _format_title(key),
        },
        "schedule_is_parallel": {
            "label": "Parallel Block",
            "extract": lambda item: [_normalize_key(item["data"].get("schedule_is_parallel"))]
            if item["data"].get("schedule_is_parallel") is not None
            else [],
            "format": lambda key: _format_bool(key),
        },
        "schedule_is_buffer": {
            "label": "Buffer Block",
            "extract": lambda item: [_normalize_key(item["data"].get("schedule_is_buffer"))]
            if item["data"].get("schedule_is_buffer") is not None
            else [],
            "format": lambda key: _format_bool(key),
        },
    }


DIMENSIONS = _dimension_registry()
BUILTIN_DIMENSION_IDS = {_canonical_field_key(key) for key in DIMENSIONS.keys()}


def _metric_registry():
    def metric_count(items):
        return {"value": len(items), "items": [it["name"] for it in items if it.get("name")]}

    def metric_duration(items):
        total = sum(_duration_minutes(it["data"].get("duration")) for it in items)
        return {"value": total, "unit": "minutes", "items": [it["name"] for it in items if it.get("name")]}

    def metric_points(items):
        total = sum(_points_value(it["data"].get("points")) for it in items)
        return {"value": total, "unit": "points", "items": [it["name"] for it in items if it.get("name")]}

    def metric_list(items):
        names = [it["name"] for it in items if it.get("name")]
        sample = names[:5]
        return {
            "value": ", ".join(sample) if sample else "-",
            "items": names,
            "count": len(names),
        }

    return {
        "count": {"label": "Count", "handler": metric_count},
        "duration": {"label": "Total Minutes", "handler": metric_duration},
        "points": {"label": "Points", "handler": metric_points},
        "list": {"label": "Item List", "handler": metric_list},
    }


METRICS = _metric_registry()


def _available_dimensions(dataset: List[Dict[str, Any]] = None):
    dims = [{"id": key, "label": value["label"]} for key, value in DIMENSIONS.items()]
    seen = {_canonical_field_key(entry["id"]) for entry in dims}
    dataset = dataset or []
    dynamic: Dict[str, str] = {}
    for item in dataset:
        data = item.get("data") or {}
        for raw_key, raw_val in data.items():
            canonical = _canonical_field_key(raw_key)
            if not canonical or canonical in seen or canonical in BUILTIN_DIMENSION_IDS:
                continue
            if isinstance(raw_val, dict):
                continue
            dynamic[canonical] = raw_key
    for key in sorted(dynamic.keys()):
        label = _format_title(key.replace(" ", "_"))
        dims.append({"id": key, "label": f"Property: {label}"})
        seen.add(_canonical_field_key(key))
    return dims


def _available_metrics():
    return [{"id": key, "label": value["label"]} for key, value in METRICS.items()]


def _apply_filters(items: List[Dict[str, Any]], filters: Dict[str, str]) -> List[Dict[str, Any]]:
    if not filters:
        return items

    normalized = { _normalize_key(k): _normalize_key(v) for k, v in filters.items() if v is not None }

    filtered = []
    for item in items:
        include = True
        for key, val in normalized.items():
            if key == "type":
                if _normalize_key(item.get("type")) != val:
                    include = False
                    break
            elif key == "tag":
                tags = [ _normalize_key(tag) for tag in _extract_tags(item["data"]) ]
                if val not in tags:
                    include = False
                    break
            else:
                candidate = _normalize_key(item["data"].get(key))
                if candidate != val:
                    include = False
                    break
        if include:
            filtered.append(item)
    return filtered


def _normalize_dimension_sequence(sequence: List[str], fallback: List[str]) -> List[str]:
    cleaned = []
    for entry in (sequence or []):
        text = _normalize_value(entry)
        if text:
            cleaned.append(text)
    return cleaned or list(fallback)


def _resolve_dimension(dimension_id: str):
    lookup = _normalize_key(dimension_id)
    if lookup in DIMENSIONS:
        base = DIMENSIONS[lookup]
        return {
            "id": lookup,
            "label": base["label"],
            "extract": base["extract"],
            "format": base["format"],
        }
    canonical = _canonical_field_key(dimension_id)
    if not canonical:
        raise ValueError(f"Unknown dimension '{dimension_id}'")

    def extract(item, target=canonical):
        matches: List[str] = []
        data = item.get("data") or {}
        for raw_key, raw_val in data.items():
            if _canonical_field_key(raw_key) == target:
                matches.extend(_ensure_dimension_values(raw_val))
        return matches

    def fmt(value):
        label = _format_title(value) if value else "Unspecified"
        return label

    pretty = _format_title(canonical.replace(" ", "_"))
    return {
        "id": canonical,
        "label": f"Property: {pretty}",
        "extract": extract,
        "format": fmt,
    }


def _dimension_value_prefix(label: str) -> str:
    if not label:
        return ""
    low = label.lower()
    if low.startswith("property:"):
        return label.split(":", 1)[-1].strip() or "Property"
    return label


def _encode_key(parts: List[str]) -> str:
    return json.dumps(parts, ensure_ascii=False, separators=(",", ":"))


def _combine_dimension_parts(item: Dict[str, Any], definitions: List[Dict[str, Any]]):
    if not definitions:
        return []
    value_sets: List[List[tuple]] = []
    for definition in definitions:
        raw_values = definition["extract"](item) or []
        entries = [(value, definition["format"](value)) for value in raw_values if value]
        if not entries:
            return []
        value_sets.append(entries)
    combos = []
    for combo in product(*value_sets):
        keys = [value for value, _ in combo]
        labels = [label for _, label in combo]
        combos.append((keys, labels))
    return combos


def _compute_matrix_from_dataset(
    row_dimensions: List[str],
    col_dimensions: List[str],
    metric: str,
    filters: Dict[str, str] = None,
    row_sort: str = None,
    col_sort: str = None,
):
    if metric not in METRICS:
        raise ValueError(f"Unknown metric '{metric}'")

    rows_sequence = _normalize_dimension_sequence(row_dimensions, ["item_type"])
    cols_sequence = _normalize_dimension_sequence(col_dimensions, ["item_status"])

    row_defs = [_resolve_dimension(dim) for dim in rows_sequence]
    col_defs = [_resolve_dimension(dim) for dim in cols_sequence]

    dataset = _apply_filters(_load_items(), filters or {})
    metadata = _build_metadata_payload(dataset)

    rows_map: Dict[str, str] = {}
    cols_map: Dict[str, str] = {}
    matrix_items: Dict[tuple, List[Dict[str, Any]]] = defaultdict(list)

    for item in dataset:
        row_keys = _combine_dimension_parts(item, row_defs)
        col_keys = _combine_dimension_parts(item, col_defs)
        if not row_keys or not col_keys:
            continue
        for r_parts, r_labels in row_keys:
            row_id = _encode_key(r_parts)
            if row_id not in rows_map:
                pieces = []
                for definition, label in zip(row_defs, r_labels):
                    prefix = _dimension_value_prefix(definition["label"]) or "Row"
                    pieces.append(f"{prefix}: {label}")
                rows_map[row_id] = " | ".join(pieces)
            for c_parts, c_labels in col_keys:
                col_id = _encode_key(c_parts)
                if col_id not in cols_map:
                    pieces = []
                    for definition, label in zip(col_defs, c_labels):
                        prefix = _dimension_value_prefix(definition["label"]) or "Column"
                        pieces.append(f"{prefix}: {label}")
                    cols_map[col_id] = " | ".join(pieces)
                matrix_items[(row_id, col_id)].append(item)

    rows = [{"id": key, "label": rows_map[key]} for key in rows_map.keys()]
    cols = [{"id": key, "label": cols_map[key]} for key in cols_map.keys()]

    metric_handler = METRICS[metric]["handler"]
    cells = {}
    for (rkey, ckey), items in matrix_items.items():
        payload = metric_handler(items)
        payload["items"] = payload.get("items", [])
        cells[f"{rkey}|{ckey}"] = payload

    def _aggregate(entry, axis):
        total = 0.0
        has_value = False
        peers = cols if axis == "row" else rows
        for peer in peers:
            key = f"{entry['id']}|{peer['id']}" if axis == "row" else f"{peer['id']}|{entry['id']}"
            cell = cells.get(key)
            if not cell:
                continue
            value = cell.get("value")
            if isinstance(value, (int, float)):
                total += float(value)
                has_value = True
        return total if has_value else 0.0

    def _sort_entries(entries, mode, axis):
        mode = (mode or DEFAULT_SORT_MODE).lower()
        reverse = mode.endswith("desc")
        if mode.startswith("metric"):
            entries.sort(key=lambda entry: _aggregate(entry, axis), reverse=reverse)
        else:
            entries.sort(key=lambda entry: entry["label"].lower(), reverse=reverse)

    _sort_entries(rows, row_sort or DEFAULT_SORT_MODE, "row")
    _sort_entries(cols, col_sort or DEFAULT_SORT_MODE, "col")

    result = {
        "rows": rows,
        "cols": cols,
        "cells": cells,
        "meta": {
            "metric": metric,
            "metric_label": METRICS[metric]["label"],
            "filters": filters or {},
            "row_dimensions": rows_sequence,
            "col_dimensions": cols_sequence,
            "row_sort": row_sort or DEFAULT_SORT_MODE,
            "col_sort": col_sort or DEFAULT_SORT_MODE,
        },
    }
    result.update(metadata)
    return result


def _metadata_from_dataset():
    dataset = _load_items()
    return _build_metadata_payload(dataset)


def compute_matrix(
    row_dimensions: List[str],
    col_dimensions: List[str],
    metric: str,
    filters: Dict[str, str] = None,
    row_sort: str = None,
    col_sort: str = None,
):
    if _matrix_db_available():
        try:
            return _compute_matrix_from_db(row_dimensions, col_dimensions, metric, filters, row_sort, col_sort)
        except Exception:
            pass
    dataset = _load_items()
    return _compute_matrix_from_dataset(row_dimensions, col_dimensions, metric, filters, row_sort, col_sort)


def get_metadata():
    if _matrix_db_available():
        try:
            return _db_metadata()
        except Exception:
            pass
    return _metadata_from_dataset()


def _db_metadata():
    with _connect_matrix_db() as conn:
        dimension_rows = conn.execute(
            "SELECT DISTINCT dimension, kind FROM dimension_entries"
        ).fetchall()
        dynamic_properties = sorted(
            {row["dimension"] for row in dimension_rows if row["kind"] == "property"}
        )
        dimension_ids = []
        seen = set()
        for builtin in DIMENSIONS.keys():
            if builtin not in seen:
                dimension_ids.append(builtin)
                seen.add(builtin)
        for row in dimension_rows:
            dim = row["dimension"]
            if dim not in seen:
                dimension_ids.append(dim)
                seen.add(dim)
        dims = [{"id": dim, "label": _dimension_label(dim)} for dim in dimension_ids]
        property_values: Dict[str, List[str]] = {}
        for prop in dynamic_properties:
            values = conn.execute(
                """
                SELECT value
                FROM dimension_entries
                WHERE dimension = ?
                GROUP BY value
                ORDER BY value
                LIMIT ?
                """,
                (prop, MAX_PROPERTY_VALUES),
            ).fetchall()
            property_values[prop] = [row["value"] for row in values if row["value"]]
        item_types = [
            row["type"]
            for row in conn.execute(
                "SELECT DISTINCT type FROM items WHERE type IS NOT NULL ORDER BY type"
            )
            if row["type"]
        ]
        template_types = [
            row["value"]
            for row in conn.execute(
                """
                SELECT value
                FROM dimension_entries
                WHERE dimension = 'template_type'
                GROUP BY value
                ORDER BY value
                """
            )
            if row["value"]
        ]
    return {
        "available_dimensions": dims,
        "available_metrics": _available_metrics(),
        "item_types": item_types,
        "template_types": template_types,
        "properties": dynamic_properties,
        "property_values": property_values,
    }


def _compute_matrix_from_db(
    row_dimensions: List[str],
    col_dimensions: List[str],
    metric: str,
    filters: Dict[str, str] = None,
    row_sort: str = None,
    col_sort: str = None,
):
    if metric not in METRICS:
        raise ValueError(f"Unknown metric '{metric}'")

    rows_sequence = _normalize_dimension_sequence(row_dimensions, ["item_type"])
    cols_sequence = _normalize_dimension_sequence(col_dimensions, ["item_status"])

    filters = filters or {}
    joins: List[str] = []
    params: List[Any] = []
    select_parts: List[str] = []
    group_parts: List[str] = []
    alias_refs: List[Dict[str, str]] = []
    alias_counter = 0

    def attach_dimensions(sequence: List[str], prefix: str) -> List[Dict[str, str]]:
        nonlocal alias_counter
        refs: List[Dict[str, str]] = []
        for dim_id in sequence:
            alias = f"{prefix}{alias_counter}"
            alias_counter += 1
            joins.append(
                f"""
                JOIN dimension_entries {alias}
                  ON {alias}.item_id = items.id AND {alias}.dimension = ?
                """
            )
            params.append(dim_id)
            select_parts.append(f"{alias}.value AS {alias}_value")
            select_parts.append(f"{alias}.display AS {alias}_display")
            group_parts.append(f"{alias}.value")
            group_parts.append(f"{alias}.display")
            refs.append({"alias": alias, "dimension": dim_id})
        return refs

    row_refs = attach_dimensions(rows_sequence, "rd")
    col_refs = attach_dimensions(cols_sequence, "cd")

    where_clauses: List[str] = []
    for raw_key, raw_val in filters.items():
        key = _normalize_key(raw_key)
        value = _normalize_key(raw_val)
        if not value:
            continue
        if key == "type":
            where_clauses.append("items.type = ?")
            params.append(value)
        else:
            alias = f"flt{alias_counter}"
            alias_counter += 1
            joins.append(
                f"""
                JOIN dimension_entries {alias}
                  ON {alias}.item_id = items.id AND {alias}.dimension = ? AND {alias}.value = ?
                """
            )
            params.extend([key, value])

    select_parts.extend(
        [
            f"GROUP_CONCAT(DISTINCT items.name, '{NAME_SEPARATOR}') AS item_names",
            "COUNT(DISTINCT items.id) AS metric_count",
            "COALESCE(SUM(items.duration_minutes), 0) AS metric_duration",
            "COALESCE(SUM(items.points_value), 0) AS metric_points",
        ]
    )

    group_clause = ", ".join(group_parts) if group_parts else "items.id"
    where_clause = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    sql = f"""
        SELECT {', '.join(select_parts)}
        FROM items
        {' '.join(joins)}
        {where_clause}
        GROUP BY {group_clause}
    """

    with _connect_matrix_db() as conn:
        rows = conn.execute(sql, params).fetchall()

    rows_map: Dict[str, str] = {}
    cols_map: Dict[str, str] = {}
    cells: Dict[str, Dict[str, Any]] = {}

    for record in rows:
        row_values: List[str] = []
        row_labels: List[str] = []
        for ref in row_refs:
            value = record[f"{ref['alias']}_value"]
            display = _resolve_dimension_display(ref["dimension"], record[f"{ref['alias']}_display"], value)
            row_values.append(value or "")
            row_labels.append(display)
        col_values: List[str] = []
        col_labels: List[str] = []
        for ref in col_refs:
            value = record[f"{ref['alias']}_value"]
            display = _resolve_dimension_display(ref["dimension"], record[f"{ref['alias']}_display"], value)
            col_values.append(value or "")
            col_labels.append(display)

        row_id = _encode_key(row_values)
        col_id = _encode_key(col_values)
        if row_id not in rows_map:
            rows_map[row_id] = _compose_dimension_label(rows_sequence, row_labels)
        if col_id not in cols_map:
            cols_map[col_id] = _compose_dimension_label(cols_sequence, col_labels)

        names = record["item_names"].split(NAME_SEPARATOR) if record["item_names"] else []
        cell_key = f"{row_id}|{col_id}"
        cells[cell_key] = _metric_payload(metric, record, [name for name in names if name])

    rows_list = [{"id": key, "label": rows_map[key]} for key in rows_map.keys()]
    cols_list = [{"id": key, "label": cols_map[key]} for key in cols_map.keys()]

    def _aggregate(entry, axis):
        total = 0.0
        peers = cols_list if axis == "row" else rows_list
        for peer in peers:
            key = f"{entry['id']}|{peer['id']}" if axis == "row" else f"{peer['id']}|{entry['id']}"
            cell = cells.get(key)
            if not cell:
                continue
            value = cell.get("value")
            if isinstance(value, (int, float)):
                total += float(value)
        return total

    def _sort_entries(entries, mode, axis):
        mode = (mode or DEFAULT_SORT_MODE).lower()
        reverse = mode.endswith("desc")
        if mode.startswith("metric"):
            entries.sort(key=lambda entry: _aggregate(entry, axis), reverse=reverse)
        else:
            entries.sort(key=lambda entry: entry["label"].lower(), reverse=reverse)

    _sort_entries(rows_list, row_sort or DEFAULT_SORT_MODE, "row")
    _sort_entries(cols_list, col_sort or DEFAULT_SORT_MODE, "col")

    metadata = _db_metadata()
    result = {
        "rows": rows_list,
        "cols": cols_list,
        "cells": cells,
        "meta": {
            "metric": metric,
            "metric_label": METRICS[metric]["label"],
            "filters": filters or {},
            "row_dimensions": rows_sequence,
            "col_dimensions": cols_sequence,
            "row_sort": row_sort or DEFAULT_SORT_MODE,
            "col_sort": col_sort or DEFAULT_SORT_MODE,
        },
    }
    result.update(metadata)
    return result


def parse_filters(raw: str) -> Dict[str, str]:
    if not raw:
        return {}
    raw = raw.strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return {str(k): str(v) for k, v in parsed.items() if v is not None}
    except Exception:
        pass
    filters = {}
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    for part in parts:
        if ":" in part:
            key, value = part.split(":", 1)
            filters[key.strip()] = value.strip()
    return filters


def parse_dimension_sequence(raw: str, fallback: List[str]) -> List[str]:
    if isinstance(raw, list):
        seed = raw
    else:
        text = _normalize_value(raw)
        if not text:
            seed = None
        else:
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    seed = parsed
                else:
                    seed = [text]
            except Exception:
                seed = [part.strip() for part in text.split(",") if part.strip()]
    cleaned = []
    for entry in (seed or []):
        value = _normalize_value(entry)
        if value:
            cleaned.append(value)
    return cleaned or list(fallback)
