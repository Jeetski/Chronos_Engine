import os
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional

import yaml


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
USER_DIR = os.path.join(ROOT_DIR, "user")
SCHEDULE_DATE_FORMAT = "%Y-%m-%d"
DAY_RUNTIME_KIND = "kairos_v2_day_runtime"
DAY_RUNTIME_VERSION = 1


def _normalize_date_str(date_value=None) -> str:
    if not date_value:
        return datetime.now().strftime(SCHEDULE_DATE_FORMAT)
    if isinstance(date_value, datetime):
        return date_value.strftime(SCHEDULE_DATE_FORMAT)
    if isinstance(date_value, date):
        return date_value.isoformat()
    return str(date_value)


def schedule_runtime_path_for_date(date_value=None) -> str:
    date_str = _normalize_date_str(date_value)
    return os.path.join(USER_DIR, "schedules", f"schedule_{date_str}.yml")


def is_day_runtime_payload(payload: Any) -> bool:
    return isinstance(payload, dict) and str(payload.get("kind") or "").strip() == DAY_RUNTIME_KIND


def load_schedule_payload_for_date(date_value=None, *, path: Optional[str] = None) -> Any:
    target_path = path or schedule_runtime_path_for_date(date_value)
    if not target_path or not os.path.exists(target_path):
        return {}
    try:
        with open(target_path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
    except Exception:
        return {}
    return data if data is not None else {}


def load_day_runtime(date_value=None, *, path: Optional[str] = None) -> Dict[str, Any]:
    data = load_schedule_payload_for_date(date_value, path=path)
    return data if is_day_runtime_payload(data) else {}


def save_day_runtime(path: str, payload: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        yaml.safe_dump(payload, fh, default_flow_style=False, sort_keys=False, allow_unicode=True)


def extract_schedule_meta(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, dict):
        schedule = payload.get("schedule")
        if isinstance(schedule, dict):
            return schedule
    return {}


def extract_execution_units(payload: Any) -> List[Dict[str, Any]]:
    schedule = extract_schedule_meta(payload)
    timer_handoff = schedule.get("timer_handoff") if isinstance(schedule, dict) else {}
    if isinstance(timer_handoff, dict) and isinstance(timer_handoff.get("execution_units"), list):
        return [unit for unit in timer_handoff.get("execution_units", []) if isinstance(unit, dict)]
    if isinstance(payload, dict) and isinstance(payload.get("execution_units"), list):
        return [unit for unit in payload.get("execution_units", []) if isinstance(unit, dict)]
    return []


def extract_schedule_items(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("items", "children"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def load_schedule_items_for_date(date_value=None, *, path: Optional[str] = None) -> List[Dict[str, Any]]:
    return extract_schedule_items(load_schedule_payload_for_date(date_value, path=path))


def get_flattened_runtime_items(payload: Any) -> List[Dict[str, Any]]:
    flat: List[Dict[str, Any]] = []

    def _walk(items: List[Dict[str, Any]]) -> None:
        for item in items:
            if not isinstance(item, dict):
                continue
            flat.append(item)
            children = item.get("children") or item.get("items") or []
            if isinstance(children, list) and children:
                _walk(children)

    _walk(extract_schedule_items(payload))
    return flat


def _normalize_time_label(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%H:%M")
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(text, fmt).strftime("%H:%M")
        except ValueError:
            continue
    match = re.search(r"(\d{1,2}):(\d{2})", text)
    if not match:
        return None
    hour = max(0, min(23, int(match.group(1))))
    minute = max(0, min(59, int(match.group(2))))
    return f"{hour:02d}:{minute:02d}"


def _time_to_minutes(label: Any) -> Optional[int]:
    normalized = _normalize_time_label(label)
    if not normalized:
        return None
    try:
        parsed = datetime.strptime(normalized, "%H:%M")
    except Exception:
        return None
    return (parsed.hour * 60) + parsed.minute


def _coerce_minutes(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return max(0, int(round(value)))
    text = str(value).strip()
    if not text:
        return 0
    if text.isdigit():
        return max(0, int(text))
    return 0


def _duration_from_range(start_label: Optional[str], end_label: Optional[str]) -> int:
    start_minutes = _time_to_minutes(start_label)
    end_minutes = _time_to_minutes(end_label)
    if start_minutes is None or end_minutes is None:
        return 0
    return max(0, end_minutes - start_minutes)


def _is_buffer_like(kind: Any, item_type: Any) -> bool:
    text = " ".join(
        part.strip().lower()
        for part in (str(kind or ""), str(item_type or ""))
        if str(part or "").strip()
    )
    if not text:
        return False
    return text in {"buffer", "break"} or "buffer" in text or text.endswith(" break")


def _normalize_conceptual_node(node: Dict[str, Any]) -> Dict[str, Any]:
    kind = str(node.get("kind") or "").strip().lower()
    children_in = node.get("children") or []
    children = []
    if isinstance(children_in, list):
        children = [_normalize_conceptual_node(child) for child in children_in if isinstance(child, dict)]

    start_label = _normalize_time_label(node.get("start_time"))
    end_label = _normalize_time_label(node.get("end_time"))
    duration = _coerce_minutes(node.get("duration_minutes")) or _duration_from_range(start_label, end_label)
    raw_type = str(node.get("type") or "").strip().lower()
    anchored = kind == "anchor"
    is_buffer = _is_buffer_like(kind, raw_type)
    item_type = raw_type or ("routine" if children else "task")
    if kind in {"buffer", "break"} and not raw_type:
        item_type = kind
    if kind == "anchor" and not raw_type:
        item_type = "timeblock"

    record: Dict[str, Any] = {
        "name": str(node.get("name") or "Unnamed Item"),
        "type": item_type,
        "kind": kind or None,
        "subtype": kind or None,
        "timeblock_subtype": kind if item_type == "timeblock" else None,
        "identity": node.get("identity"),
        "start_time": start_label,
        "end_time": end_label,
        "duration": duration,
        "children": children,
        "schedule_type": item_type,
        "window_name": kind.upper() if kind else None,
        "window": kind == "window",
        "reschedule": "never" if anchored else str(node.get("reschedule") or "auto"),
        "anchored": anchored,
        "is_buffer": is_buffer,
        "is_break": raw_type == "break" or kind == "break",
        "buffer_type": "break" if (raw_type == "break" or kind == "break") else ("buffer" if is_buffer else None),
        "block_id": str(node.get("identity") or f"{str(node.get('name') or 'unnamed').strip()}@{start_label or 'unscheduled'}"),
        "start_minutes": _time_to_minutes(start_label),
        "end_minutes": _time_to_minutes(end_label),
    }
    return {key: value for key, value in record.items() if value not in (None, [])}


def build_runtime_items_from_conceptual_blocks(conceptual_blocks: Any) -> List[Dict[str, Any]]:
    if not isinstance(conceptual_blocks, list):
        return []
    return [_normalize_conceptual_node(block) for block in conceptual_blocks if isinstance(block, dict)]


def _normalize_execution_unit(unit: Dict[str, Any]) -> Dict[str, Any]:
    kind = str(unit.get("kind") or "").strip().lower()
    item_type = str(unit.get("type") or "").strip().lower()
    parent_kind = str(unit.get("parent_kind") or "").strip().lower()
    start_label = _normalize_time_label(unit.get("start_time"))
    end_label = _normalize_time_label(unit.get("end_time"))
    duration = _coerce_minutes(unit.get("duration_minutes")) or _duration_from_range(start_label, end_label)
    anchored = kind == "anchor" or parent_kind == "anchor"
    is_buffer = _is_buffer_like(kind, item_type)
    normalized_type = item_type or ("buffer" if is_buffer else kind or "task")
    return {
        "name": str(unit.get("name") or "Unnamed block"),
        "type": normalized_type,
        "kind": kind or None,
        "identity": unit.get("identity"),
        "parent_name": unit.get("parent_name"),
        "parent_kind": parent_kind or None,
        "start": start_label,
        "end": end_label,
        "start_time": start_label,
        "end_time": end_label,
        "minutes": duration,
        "duration": duration,
        "is_buffer": is_buffer,
        "is_break": item_type == "break" or kind == "break",
        "anchored": anchored,
        "reschedule": "never" if anchored else "auto",
        "window_name": parent_kind.upper() if parent_kind else None,
        "window": kind == "window" or parent_kind == "window",
        "buffer_type": "break" if (item_type == "break" or kind == "break") else ("buffer" if is_buffer else None),
        "schedule_type": normalized_type,
        "subtype": "anchor" if anchored else (kind or None),
        "timeblock_subtype": "anchor" if anchored and normalized_type == "timeblock" else (kind if normalized_type == "timeblock" else None),
        "block_id": str(unit.get("identity") or f"{str(unit.get('name') or 'unnamed').strip()}@{start_label or 'unscheduled'}"),
        "start_minutes": unit.get("start_minutes") if unit.get("start_minutes") is not None else _time_to_minutes(start_label),
        "end_minutes": unit.get("end_minutes") if unit.get("end_minutes") is not None else _time_to_minutes(end_label),
    }


def _legacy_is_buffer_like(node: Dict[str, Any]) -> bool:
    if not isinstance(node, dict):
        return False
    if bool(node.get("is_buffer")) or bool(node.get("is_break")):
        return True
    block_id = str(node.get("block_id") or "").strip().lower()
    if "::buffer::" in block_id or "::break::" in block_id:
        return True
    if str(node.get("buffer_type") or "").strip():
        return True
    subtype = str(node.get("subtype") or node.get("timeblock_subtype") or "").strip().lower()
    if subtype in {"buffer", "break"}:
        return True
    raw_type = str(node.get("type") or node.get("schedule_type") or "").strip().lower()
    if raw_type in {"buffer", "break"} or "buffer" in raw_type:
        return True
    original = node.get("original_item_data") if isinstance(node.get("original_item_data"), dict) else {}
    if original:
        if bool(original.get("is_buffer")) or bool(original.get("is_break")):
            return True
        if str(original.get("buffer_type") or "").strip():
            return True
        orig_subtype = str(original.get("subtype") or original.get("timeblock_subtype") or "").strip().lower()
        if orig_subtype in {"buffer", "break"}:
            return True
        orig_type = str(original.get("type") or original.get("schedule_type") or "").strip().lower()
        if orig_type in {"buffer", "break"} or "buffer" in orig_type:
            return True
    return False


def _legacy_duration_minutes(node: Dict[str, Any]) -> int:
    if not isinstance(node, dict):
        return 0
    duration = _coerce_minutes(node.get("duration"))
    if duration > 0:
        return duration
    original = node.get("original_item_data") if isinstance(node.get("original_item_data"), dict) else {}
    duration = _coerce_minutes(original.get("duration"))
    if duration > 0:
        return duration
    start_label = _normalize_time_label(node.get("start_time") or original.get("start_time") or node.get("ideal_start_time") or original.get("ideal_start_time"))
    end_label = _normalize_time_label(node.get("end_time") or original.get("end_time") or node.get("ideal_end_time") or original.get("ideal_end_time"))
    return _duration_from_range(start_label, end_label)


def _legacy_should_include(node: Dict[str, Any]) -> bool:
    if _legacy_is_buffer_like(node):
        return True
    children = node.get("children") or node.get("items") or []
    if not isinstance(children, list) or not children:
        return True
    for child in children:
        if not isinstance(child, dict):
            continue
        if _legacy_is_buffer_like(child):
            continue
        if child.get("is_parallel_item"):
            continue
        if _legacy_duration_minutes(child) > 0:
            return False
    return True


def _normalize_legacy_schedule_block(node: Dict[str, Any]) -> Dict[str, Any]:
    original = node.get("original_item_data") if isinstance(node.get("original_item_data"), dict) else {}
    start_label = _normalize_time_label(node.get("start_time") or original.get("start_time") or node.get("ideal_start_time") or original.get("ideal_start_time"))
    end_label = _normalize_time_label(node.get("end_time") or original.get("end_time") or node.get("ideal_end_time") or original.get("ideal_end_time"))
    duration = _legacy_duration_minutes(node)
    item_type = str(node.get("type") or original.get("type") or node.get("schedule_type") or "").strip().lower() or "task"
    anchored = bool(node.get("anchored"))
    if not anchored:
        reschedule = node.get("reschedule")
        if isinstance(reschedule, str):
            anchored = reschedule.strip().lower() == "never"
        elif isinstance(original.get("reschedule"), str):
            anchored = str(original.get("reschedule")).strip().lower() == "never"
    is_buffer = _legacy_is_buffer_like(node)
    return {
        "name": str(node.get("name") or original.get("name") or "Unnamed block"),
        "type": item_type,
        "kind": str(node.get("subtype") or node.get("timeblock_subtype") or item_type or "").strip().lower() or None,
        "identity": node.get("identity"),
        "parent_name": None,
        "parent_kind": None,
        "start": start_label,
        "end": end_label,
        "start_time": start_label,
        "end_time": end_label,
        "minutes": duration,
        "duration": duration,
        "is_buffer": is_buffer,
        "is_break": bool(node.get("is_break")) or item_type == "break",
        "anchored": anchored,
        "reschedule": "never" if anchored else str(node.get("reschedule") or original.get("reschedule") or "auto"),
        "window_name": node.get("window_name") or original.get("window_name"),
        "window": bool(node.get("window")),
        "buffer_type": node.get("buffer_type") or original.get("buffer_type"),
        "schedule_type": item_type,
        "subtype": node.get("subtype") or node.get("timeblock_subtype"),
        "timeblock_subtype": node.get("timeblock_subtype"),
        "block_id": str(node.get("block_id") or node.get("identity") or f"{str(node.get('name') or original.get('name') or 'unnamed').strip()}@{start_label or 'unscheduled'}"),
        "start_minutes": _time_to_minutes(start_label),
        "end_minutes": _time_to_minutes(end_label),
    }


def build_day_runtime_payload(target_date, result: Dict[str, Any]) -> Dict[str, Any]:
    schedule_meta = result.get("schedule", {}) if isinstance(result, dict) else {}
    if not isinstance(schedule_meta, dict):
        schedule_meta = {}
    conceptual = schedule_meta.get("conceptual_schedule", {}) if isinstance(schedule_meta, dict) else {}
    conceptual_blocks = conceptual.get("conceptual_blocks", []) if isinstance(conceptual, dict) else []
    items = build_runtime_items_from_conceptual_blocks(conceptual_blocks)
    execution_units = extract_execution_units({"schedule": schedule_meta})
    generated_at = (
        result.get("generated_at")
        if isinstance(result, dict)
        else None
    ) or datetime.now().isoformat(timespec="seconds")
    return {
        "kind": DAY_RUNTIME_KIND,
        "runtime_version": DAY_RUNTIME_VERSION,
        "engine": "kairos_v2",
        "date": _normalize_date_str(target_date),
        "generated_at": str(generated_at),
        "items": items,
        "schedule": schedule_meta,
        "stats": {
            "item_count": len(get_flattened_runtime_items({"items": items})),
            "execution_unit_count": len(execution_units),
            "conceptual_block_count": len(items),
        },
    }


def build_schedule_plan(payload: Any, *, min_minutes: int = 5, now_dt: Optional[datetime] = None, date_key: Optional[str] = None) -> Dict[str, Any]:
    current_dt = now_dt or datetime.now()
    plan_date = str(date_key or (payload.get("date") if isinstance(payload, dict) else "") or current_dt.strftime(SCHEDULE_DATE_FORMAT)).strip()
    blocks: List[Dict[str, Any]] = []
    execution_units = extract_execution_units(payload)
    source_blocks: List[Dict[str, Any]] = []
    if execution_units:
        source_blocks = [_normalize_execution_unit(unit) for unit in execution_units]
    else:
        for node in get_flattened_runtime_items(payload):
            if not isinstance(node, dict):
                continue
            if node.get("is_parallel_item"):
                continue
            if not _legacy_should_include(node):
                continue
            normalized = _normalize_legacy_schedule_block(node)
            if max(0, int(normalized.get("minutes") or 0)) <= 0:
                continue
            source_blocks.append(normalized)

    for normalized in source_blocks:
        minutes = max(0, int(normalized.get("minutes") or 0))
        if minutes <= 0:
            continue
        start_minutes = normalized.get("start_minutes")
        end_minutes = normalized.get("end_minutes")
        if plan_date == current_dt.strftime(SCHEDULE_DATE_FORMAT) and end_minutes is not None:
            now_minutes = (current_dt.hour * 60) + current_dt.minute
            if int(end_minutes) <= now_minutes:
                continue
            if start_minutes is not None and int(start_minutes) <= now_minutes < int(end_minutes):
                minutes = max(1, int(end_minutes) - now_minutes)
        if (not normalized.get("is_buffer")) and minutes < max(1, int(min_minutes)):
            continue
        normalized["minutes"] = minutes
        normalized["date"] = plan_date
        blocks.append(normalized)

    blocks.sort(
        key=lambda block: (
            block.get("start_minutes") if block.get("start_minutes") is not None else 10**9,
            str(block.get("name") or "").lower(),
        )
    )
    return {
        "generated_at": current_dt.isoformat(timespec="seconds"),
        "source": "kairos_v2_runtime",
        "date": plan_date,
        "blocks": blocks,
    }


def load_schedule_plan_for_date(date_value=None, *, min_minutes: int = 5, now_dt: Optional[datetime] = None) -> Dict[str, Any]:
    runtime = load_day_runtime(date_value)
    if not runtime:
        return {
            "generated_at": (now_dt or datetime.now()).isoformat(timespec="seconds"),
            "source": "kairos_v2_runtime",
            "date": _normalize_date_str(date_value),
            "blocks": [],
        }
    return build_schedule_plan(
        runtime,
        min_minutes=min_minutes,
        now_dt=now_dt,
        date_key=_normalize_date_str(date_value),
    )
