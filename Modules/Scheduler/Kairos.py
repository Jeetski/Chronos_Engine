"""
Kairos Scheduler (active `today` scheduling engine).

Design goals:
1) Build a realistic day plan from a large executable backlog.
2) Preserve hard constraints first (anchors, fixed windows, required context).
3) Maximize value in remaining space using weighted ranking.
4) Emit rich phase notes for observability and debugging.

High-level pipeline:
- load runtime context (status, settings, scoring weights, trend map)
- resolve day template windows
- gather candidates from core DB
- filter candidates by executability + context constraints
- score candidates
- construct schedule (anchors -> injections -> windows -> gaps -> synthetic timeblocks)
- emit decision log
"""

import json
import os
import sqlite3
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

import yaml

from Utilities.duration_parser import parse_duration_string  # type: ignore

# Item types Kairos can place into a concrete daily timeline.
EXECUTABLE_TYPES = {"week", "day", "routine", "subroutine", "microroutine", "task", "habit"}

# Name heuristics for "likely fixed" items when explicit anchor metadata is missing.
ANCHOR_NAME_HINTS = ("sleep", "work", "uni", "school", "commute", "transit", "bedtime")


class KairosScheduler:
    def __init__(self, user_context: Dict[str, Any] = None):
        """Initialize per-run state and optional user overrides."""
        self.user_context = user_context or {}
        self.decision_log: List[str] = []
        self.phase_notes: Dict[str, Any] = {}
        self.last_schedule: Dict[str, Any] = {}
        self.last_target_date: Optional[date] = None
        self.runtime: Dict[str, Any] = {}
        self.windows: List[Dict[str, Any]] = []
        self.template_timeblocks: List[Dict[str, Any]] = []

    def _normalize_key(self, value: Any) -> str:
        """Normalize arbitrary keys into a stable snake-ish token for matching."""
        if value is None:
            return ""
        return str(value).strip().lower().replace(" ", "_")

    def _as_bool(self, value: Any, default: bool = False) -> bool:
        """Parse loose CLI/property-style truthy values into bool."""
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            s = value.strip().lower()
            if s in ("1", "true", "yes", "on", "y"):
                return True
            if s in ("0", "false", "no", "off", "n"):
                return False
        return default

    def generate_schedule(self, target_date: date) -> Dict[str, Any]:
        """
        Execute one full Kairos run for a specific date.

        This method orchestrates the full pipeline and is intentionally linear so
        phase output can be inspected independently in logs/phase_notes.
        """
        self.decision_log = []
        self.phase_notes = {}
        self.last_schedule = {}
        self.last_target_date = target_date
        self.runtime = self._load_runtime()
        self.windows = self._resolve_windows(target_date)
        print(f"[Kairos] Generating schedule for {target_date}...")
        candidates = self.gather_candidates(target_date)
        print(f"[Kairos] Gathered {len(candidates)} candidates.")
        valid = self.filter_candidates(candidates)
        print(f"[Kairos] Filtered down to {len(valid)} valid items.")
        scored = self.score_candidates(valid)
        schedule = self.construct_schedule(scored, target_date)
        self.last_schedule = schedule
        self.explain_decisions()
        return schedule

    def _load_runtime(self) -> Dict[str, Any]:
        """
        Load external runtime dependencies and user settings.

        Runtime is intentionally centralized so pure scheduling logic can remain
        stateless and test-friendly.
        """
        try:
            from Commands import Today as T
            from Modules.Scheduler import USER_DIR, read_template, status_current_path
            status_settings = read_template(os.path.join(USER_DIR, "Settings", "Status_Settings.yml")) or {}
            current_status = read_template(status_current_path()) or read_template(os.path.join(USER_DIR, "current_status.yml")) or {}
            status_context = T.build_status_context(status_settings, current_status)
            happiness_map = T.load_happiness_map()
            sched_priorities = read_template(os.path.join(USER_DIR, "Settings", "Scheduling_Priorities.yml")) or {}
            buffer_settings = read_template(os.path.join(USER_DIR, "Settings", "buffer_settings.yml")) or {}
            quick_wins_settings = read_template(os.path.join(USER_DIR, "Settings", "quick_wins_settings.yml")) or {}
            timer_settings = read_template(os.path.join(USER_DIR, "Settings", "Timer_Settings.yml")) or {}
            timer_profiles = read_template(os.path.join(USER_DIR, "Settings", "Timer_Profiles.yml")) or {}
            options = {
                "force_template": self.user_context.get("force_template"),
                "use_buffers": self._as_bool(self.user_context.get("use_buffers"), True),
                "use_timer_breaks": self._as_bool(self.user_context.get("use_timer_breaks"), False),
                "use_timer_sprints": self._as_bool(self.user_context.get("use_timer_sprints"), False),
                "timer_profile": self.user_context.get("timer_profile"),
                "ignore_trends": self._as_bool(self.user_context.get("ignore_trends"), False),
                "custom_property": self.user_context.get("custom_property"),
            }
            status_overrides = self.user_context.get("status_overrides")
            if isinstance(status_overrides, dict):
                curr = status_context.get("current", {}) if isinstance(status_context, dict) else {}
                if not isinstance(curr, dict):
                    curr = {}
                    status_context["current"] = curr
                for k, v in status_overrides.items():
                    nk = self._normalize_key(k)
                    if not nk:
                        continue
                    curr[nk] = str(v).strip().lower()
            trend_map, trend_notes = self._load_trend_map(ignore_trends=bool(options.get("ignore_trends")))
            return {
                "Today": T,
                "status_context": status_context,
                "happiness_map": happiness_map,
                "weights": self._apply_weight_overrides(self._weights_from_settings(sched_priorities)),
                "buffer_settings": buffer_settings,
                "quick_wins_settings": quick_wins_settings,
                "timer_settings": timer_settings,
                "timer_profiles": timer_profiles,
                "options": options,
                "trend_map": trend_map,
            }
        except Exception as e:
            self.phase_notes["runtime"] = {"error": str(e)}
            return {"status_context": {"types": {}, "current": {}}, "happiness_map": None, "weights": self._weights_from_settings({})}

    def _load_trend_map(self, ignore_trends: bool = False) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
        """
        Build reliability priors from behavior history.

        The output `trend_score` is normalized to [-1, 1] and blended into
        candidate scoring to prefer items with stronger execution history.
        """
        if ignore_trends:
            notes = {"enabled": False, "reason": "ignore_trends=true", "entries": 0}
            self.phase_notes["trends"] = notes
            return {}, notes
        out: Dict[str, Dict[str, Any]] = {}
        notes: Dict[str, Any] = {"enabled": True, "entries": 0, "source_db": None}
        try:
            from Modules.ItemManager import get_user_dir
            db = os.path.join(get_user_dir(), "Data", "chronos_behavior.db")
            notes["source_db"] = db
            if not os.path.exists(db):
                notes["enabled"] = False
                notes["reason"] = f"missing:{db}"
                self.phase_notes["trends"] = notes
                return out, notes
            conn = sqlite3.connect(db)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            rows = cur.execute(
                """
                SELECT item_slug, item_type, name, status, variance_minutes
                FROM activity_facts
                """
            ).fetchall()
            conn.close()
            aggregates: Dict[str, Dict[str, Any]] = {}
            for row in rows:
                slug = str(row["item_slug"] or "").strip().lower()
                itype = str(row["item_type"] or "").strip().lower()
                name = str(row["name"] or "").strip().lower()
                status = str(row["status"] or "").strip().lower()
                if status not in ("completed", "done", "missed", "skipped", "cancelled", "partial"):
                    continue
                key = f"slug::{slug}" if slug else f"name::{itype}::{name}"
                entry = aggregates.setdefault(key, {"total": 0, "completed": 0, "missed": 0, "variance_abs_sum": 0.0, "variance_count": 0})
                entry["total"] += 1
                if status in ("completed", "done"):
                    entry["completed"] += 1
                elif status == "partial":
                    entry["completed"] += 0.5
                elif status in ("missed", "skipped", "cancelled"):
                    entry["missed"] += 1
                try:
                    v = float(row["variance_minutes"] if row["variance_minutes"] is not None else 0.0)
                    entry["variance_abs_sum"] += abs(v)
                    entry["variance_count"] += 1
                except Exception:
                    pass

            for key, agg in aggregates.items():
                total = int(agg.get("total", 0) or 0)
                if total <= 0:
                    continue
                completed = float(agg.get("completed", 0) or 0.0)
                missed = int(agg.get("missed", 0) or 0)
                completion_rate = completed / max(1, total)
                avg_abs_variance = float(agg.get("variance_abs_sum", 0.0) or 0.0) / max(1, int(agg.get("variance_count", 0) or 0))
                if total < 3:
                    score = 0.0
                else:
                    reliability = (completion_rate * 2.0) - 1.0
                    miss_penalty = min(0.5, missed / max(1, total))
                    variance_penalty = min(0.75, avg_abs_variance / 120.0)
                    score = max(-1.0, min(1.0, reliability - miss_penalty - variance_penalty))
                out[key] = {
                    "trend_score": round(score, 6),
                    "total": total,
                    "completed": completed,
                    "missed": missed,
                    "completion_rate": round(completion_rate, 6),
                    "avg_abs_variance": round(avg_abs_variance, 4),
                }
            notes["entries"] = len(out)
            notes["sample"] = sorted(
                [
                    {"key": k, "score": v.get("trend_score"), "total": v.get("total"), "completion_rate": v.get("completion_rate")}
                    for k, v in out.items()
                ],
                key=lambda x: (-float(x.get("score") or 0), str(x.get("key") or "")),
            )[:15]
            self.phase_notes["trends"] = notes
            return out, notes
        except Exception as e:
            notes["enabled"] = False
            notes["reason"] = str(e)
            self.phase_notes["trends"] = notes
            return {}, notes

    def _apply_weight_overrides(self, weights: Dict[str, float]) -> Dict[str, float]:
        """Allow per-run weighting overrides (`prioritize:<factor>=<rank>`)."""
        out = dict(weights or {})
        raw = self.user_context.get("prioritize")
        if not isinstance(raw, dict):
            return out
        key_aliases = {
            "environment": "environment",
            "category": "category",
            "happiness": "happiness",
            "due_date": "due_date",
            "due": "due_date",
            "deadline": "deadline",
            "status_alignment": "status_alignment",
            "status": "status_alignment",
            "priority": "priority_property",
            "priority_property": "priority_property",
            "trend": "trend_reliability",
            "trends": "trend_reliability",
            "trend_reliability": "trend_reliability",
            "custom_property": "custom_property",
            "custom": "custom_property",
        }
        for k, v in raw.items():
            nk = key_aliases.get(self._normalize_key(k))
            if not nk:
                continue
            try:
                out[nk] = float(v)
            except Exception:
                continue
        return out

    def _resolve_forced_template(self, day_name: str) -> Optional[Dict[str, Any]]:
        """
        Resolve an explicitly requested day template, if any.

        Supports absolute paths, plain names, and stem matches.
        """
        forced = self.user_context.get("force_template")
        if not forced:
            return None
        try:
            from Modules.Scheduler import USER_DIR, read_template, list_day_template_paths
        except Exception:
            return None
        token = str(forced).strip()
        if not token:
            return None
        candidates: List[str] = []
        if os.path.exists(token):
            candidates.append(token)
        days_dir = os.path.join(USER_DIR, "Days")
        if os.path.isdir(days_dir):
            maybe = os.path.join(days_dir, token)
            if os.path.exists(maybe):
                candidates.append(maybe)
            if not token.lower().endswith(".yml"):
                maybe2 = os.path.join(days_dir, f"{token}.yml")
                if os.path.exists(maybe2):
                    candidates.append(maybe2)
            for p in list_day_template_paths(day_name):
                stem = os.path.splitext(os.path.basename(p))[0].strip().lower()
                if stem == token.lower():
                    candidates.append(p)
        checked = set()
        for p in candidates:
            ap = os.path.abspath(p)
            if ap in checked:
                continue
            checked.add(ap)
            template = read_template(ap)
            if isinstance(template, dict):
                return {"path": ap, "template": template, "score": "forced"}
        return None

    def _weights_from_settings(self, payload: Dict[str, Any]) -> Dict[str, float]:
        """Map scheduling-priority settings into Kairos scoring weights."""
        w = {
            "environment": 7.0,
            "category": 6.0,
            "happiness": 5.0,
            "due_date": 4.0,
            "deadline": 5.0,
            "status_alignment": 3.0,
            "priority_property": 2.0,
            "trend_reliability": 3.0,
            "custom_property": 0.0,
        }
        rows = payload.get("Scheduling_Priorities", []) if isinstance(payload, dict) else []
        name_map = {
            "environment": "environment",
            "category": "category",
            "happiness": "happiness",
            "due date": "due_date",
            "deadline": "deadline",
            "status alignment": "status_alignment",
            "priority property": "priority_property",
            "trend reliability": "trend_reliability",
            "trend": "trend_reliability",
            "custom property": "custom_property",
        }
        for row in rows if isinstance(rows, list) else []:
            if not isinstance(row, dict):
                continue
            key = name_map.get(str(row.get("Name", "")).strip().lower())
            if key:
                try:
                    w[key] = float(row.get("Rank", w[key]))
                except Exception:
                    pass
        return w

    def _resolve_windows(self, target_date: date) -> List[Dict[str, Any]]:
        """
        Resolve dynamic scheduling windows from the selected day template.

        Windows are the primary placement containers for non-anchor work.
        """
        windows: List[Dict[str, Any]] = []
        timeblocks: List[Dict[str, Any]] = []
        day_name = target_date.strftime("%A")
        info: Dict[str, Any] = {}
        try:
            T = self.runtime.get("Today")
            forced_info = self._resolve_forced_template(day_name)
            if forced_info:
                info = forced_info
            elif T:
                # Legacy parity + stricter gate:
                # 1) prefer templates that explicitly match current status/place
                # 2) if none match, fall back to legacy weighted selector
                info = self._select_template_for_day_strict(day_name, T) or {}
            template = info.get("template") if isinstance(info, dict) else None

            loaded_templates: Dict[str, Dict[str, Any]] = {}

            def _template_key(item_type: Any, item_name: Any) -> str:
                return f"{str(item_type or '').strip().lower()}::{str(item_name or '').strip().lower()}"

            def _load_referenced_template(item_type: Any, item_name: Any) -> Optional[Dict[str, Any]]:
                key = _template_key(item_type, item_name)
                if not key or key == "::":
                    return None
                if key in loaded_templates:
                    return loaded_templates.get(key)
                try:
                    from Modules.ItemManager import get_item_path

                    path = get_item_path(str(item_type or ""), str(item_name or ""))
                    if not path or not os.path.exists(path):
                        loaded_templates[key] = None  # type: ignore
                        return None
                    with open(path, "r", encoding="utf-8") as fh:
                        data = yaml.safe_load(fh) or {}
                    if isinstance(data, dict):
                        loaded_templates[key] = data
                        return data
                except Exception:
                    pass
                loaded_templates[key] = None  # type: ignore
                return None

            seen_templates: set[str] = set()
            seen_window_keys: set[str] = set()
            seen_timeblock_keys: set[str] = set()

            def _add_window(node: Dict[str, Any]) -> None:
                s = str(node.get("start") or "").strip()
                e = str(node.get("end") or "").strip()
                if not s or not e:
                    return
                n = str(node.get("name") or "Window").strip() or "Window"
                k = f"{n.lower()}|{s}|{e}"
                if k in seen_window_keys:
                    return
                seen_window_keys.add(k)
                windows.append({"name": n, "start": s, "end": e, "filter": node.get("filters") or {}})

            def _add_timeblock(node: Dict[str, Any]) -> None:
                n = str(node.get("name") or "Timeblock").strip() or "Timeblock"
                subtype = str(node.get("subtype") or "").strip().lower()
                start = str(node.get("start") or node.get("start_time") or "").strip()
                end = str(node.get("end") or node.get("end_time") or "").strip()
                duration = node.get("duration")
                k = f"{n.lower()}|{subtype}|{start}|{end}|{duration}"
                if k in seen_timeblock_keys:
                    return
                seen_timeblock_keys.add(k)
                timeblocks.append(
                    {
                        "name": n,
                        "type": "timeblock",
                        "subtype": subtype,
                        "start": start,
                        "end": end,
                        "duration": duration,
                        "category": node.get("category"),
                        "filters": node.get("filters") if isinstance(node.get("filters"), dict) else {},
                        "reschedule": node.get("reschedule"),
                        "essential": node.get("essential"),
                        "absorbable": node.get("absorbable"),
                        "flexible": node.get("flexible"),
                    }
                )

            def _collect_windows_from_template_data(data: Dict[str, Any]) -> None:
                if not isinstance(data, dict):
                    return
                if bool(data.get("window")):
                    _add_window(data)
                container_lists = []
                seq = data.get("sequence")
                ch = data.get("children")
                if isinstance(seq, list):
                    container_lists.append(seq)
                if isinstance(ch, list):
                    container_lists.append(ch)
                for lst in container_lists:
                    for node in lst:
                        if not isinstance(node, dict):
                            continue
                        node_type = str(node.get("type") or "").strip().lower()
                        if node_type == "timeblock":
                            # Support both inline timeblock definitions and referenced
                            # `type: timeblock` templates (by name).
                            ref_name = str(node.get("name") or "").strip()
                            resolved_tb = None
                            if ref_name:
                                resolved_tb = _load_referenced_template("timeblock", ref_name)
                            if isinstance(resolved_tb, dict):
                                merged_tb = dict(resolved_tb)
                                # Inline node fields override referenced defaults.
                                merged_tb.update(node)
                                _add_timeblock(merged_tb)
                            else:
                                _add_timeblock(node)
                        if bool(node.get("window")):
                            _add_window(node)
                        # Recurse inline nested nodes.
                        if isinstance(node.get("children"), list) or isinstance(node.get("sequence"), list):
                            _collect_windows_from_template_data(node)
                        # Recurse referenced templates.
                        ref_type = node_type
                        ref_name = str(node.get("name") or "").strip()
                        if ref_type and ref_name and ref_type in {"day", "week", "routine", "subroutine", "microroutine", "timeblock"}:
                            tkey = _template_key(ref_type, ref_name)
                            if tkey in seen_templates:
                                continue
                            seen_templates.add(tkey)
                            ref = _load_referenced_template(ref_type, ref_name)
                            if isinstance(ref, dict):
                                _collect_windows_from_template_data(ref)

            if isinstance(template, dict):
                root_type = str(template.get("type") or "day").strip().lower()
                root_name = str(template.get("name") or "").strip()
                if root_type and root_name:
                    seen_templates.add(_template_key(root_type, root_name))
                _collect_windows_from_template_data(template)
        except Exception as e:
            info = {"error": str(e)}
        if not windows:
            windows = [{"name": "Deep Work", "start": "09:00", "end": "11:00", "filter": {"category": "work"}}]
        self.template_timeblocks = timeblocks
        self.phase_notes["template"] = {
            "day": day_name,
            "template_path": info.get("path"),
            "template_score": info.get("score"),
            "forced": bool(self.user_context.get("force_template")),
            "windows_found": len(windows),
            "timeblocks_found": len(timeblocks),
        }
        return windows

    def _template_place_matches(self, template: Dict[str, Any], status_context: Dict[str, Any]) -> bool:
        """Hard gate: template `place` must match current place when both are set."""
        if not isinstance(template, dict):
            return False
        if not isinstance(status_context, dict):
            return True
        current = status_context.get("current", {})
        if not isinstance(current, dict):
            return True
        tpl_place = self._normalize_key(template.get("place"))
        if not tpl_place:
            return True
        current_place = self._normalize_key(current.get("place"))
        if not current_place:
            return True
        return tpl_place == current_place

    def _template_status_matches(self, template: Dict[str, Any], status_context: Dict[str, Any], T: Any) -> bool:
        """
        Hard gate for status-requirement compatibility.

        Uses legacy requirement extraction to preserve semantics across engines.
        """
        if not isinstance(template, dict):
            return False
        if not isinstance(status_context, dict):
            return True
        if T and hasattr(T, "extract_status_requirements"):
            try:
                req = T.extract_status_requirements(template, status_context) or {}
            except Exception:
                req = {}
            if req and not self._req_match(req, status_context):
                return False
        return self._template_place_matches(template, status_context)

    def _select_template_for_day_strict(self, day_name: str, T: Any) -> Dict[str, Any]:
        """
        Select day template using strict compatibility tiers.

        Priority:
        1) day-eligible + place match + status-requirements match
        2) day-eligible + place match
        3) legacy score-based fallback
        """
        status_context = self.runtime.get("status_context", {}) if isinstance(self.runtime, dict) else {}
        strict_candidates: List[Tuple[float, str, Dict[str, Any]]] = []
        place_only_candidates: List[Tuple[float, str, Dict[str, Any]]] = []
        reasons = {
            "strict_considered": 0,
            "strict_kept": 0,
            "strict_rejected": 0,
            "place_only_kept": 0,
            "fallback_used": False,
        }

        try:
            from Modules.Scheduler import list_day_template_paths, read_template, is_template_eligible_for_day

            for path in list_day_template_paths(day_name):
                template = read_template(path)
                if not isinstance(template, dict):
                    continue
                reasons["strict_considered"] += 1
                if not is_template_eligible_for_day(template, day_name):
                    reasons["strict_rejected"] += 1
                    continue
                place_ok = self._template_place_matches(template, status_context)
                if not place_ok:
                    reasons["strict_rejected"] += 1
                    continue
                status_ok = self._template_status_matches(template, status_context, T)
                score = 0.0
                if T and hasattr(T, "extract_status_requirements") and hasattr(T, "score_status_alignment"):
                    try:
                        req = T.extract_status_requirements(template, status_context) or {}
                        score = float(T.score_status_alignment(req, status_context))
                    except Exception:
                        score = 0.0
                if status_ok:
                    strict_candidates.append((score, path, template))
                    reasons["strict_kept"] += 1
                else:
                    place_only_candidates.append((score, path, template))
                    reasons["place_only_kept"] += 1
        except Exception:
            strict_candidates = []
            place_only_candidates = []

        if strict_candidates:
            strict_candidates.sort(key=lambda x: (x[0], str(x[1]).lower()), reverse=True)
            best_score, best_path, best_template = strict_candidates[0]
            self.phase_notes["template_match"] = reasons
            return {"path": best_path, "template": best_template, "score": best_score}

        if place_only_candidates:
            place_only_candidates.sort(key=lambda x: (x[0], str(x[1]).lower()), reverse=True)
            best_score, best_path, best_template = place_only_candidates[0]
            self.phase_notes["template_match"] = reasons
            return {"path": best_path, "template": best_template, "score": best_score}

        reasons["fallback_used"] = True
        self.phase_notes["template_match"] = reasons
        if T and hasattr(T, "select_template_for_day"):
            try:
                return T.select_template_for_day(day_name, status_context) or {}
            except Exception:
                return {}
        return {}

    def gather_candidates(self, target_date: date) -> List[Dict[str, Any]]:
        """
        Pull executable items + commitments from the core mirror DB.

        Kairos schedules executable types; commitments are loaded for context and
        telemetry but currently filtered out as observer-only.
        """
        out: List[Dict[str, Any]] = []
        try:
            from Modules.ItemManager import get_user_dir
            db = os.path.join(get_user_dir(), "Data", "chronos_core.db")
            if not os.path.exists(db):
                self.phase_notes["gather"] = {"error": f"missing:{db}", "total": 0}
                return out
            conn = sqlite3.connect(db)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                """
                SELECT * FROM items
                WHERE type IN ('week','day','routine','subroutine','microroutine','task','habit')
                AND (status IS NULL OR lower(status) NOT IN ('completed','done','archived','cancelled','skipped'))
                """
            )
            backlog = cur.fetchall()
            print(f"[Kairos Debug] DB returned {len(backlog)} executable items.")
            for row in backlog:
                item = dict(row)
                item["_source_kind"] = "backlog"
                item["_raw"] = self._decode_raw(item.get("raw_json"))
                out.append(item)
            cur.execute("SELECT * FROM items WHERE type = 'commitment'")
            commitments = cur.fetchall()
            print(f"[Kairos Debug] DB returned {len(commitments)} commitments.")
            for row in commitments:
                item = dict(row)
                item["_source_kind"] = "commitment_rule"
                item["_raw"] = self._decode_raw(item.get("raw_json"))
                out.append(item)
            conn.close()
            self.phase_notes["gather"] = {
                "source_db": db,
                "executable_items": len(backlog),
                "commitments": len(commitments),
                "total": len(out),
            }
        except Exception as e:
            self.phase_notes["gather"] = {"error": str(e), "total": len(out)}
        return out

    def _decode_raw(self, raw: Any) -> Dict[str, Any]:
        """Parse stored JSON payload from DB row into a dict-safe shape."""
        if isinstance(raw, dict):
            return raw
        if not raw:
            return {}
        try:
            v = json.loads(str(raw))
            return v if isinstance(v, dict) else {}
        except Exception:
            return {}

    def filter_candidates(self, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Apply hard filters before scoring.

        Filters remove non-executable entries, context mismatches, and
        pathological durations to keep later ranking/placement tractable.
        """
        keep: List[Dict[str, Any]] = []
        rejected: List[Dict[str, Any]] = []
        status_context = self.runtime.get("status_context", {}) or {}
        current = status_context.get("current", {}) if isinstance(status_context, dict) else {}
        place = str(current.get("place") or "").strip().lower()
        T = self.runtime.get("Today")
        for item in candidates:
            src = item.get("_raw") if isinstance(item.get("_raw"), dict) else item
            item_type = str(item.get("type") or "").strip().lower()
            if item.get("_source_kind") == "commitment_rule":
                rejected.append({"name": item.get("name"), "type": item.get("type"), "reason": "observer_only_commitment"})
                continue
            if bool(src.get("observer_only", item.get("observer_only"))):
                rejected.append({"name": item.get("name"), "type": item.get("type"), "reason": "observer_only_item"})
                continue
            if item_type not in EXECUTABLE_TYPES:
                rejected.append({"name": item.get("name"), "type": item.get("type"), "reason": "non_executable_type"})
                continue
            dur = self._duration_minutes(item)
            if dur > 960:
                rejected.append({"name": item.get("name"), "type": item.get("type"), "reason": "duration_gt_day"})
                continue
            item_place = str(src.get("place") or item.get("place") or "").strip().lower()
            if item_place and place and item_place != place:
                rejected.append({"name": item.get("name"), "type": item.get("type"), "reason": "place_mismatch"})
                continue
            req = {}
            if T and hasattr(T, "extract_status_requirements"):
                try:
                    req = T.extract_status_requirements(src, status_context) or {}
                except Exception:
                    req = {}
            if req and not self._req_match(req, status_context):
                rejected.append({"name": item.get("name"), "type": item.get("type"), "reason": "status_requirements_unmet"})
                continue
            item["_effective_duration"] = dur
            item["_requirements"] = req
            keep.append(item)
        self.phase_notes["filter"] = {"input": len(candidates), "kept": len(keep), "rejected": len(rejected), "sample_rejections": rejected[:25]}
        return keep

    def _req_match(self, req: Dict[str, List[str]], status_context: Dict[str, Any]) -> bool:
        """Return True when current status satisfies all normalized requirement lists."""
        curr = status_context.get("current", {}) if isinstance(status_context, dict) else {}
        for k, allowed in req.items():
            v = str(curr.get(k) or "").strip().lower()
            vals = [str(x).strip().lower() for x in (allowed or [])]
            if vals and v not in vals:
                return False
        return True

    def score_candidates(self, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Compute weighted Kairos score per candidate.

        Score is additive across factors and primarily used as a placement
        priority (not a strict utility guarantee).
        """
        weights = self.runtime.get("weights", {}) or {}
        status_context = self.runtime.get("status_context", {}) or {}
        happiness_map = self.runtime.get("happiness_map")
        trend_map = self.runtime.get("trend_map", {}) if isinstance(self.runtime, dict) else {}
        T = self.runtime.get("Today")
        target_date = self.last_target_date or date.today()
        rows = []
        scored = []
        for item in candidates:
            src = item.get("_raw") if isinstance(item.get("_raw"), dict) else item
            score = 0.0
            reasons: List[str] = []
            p = str(item.get("priority") or "low").strip().lower()
            pval = {"high": 10.0, "medium": 5.0, "low": 1.0}.get(p, 1.0)
            c = pval * float(weights.get("priority_property", 2.0))
            score += c; reasons.append(f"priority_property={c:.2f}")
            c = (1.0 if (item.get("category") or src.get("category")) else 0.0) * float(weights.get("category", 6.0))
            score += c; reasons.append(f"category={c:.2f}")
            c = self._env_score(src, status_context, float(weights.get("environment", 7.0)))
            score += c; reasons.append(f"environment={c:.2f}")
            c = self._date_urgency(src.get("due_date"), target_date) * float(weights.get("due_date", 4.0))
            score += c; reasons.append(f"due_date={c:.2f}")
            c = self._date_urgency(src.get("deadline"), target_date) * float(weights.get("deadline", 5.0))
            score += c; reasons.append(f"deadline={c:.2f}")
            c = self._happiness_score(src, happiness_map) * float(weights.get("happiness", 5.0))
            score += c; reasons.append(f"happiness={c:.2f}")
            c = 0.0
            if T and hasattr(T, "score_status_alignment"):
                try:
                    c = float(T.score_status_alignment(item.get("_requirements") or {}, status_context)) * float(weights.get("status_alignment", 3.0))
                except Exception:
                    c = 0.0
            score += c; reasons.append(f"status_alignment={c:.2f}")
            c = self._trend_contribution(item, trend_map) * float(weights.get("trend_reliability", 3.0))
            score += c; reasons.append(f"trend_reliability={c:.2f}")
            custom_key = str((self.runtime.get("options", {}) or {}).get("custom_property") or "").strip()
            if custom_key:
                # Optional extension hook lets operators steer ranking by one
                # arbitrary property without changing schema or code.
                c = self._custom_property_contribution(src, item, custom_key) * float(weights.get("custom_property", 0.0))
                score += c; reasons.append(f"custom_property[{custom_key}]={c:.2f}")
            item["kairos_score"] = round(score, 6)
            item["_score_reasons"] = reasons
            scored.append(item)
            rows.append({"name": item.get("name"), "type": item.get("type"), "score": round(score, 3), "reasons": reasons})
        scored.sort(key=lambda x: (-float(x.get("kairos_score") or 0), str(x.get("name") or "").lower(), str(x.get("type") or "").lower()))
        rows.sort(key=lambda x: (-float(x.get("score") or 0), str(x.get("name") or "").lower(), str(x.get("type") or "").lower()))
        self.phase_notes["score"] = {"input": len(candidates), "weights": weights, "top_scored": rows[:30]}
        return scored

    def _trend_contribution(self, item: Dict[str, Any], trend_map: Any) -> float:
        """Resolve historical reliability signal for this item, if available."""
        if not isinstance(trend_map, dict) or not trend_map:
            return 0.0
        slug = str(item.get("slug") or item.get("id") or "").strip().lower()
        key_slug = f"slug::{slug}" if slug else ""
        itype = str(item.get("type") or "").strip().lower()
        name = str(item.get("name") or "").strip().lower()
        key_name = f"name::{itype}::{name}"
        row = trend_map.get(key_slug) if key_slug else None
        if not isinstance(row, dict):
            row = trend_map.get(key_name)
        if not isinstance(row, dict):
            return 0.0
        try:
            return float(row.get("trend_score", 0.0) or 0.0)
        except Exception:
            return 0.0

    def _env_score(self, src: Dict[str, Any], status_context: Dict[str, Any], weight: float) -> float:
        """Environment/place compatibility contribution."""
        need = str(src.get("place") or "").strip().lower()
        curr = str((status_context.get("current", {}) or {}).get("place") or "").strip().lower()
        if not need:
            return 0.0
        return weight if (curr and curr == need) else (-0.5 * weight)

    def _date_urgency(self, raw: Any, target_date: date) -> float:
        """Convert due/deadline date into urgency scalar."""
        d = self._parse_date(raw)
        if not d:
            return 0.0
        delta = (d - target_date).days
        if delta <= 0:
            return 2.0
        if delta >= 14:
            return 0.0
        return max(0.0, 1.0 - (delta / 14.0))

    def _parse_date(self, raw: Any) -> Optional[date]:
        """Parse supported date formats into `date`."""
        if isinstance(raw, date):
            return raw
        if not raw:
            return None
        s = str(raw).strip()
        for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
            try:
                return datetime.strptime(s[:10], fmt).date()
            except Exception:
                pass
        return None

    def _happiness_score(self, src: Dict[str, Any], happiness_map: Any) -> float:
        """
        Estimate motivational alignment based on happiness-map tags.

        Bounded to keep this factor influential but not dominant.
        """
        if not isinstance(happiness_map, dict):
            return 0.0
        rows = happiness_map.get("map", [])
        if not isinstance(rows, list):
            return 0.0
        m: Dict[str, float] = {}
        for r in rows:
            if not isinstance(r, dict):
                continue
            k = str(r.get("key") or "").strip().lower()
            if not k:
                continue
            try:
                rank = float(r.get("priority", 10))
            except Exception:
                rank = 10.0
            m[k] = max(0.1, 11.0 - rank)
        tokens: List[str] = []
        hv = src.get("happiness")
        if isinstance(hv, str):
            tokens.append(hv.strip().lower())
        elif isinstance(hv, list):
            tokens.extend([str(x).strip().lower() for x in hv])
        tags = src.get("tags")
        if isinstance(tags, list):
            tokens.extend([str(x).strip().lower() for x in tags])
        elif isinstance(tags, str):
            tokens.append(tags.strip().lower())
        total = sum(m.get(t, 0.0) for t in tokens)
        return min(total / 10.0, 2.0)

    def _custom_property_contribution(self, src: Dict[str, Any], item: Dict[str, Any], property_name: str) -> float:
        """Best-effort numeric projection for an arbitrary custom property."""
        key = self._normalize_key(property_name)
        if not key:
            return 0.0

        def _find_value(record: Any) -> Any:
            """Find key with both exact and normalized matching."""
            if not isinstance(record, dict):
                return None
            if property_name in record:
                return record.get(property_name)
            for rk, rv in record.items():
                if self._normalize_key(rk) == key:
                    return rv
            return None

        value = _find_value(src)
        if value is None:
            value = _find_value(item)
        if value is None:
            return 0.0

        if isinstance(value, bool):
            return 1.0 if value else 0.0
        if isinstance(value, (int, float)):
            return max(-2.0, min(2.0, float(value) / 10.0))
        if isinstance(value, (list, dict, tuple, set)):
            return 1.0 if len(value) > 0 else 0.0
        s = str(value).strip().lower()
        if not s:
            return 0.0
        if s in ("true", "yes", "on", "y"):
            return 1.0
        if s in ("false", "no", "off", "n"):
            return 0.0
        try:
            return max(-2.0, min(2.0, float(s) / 10.0))
        except Exception:
            return 1.0

    def _duration_minutes(self, item: Dict[str, Any]) -> int:
        """Normalize candidate duration; fallback to 30m when unknown/non-positive."""
        raw = item.get("_effective_duration", item.get("duration_minutes", item.get("duration")))
        if isinstance(raw, (int, float)):
            mins = int(raw)
        elif isinstance(raw, str):
            parsed = parse_duration_string(raw)
            if parsed is None:
                try:
                    mins = int(float(raw))
                except Exception:
                    mins = 0
            else:
                mins = int(parsed)
        else:
            mins = 0
        return mins if mins > 0 else 30

    def _to_hhmm(self, total_minutes: int) -> str:
        """Convert absolute minutes-from-midnight into bounded HH:MM."""
        total = int(total_minutes) % (24 * 60)
        h = int(total // 60)
        m = int(total % 60)
        return f"{h:02d}:{m:02d}"

    def _item_id(self, item: Dict[str, Any]) -> str:
        """Stable runtime id used for dedupe and remaining-duration tracking."""
        return str(item.get("id") or item.get("slug") or f"{item.get('type', '')}::{item.get('name', '')}")

    def _window_candidates(self, ranked: List[Dict[str, Any]], used: set, win: Dict[str, Any], fill: int, cap: int, remaining: Dict[str, int], sprint_cap: int) -> List[Dict[str, Any]]:
        """
        Return sorted candidates that can still fit in the active window segment.

        This is the main "what can be scheduled next here?" predicate.
        """
        wanted = ""
        wanted_tags: set[str] = set()
        f = win.get("filter") if isinstance(win, dict) else {}
        if isinstance(f, dict):
            wanted = str(f.get("category") or "").strip().lower()
            raw_tags = f.get("tags")
            if isinstance(raw_tags, list):
                wanted_tags = {str(t).strip().lower() for t in raw_tags if str(t).strip()}
            elif isinstance(raw_tags, str):
                wanted_tags = {str(t).strip().lower() for t in raw_tags.split(",") if str(t).strip()}
            raw_tag = f.get("tag")
            if isinstance(raw_tag, str) and raw_tag.strip():
                wanted_tags.add(raw_tag.strip().lower())
        out = []
        for item in ranked:
            iid = self._item_id(item)
            if iid in used:
                continue
            rem = int(remaining.get(iid, self._duration_minutes(item)))
            if rem <= 0:
                continue
            dur = min(rem, sprint_cap) if sprint_cap > 0 else rem
            if fill + dur > cap:
                continue
            if wanted:
                cat = str(item.get("category") or "").strip().lower()
                if cat != wanted:
                    continue
            if wanted_tags:
                src = item.get("_raw") if isinstance(item.get("_raw"), dict) else item
                raw_item_tags = src.get("tags", item.get("tags"))
                item_tags: set[str] = set()
                if isinstance(raw_item_tags, list):
                    item_tags = {str(t).strip().lower() for t in raw_item_tags if str(t).strip()}
                elif isinstance(raw_item_tags, str):
                    item_tags = {str(t).strip().lower() for t in raw_item_tags.split(",") if str(t).strip()}
                if not (item_tags & wanted_tags):
                    continue
            out.append(item)
        out.sort(key=lambda x: (-float(x.get("kairos_score") or 0), str(x.get("name") or "").lower(), str(x.get("type") or "").lower()))
        return out

    def _parse_hhmm(self, value: Any) -> Optional[int]:
        """Parse HH:MM-style values into absolute minutes-from-midnight."""
        if not value:
            return None
        s = str(value).strip()
        if len(s) < 4 or ":" not in s:
            return None
        try:
            h, m = s.split(":", 1)
            hh = int(h)
            mm = int(m[:2])
            if hh < 0 or hh > 23 or mm < 0 or mm > 59:
                return None
            return hh * 60 + mm
        except Exception:
            return None

    def _timeblock_slot(self, tb: Dict[str, Any]) -> Optional[Tuple[int, int]]:
        """Resolve template timeblock slot from start/end or start+duration."""
        if not isinstance(tb, dict):
            return None
        start = self._parse_hhmm(tb.get("start") or tb.get("start_time"))
        if start is None:
            return None
        end = self._parse_hhmm(tb.get("end") or tb.get("end_time"))
        dur_raw = tb.get("duration")
        try:
            if isinstance(dur_raw, str):
                parsed = parse_duration_string(dur_raw)
                dur = int(parsed) if parsed is not None else int(float(dur_raw))
            elif isinstance(dur_raw, (int, float)):
                dur = int(dur_raw)
            else:
                dur = 0
        except Exception:
            dur = 0
        if end is None:
            end = start + (dur if dur > 0 else 30)
        if end <= start:
            end = start + (dur if dur > 0 else 30)
        return (start, end)

    def _is_anchor_timeblock(self, tb: Dict[str, Any]) -> bool:
        """Timeblock anchors reserve fixed time and participate in overlap checks."""
        if not isinstance(tb, dict):
            return False
        subtype = str(tb.get("subtype") or "").strip().lower()
        if subtype == "anchor":
            return True
        reschedule = tb.get("reschedule")
        if isinstance(reschedule, bool):
            if reschedule is False:
                return True
        elif isinstance(reschedule, str) and reschedule.strip().lower() in ("never", "false", "no"):
            return True
        if bool(tb.get("essential")):
            return True
        return False

    def _is_anchor_item(self, item: Dict[str, Any]) -> bool:
        """
        Identify hard-scaffold items.

        Anchors are placed first and are allowed to invalidate the run when they
        overlap, because all downstream placement depends on them being coherent.
        """
        src = item.get("_raw") if isinstance(item.get("_raw"), dict) else item
        reschedule = src.get("reschedule", item.get("reschedule"))
        if isinstance(reschedule, bool):
            if reschedule is False:
                return True
        elif isinstance(reschedule, str) and reschedule.strip().lower() in ("never", "false", "no"):
            return True
        if bool(src.get("essential", item.get("essential"))):
            return True
        tags = src.get("tags")
        tag_values = []
        if isinstance(tags, list):
            tag_values = [str(t).strip().lower() for t in tags]
        elif isinstance(tags, str):
            tag_values = [tags.strip().lower()]
        if any(t in ("anchor", "fixed") for t in tag_values):
            return True
        name = str(item.get("name") or src.get("name") or "").strip().lower()
        if any(hint in name for hint in ANCHOR_NAME_HINTS):
            start_candidate = self._parse_hhmm(src.get("start_time") or src.get("ideal_start_time"))
            if start_candidate is not None:
                return True
        return False

    def _is_injection_item(self, item: Dict[str, Any]) -> bool:
        """Detect status-triggered injection items (`auto_inject: true`)."""
        src = item.get("_raw") if isinstance(item.get("_raw"), dict) else item
        return bool(src.get("auto_inject", item.get("auto_inject")))

    def _anchor_slot(self, item: Dict[str, Any]) -> Optional[Dict[str, int]]:
        """Resolve anchor slot from explicit start/end or start+duration."""
        src = item.get("_raw") if isinstance(item.get("_raw"), dict) else item
        start = self._parse_hhmm(src.get("start_time") or src.get("ideal_start_time"))
        if start is None:
            return None
        end = self._parse_hhmm(src.get("end_time") or src.get("ideal_end_time"))
        dur = self._duration_minutes(item)
        if end is None:
            end = start + dur
        if end <= start:
            end = start + max(5, dur)
        return {"start": start, "end": end}

    def _subtract_occupied(self, win_start: int, win_end: int, occupied: List[tuple]) -> List[tuple]:
        """Subtract occupied intervals from a target interval and return free segments."""
        segments = [(win_start, win_end)]
        occ = sorted([x for x in occupied if x[1] > win_start and x[0] < win_end], key=lambda x: x[0])
        for os_, oe in occ:
            next_segments = []
            for ss, se in segments:
                if oe <= ss or os_ >= se:
                    next_segments.append((ss, se))
                    continue
                if ss < os_:
                    next_segments.append((ss, os_))
                if oe < se:
                    next_segments.append((oe, se))
            segments = next_segments
        return [(a, b) for a, b in segments if b - a > 0]

    def _buffer_minutes_for_item(self, item: Dict[str, Any]) -> int:
        """Template-derived post-item buffer size by item type."""
        settings = self.runtime.get("buffer_settings", {}) if isinstance(self.runtime, dict) else {}
        if not isinstance(settings, dict):
            return 0
        template = settings.get("template_buffers", {})
        if not isinstance(template, dict):
            return 0
        t = str(item.get("type") or "").strip().lower()
        key_map = {
            "microroutine": "microroutine_buffer_minutes",
            "subroutine": "subroutine_buffer_minutes",
            "routine": "routine_buffer_minutes",
        }
        key = key_map.get(t, "day_template_default_buffer_minutes")
        try:
            return max(0, int(template.get(key, 0) or 0))
        except Exception:
            return 0

    def _dynamic_buffer_settings(self) -> tuple[int, int]:
        """Global dynamic buffer cadence and duration."""
        settings = self.runtime.get("buffer_settings", {}) if isinstance(self.runtime, dict) else {}
        if not isinstance(settings, dict):
            return (0, 0)
        dyn = settings.get("global_dynamic_buffer", {})
        if not isinstance(dyn, dict):
            return (0, 0)
        try:
            interval = max(0, int(dyn.get("buffer_interval_minutes", 0) or 0))
        except Exception:
            interval = 0
        try:
            duration = max(0, int(dyn.get("buffer_duration_minutes", 0) or 0))
        except Exception:
            duration = 0
        return (interval, duration)

    def _timer_profile(self) -> Dict[str, Any]:
        """Resolve active timer profile (forced > default > first available)."""
        profiles = self.runtime.get("timer_profiles", {}) if isinstance(self.runtime, dict) else {}
        settings = self.runtime.get("timer_settings", {}) if isinstance(self.runtime, dict) else {}
        if not isinstance(profiles, dict):
            return {}
        forced = self.user_context.get("timer_profile")
        if forced:
            key = str(forced).strip()
            if isinstance(profiles.get(key), dict):
                return profiles.get(key) or {}
        if isinstance(settings, dict):
            default_key = str(settings.get("default_profile") or "").strip()
            if default_key and isinstance(profiles.get(default_key), dict):
                return profiles.get(default_key) or {}
        for _, profile in profiles.items():
            if isinstance(profile, dict):
                return profile
        return {}

    def _make_timeblock(self, start: int, end: int, name: str, subtype: str, buffer_type: Optional[str] = None) -> Dict[str, Any]:
        """Create synthetic schedule block for inserted buffers/breaks."""
        dur = max(0, end - start)
        return {
            "name": name,
            "type": "timeblock",
            "subtype": subtype,
            "duration_minutes": dur,
            "start_time": self._to_hhmm(start),
            "end_time": self._to_hhmm(end),
            "window_name": "TIMEBLOCK",
            "block_id": f"timeblock::{subtype}::{self._to_hhmm(start)}",
            "kairos_score": None,
            "kairos_element": subtype,
            "is_buffer": subtype == "buffer",
            "is_break": subtype == "break",
            "buffer_type": buffer_type,
            "reschedule": "never",
            "essential": False,
            "flexible": False,
        }

    def _insert_timeblocks(self, timeline: List[tuple]) -> tuple[List[tuple], List[Dict[str, Any]]]:
        """
        Inject synthetic buffer/break blocks into free gaps between scheduled blocks.

        This pass runs after primary placement so buffers never displace anchors or
        ranked work; they only consume genuinely free slack.
        """
        if not timeline:
            return timeline, []
        options = self.runtime.get("options", {}) if isinstance(self.runtime, dict) else {}
        use_buffers = bool(options.get("use_buffers", True))
        use_timer_breaks = bool(options.get("use_timer_breaks", False))
        if not use_buffers and not use_timer_breaks:
            return sorted(timeline, key=lambda x: (x[0], str(x[2].get("name") or "").lower())), []
        dyn_interval, dyn_duration = self._dynamic_buffer_settings()
        tprof = self._timer_profile()
        try:
            focus_min = max(0, int(tprof.get("focus_minutes", 0) or 0))
        except Exception:
            focus_min = 0
        try:
            short_break = max(0, int(tprof.get("short_break_minutes", 0) or 0))
        except Exception:
            short_break = 0

        sorted_tl = sorted(timeline, key=lambda x: (x[0], str(x[2].get("name") or "").lower()))
        out = list(sorted_tl)
        events: List[Dict[str, Any]] = []
        minutes_since_last_buffer = 0
        minutes_since_last_break = 0
        for i in range(len(sorted_tl) - 1):
            _, curr_end, curr_block = sorted_tl[i]
            next_start, _, _ = sorted_tl[i + 1]
            gap = max(0, next_start - curr_end)
            curr_type = str(curr_block.get("type") or "").strip().lower()
            curr_dur = max(0, curr_end - (sorted_tl[i][0] or curr_end))
            is_anchor = str(curr_block.get("window_name") or "").upper() == "ANCHOR"
            is_timeblock = curr_type == "timeblock"
            if not is_anchor and not is_timeblock:
                minutes_since_last_buffer += curr_dur
                minutes_since_last_break += curr_dur

            gap_cursor = curr_end
            remaining_gap = gap

            # Dynamic buffer check (same trigger family as Today scheduler).
            if use_buffers and (
                dyn_interval > 0
                and dyn_duration > 0
                and remaining_gap >= dyn_duration
                and minutes_since_last_buffer + remaining_gap >= dyn_interval
            ):
                made = self._make_timeblock(gap_cursor, gap_cursor + dyn_duration, "Dynamic Buffer", "buffer", buffer_type="dynamic")
                out.append((gap_cursor, gap_cursor + dyn_duration, made))
                events.append(
                    {
                        "id": made.get("block_id"),
                        "name": made.get("name"),
                        "subtype": made.get("subtype"),
                        "buffer_type": "dynamic",
                        "start": made.get("start_time"),
                        "end": made.get("end_time"),
                        "from_item": f"{curr_block.get('type')}:{curr_block.get('name')}",
                    }
                )
                gap_cursor += dyn_duration
                remaining_gap -= dyn_duration
                minutes_since_last_buffer = 0

            # Template buffer check after routine/subroutine/microroutine items.
            if use_buffers and curr_type != "timeblock" and str(curr_block.get("window_name") or "").upper() != "ANCHOR":
                bmin = self._buffer_minutes_for_item(curr_block)
                if bmin > 0 and remaining_gap >= bmin:
                    made = self._make_timeblock(gap_cursor, gap_cursor + bmin, "Buffer", "buffer", buffer_type="template")
                    out.append((gap_cursor, gap_cursor + bmin, made))
                    events.append(
                        {
                            "id": made.get("block_id"),
                            "name": made.get("name"),
                            "subtype": made.get("subtype"),
                            "buffer_type": "template",
                            "start": made.get("start_time"),
                            "end": made.get("end_time"),
                            "from_item": f"{curr_block.get('type')}:{curr_block.get('name')}",
                        }
                    )
                    minutes_since_last_buffer = 0

            # Timer-profile break hook.
            if use_timer_breaks and focus_min > 0 and short_break > 0 and minutes_since_last_break >= focus_min and remaining_gap >= short_break:
                made = self._make_timeblock(gap_cursor, gap_cursor + short_break, "Break", "break", buffer_type="timer_profile")
                out.append((gap_cursor, gap_cursor + short_break, made))
                events.append(
                    {
                        "id": made.get("block_id"),
                        "name": made.get("name"),
                        "subtype": made.get("subtype"),
                        "buffer_type": "timer_profile",
                        "start": made.get("start_time"),
                        "end": made.get("end_time"),
                        "from_item": f"{curr_block.get('type')}:{curr_block.get('name')}",
                    }
                )
                minutes_since_last_break = 0
        out.sort(key=lambda x: (x[0], str(x[2].get("name") or "").lower()))
        return out, events

    def construct_schedule(self, ranked_items: List[Dict[str, Any]], target_date: date) -> Dict[str, Any]:
        """
        Build final day plan from ranked candidates.

        Placement order is intentional:
        1) anchors (hard constraints, including anchor timeblocks)
        2) injections (status-triggered must-do items)
        3) windows and template timeblocks (category/free/buffer)
        4) gaps (quick wins / leftovers)
        5) synthetic timeblocks (buffers/breaks)
        """
        schedule = {"date": target_date.isoformat(), "blocks": [], "stats": {"total_items": len(ranked_items), "scheduled_items": 0, "happiness_score": 0}}
        deduped = []
        seen = set()
        dropped = 0
        for item in ranked_items:
            # Deduplicate by logical identity so repeated DB mirrors of the same
            # type+name do not inflate placement opportunities.
            key = (str(item.get("type") or "").strip().lower(), str(item.get("name") or "").strip().lower())
            if key in seen:
                dropped += 1
                continue
            seen.add(key)
            deduped.append(item)
        timeline = []
        used = set()
        win_events = []
        anchor_events = {"placed": [], "conflicts": [], "skipped_no_time": []}
        injection_events = {"candidates": 0, "placed": []}
        gap_events = {"strategy": "quick_wins", "max_minutes": 15, "placed": []}
        timeblock_events = {"placed": [], "template": []}
        windows = self.windows or [{"name": "Deep Work", "start": "09:00", "end": "11:00", "filter": {"category": "work"}}]
        options = self.runtime.get("options", {}) if isinstance(self.runtime, dict) else {}
        tprof = self._timer_profile()
        sprint_cap = 0
        if bool(options.get("use_timer_sprints")):
            try:
                sprint_cap = max(0, int(tprof.get("focus_minutes", 0) or 0))
            except Exception:
                sprint_cap = 0
        day_floor = 0
        if bool(self.user_context.get("start_from_now")) and target_date == date.today():
            now_dt = datetime.now()
            day_floor = max(0, min(24 * 60, now_dt.hour * 60 + now_dt.minute))

        # 1) Place anchors first (hard scaffold).
        template_timeblocks = list(self.template_timeblocks or [])
        anchors = []
        flex = []
        for item in deduped:
            if self._is_anchor_item(item):
                anchors.append(item)
            else:
                flex.append(item)

        # Treat template timeblocks marked as anchors like fixed scaffold.
        for tb in template_timeblocks:
            if not self._is_anchor_timeblock(tb):
                continue
            pseudo = {
                "id": f"timeblock::{str(tb.get('name') or 'anchor').strip().lower()}",
                "name": tb.get("name") or "Timeblock Anchor",
                "type": "timeblock",
                "subtype": tb.get("subtype"),
                "_raw": {
                    "start_time": tb.get("start") or tb.get("start_time"),
                    "end_time": tb.get("end") or tb.get("end_time"),
                    "duration": tb.get("duration"),
                    "reschedule": tb.get("reschedule", "never"),
                    "essential": tb.get("essential", True),
                    "tags": tb.get("tags") or ["anchor"],
                },
                "reschedule": tb.get("reschedule", "never"),
                "essential": tb.get("essential", True),
                "kairos_score": 0,
                "status": "active",
                "category": tb.get("category"),
                "_template_timeblock_anchor": True,
            }
            anchors.append(pseudo)

        anchors_sorted = sorted(
            anchors,
            key=lambda it: (
                self._anchor_slot(it)["start"] if self._anchor_slot(it) else 10**9,
                1 if bool(it.get("_template_timeblock_anchor")) else 0,
                str(it.get("name") or "").lower(),
            ),
        )
        occupied = []
        for item in anchors_sorted:
            slot = self._anchor_slot(item)
            if not slot:
                anchor_events["skipped_no_time"].append({"name": item.get("name"), "type": item.get("type")})
                continue
            s, e = slot["start"], slot["end"]
            conflict = False
            soft_skip = False
            for os_, oe, oblock in occupied:
                # Overlap check is strict because anchors are non-negotiable.
                if s < oe and os_ < e:
                    if bool(item.get("_template_timeblock_anchor")):
                        # If a template anchor overlaps an already-placed hard
                        # anchor (e.g., dedicated Sleep habit), skip it instead
                        # of invalidating the run.
                        soft_skip = True
                        break
                    conflict = True
                    anchor_events["conflicts"].append(
                        {
                            "name": item.get("name"),
                            "type": item.get("type"),
                            "start": self._to_hhmm(s),
                            "end": self._to_hhmm(e),
                            "overlaps": {"name": oblock.get("name"), "type": oblock.get("type"), "start": oblock.get("start_time"), "end": oblock.get("end_time")},
                        }
                    )
                    break
            if soft_skip:
                anchor_events["skipped_no_time"].append({"name": item.get("name"), "type": item.get("type"), "reason": "overlaps_existing_anchor"})
                continue
            if conflict:
                continue
            iid = self._item_id(item)
            used.add(iid)
            block = dict(item)
            block["duration_minutes"] = e - s
            block["start_time"] = self._to_hhmm(s)
            block["end_time"] = self._to_hhmm(e)
            block["window_name"] = "ANCHOR"
            block["block_id"] = f"{iid}@{block['start_time']}"
            if str(block.get("type") or "").strip().lower() == "timeblock":
                raw_tb = block.get("_raw") if isinstance(block.get("_raw"), dict) else {}
                block["subtype"] = raw_tb.get("subtype") or block.get("subtype") or "anchor"
                block["reschedule"] = "never"
                block["essential"] = True
            timeline.append((s, e, block))
            occupied.append((s, e, block))
            schedule["stats"]["scheduled_items"] += 1
            anchor_events["placed"].append({"id": block["block_id"], "name": block.get("name"), "type": block.get("type"), "start": block.get("start_time"), "end": block.get("end_time")})

        # Fail-fast safety: unresolved anchor conflicts invalidate this run.
        anchor_conflicts = anchor_events.get("conflicts") or []
        if anchor_conflicts:
            schedule["stats"]["valid"] = False
            schedule["stats"]["invalid_reason"] = "anchor_conflicts"
            schedule["errors"] = [
                "Anchor conflict detected. Resolve fixed-time overlaps before scheduling."
            ]
            self.phase_notes["anchors"] = {
                "candidates": len(anchors),
                "placed": len(anchor_events["placed"]),
                "conflicts": anchor_conflicts,
                "skipped_no_time": anchor_events["skipped_no_time"],
                "placed_items": anchor_events["placed"][:40],
            }
            self.phase_notes["construct"] = {
                "ranked_input": len(ranked_items),
                "deduped_input": len(deduped),
                "dedupe_dropped": dropped,
                "windows": [],
                "scheduled": len(timeline),
                "unscheduled_top": [],
                "aborted": True,
                "abort_reason": "anchor_conflicts",
            }
            timeline.sort(key=lambda x: (x[0], str(x[2].get("name") or "").lower()))
            schedule["blocks"] = [x[2] for x in timeline]
            return schedule

        # 2) Place injections in earliest free gaps (status-triggered / tagged).
        remaining: Dict[str, int] = {}
        for item in deduped:
            iid = self._item_id(item)
            remaining[iid] = self._duration_minutes(item)
        for item in anchors_sorted:
            iid = self._item_id(item)
            if iid in remaining:
                remaining[iid] = 0
        injections = [it for it in flex if self._is_injection_item(it)]
        window_pool = [it for it in flex if not self._is_injection_item(it)]
        injection_events["candidates"] = len(injections)
        injections_sorted = sorted(
            injections,
            key=lambda x: (-float(x.get("kairos_score") or 0), str(x.get("name") or "").lower(), str(x.get("type") or "").lower()),
        )
        for item in injections_sorted:
            iid = self._item_id(item)
            if iid in used:
                continue
            dur = int(remaining.get(iid, self._duration_minutes(item)))
            if dur <= 0:
                continue
            free = self._subtract_occupied(day_floor, 24 * 60, [(a, b) for a, b, _ in timeline])
            placed = False
            for seg_start, seg_end in free:
                # Injections are packed into earliest feasible free segment.
                if seg_end - seg_start < dur:
                    continue
                bstart = seg_start
                bend = bstart + dur
                block = dict(item)
                block["duration_minutes"] = dur
                block["start_time"] = self._to_hhmm(bstart)
                block["end_time"] = self._to_hhmm(bend)
                block["window_name"] = "INJECTION"
                block["kairos_element"] = "injection"
                block["injected"] = True
                block["block_id"] = f"{iid}@{block['start_time']}"
                timeline.append((bstart, bend, block))
                used.add(iid)
                remaining[iid] = 0
                schedule["stats"]["scheduled_items"] += 1
                injection_events["placed"].append(
                    {
                        "id": block["block_id"],
                        "name": block.get("name"),
                        "type": block.get("type"),
                        "start": block.get("start_time"),
                        "end": block.get("end_time"),
                        "score": block.get("kairos_score"),
                    }
                )
                placed = True
                break
            if not placed:
                continue

        for win in windows:
            # Window loop: schedule highest-scoring fitting candidates into each
            # currently free segment inside this window.
            sh, sm = map(int, str(win.get("start", "09:00")).split(":"))
            eh, em = map(int, str(win.get("end", "11:00")).split(":"))
            start = max(sh * 60 + sm, day_floor)
            end = eh * 60 + em
            cap = end - start
            placements = []
            free_segments = []
            if cap > 0:
                free_segments = self._subtract_occupied(start, end, [(a, b) for a, b, _ in timeline])
                for seg_start, seg_end in free_segments:
                    fill = 0
                    seg_cap = seg_end - seg_start
                    while fill < seg_cap:
                        cands = self._window_candidates(window_pool, used, win, fill, seg_cap, remaining, sprint_cap)
                        if not cands:
                            break
                        pick = cands[0]
                        alt = cands[1] if len(cands) > 1 else None
                        # Record second-best candidate for explainability in logs.
                        iid = self._item_id(pick)
                        rem = int(remaining.get(iid, self._duration_minutes(pick)))
                        dur = min(rem, sprint_cap) if sprint_cap > 0 else rem
                        if dur <= 0:
                            used.add(iid)
                            continue
                        bstart = seg_start + fill
                        bend = bstart + dur
                        if bend > seg_end:
                            break
                        fill += dur
                        remaining[iid] = max(0, rem - dur)
                        if remaining[iid] <= 0:
                            used.add(iid)
                        block = dict(pick)
                        block["duration_minutes"] = dur
                        block["start_time"] = self._to_hhmm(bstart)
                        block["end_time"] = self._to_hhmm(bend)
                        block["window_name"] = win.get("name")
                        block["kairos_element"] = "window"
                        if sprint_cap > 0:
                            block["sprint"] = {"enabled": True, "focus_minutes": sprint_cap, "remaining_after": remaining.get(iid, 0)}
                        block["block_id"] = f"{iid}@{block['start_time']}"
                        if alt:
                            block["selected_over"] = {"name": alt.get("name"), "type": alt.get("type"), "score": alt.get("kairos_score")}
                        timeline.append((bstart, bend, block))
                        schedule["stats"]["scheduled_items"] += 1
                        placements.append({"id": block["block_id"], "name": block.get("name"), "type": block.get("type"), "start": block.get("start_time"), "end": block.get("end_time"), "score": block.get("kairos_score"), "selected_over": block.get("selected_over")})
            win_events.append(
                {
                    "window": win.get("name"),
                    "start": win.get("start"),
                    "end": win.get("end"),
                    "filter": win.get("filter") or {},
                    "capacity_minutes": cap,
                    "placed": len(placements),
                    "placements": placements,
                    "free_segments": [{"start": self._to_hhmm(a), "end": self._to_hhmm(b)} for a, b in free_segments],
                }
            )

        # 3.5) Template timeblocks (category/free/buffer) from selected template.
        non_anchor_timeblocks = [tb for tb in template_timeblocks if not self._is_anchor_timeblock(tb)]
        non_anchor_timeblocks.sort(
            key=lambda tb: (
                (self._timeblock_slot(tb)[0] if self._timeblock_slot(tb) else 10**9),
                str(tb.get("name") or "").lower(),
            )
        )
        for tb in non_anchor_timeblocks:
            slot = self._timeblock_slot(tb)
            if not slot:
                continue
            tb_start, tb_end = slot
            if tb_end <= day_floor:
                continue
            tb_start = max(tb_start, day_floor)
            subtype = str(tb.get("subtype") or "free").strip().lower()
            tb_name = str(tb.get("name") or "Timeblock").strip() or "Timeblock"
            free_segments = self._subtract_occupied(tb_start, tb_end, [(a, b) for a, b, _ in timeline])
            placements = []
            if subtype in ("category", "free"):
                win_filter: Dict[str, Any] = {}
                if isinstance(tb.get("filters"), dict):
                    win_filter.update(tb.get("filters") or {})
                if subtype == "category":
                    cat = str(tb.get("category") or "").strip()
                    if cat and "category" not in win_filter:
                        win_filter["category"] = cat
                win_meta = {"name": tb_name, "filter": win_filter}
                for seg_start, seg_end in free_segments:
                    fill = 0
                    seg_cap = seg_end - seg_start
                    while fill < seg_cap:
                        cands = self._window_candidates(window_pool, used, win_meta, fill, seg_cap, remaining, sprint_cap)
                        if not cands and subtype == "category":
                            # Category blocks may accept other items when no
                            # category match is available.
                            cands = self._window_candidates(window_pool, used, {"name": tb_name, "filter": {}}, fill, seg_cap, remaining, sprint_cap)
                        if not cands:
                            break
                        pick = cands[0]
                        iid = self._item_id(pick)
                        rem = int(remaining.get(iid, self._duration_minutes(pick)))
                        dur = min(rem, sprint_cap) if sprint_cap > 0 else rem
                        if dur <= 0 or fill + dur > seg_cap:
                            break
                        bstart = seg_start + fill
                        bend = bstart + dur
                        fill += dur
                        remaining[iid] = max(0, rem - dur)
                        if remaining[iid] <= 0:
                            used.add(iid)
                        block = dict(pick)
                        block["duration_minutes"] = dur
                        block["start_time"] = self._to_hhmm(bstart)
                        block["end_time"] = self._to_hhmm(bend)
                        block["window_name"] = tb_name
                        block["kairos_element"] = "timeblock"
                        block["timeblock_subtype"] = subtype
                        block["block_id"] = f"{self._item_id(pick)}@{block['start_time']}"
                        timeline.append((bstart, bend, block))
                        schedule["stats"]["scheduled_items"] += 1
                        placements.append({"id": block["block_id"], "name": block.get("name"), "type": block.get("type"), "start": block.get("start_time"), "end": block.get("end_time"), "score": block.get("kairos_score")})

            # Buffer/free blocks should remain visible even when empty.
            if subtype in ("buffer", "free"):
                occupied_now = [(a, b) for a, b, _ in timeline]
                free_after_fill = self._subtract_occupied(tb_start, tb_end, occupied_now)
                for seg_start, seg_end in free_after_fill:
                    if seg_end <= seg_start:
                        continue
                    block = {
                        "name": tb_name,
                        "type": "timeblock",
                        "subtype": subtype,
                        "duration_minutes": seg_end - seg_start,
                        "start_time": self._to_hhmm(seg_start),
                        "end_time": self._to_hhmm(seg_end),
                        "window_name": "TIMEBLOCK",
                        "kairos_element": "timeblock",
                        "block_id": f"timeblock::{subtype}::{self._to_hhmm(seg_start)}",
                        "reschedule": "never" if subtype == "buffer" else "auto",
                        "essential": False,
                        "absorbable": bool(tb.get("absorbable", True)),
                        "flexible": bool(tb.get("flexible", True)),
                        "category": tb.get("category"),
                    }
                    timeline.append((seg_start, seg_end, block))
                    schedule["stats"]["scheduled_items"] += 1
                    placements.append({"id": block["block_id"], "name": block.get("name"), "type": block.get("type"), "start": block.get("start_time"), "end": block.get("end_time"), "score": block.get("kairos_score")})

            timeblock_events["template"].append(
                {
                    "name": tb_name,
                    "subtype": subtype,
                    "start": self._to_hhmm(tb_start),
                    "end": self._to_hhmm(tb_end),
                    "placed": len(placements),
                    "placements": placements,
                }
            )

        # 4) Fill remaining day gaps using quick-win strategy (short executable items).
        quick = self.runtime.get("quick_wins_settings", {}) if isinstance(self.runtime, dict) else {}
        try:
            gap_max = max(1, int((quick or {}).get("max_minutes", 15) or 15))
        except Exception:
            gap_max = 15
        try:
            if self.user_context.get("quickwins_max_minutes") is not None:
                gap_max = max(1, int(self.user_context.get("quickwins_max_minutes")))
        except Exception:
            pass
        gap_events["max_minutes"] = gap_max
        free_day = self._subtract_occupied(day_floor, 24 * 60, [(a, b) for a, b, _ in timeline])
        for seg_start, seg_end in free_day:
            # Gap fill intentionally prioritizes short wins to avoid fragmenting
            # the day with long blocks in arbitrary leftover spaces.
            cursor = seg_start
            while cursor < seg_end:
                remaining_minutes = seg_end - cursor
                cands = []
                for item in flex:
                    iid = self._item_id(item)
                    if iid in used:
                        continue
                    rem = int(remaining.get(iid, self._duration_minutes(item)))
                    dur = min(rem, sprint_cap) if sprint_cap > 0 else rem
                    if dur <= 0:
                        used.add(iid)
                        continue
                    if dur > remaining_minutes or dur > gap_max:
                        continue
                    cands.append(item)
                cands.sort(key=lambda x: (-float(x.get("kairos_score") or 0), str(x.get("name") or "").lower(), str(x.get("type") or "").lower()))
                if not cands:
                    break
                pick = cands[0]
                dur = self._duration_minutes(pick)
                iid = self._item_id(pick)
                rem = int(remaining.get(iid, dur))
                dur = min(rem, sprint_cap) if sprint_cap > 0 else rem
                if dur <= 0:
                    used.add(iid)
                    continue
                bstart = cursor
                bend = bstart + dur
                block = dict(pick)
                block["duration_minutes"] = dur
                block["start_time"] = self._to_hhmm(bstart)
                block["end_time"] = self._to_hhmm(bend)
                block["window_name"] = "GAP"
                block["kairos_element"] = "gap"
                block["block_id"] = f"{iid}@{block['start_time']}"
                timeline.append((bstart, bend, block))
                remaining[iid] = max(0, rem - dur)
                if remaining[iid] <= 0:
                    used.add(iid)
                cursor = bend
                schedule["stats"]["scheduled_items"] += 1
                gap_events["placed"].append(
                    {
                        "id": block["block_id"],
                        "name": block.get("name"),
                        "type": block.get("type"),
                        "start": block.get("start_time"),
                        "end": block.get("end_time"),
                        "score": block.get("kairos_score"),
                    }
                )

        # 5) Insert synthetic timeblocks for buffers/breaks when free room exists between blocks.
        timeline, inserted_timeblocks = self._insert_timeblocks(timeline)
        if inserted_timeblocks:
            schedule["stats"]["scheduled_items"] += len(inserted_timeblocks)
            timeblock_events["placed"] = inserted_timeblocks

        timeline.sort(key=lambda x: (x[0], str(x[2].get("name") or "").lower()))
        schedule["blocks"] = [x[2] for x in timeline]
        uns = []
        for item in deduped:
            iid = self._item_id(item)
            if iid in used or int(remaining.get(iid, 0)) <= 0:
                continue
            uns.append({"name": item.get("name"), "type": item.get("type"), "score": item.get("kairos_score"), "remaining_minutes": int(remaining.get(iid, 0))})
        uns.sort(key=lambda x: (-float(x.get("score") or 0), str(x.get("name") or "").lower()))
        self.phase_notes["anchors"] = {
            "candidates": len(anchors),
            "placed": len(anchor_events["placed"]),
            "conflicts": anchor_events["conflicts"],
            "skipped_no_time": anchor_events["skipped_no_time"],
            "placed_items": anchor_events["placed"][:40],
        }
        self.phase_notes["construct"] = {
            "ranked_input": len(ranked_items),
            "deduped_input": len(deduped),
            "dedupe_dropped": dropped,
            "injections": injection_events,
            "windows": win_events,
            "gaps": gap_events,
            "timeblocks": timeblock_events,
            "scheduled": len(schedule["blocks"]),
            "unscheduled_top": uns[:30],
            "options": options,
            "timer_profile": tprof,
            "sprint_cap_minutes": sprint_cap,
        }
        return schedule

    def explain_decisions(self):
        """
        Emit a markdown decision log for post-run diagnosis.

        This log is the primary observability artifact for tuning Kairos behavior.
        """
        try:
            from Modules.ItemManager import get_user_dir
            user_dir = get_user_dir()
        except Exception:
            user_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "User"))
        logs_dir = os.path.join(user_dir, "Logs")
        os.makedirs(logs_dir, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        run_date = self.last_target_date.isoformat() if self.last_target_date else "unknown"
        out = os.path.join(logs_dir, f"kairos_decision_log_{stamp}.md")
        latest = os.path.join(logs_dir, "kairos_decision_log_latest.md")
        tmpl = self.phase_notes.get("template", {})
        gather = self.phase_notes.get("gather", {})
        anchors = self.phase_notes.get("anchors", {})
        filt = self.phase_notes.get("filter", {})
        score = self.phase_notes.get("score", {})
        trends = self.phase_notes.get("trends", {})
        construct = self.phase_notes.get("construct", {})
        blocks = (self.last_schedule or {}).get("blocks", []) if isinstance(self.last_schedule, dict) else []
        lines: List[str] = []
        lines.append(f"# Kairos Decision Log ({run_date})")
        lines.append("")
        lines.append(f"- Generated At: {datetime.now().isoformat(timespec='seconds')}")
        lines.append(f"- Candidates Gathered: {gather.get('total', 0)}")
        lines.append(f"- Candidates Kept After Filter: {filt.get('kept', 0)}")
        lines.append(f"- Blocks Scheduled: {len(blocks) if isinstance(blocks, list) else 0}")
        lines.append("")
        lines.append("## Template and Windows")
        lines.append(f"- day: {tmpl.get('day')}")
        lines.append(f"- template_path: {tmpl.get('template_path')}")
        lines.append(f"- template_score: {tmpl.get('template_score')}")
        lines.append(f"- forced_template: {tmpl.get('forced')}")
        lines.append(f"- windows_found: {tmpl.get('windows_found')}")
        lines.append("")
        lines.append("## Phase 1 - Gather")
        lines.append(f"- Source DB: {gather.get('source_db', 'n/a')}")
        lines.append(f"- executable rows: {gather.get('executable_items', 0)}")
        lines.append(f"- commitment rows: {gather.get('commitments', 0)}")
        if gather.get("error"):
            lines.append(f"- error: {gather.get('error')}")
        lines.append("")
        lines.append("## Phase 2 - Filter")
        lines.append(f"- input: {filt.get('input', 0)}")
        lines.append(f"- kept: {filt.get('kept', 0)}")
        lines.append(f"- rejected: {filt.get('rejected', 0)}")
        for row in (filt.get("sample_rejections") or [])[:20]:
            lines.append(f"  - reject {row.get('type')}:{row.get('name')} -> {row.get('reason')}")
        lines.append("")
        lines.append("## Phase 3 - Score (Top)")
        lines.append(f"- weights: {score.get('weights', {})}")
        lines.append(f"- trends_enabled: {trends.get('enabled')}")
        lines.append(f"- trends_source: {trends.get('source_db')}")
        lines.append(f"- trends_entries: {trends.get('entries', 0)}")
        if trends.get("reason"):
            lines.append(f"- trends_reason: {trends.get('reason')}")
        for t in (trends.get("sample") or [])[:10]:
            lines.append(f"  - trend {t.get('key')} score={t.get('score')} total={t.get('total')} completion_rate={t.get('completion_rate')}")
        for row in (score.get("top_scored") or [])[:20]:
            reasons = ", ".join(row.get("reasons") or [])
            lines.append(f"  - {row.get('type')}:{row.get('name')} score={row.get('score')} [{reasons}]")
        lines.append("")
        lines.append("## Phase 4 - Construct")
        lines.append(f"- anchors candidates: {anchors.get('candidates', 0)}")
        lines.append(f"- anchors placed: {anchors.get('placed', 0)}")
        lines.append(f"- anchors conflicts: {len(anchors.get('conflicts') or [])}")
        for a in (anchors.get("placed_items") or [])[:15]:
            lines.append(f"  - anchor {a.get('id')} {a.get('type')}:{a.get('name')} {a.get('start')}-{a.get('end')}")
        for c in (anchors.get("conflicts") or [])[:10]:
            ov = c.get("overlaps") or {}
            lines.append(
                f"  - anchor_conflict {c.get('type')}:{c.get('name')} {c.get('start')}-{c.get('end')} "
                f"overlaps {ov.get('type')}:{ov.get('name')} {ov.get('start')}-{ov.get('end')}"
            )
        if anchors.get("conflicts"):
            lines.append("  - action_required: Resolve anchor overlaps, then rerun `today kairos`.")
            lines.append("  - how_to_fix: adjust start_time/end_time or duration on conflicting anchor items,")
            lines.append("    or remove `reschedule: never`/`essential: true` if the block should be flexible.")
        lines.append(f"- ranked input: {construct.get('ranked_input', 0)}")
        lines.append(f"- deduped input: {construct.get('deduped_input', 0)}")
        lines.append(f"- dedupe dropped: {construct.get('dedupe_dropped', 0)}")
        lines.append(f"- options: {construct.get('options', {})}")
        lines.append(f"- timer_profile: {construct.get('timer_profile', {}).get('type', 'n/a')} focus={construct.get('timer_profile', {}).get('focus_minutes')} short_break={construct.get('timer_profile', {}).get('short_break_minutes')}")
        lines.append(f"- sprint_cap_minutes: {construct.get('sprint_cap_minutes', 0)}")
        injections = construct.get("injections") or {}
        lines.append(f"- injections candidates: {injections.get('candidates', 0)}")
        lines.append(f"- injections placed: {len(injections.get('placed') or [])}")
        for p in (injections.get("placed") or [])[:10]:
            lines.append(f"  - injection {p.get('id')} {p.get('type')}:{p.get('name')} {p.get('start')}-{p.get('end')} score={p.get('score')}")
        for win in (construct.get("windows") or []):
            lines.append(f"- window {win.get('window')} ({win.get('start')} - {win.get('end')}) placed={win.get('placed')}")
            for p in (win.get("placements") or [])[:15]:
                over = p.get("selected_over")
                over_txt = f" selected_over={over.get('type')}:{over.get('name')}({over.get('score')})" if over else ""
                lines.append(f"  - {p.get('id')} {p.get('type')}:{p.get('name')} {p.get('start')}-{p.get('end')} score={p.get('score')}{over_txt}")
        gaps = construct.get("gaps") or {}
        lines.append(f"- gap strategy: {gaps.get('strategy')} (max_minutes={gaps.get('max_minutes')})")
        lines.append(f"- gap fills placed: {len(gaps.get('placed') or [])}")
        for p in (gaps.get("placed") or [])[:10]:
            lines.append(f"  - gap {p.get('id')} {p.get('type')}:{p.get('name')} {p.get('start')}-{p.get('end')} score={p.get('score')}")
        timeblocks = construct.get("timeblocks") or {}
        lines.append(f"- timeblocks placed: {len(timeblocks.get('placed') or [])}")
        for tb in (timeblocks.get("placed") or [])[:10]:
            lines.append(f"  - timeblock {tb.get('id')} {tb.get('subtype')} {tb.get('start')}-{tb.get('end')} from={tb.get('from_item')}")
        lines.append("- unscheduled top:")
        for row in (construct.get("unscheduled_top") or [])[:15]:
            lines.append(f"  - {row.get('type')}:{row.get('name')} score={row.get('score')}")
        lines.append("")
        lines.append("## Final Blocks")
        for b in (blocks or [])[:80]:
            lines.append(f"- {b.get('block_id')} [{b.get('start_time')} - {b.get('end_time')}] {b.get('type')}:{b.get('name')} score={b.get('kairos_score')}")
        body = "\n".join(lines) + "\n"
        with open(out, "w", encoding="utf-8") as f:
            f.write(body)
        with open(latest, "w", encoding="utf-8") as f:
            f.write(body)
        self.decision_log = lines
        print(f"[Kairos] Decision log written: {out}")


if __name__ == "__main__":
    scheduler = KairosScheduler()
    today = date.today()
    print("--- Starting Kairos Shadow Run ---")
    schedule = scheduler.generate_schedule(today)
    print("\n--- Generated Schedule ---")
    print(f"Stats: {schedule.get('stats')}")
    for block in schedule.get("blocks", []):
        print(f"[{block.get('start_time', '??:??')}] {block.get('name')} (Score: {block.get('kairos_score', 0)})")
    print("--- End Shadow Run ---")
