from __future__ import annotations

import os
import re
from collections import Counter
from datetime import date, datetime
from typing import Any
from urllib.parse import parse_qs

import yaml

from modules.item_manager import list_all_items_any
from modules.scheduler import schedule_path_for_date, status_current_path

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.yml")
PROFILE_PATH = os.path.join(ROOT_DIR, "user", "profile", "profile.yml")

DEFAULT_CONFIG = {
    "project": {"name": "Thoughtforms", "mode": "prototype"},
    "frontend": {"dev_port": 4174},
    "api": {"bootstrap_limit": 12, "query_limit": 8},
    "board": {
        "note_width": 280,
        "base_y": 120,
        "source_lanes": {"chronos": 120, "today": 460, "query": 820},
        "column_gap": 32,
        "row_gap": 28,
    },
    "palette": {
        "task": "#f97316",
        "goal": "#22c55e",
        "project": "#38bdf8",
        "note": "#facc15",
        "journal_entry": "#fb7185",
        "habit": "#a78bfa",
        "today_block": "#60a5fa",
        "default": "#94a3b8",
    },
}

TYPE_PRIORITY = {
    "goal": 0,
    "project": 1,
    "task": 2,
    "habit": 3,
    "note": 4,
    "journal_entry": 5,
}


def _read_yaml(path: str) -> Any:
    try:
        if not os.path.exists(path):
            return {}
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        return data if data is not None else {}
    except Exception:
        return {}


def _deep_merge(base: Any, override: Any) -> Any:
    if not isinstance(base, dict) or not isinstance(override, dict):
        return override
    merged = dict(base)
    for key, value in override.items():
        if key in merged:
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _load_config() -> dict[str, Any]:
    raw = _read_yaml(CONFIG_PATH)
    if not isinstance(raw, dict):
        raw = {}
    return _deep_merge(DEFAULT_CONFIG, raw)


def _slug(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "item"


def _coerce_text(value: Any, limit: int = 180) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        value = ", ".join(str(part).strip() for part in value if str(part).strip())
    elif isinstance(value, dict):
        value = yaml.safe_dump(value, allow_unicode=True, sort_keys=False)
    text = str(value).strip()
    text = re.sub(r"\s+", " ", text)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "..."


def _tokenize(text: str) -> list[str]:
    return [token for token in re.findall(r"[a-z0-9_]{2,}", str(text or "").lower()) if token]


def _load_profile() -> dict[str, Any]:
    payload = _read_yaml(PROFILE_PATH)
    return payload if isinstance(payload, dict) else {}


def _load_status() -> dict[str, Any]:
    path = status_current_path()
    payload = _read_yaml(path)
    return payload if isinstance(payload, dict) else {}


def _load_today_blocks() -> list[dict[str, Any]]:
    path = schedule_path_for_date(date.today())
    payload = _read_yaml(path)
    rows: list[Any]
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = payload.get("blocks") or payload.get("schedule") or []
    else:
        rows = []
    blocks: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        blocks.append(
            {
                "name": str(row.get("name") or "Untitled block").strip() or "Untitled block",
                "type": str(row.get("type") or "today_block").strip() or "today_block",
                "start": str(row.get("start_time") or row.get("start") or "").strip(),
                "end": str(row.get("end_time") or row.get("end") or "").strip(),
                "status": str(row.get("status") or "").strip(),
                "category": str(row.get("category") or "").strip(),
            }
        )
    return blocks


def _load_all_items() -> list[dict[str, Any]]:
    rows = list_all_items_any() or []
    items = [row for row in rows if isinstance(row, dict) and str(row.get("name") or "").strip()]
    items.sort(key=lambda row: (TYPE_PRIORITY.get(str(row.get("type") or "").lower(), 99), str(row.get("name") or "").lower()))
    return items


def _lane_x(config: dict[str, Any], lane: str) -> int:
    board = config.get("board") if isinstance(config.get("board"), dict) else {}
    lanes = board.get("source_lanes") if isinstance(board.get("source_lanes"), dict) else {}
    value = lanes.get(lane)
    try:
        return int(value)
    except Exception:
        return 120


def _color_for(config: dict[str, Any], kind: str) -> str:
    palette = config.get("palette") if isinstance(config.get("palette"), dict) else {}
    return str(palette.get(kind) or palette.get("default") or "#94a3b8")


def _layout_position(config: dict[str, Any], lane: str, index: int) -> tuple[int, int]:
    board = config.get("board") if isinstance(config.get("board"), dict) else {}
    base_y = int(board.get("base_y") or 120)
    row_gap = int(board.get("row_gap") or 28)
    column_gap = int(board.get("column_gap") or 32)
    note_width = int(board.get("note_width") or 280)
    column = index % 2
    row = index // 2
    x = _lane_x(config, lane) + (column * (note_width + column_gap))
    y = base_y + (row * (160 + row_gap))
    return x, y


def _node_from_item(config: dict[str, Any], item: dict[str, Any], index: int, lane: str, *, transient: bool) -> dict[str, Any]:
    item_type = str(item.get("type") or "item").strip().lower() or "item"
    name = str(item.get("name") or "Untitled").strip() or "Untitled"
    x, y = _layout_position(config, lane, index)
    summary_bits = [
        _coerce_text(item.get("category"), 40),
        _coerce_text(item.get("status"), 40),
        _coerce_text(item.get("priority"), 40),
    ]
    summary = " | ".join(bit for bit in summary_bits if bit)
    body = _coerce_text(
        item.get("content")
        or item.get("description")
        or item.get("summary")
        or item.get("notes")
        or item.get("why")
        or item.get("details"),
        220,
    )
    tags = item.get("tags") if isinstance(item.get("tags"), list) else []
    return {
        "id": f"chronos-item:{item_type}:{_slug(name)}",
        "kind": item_type,
        "title": name,
        "subtitle": summary,
        "body": body,
        "tags": [str(tag).strip() for tag in tags if str(tag).strip()][:6],
        "x": x,
        "y": y,
        "width": int(config.get("board", {}).get("note_width") or 280),
        "color": _color_for(config, item_type),
        "source": "chronos",
        "transient": bool(transient),
    }


def _node_from_block(config: dict[str, Any], block: dict[str, Any], index: int) -> dict[str, Any]:
    name = str(block.get("name") or "Untitled block").strip() or "Untitled block"
    subtitle = " -> ".join(part for part in [str(block.get("start") or "").strip(), str(block.get("end") or "").strip()] if part)
    body = " | ".join(part for part in [str(block.get("type") or "").strip(), str(block.get("category") or "").strip(), str(block.get("status") or "").strip()] if part)
    x, y = _layout_position(config, "today", index)
    return {
        "id": f"chronos-block:{_slug(name)}:{_slug(block.get('start'))}",
        "kind": "today_block",
        "title": name,
        "subtitle": subtitle,
        "body": body,
        "tags": ["today"],
        "x": x,
        "y": y,
        "width": int(config.get("board", {}).get("note_width") or 280),
        "color": _color_for(config, "today_block"),
        "source": "today",
        "transient": False,
    }


def _search_blob(item: dict[str, Any]) -> str:
    parts = [
        item.get("name"),
        item.get("type"),
        item.get("category"),
        item.get("status"),
        item.get("priority"),
        item.get("content"),
        item.get("description"),
        item.get("summary"),
        item.get("notes"),
        item.get("why"),
    ]
    tags = item.get("tags")
    if isinstance(tags, list):
        parts.extend(tags)
    return " ".join(_coerce_text(part, 400) for part in parts if part).lower()


def _score_item(item: dict[str, Any], tokens: list[str]) -> int:
    blob = _search_blob(item)
    name = str(item.get("name") or "").lower()
    item_type = str(item.get("type") or "").lower()
    score = 0
    for token in tokens:
        if token in name:
            score += 6
        if token == item_type:
            score += 5
        if token in blob:
            score += 2
    return score


def build_bootstrap_payload() -> dict[str, Any]:
    config = _load_config()
    profile = _load_profile()
    status = _load_status()
    today_blocks = _load_today_blocks()
    items = _load_all_items()
    limit = int(config.get("api", {}).get("bootstrap_limit") or 12)
    chosen_items = items[:limit]
    nodes = [_node_from_item(config, item, idx, "chronos", transient=False) for idx, item in enumerate(chosen_items)]
    nodes.extend(_node_from_block(config, block, idx) for idx, block in enumerate(today_blocks[:4]))
    counts = Counter(str(item.get("type") or "item").strip().lower() or "item" for item in items)
    return {
        "ok": True,
        "message": "Thoughtforms is connected to Chronos.",
        "meta": {
            "projectName": str(config.get("project", {}).get("name") or "Thoughtforms"),
            "mode": str(config.get("project", {}).get("mode") or "prototype"),
            "fetchedAt": datetime.now().isoformat(timespec="seconds"),
        },
        "context": {
            "profile": {
                "nickname": str(profile.get("nickname") or profile.get("name") or "").strip(),
                "theme": str(profile.get("theme") or "").strip(),
            },
            "status": {str(key): str(value) for key, value in status.items() if value not in (None, "")},
            "today": {
                "date": date.today().isoformat(),
                "blockCount": len(today_blocks),
                "blocks": today_blocks[:6],
            },
            "counts": dict(counts),
        },
        "nodes": nodes,
    }


def build_query_payload(prompt: str) -> dict[str, Any]:
    config = _load_config()
    clean_prompt = str(prompt or "").strip()
    tokens = _tokenize(clean_prompt)
    if not tokens:
        return {
            "ok": True,
            "prompt": clean_prompt,
            "reply": "Ask about today, a goal, a project, a habit, or any Chronos item name.",
            "nodes": [],
        }

    items = _load_all_items()
    scored: list[tuple[int, dict[str, Any]]] = []
    for item in items:
        score = _score_item(item, tokens)
        if score > 0:
            scored.append((score, item))
    scored.sort(key=lambda row: (-row[0], TYPE_PRIORITY.get(str(row[1].get("type") or "").lower(), 99), str(row[1].get("name") or "").lower()))
    limit = int(config.get("api", {}).get("query_limit") or 8)
    top_items = [item for _score, item in scored[:limit]]

    nodes = [_node_from_item(config, item, idx, "query", transient=True) for idx, item in enumerate(top_items)]

    today_blocks = _load_today_blocks()
    if any(token in {"today", "schedule", "agenda", "plan"} for token in tokens):
        nodes.extend(_node_from_block(config, block, idx + len(nodes)) for idx, block in enumerate(today_blocks[:3]))

    hit_counts = Counter(str(item.get("type") or "item").strip().lower() or "item" for item in top_items)
    if top_items:
        parts = [f"{value} {key}" for key, value in sorted(hit_counts.items())]
        reply = f"Found {len(top_items)} Chronos matches for '{clean_prompt}'. Surface mix: " + ", ".join(parts) + "."
    elif today_blocks and any(token in {"today", "schedule", "agenda", "plan"} for token in tokens):
        reply = f"I did not find matching items for '{clean_prompt}', but I surfaced today's schedule blocks."
    else:
        reply = f"No direct Chronos matches for '{clean_prompt}'. Try a specific item name, type, or 'today'."

    return {
        "ok": True,
        "prompt": clean_prompt,
        "reply": reply,
        "nodes": nodes,
        "context": {
            "matches": len(top_items),
            "hitsByType": dict(hit_counts),
        },
    }


def _handle_search(handler: Any, parsed: Any) -> None:
    qs = parse_qs(parsed.query or "")
    query = (qs.get("q") or [""])[0]
    handler._write_json(200, build_query_payload(query))


def handle_get(handler: Any, parsed: Any) -> bool:
    if parsed.path == "/api/thoughtforms/health":
        handler._write_json(
            200,
            {
                "ok": True,
                "service": "thoughtforms",
                "fetchedAt": datetime.now().isoformat(timespec="seconds"),
            },
        )
        return True
    if parsed.path == "/api/thoughtforms/bootstrap":
        handler._write_json(200, build_bootstrap_payload())
        return True
    if parsed.path == "/api/thoughtforms/search":
        _handle_search(handler, parsed)
        return True
    return False


def handle_post(handler: Any, parsed: Any, payload: Any) -> bool:
    if parsed.path != "/api/thoughtforms/query":
        return False
    if not isinstance(payload, dict):
        handler._write_json(400, {"ok": False, "error": "Payload must be a map"})
        return True
    prompt = str(payload.get("prompt") or "").strip()
    handler._write_json(200, build_query_payload(prompt))
    return True
