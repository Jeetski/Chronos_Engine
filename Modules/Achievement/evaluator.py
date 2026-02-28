from __future__ import annotations

from datetime import datetime
from typing import Any

from Modules.ItemManager import list_all_items, read_item_data, write_item_data, get_user_dir


def _settings_path() -> str:
    base = get_user_dir()
    return f"{base}/Settings/achievements_settings.yml"


def _profile_path() -> str:
    base = get_user_dir()
    return f"{base}/Profile/profile.yml"


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _now_ms() -> int:
    return int(datetime.now().timestamp() * 1000)


def _slug(s: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in str(s or "").strip().lower()).strip("_")


def _to_int(v: Any, default: int = 0) -> int:
    try:
        if v is None or v == "":
            return default
        return int(v)
    except Exception:
        return default


def _to_float(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "":
            return default
        return float(v)
    except Exception:
        return default


def _load_yaml(path: str) -> dict:
    try:
        import yaml
    except Exception:
        return {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_yaml(path: str, data: dict) -> None:
    try:
        import yaml
    except Exception:
        return
    try:
        with open(path, "w", encoding="utf-8") as fh:
            yaml.dump(data, fh, default_flow_style=False, allow_unicode=True)
    except Exception:
        return


def _load_settings() -> dict:
    cfg = _load_yaml(_settings_path())
    if not cfg:
        cfg = {}
    leveling = cfg.get("leveling") if isinstance(cfg.get("leveling"), dict) else {}
    awards = cfg.get("awards") if isinstance(cfg.get("awards"), dict) else {}
    sync = cfg.get("sync") if isinstance(cfg.get("sync"), dict) else {}
    cfg["enabled"] = bool(cfg.get("enabled", True))
    cfg["awards"] = {
        "default_points": _to_int(awards.get("default_points"), 10),
        "default_xp": _to_int(awards.get("default_xp"), 10),
    }
    cfg["leveling"] = {
        "max_level": max(1, _to_int(leveling.get("max_level"), 100)),
        "base_xp_to_level_2": max(1, _to_int(leveling.get("base_xp_to_level_2"), 1000)),
        "growth": max(1.0, _to_float(leveling.get("growth"), 1.06)),
    }
    cfg["sync"] = {
        "run_on_review": bool(sync.get("run_on_review", True)),
    }
    return cfg


def _calc_level_from_xp(total_xp: int, settings: dict) -> dict:
    total = max(0, _to_int(total_xp, 0))
    lvl_cfg = settings.get("leveling") or {}
    max_level = max(1, _to_int(lvl_cfg.get("max_level"), 100))
    base = max(1, _to_int(lvl_cfg.get("base_xp_to_level_2"), 1000))
    growth = max(1.0, _to_float(lvl_cfg.get("growth"), 1.06))

    level = 1
    spent = 0
    while level < max_level:
        need = int(round(base * (growth ** (level - 1))))
        if total < spent + need:
            break
        spent += need
        level += 1

    if level >= max_level:
        return {
            "level": max_level,
            "xp_total": total,
            "xp_into_level": 0,
            "xp_to_next_level": 0,
        }

    need_next = int(round(base * (growth ** (level - 1))))
    into = max(0, total - spent)
    return {
        "level": level,
        "xp_total": total,
        "xp_into_level": into,
        "xp_to_next_level": max(1, need_next),
    }


def _load_profile() -> dict:
    data = _load_yaml(_profile_path())
    return data if isinstance(data, dict) else {}


def _save_profile(data: dict) -> None:
    _save_yaml(_profile_path(), data)


def _achievement_id(row: dict) -> str:
    rid = str(row.get("id") or "").strip()
    if rid:
        return rid
    return _slug(str(row.get("name") or ""))


def _is_awarded(row: dict) -> bool:
    status = str(row.get("status") or "").strip().lower()
    return bool(row.get("awarded")) or bool(row.get("awarded_at")) or status in ("awarded", "done", "completed")


def _iter_achievements() -> list[dict]:
    rows = list_all_items("achievement") or []
    out: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        out.append(row)
    return out


def _read_achievement(row: dict) -> tuple[str, dict] | tuple[None, None]:
    name = str(row.get("name") or "").strip()
    if not name:
        return None, None
    data = read_item_data("achievement", name)
    if not isinstance(data, dict):
        return None, None
    return name, data


def _award_payload(ach_data: dict, settings: dict) -> tuple[int, int]:
    awards = settings.get("awards") or {}
    points = _to_int(ach_data.get("points"), _to_int(awards.get("default_points"), 10))
    xp = _to_int(ach_data.get("xp"), _to_int(awards.get("default_xp"), 10))
    return points, xp


def _apply_rewards(
    name: str,
    ach_id: str,
    points: int,
    xp: int,
    source: str | None,
    *,
    title: str | None = None,
    description: str | None = None,
) -> dict:
    profile = _load_profile()
    settings = _load_settings()
    prev_total_xp = _to_int(profile.get("xp_total"), 0)
    prev_state = _calc_level_from_xp(prev_total_xp, settings)
    prev_level = _to_int(prev_state.get("level"), 1)
    next_total_xp = max(0, prev_total_xp + max(0, xp))
    lvl = _calc_level_from_xp(next_total_xp, settings)
    next_level = _to_int(lvl.get("level"), 1)
    levels_gained = max(0, next_level - prev_level)
    leveled_up = levels_gained > 0
    profile["xp_total"] = lvl["xp_total"]
    profile["level"] = lvl["level"]
    profile["xp_into_level"] = lvl["xp_into_level"]
    profile["xp_to_next_level"] = lvl["xp_to_next_level"]
    award_event = {
        "event_id": f"{ach_id}:{_now_ms()}",
        "name": name,
        "title": str(title or name or "").strip(),
        "description": str(description or "").strip(),
        "id": ach_id,
        "source": source or "",
        "awarded_at": _now_str(),
        "xp": xp,
        "points": points,
        "level_before": prev_level,
        "level_after": next_level,
        "leveled_up": leveled_up,
        "levels_gained": levels_gained,
        "level": lvl["level"],
        "xp_total": lvl["xp_total"],
        "xp_into_level": lvl["xp_into_level"],
        "xp_to_next_level": lvl["xp_to_next_level"],
    }
    profile["last_achievement_award"] = award_event
    feed = profile.get("achievement_award_feed")
    if not isinstance(feed, list):
        feed = []
    feed.append(award_event)
    profile["achievement_award_feed"] = feed[-100:]
    _save_profile(profile)

    if points > 0:
        try:
            from Utilities import points as Points
            Points.add_points(points, reason="achievement", source_item=name, tags=["achievement", ach_id])
        except Exception:
            pass

    return {
        "xp_total": lvl["xp_total"],
        "level": lvl["level"],
        "xp_into_level": lvl["xp_into_level"],
        "xp_to_next_level": lvl["xp_to_next_level"],
    }


def award_by_id(achievement_id: str, *, source: str | None = None, context: dict | None = None) -> dict:
    settings = _load_settings()
    if not settings.get("enabled", True):
        return {"ok": False, "error": "achievements disabled"}

    target = _slug(achievement_id)
    for row in _iter_achievements():
        rid = _achievement_id(row)
        if rid != target:
            continue
        name, data = _read_achievement(row)
        if not name or not data:
            return {"ok": False, "error": "achievement not found"}
        if _is_awarded(data):
            return {"ok": True, "awarded": False, "already_awarded": True, "id": rid, "name": name}

        points, xp = _award_payload(data, settings)
        now = _now_str()
        data["id"] = rid
        data["awarded"] = True
        data["status"] = "awarded"
        data["awarded_at"] = data.get("awarded_at") or now
        data["awarded_by"] = source or "evaluator"
        data["title"] = str(data.get("title") or data.get("name") or "")
        if points is not None:
            data["points"] = points
        if xp is not None:
            data["xp"] = xp
        write_item_data("achievement", name, data)
        profile_state = _apply_rewards(
            name,
            rid,
            points,
            xp,
            source,
            title=str(data.get("title") or name),
            description=str(data.get("description") or data.get("notes") or ""),
        )
        return {
            "ok": True,
            "awarded": True,
            "id": rid,
            "name": name,
            "points": points,
            "xp": xp,
            "profile": profile_state,
            "context": context or {},
        }

    return {"ok": False, "error": "achievement id not found"}


def award_by_name(name: str, *, source: str | None = None, context: dict | None = None) -> dict:
    target = str(name or "").strip().lower()
    if not target:
        return {"ok": False, "error": "missing achievement name"}
    for row in _iter_achievements():
        nm = str(row.get("name") or "").strip()
        if nm.lower() != target:
            continue
        rid = _achievement_id(row)
        return award_by_id(rid, source=source, context=context)
    return {"ok": False, "error": "achievement name not found"}


def _event_match(ach: dict, event_name: str, payload: dict) -> bool:
    trigger = ach.get("trigger")
    if not isinstance(trigger, dict):
        return False
    if str(trigger.get("type") or "").strip().lower() != "event":
        return False
    if str(trigger.get("event") or "").strip().lower() != str(event_name or "").strip().lower():
        return False
    when = trigger.get("when")
    if not isinstance(when, dict):
        return True

    command = str((payload or {}).get("command") or "").strip().lower()
    args = (payload or {}).get("args")
    args = args if isinstance(args, list) else []
    arg0 = str(args[0]).strip().lower() if args else ""
    args_l = [str(a).strip().lower() for a in args]

    eq_cmd = when.get("command")
    if eq_cmd and command != str(eq_cmd).strip().lower():
        return False
    cmd_in = when.get("command_in")
    if isinstance(cmd_in, list) and cmd_in:
        allowed = {str(v).strip().lower() for v in cmd_in}
        if command not in allowed:
            return False
    eq_arg0 = when.get("arg0")
    if eq_arg0 and arg0 != str(eq_arg0).strip().lower():
        return False
    arg0_in = when.get("arg0_in")
    if isinstance(arg0_in, list) and arg0_in:
        allowed = {str(v).strip().lower() for v in arg0_in}
        if arg0 not in allowed:
            return False
    args_contains = when.get("args_contains")
    if isinstance(args_contains, list):
        for needle in args_contains:
            if str(needle).strip().lower() not in args_l:
                return False
    elif isinstance(args_contains, str):
        if args_contains.strip().lower() not in args_l:
            return False

    # Generic payload field equality for non-command events.
    reserved = {"command", "command_in", "arg0", "arg0_in", "args_contains"}
    for key, expected in when.items():
        if key in reserved:
            continue
        actual = (payload or {}).get(key)
        if isinstance(expected, list):
            allowed = {str(v).strip().lower() for v in expected}
            if str(actual or "").strip().lower() not in allowed:
                return False
        else:
            if str(actual or "").strip().lower() != str(expected or "").strip().lower():
                return False
    return True


def emit_event(event_name: str, payload: dict | None = None) -> list[dict]:
    settings = _load_settings()
    if not settings.get("enabled", True):
        return []
    results: list[dict] = []
    payload = payload if isinstance(payload, dict) else {}
    for row in _iter_achievements():
        ach_id = _achievement_id(row)
        if not ach_id:
            continue
        if not _event_match(row, event_name, payload):
            continue
        res = award_by_id(ach_id, source=f"event:{event_name}", context=payload)
        results.append(res)
    return results


def _check_habit_streak(days: int) -> bool:
    habits = list_all_items("habit") or []
    for h in habits:
        if not isinstance(h, dict):
            continue
        polarity = str(h.get("polarity") or "good").strip().lower()
        if polarity == "bad":
            streak = _to_int(h.get("clean_current_streak"), 0)
        else:
            streak = _to_int(h.get("current_streak"), 0)
        if streak >= days:
            return True
    return False


def _check_commitment_streak(days: int) -> bool:
    commitments = list_all_items("commitment") or []
    for c in commitments:
        if not isinstance(c, dict):
            continue
        streak = _to_int(c.get("streak_current"), _to_int(c.get("current_streak"), 0))
        if streak >= days:
            return True
    return False


def _check_first_goal_milestone() -> bool:
    milestones = list_all_items("milestone") or []
    for m in milestones:
        if not isinstance(m, dict):
            continue
        status = str(m.get("status") or "").strip().lower()
        if status in ("completed", "done"):
            return True
    return False


def _check_due_item_met() -> bool:
    for t in ("task", "goal", "milestone", "commitment"):
        rows = list_all_items(t) or []
        for row in rows:
            if not isinstance(row, dict):
                continue
            due = str(row.get("due_date") or row.get("deadline") or row.get("due") or "").strip()
            if not due:
                continue
            due_day = due[:10]
            if len(due_day) != 10:
                continue
            completed = str(row.get("last_completed") or row.get("completed") or "").strip()
            if not completed:
                cds = row.get("completion_dates")
                if isinstance(cds, list) and cds:
                    completed = str(cds[-1] or "").strip()
            if not completed:
                continue
            comp_day = completed[:10]
            if comp_day and comp_day <= due_day:
                return True
    return False


def evaluate_sync(*, now: datetime | None = None) -> list[dict]:
    settings = _load_settings()
    if not settings.get("enabled", True):
        return []

    results: list[dict] = []
    for row in _iter_achievements():
        trigger = row.get("trigger")
        if not isinstance(trigger, dict):
            continue
        if str(trigger.get("type") or "").strip().lower() != "sync":
            continue
        rule = str(trigger.get("rule") or "").strip().lower()
        params = trigger.get("params") if isinstance(trigger.get("params"), dict) else {}
        ok = False
        if rule == "habit_streak_at_least":
            ok = _check_habit_streak(_to_int(params.get("days"), 7))
        elif rule == "commitment_streak_at_least":
            ok = _check_commitment_streak(_to_int(params.get("days"), 7))
        elif rule == "any_milestone_completed":
            ok = _check_first_goal_milestone()
        elif rule == "any_due_item_met":
            ok = _check_due_item_met()

        if not ok:
            continue
        ach_id = _achievement_id(row)
        if not ach_id:
            continue
        res = award_by_id(ach_id, source="sync", context={"rule": rule, "params": params})
        results.append(res)

    return results


def reset_all(*, clear_archive: bool = True) -> dict:
    settings = _load_settings()
    reset_count = 0
    touched = 0
    for row in _iter_achievements():
        name, data = _read_achievement(row)
        if not name or not data:
            continue
        touched += 1
        had_award = _is_awarded(data)
        data["awarded"] = False
        data["status"] = "pending"
        data.pop("awarded_at", None)
        data.pop("awarded_by", None)
        if clear_archive:
            data["archived"] = False
        write_item_data("achievement", name, data)
        if had_award:
            reset_count += 1

    lvl = _calc_level_from_xp(0, settings)
    profile = _load_profile()
    profile["xp_total"] = lvl["xp_total"]
    profile["level"] = lvl["level"]
    profile["xp_into_level"] = lvl["xp_into_level"]
    profile["xp_to_next_level"] = lvl["xp_to_next_level"]
    profile["last_achievement_award"] = {}
    profile["achievement_award_feed"] = []
    _save_profile(profile)

    return {
        "ok": True,
        "touched": touched,
        "reset_awarded": reset_count,
        "profile": {
            "xp_total": lvl["xp_total"],
            "level": lvl["level"],
            "xp_into_level": lvl["xp_into_level"],
            "xp_to_next_level": lvl["xp_to_next_level"],
        },
    }


def reset_progress() -> dict:
    settings = _load_settings()
    lvl = _calc_level_from_xp(0, settings)
    profile = _load_profile()
    profile["xp_total"] = lvl["xp_total"]
    profile["level"] = lvl["level"]
    profile["xp_into_level"] = lvl["xp_into_level"]
    profile["xp_to_next_level"] = lvl["xp_to_next_level"]
    profile["last_achievement_award"] = {}
    profile["achievement_award_feed"] = []
    _save_profile(profile)
    return {
        "ok": True,
        "profile": {
            "xp_total": lvl["xp_total"],
            "level": lvl["level"],
            "xp_into_level": lvl["xp_into_level"],
            "xp_to_next_level": lvl["xp_to_next_level"],
        },
    }
