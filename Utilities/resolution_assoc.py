from __future__ import annotations

from copy import deepcopy
from datetime import datetime


CANONICAL_AFFIRMATION = "I am coding my dream productivity system."
CANONICAL_RAW_TEXT = "Release Chronos Engine"
TARGET_TYPES = {"project", "goal", "milestone"}


def _text(value) -> str:
    try:
        return str(value or "").strip()
    except Exception:
        return ""


def _contains_chronos_signal(*values) -> bool:
    blob = " ".join(_text(v).lower() for v in values if _text(v))
    if not blob:
        return False
    return ("chronos" in blob) or ("kairos" in blob)


def _is_resolution_block(value) -> bool:
    return isinstance(value, dict) and bool(value.get("affirmation") or value.get("raw_text"))


def _canonical_resolution() -> dict:
    now = datetime.now()
    return {
        "affirmation": CANONICAL_AFFIRMATION,
        "raw_text": CANONICAL_RAW_TEXT,
        "created_date": now.strftime("%Y-%m-%d"),
        "year": now.year,
    }


def _project_resolution(project_name: str) -> dict | None:
    if not _text(project_name):
        return None
    try:
        from modules.item_manager import read_item_data  # local import to avoid cycles
        project = read_item_data("project", project_name) or {}
    except Exception:
        project = {}
    res = project.get("resolution")
    return deepcopy(res) if _is_resolution_block(res) else None


def _goal_project(goal_name: str) -> str:
    if not _text(goal_name):
        return ""
    try:
        from modules.item_manager import read_item_data  # local import to avoid cycles
        goal = read_item_data("goal", goal_name) or {}
    except Exception:
        goal = {}
    return _text(goal.get("project"))


def _find_chronos_project_resolution() -> dict | None:
    try:
        from modules.item_manager import list_all_items  # local import to avoid cycles
        projects = list_all_items("project") or []
    except Exception:
        projects = []
    for project in projects:
        if not isinstance(project, dict):
            continue
        name = _text(project.get("name"))
        res = project.get("resolution")
        if _contains_chronos_signal(name) and _is_resolution_block(res):
            return deepcopy(res)
    return None


def _infer_resolution_ref_for_item(item_type: str, data: dict) -> str | None:
    t = _text(item_type).lower()
    if t not in {"goal", "milestone"} or not isinstance(data, dict):
        return None
    if _text(data.get("resolution_ref")):
        return None
    project_name = _text(data.get("project"))
    if not project_name and t == "milestone":
        project_name = _goal_project(_text(data.get("goal")))
    if project_name and _is_resolution_block(_project_resolution(project_name)):
        return project_name
    return None


def infer_resolution_for_item(item_type: str, data: dict) -> dict | None:
    t = _text(item_type).lower()
    if t not in TARGET_TYPES or not isinstance(data, dict):
        return None

    # Respect explicit user-provided resolution.
    if _is_resolution_block(data.get("resolution")):
        return None

    # Keep full resolution block on projects only to avoid duplication.
    if t in {"goal", "milestone"}:
        return None

    project_name = _text(data.get("project"))

    # Chronos/Kairos fallback for project/goal/milestone items not explicitly linked yet.
    name = _text(data.get("name"))
    goal = _text(data.get("goal"))
    category = _text(data.get("category"))
    tags = data.get("tags")
    tag_blob = ", ".join(str(v) for v in tags) if isinstance(tags, list) else _text(tags)
    if _contains_chronos_signal(name, project_name, goal, category, tag_blob):
        return _find_chronos_project_resolution() or _canonical_resolution()

    return None


def apply_resolution_associations(item_type: str, data: dict):
    if not isinstance(data, dict):
        return data
    resolution_ref = _infer_resolution_ref_for_item(item_type, data)
    if resolution_ref:
        data["resolution_ref"] = resolution_ref
    inferred = infer_resolution_for_item(item_type, data)
    if inferred:
        data["resolution"] = inferred
    return data
