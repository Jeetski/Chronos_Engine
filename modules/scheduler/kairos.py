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
import re
import sqlite3
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import yaml

from Utilities.duration_parser import parse_duration_string  # type: ignore

# Item types Kairos can place into a concrete daily timeline.
# Containers (`week`/`day`/`routine`) are intentionally excluded.
EXECUTABLE_TYPES = {"subroutine", "microroutine", "task", "habit"}

# Name heuristics for "likely fixed" items when explicit anchor metadata is missing.
ANCHOR_NAME_HINTS = ("sleep", "work", "uni", "school", "commute", "transit", "bedtime")


class KairosScheduler:
    def __init__(self, user_context: Dict[str, Any] = None):
        """Initialize per-run state and optional user overrides."""
        self.user_context = user_context or {}
        env_debug = str(os.getenv("CHRONOS_KAIROS_DEBUG", "")).strip().lower() in ("1", "true", "yes", "on")
        self.debug = self._as_bool(self.user_context.get("debug"), False) or env_debug
        self.verbose = self._as_bool(self.user_context.get("verbose"), False) or self.debug
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

    def _log(self, message: str, *, debug: bool = False) -> None:
        """Gated runtime logging to avoid noisy scheduler output by default."""
        if debug:
            if not self.debug:
                return
        else:
            if not self.verbose:
                return
        try:
            print(message)
        except Exception:
            pass

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
        self._run_pre_schedule_hooks()
        self.runtime = self._load_runtime()
        self.windows = self._resolve_windows(target_date)
        self._log(f"[Kairos] Generating schedule for {target_date}...")
        candidates = self.gather_candidates(target_date)
        self._log(f"[Kairos] Gathered {len(candidates)} candidates.")
        valid = self.filter_candidates(candidates)
        self._log(f"[Kairos] Filtered down to {len(valid)} valid items.")
        scored = self.score_candidates(valid)
        schedule = self.construct_schedule(scored, target_date)
        self.last_schedule = schedule
        self.explain_decisions()
        return schedule

    def _run_pre_schedule_hooks(self) -> None:
        """
        Run legacy-parity pre-schedule evaluators (commitments/milestones).

        Hook is non-fatal and can be disabled via user_context `evaluate_hooks:false`.
        """
        enabled = self._as_bool((self.user_context or {}).get("evaluate_hooks"), False)
        if not enabled:
            self.phase_notes["pre_schedule_hooks"] = {"enabled": False, "reason": "evaluate_hooks=false", "results": []}
            return

        results: List[Dict[str, Any]] = []

        try:
            from modules.commitment import main as CommitmentModule  # type: ignore

            CommitmentModule.evaluate_and_trigger()
            results.append({"hook": "commitment", "ok": True})
        except Exception as e:
            results.append({"hook": "commitment", "ok": False, "error": str(e)})

        try:
            from modules.milestone import main as MilestoneModule  # type: ignore

            MilestoneModule.evaluate_and_update_milestones()
            results.append({"hook": "milestone", "ok": True})
        except Exception as e:
            results.append({"hook": "milestone", "ok": False, "error": str(e)})

        self.phase_notes["pre_schedule_hooks"] = {"enabled": True, "results": results}

    def _load_runtime(self) -> Dict[str, Any]:
        """
        Load external runtime dependencies and user settings.

        Runtime is intentionally centralized so pure scheduling logic can remain
        stateless and test-friendly.
        """
        try:
            from Commands import today as T
            from modules.scheduler import USER_DIR, normalize_completion_entries, read_template, status_current_path
            status_settings = read_template(os.path.join(USER_DIR, "Settings", "Status_Settings.yml")) or {}
            current_status = read_template(status_current_path()) or read_template(os.path.join(USER_DIR, "current_status.yml")) or {}
            status_context = T.build_status_context(status_settings, current_status)
            happiness_map = T.load_happiness_map()
            sched_priorities = read_template(os.path.join(USER_DIR, "Settings", "Scheduling_Priorities.yml")) or {}
            buffer_settings = read_template(os.path.join(USER_DIR, "Settings", "buffer_settings.yml")) or {}
            quick_wins_settings = read_template(os.path.join(USER_DIR, "Settings", "quick_wins_settings.yml")) or {}
            timer_settings = read_template(os.path.join(USER_DIR, "Settings", "Timer_Settings.yml")) or {}
            timer_profiles = read_template(os.path.join(USER_DIR, "Settings", "Timer_Profiles.yml")) or {}
            status_match_threshold = self.user_context.get("status_match_threshold")
            options = {
                "force_template": self.user_context.get("force_template"),
                "use_buffers": self._as_bool(self.user_context.get("use_buffers"), True),
                "use_timer_breaks": self._as_bool(self.user_context.get("use_timer_breaks"), False),
                "use_timer_sprints": self._as_bool(self.user_context.get("use_timer_sprints"), False),
                "timer_profile": self.user_context.get("timer_profile"),
                "ignore_trends": self._as_bool(self.user_context.get("ignore_trends"), False),
                "custom_property": self.user_context.get("custom_property"),
                "status_match_threshold": status_match_threshold,
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
            target = self.last_target_date or date.today()
            start_from_now = bool(self._as_bool(self.user_context.get("start_from_now"), False))
            missed_promo_enabled = bool(target == date.today() and start_from_now)
            missed_promo_threshold = 30
            missed_promo_boost = 20.0
            if T and hasattr(T, "load_scheduling_config"):
                try:
                    cfg = T.load_scheduling_config() or {}
                    rescheduling_cfg = cfg.get("rescheduling", {}) if isinstance(cfg, dict) else {}
                    missed_promo_threshold = int(rescheduling_cfg.get("importance_threshold", 30) or 30)
                    status_matching_cfg = cfg.get("status_matching", {}) if isinstance(cfg, dict) else {}
                    if status_match_threshold is None:
                        status_match_threshold = status_matching_cfg.get("requirement_threshold")
                        options["status_match_threshold"] = status_match_threshold
                except Exception:
                    missed_promo_threshold = 30
            if self.user_context.get("missed_promotion_threshold") is not None:
                try:
                    missed_promo_threshold = int(self.user_context.get("missed_promotion_threshold"))
                except Exception:
                    pass
            if self.user_context.get("missed_promotion_boost") is not None:
                try:
                    missed_promo_boost = float(self.user_context.get("missed_promotion_boost"))
                except Exception:
                    pass
            completion_path = os.path.join(USER_DIR, "Schedules", "completions", f"{target.isoformat()}.yml")
            completion_payload = read_template(completion_path) or {}
            completion_entries = normalize_completion_entries(completion_payload)
            completed_names, completed_blocks, completed_specs, completion_notes = self._build_completed_markers(completion_entries)
            completion_notes["path"] = completion_path
            completion_notes["exists"] = os.path.exists(completion_path)
            self.phase_notes["completed_today"] = completion_notes
            missed_by_name, missed_notes = self._load_recent_missed_entries(target, enabled=missed_promo_enabled)
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
                "completion_entries": completion_entries,
                "completed_names": completed_names,
                "completed_blocks": completed_blocks,
                "completed_specs": completed_specs,
                "missed_promotions": {
                    "enabled": missed_promo_enabled,
                    "threshold": missed_promo_threshold,
                    "boost": missed_promo_boost,
                    "by_name": missed_by_name,
                    "notes": missed_notes,
                },
            }
        except Exception as e:
            self.phase_notes["runtime"] = {"error": str(e)}
            return {"status_context": {"types": {}, "current": {}}, "happiness_map": None, "weights": self._weights_from_settings({})}

    def _load_recent_missed_entries(self, target_date: date, *, enabled: bool) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
        """
        Read completion logs for target day and previous day to detect missed items.

        Output map key is normalized item name -> signal metadata.
        """
        notes: Dict[str, Any] = {"enabled": bool(enabled), "files": [], "items": 0}
        if not enabled:
            notes["reason"] = "disabled"
            self.phase_notes["missed_promotion"] = notes
            return {}, notes
        try:
            from modules.scheduler import USER_DIR, read_template, normalize_completion_entries
        except Exception as e:
            notes["enabled"] = False
            notes["reason"] = f"import_error:{e}"
            self.phase_notes["missed_promotion"] = notes
            return {}, notes

        out: Dict[str, Dict[str, Any]] = {}
        statuses_done = {"completed", "done", "skipped"}
        statuses_missed = {"missed"}
        days = [target_date, target_date - timedelta(days=1)]
        for d in days:
            day_str = d.isoformat()
            path = os.path.join(USER_DIR, "Schedules", "completions", f"{day_str}.yml")
            file_note = {"date": day_str, "path": path, "exists": os.path.exists(path), "entries": 0}
            if not os.path.exists(path):
                notes["files"].append(file_note)
                continue
            payload = read_template(path) or {}
            entries = normalize_completion_entries(payload or {})
            if not isinstance(entries, dict):
                notes["files"].append(file_note)
                continue
            file_note["entries"] = len(entries)
            notes["files"].append(file_note)
            for key, entry in entries.items():
                if not isinstance(entry, dict):
                    continue
                name = str(entry.get("name") or "").strip()
                if not name and isinstance(key, str) and "@" in key:
                    name = str(key.split("@", 1)[0] or "").strip()
                if not name:
                    continue
                status = str(entry.get("status") or "").strip().lower()
                if not status:
                    continue
                name_key = self._normalize_key(name)
                if not name_key:
                    continue
                row = out.setdefault(
                    name_key,
                    {"name": name, "missed": 0, "done": 0, "sources": set()},
                )
                if status in statuses_missed:
                    row["missed"] = int(row.get("missed", 0)) + 1
                elif status in statuses_done:
                    row["done"] = int(row.get("done", 0)) + 1
                row["sources"].add(day_str)

        result: Dict[str, Dict[str, Any]] = {}
        for name_key, row in out.items():
            missed = int(row.get("missed", 0) or 0)
            done = int(row.get("done", 0) or 0)
            net = missed - done
            if net <= 0:
                continue
            result[name_key] = {
                "name": row.get("name"),
                "missed": missed,
                "done": done,
                "net_missed": net,
                "sources": sorted(list(row.get("sources") or [])),
            }
        notes["items"] = len(result)
        notes["sample"] = list(result.values())[:20]
        self.phase_notes["missed_promotion"] = notes
        return result, notes

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
            from modules.item_manager import get_user_dir
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
            from modules.scheduler import USER_DIR, read_template, list_day_template_paths
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
                    from modules.item_manager import get_item_path

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
            windows = []

        window_overrides = self.user_context.get("window_filter_overrides")
        override_events: List[Dict[str, Any]] = []
        if isinstance(window_overrides, list):
            for raw in window_overrides:
                if not isinstance(raw, dict):
                    continue
                key = str(raw.get("key") or "").strip()
                if not key:
                    continue
                value = raw.get("value")
                target_name = str(raw.get("window") or "").strip()
                target_name_norm = self._normalize_key(target_name) if target_name else ""
                touched = 0
                for win in windows:
                    win_name_norm = self._normalize_key(win.get("name"))
                    if target_name_norm and win_name_norm != target_name_norm:
                        continue
                    filt = win.get("filter")
                    if not isinstance(filt, dict):
                        filt = {}
                        win["filter"] = filt
                    filt[key] = value
                    touched += 1
                override_events.append(
                    {
                        "window": target_name or "*",
                        "key": key,
                        "value": value,
                        "applied_windows": touched,
                    }
                )

        self.template_timeblocks = timeblocks
        self.phase_notes["template"] = {
            "day": day_name,
            "template_path": info.get("path"),
            "template_score": info.get("score"),
            "forced": bool(self.user_context.get("force_template")),
            "windows_found": len(windows),
            "timeblocks_found": len(timeblocks),
            "window_filter_overrides": override_events,
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
            from modules.scheduler import list_day_template_paths, read_template, is_template_eligible_for_day

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
            from modules.item_manager import get_user_dir
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
                WHERE type IN ('subroutine','microroutine','task','habit')
                AND (status IS NULL OR lower(status) NOT IN ('completed','done','archived','cancelled','skipped'))
                """
            )
            backlog = cur.fetchall()
            self._log(f"[Kairos Debug] DB returned {len(backlog)} executable items.", debug=True)
            for row in backlog:
                item = dict(row)
                item["_source_kind"] = "backlog"
                item["_raw"] = self._decode_raw(item.get("raw_json"))
                out.append(item)
            cur.execute("SELECT * FROM items WHERE type = 'commitment'")
            commitments = cur.fetchall()
            self._log(f"[Kairos Debug] DB returned {len(commitments)} commitments.", debug=True)
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
        place = self._normalize_key(current.get("place"))
        raw_completed_specs = self.runtime.get("completed_specs")
        completed_specs = raw_completed_specs if isinstance(raw_completed_specs, dict) else {}
        candidate_nt_counts: Dict[Tuple[str, str], int] = {}
        for item in candidates:
            src = item.get("_raw") if isinstance(item.get("_raw"), dict) else item
            tkey = self._normalize_key(item.get("type") or src.get("type"))
            nkey = self._normalize_key(item.get("name") or src.get("name"))
            if tkey and nkey:
                key = (tkey, nkey)
                candidate_nt_counts[key] = int(candidate_nt_counts.get(key, 0) or 0) + 1
        T = self.runtime.get("Today")
        for item in candidates:
            src = item.get("_raw") if isinstance(item.get("_raw"), dict) else item
            item_type = str(item.get("type") or "").strip().lower()
            name_key = self._normalize_key(item.get("name") or src.get("name"))
            type_key = self._normalize_key(item_type or src.get("type"))
            done_specs = []
            if name_key and type_key:
                done_specs.extend(completed_specs.get(f"{type_key}|{name_key}") or [])
            if name_key:
                done_specs.extend(completed_specs.get(f"*|{name_key}") or [])
            if done_specs:
                same_count = int(candidate_nt_counts.get((type_key, name_key), 0) or 0)
                candidate_time_hints = [
                    self._parse_hhmm_flexible(src.get("start_time")),
                    self._parse_hhmm_flexible(src.get("ideal_start_time")),
                    self._parse_hhmm_flexible(item.get("start_time")),
                    self._parse_hhmm_flexible(item.get("ideal_start_time")),
                ]
                candidate_time_hints = [int(v) for v in candidate_time_hints if v is not None]
                matched_by_time = False
                if candidate_time_hints:
                    for spec in done_specs:
                        smin = spec.get("scheduled_start_min")
                        amin = spec.get("actual_start_min")
                        if (smin is not None and int(smin) in candidate_time_hints) or (
                            amin is not None and int(amin) in candidate_time_hints
                        ):
                            matched_by_time = True
                            break
                safe_to_suppress = False
                if matched_by_time:
                    safe_to_suppress = True
                elif same_count <= 1:
                    # Unambiguous candidate pair (type+name): suppress.
                    safe_to_suppress = True
                if safe_to_suppress:
                    rejected.append(
                        {
                            "name": item.get("name"),
                            "type": item.get("type"),
                            "reason": "already_completed_today",
                        }
                    )
                    continue
            if item.get("_source_kind") == "commitment_rule":
                rejected.append({"name": item.get("name"), "type": item.get("type"), "reason": "observer_only_commitment"})
                continue
            if bool(src.get("observer_only", item.get("observer_only"))):
                rejected.append({"name": item.get("name"), "type": item.get("type"), "reason": "observer_only_item"})
                continue
            if item_type not in EXECUTABLE_TYPES:
                rejected.append({"name": item.get("name"), "type": item.get("type"), "reason": "non_executable_type"})
                continue
            children_payload = src.get("children")
            if not isinstance(children_payload, list):
                children_payload = src.get("items")
            if not isinstance(children_payload, list):
                children_payload = src.get("sequence")
            if isinstance(children_payload, list) and children_payload:
                rejected.append({"name": item.get("name"), "type": item.get("type"), "reason": "container_with_children"})
                continue
            dur = self._duration_minutes(item)
            if dur > 960:
                rejected.append({"name": item.get("name"), "type": item.get("type"), "reason": "duration_gt_day"})
                continue
            item_place = self._normalize_key(src.get("place") or item.get("place"))
            if item_place and place and item_place != place:
                rejected.append({"name": item.get("name"), "type": item.get("type"), "reason": "place_mismatch"})
                continue
            req = {}
            if T and hasattr(T, "extract_status_requirements"):
                try:
                    req = T.extract_status_requirements(src, status_context) or {}
                except Exception:
                    req = {}
            req_probability = self._req_probability(req, status_context)
            item["_status_requirement_probability"] = req_probability
            threshold = self._status_match_threshold()
            if req and req_probability < threshold:
                rejected.append(
                    {
                        "name": item.get("name"),
                        "type": item.get("type"),
                        "reason": f"status_requirements_unmet({req_probability:.2f}<{threshold:.2f})",
                    }
                )
                continue
            item["_effective_duration"] = dur
            item["_requirements"] = req
            keep.append(item)
        self.phase_notes["filter"] = {"input": len(candidates), "kept": len(keep), "rejected": len(rejected), "sample_rejections": rejected[:25]}
        return keep

    def _status_match_threshold(self) -> float:
        """
        Soft-match threshold for status requirement compatibility.

        Default is intentionally permissive to avoid over-pruning:
        - 0.35 => near matches can still pass
        """
        raw = None
        try:
            raw = ((self.runtime.get("options", {}) or {}).get("status_match_threshold"))
        except Exception:
            raw = None
        if raw is None:
            raw = (self.user_context or {}).get("status_match_threshold")
        try:
            return max(0.0, min(1.0, float(raw)))
        except Exception:
            return 0.35

    def _req_probability(self, req: Dict[str, List[str]], status_context: Dict[str, Any]) -> float:
        """
        Return normalized compatibility probability in [0,1] for status requirements.
        """
        if not req:
            return 1.0

        T = self.runtime.get("Today")
        if T and hasattr(T, "status_requirements_probability"):
            try:
                val = float(T.status_requirements_probability(req, status_context))
                return max(0.0, min(1.0, val))
            except Exception:
                pass

        # Fallback: exact-match fraction if helper is unavailable.
        curr = status_context.get("current", {}) if isinstance(status_context, dict) else {}
        if not isinstance(curr, dict):
            curr = {}
        total = 0
        matched = 0
        for k, allowed in req.items():
            vals = [str(x).strip().lower() for x in (allowed or []) if str(x).strip()]
            if not vals:
                continue
            total += 1
            v = str(curr.get(k) or "").strip().lower()
            if v in vals:
                matched += 1
        if total <= 0:
            return 1.0
        return max(0.0, min(1.0, float(matched) / float(total)))

    def _req_match(self, req: Dict[str, List[str]], status_context: Dict[str, Any]) -> bool:
        """Soft gate: requirement passes when probability is above configured threshold."""
        return self._req_probability(req, status_context) >= self._status_match_threshold()

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
        missed_cfg = self.runtime.get("missed_promotions", {}) if isinstance(self.runtime, dict) else {}
        missed_enabled = bool((missed_cfg or {}).get("enabled"))
        missed_threshold = float((missed_cfg or {}).get("threshold", 30) or 30)
        missed_boost = float((missed_cfg or {}).get("boost", 20.0) or 20.0)
        missed_by_name = (missed_cfg or {}).get("by_name", {}) if isinstance(missed_cfg, dict) else {}
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
            try:
                req_prob = float(item.get("_status_requirement_probability"))
                reasons.append(f"status_req_prob={req_prob:.2f}")
            except Exception:
                pass
            c = self._trend_contribution(item, trend_map) * float(weights.get("trend_reliability", 3.0))
            score += c; reasons.append(f"trend_reliability={c:.2f}")
            if missed_enabled and isinstance(missed_by_name, dict):
                key = self._normalize_key(item.get("name") or src.get("name"))
                signal = missed_by_name.get(key)
                if isinstance(signal, dict) and float(signal.get("net_missed", 0) or 0) > 0 and score >= missed_threshold:
                    score += missed_boost
                    reasons.append(
                        f"missed_promotion=+{missed_boost:.2f}"
                        f" net={signal.get('net_missed')} src={','.join(signal.get('sources') or [])}"
                    )
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
        need = self._normalize_key(src.get("place"))
        curr = self._normalize_key((status_context.get("current", {}) or {}).get("place"))
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
        try:
            total = int(total_minutes)
        except Exception:
            total = 0
        total = max(0, min((24 * 60) - 1, total))
        h = int(total // 60)
        m = int(total % 60)
        return f"{h:02d}:{m:02d}"

    def _canonical_item_identity(self, item: Dict[str, Any]) -> Optional[str]:
        """
        Return stable cross-run identity when available (id/slug), else None.
        """
        if not isinstance(item, dict):
            return None
        raw = item.get("_raw") if isinstance(item.get("_raw"), dict) else {}
        for key in ("id", "slug"):
            value = item.get(key)
            if value is None and isinstance(raw, dict):
                value = raw.get(key)
            text = str(value or "").strip()
            if not text:
                continue
            return f"{key}:{text.lower() if key == 'slug' else text}"
        return None

    def _runtime_item_uid(self, item: Dict[str, Any], ordinal: Optional[int] = None) -> str:
        """
        Runtime-only uid used for in-run tracking when canonical identity is missing.
        """
        if not isinstance(item, dict):
            return f"anon::invalid::{ordinal if ordinal is not None else 'na'}"
        existing = str(item.get("_kairos_uid") or "").strip()
        if existing:
            return existing

        canonical = self._canonical_item_identity(item)
        if canonical:
            item["_kairos_uid"] = canonical
            return canonical

        raw = item.get("_raw") if isinstance(item.get("_raw"), dict) else {}
        t = self._normalize_key(item.get("type") or raw.get("type") or "item") or "item"
        n = self._normalize_key(item.get("name") or raw.get("name") or "unnamed") or "unnamed"
        place = self._normalize_key(item.get("place") or raw.get("place") or "") or "na"
        start_hint = self._parse_hhmm(raw.get("start_time") or raw.get("ideal_start_time") or item.get("start_time"))
        dur_hint = self._duration_minutes(item)
        ord_hint = f":{int(ordinal)}" if ordinal is not None else ""
        uid = f"anon:{t}:{n}:{place}:{start_hint if start_hint is not None else 'na'}:{dur_hint}{ord_hint}"
        item["_kairos_uid"] = uid
        return uid

    def _item_id(self, item: Dict[str, Any]) -> str:
        """Stable runtime id used for dedupe and remaining-duration tracking."""
        if not isinstance(item, dict):
            return "invalid::item"
        existing = str(item.get("_kairos_uid") or "").strip()
        if existing:
            return existing
        canonical = self._canonical_item_identity(item)
        if canonical:
            item["_kairos_uid"] = canonical
            return canonical
        return self._runtime_item_uid(item)

    def _window_filter_match(self, item: Dict[str, Any], win_filter: Dict[str, Any]) -> bool:
        """
        Generic legacy-style filter matching for work windows.

        Rules:
        - Filter value can be scalar or list of allowed values.
        - Item value can be scalar or list; lists match by intersection.
        - Lookup checks both resolved item fields and raw payload.
        """
        if not isinstance(win_filter, dict) or not win_filter:
            return True
        src = item.get("_raw") if isinstance(item.get("_raw"), dict) else {}

        def _get_prop(record: Dict[str, Any], key: str) -> Any:
            if key in record:
                return record.get(key)
            nk = self._normalize_key(key)
            for rk, rv in record.items():
                if self._normalize_key(rk) == nk:
                    return rv
            return None

        def _to_tokens(value: Any) -> List[str]:
            vals = value if isinstance(value, (list, tuple, set)) else [value]
            out: List[str] = []
            for v in vals:
                if v is None:
                    continue
                if isinstance(v, bool):
                    out.append("true" if v else "false")
                elif isinstance(v, (int, float)):
                    out.append(str(v))
                else:
                    s = str(v).strip()
                    if not s:
                        continue
                    out.append(self._normalize_key(s))
            return out

        for raw_key, raw_expected in win_filter.items():
            key = str(raw_key or "").strip()
            if not key:
                continue
            item_value = _get_prop(item, key)
            if item_value is None:
                item_value = _get_prop(src, key)
            # Backward-compat alias: `tag` filter checks against `tags` list.
            if item_value is None and self._normalize_key(key) == "tag":
                item_value = _get_prop(item, "tags")
                if item_value is None:
                    item_value = _get_prop(src, "tags")

            want = set(_to_tokens(raw_expected))
            if not want:
                continue
            have = set(_to_tokens(item_value))
            if not have or have.isdisjoint(want):
                return False
        return True

    def _window_candidates(self, ranked: List[Dict[str, Any]], used: set, win: Dict[str, Any], fill: int, cap: int, remaining: Dict[str, int], sprint_cap: int) -> List[Dict[str, Any]]:
        """
        Return sorted candidates that can still fit in the active window segment.

        This is the main "what can be scheduled next here?" predicate.
        """
        f = win.get("filter") if isinstance(win, dict) else {}
        win_filter = f if isinstance(f, dict) else {}
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
            if not self._window_filter_match(item, win_filter):
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

    def _parse_hhmm_flexible(self, value: Any) -> Optional[int]:
        """Parse HH:MM from plain strings or embedded timestamps (for example logged_at ISO)."""
        parsed = self._parse_hhmm(value)
        if parsed is not None:
            return parsed
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        m = re.search(r"(\d{1,2}):(\d{2})", text)
        if not m:
            return None
        try:
            hh = int(m.group(1))
            mm = int(m.group(2))
        except Exception:
            return None
        if hh < 0 or hh > 23 or mm < 0 or mm > 59:
            return None
        return (hh * 60) + mm

    def _build_completed_markers(
        self, completion_entries: Dict[str, Any]
    ) -> Tuple[set[str], List[Dict[str, Any]], Dict[str, List[Dict[str, Any]]], Dict[str, Any]]:
        """
        Convert done completion entries into:
        - a normalized name set for candidate filtering
        - fixed blocks shown at completion time in the final schedule output
        """
        entries = completion_entries if isinstance(completion_entries, dict) else {}
        suppress_statuses = {"completed", "done", "skipped"}
        marker_statuses = {"completed", "done"}
        completed_names: set[str] = set()
        completed_blocks: List[Dict[str, Any]] = []
        completed_specs: Dict[str, List[Dict[str, Any]]] = {}
        done_count = 0
        skipped_count = 0
        sample: List[Dict[str, Any]] = []

        for key, raw in entries.items():
            if not isinstance(raw, dict):
                continue
            status = str(raw.get("status") or "").strip().lower()
            if status not in suppress_statuses:
                continue
            if status in marker_statuses:
                done_count += 1
            elif status == "skipped":
                skipped_count += 1

            name = str(raw.get("name") or "").strip()
            if not name and isinstance(key, str):
                name = str(key).split("@", 1)[0].strip()
            if not name:
                continue
            name_norm = self._normalize_key(name)
            if name_norm:
                completed_names.add(name_norm)

            scheduled_start = self._parse_hhmm_flexible(raw.get("scheduled_start"))
            scheduled_end = self._parse_hhmm_flexible(raw.get("scheduled_end"))
            actual_start = self._parse_hhmm_flexible(raw.get("actual_start"))
            actual_end = self._parse_hhmm_flexible(raw.get("actual_end"))
            logged_at = self._parse_hhmm_flexible(raw.get("logged_at"))

            start_min = (
                actual_start
                if actual_start is not None
                else actual_end
                if actual_end is not None
                else scheduled_start
                if scheduled_start is not None
                else logged_at
            )
            if start_min is None:
                continue
            start_min = max(0, min((24 * 60) - 2, int(start_min)))

            duration_guess = 1
            if actual_start is not None and actual_end is not None and actual_end > actual_start:
                duration_guess = int(actual_end) - int(actual_start)
            elif scheduled_start is not None and scheduled_end is not None and scheduled_end > scheduled_start:
                duration_guess = int(scheduled_end) - int(scheduled_start)
            duration_guess = max(1, duration_guess)

            end_min = (
                actual_end
                if actual_end is not None
                else scheduled_end
                if scheduled_end is not None
                else actual_start
            )
            if end_min is None or int(end_min) <= int(start_min):
                end_min = min((24 * 60) - 1, int(start_min) + int(duration_guess))
            end_min = int(end_min)
            if end_min <= start_min:
                end_min = min((24 * 60) - 1, int(start_min) + 1)

            raw_type = str(raw.get("type") or "").strip().lower()
            spec_type = raw_type or "*"
            item_type = raw_type or "task"
            status_norm = "completed" if status in {"completed", "done"} else status
            # Store completion specs by "<type>|<name>" so filtering can
            # suppress completed work even when candidate rows are partially
            # typed or legacy logs only include names.
            spec_key = f"{spec_type}|{name_norm}"
            completed_specs.setdefault(spec_key, []).append(
                {
                    "status": status_norm,
                    "scheduled_start_min": scheduled_start,
                    "actual_start_min": actual_start,
                    "logged_at": raw.get("logged_at"),
                    "completion_key": str(key),
                }
            )
            if status in marker_statuses:
                block_id = (
                    f"completed::{name_norm or 'item'}@{self._to_hhmm(start_min)}"
                    f"::{len(completed_blocks) + 1}"
                )
                completed_blocks.append(
                    {
                        "name": name,
                        "type": item_type,
                        "status": status_norm,
                        "completion_status": status_norm,
                        "start_time": self._to_hhmm(start_min),
                        "end_time": self._to_hhmm(end_min),
                        "duration_minutes": max(1, end_min - start_min),
                        "window_name": "COMPLETED",
                        "kairos_element": "completed_log",
                        "reschedule": "never",
                        "essential": True,
                        "anchored": True,
                        "actual_start": self._to_hhmm(actual_start) if actual_start is not None else None,
                        "actual_end": self._to_hhmm(actual_end) if actual_end is not None else None,
                        "scheduled_start": self._to_hhmm(scheduled_start) if scheduled_start is not None else None,
                        "scheduled_end": self._to_hhmm(scheduled_end) if scheduled_end is not None else None,
                        "completed_logged_at": raw.get("logged_at"),
                        "completion_key": str(key),
                        "block_id": block_id,
                    }
                )
                if len(sample) < 12:
                    sample.append(
                        {
                            "name": name,
                            "status": status_norm,
                            "start": self._to_hhmm(start_min),
                            "end": self._to_hhmm(end_min),
                        }
                    )

        completed_blocks.sort(
            key=lambda b: (
                self._parse_hhmm_flexible(b.get("start_time")) or 0,
                str(b.get("name") or "").lower(),
            )
        )
        notes = {
            "entries": len(entries),
            "done_entries": done_count,
            "skipped_entries": skipped_count,
            "done_names": len(completed_names),
            "done_blocks": len(completed_blocks),
            "done_specs": len(completed_specs),
            "sample": sample,
        }
        return completed_names, completed_blocks, completed_specs, notes

    def _build_manual_injection_stub(self, name: str, item_type: str) -> Dict[str, Any]:
        """
        Create a fallback candidate when a manual injection references an item
        that is not present in the ranked candidate pool.
        """
        n = str(name or "").strip() or "Injected Item"
        t = str(item_type or "task").strip().lower() or "task"
        key = self._normalize_key(f"{t}::{n}") or "manual_inject"
        return {
            "id": f"manual_inject::{key}",
            "name": n,
            "type": t,
            "priority": "high",
            "status": "pending",
            "kairos_score": 100.0,
            "_raw": {
                "name": n,
                "type": t,
                "duration": "15m",
                "manual_injection": True,
            },
            "_manual_injection_stub": True,
        }

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

    def _depends_on_tokens(self, block: Dict[str, Any]) -> List[str]:
        """
        Normalize a block's depends_on payload into a list of comparable tokens.

        Supported shapes: string (comma-separated), list/tuple/set, or dict keys.
        """
        if not isinstance(block, dict):
            return []
        src = block.get("_raw") if isinstance(block.get("_raw"), dict) else {}
        raw = block.get("depends_on")
        if raw is None:
            raw = src.get("depends_on")
        out: List[str] = []
        if isinstance(raw, str):
            out.extend([part.strip() for part in raw.split(",") if part.strip()])
        elif isinstance(raw, (list, tuple, set)):
            out.extend([str(v).strip() for v in raw if str(v).strip()])
        elif isinstance(raw, dict):
            out.extend([str(k).strip() for k in raw.keys() if str(k).strip()])
        normalized = []
        seen = set()
        for token in out:
            n = self._normalize_key(token)
            if not n or n in seen:
                continue
            seen.add(n)
            normalized.append(n)
        return normalized

    def _propagate_dependency_shifts(
        self,
        timeline: List[Tuple[int, int, Dict[str, Any]]],
        *,
        day_floor: int = 0,
        day_ceiling: int = 24 * 60,
        max_iterations: int = 200,
    ) -> Tuple[List[Tuple[int, int, Dict[str, Any]]], Dict[str, Any]]:
        """
        Enforce `depends_on` ordering by shifting dependent blocks after their prerequisites.

        This runs after conflict repair so dependencies remain valid even when earlier
        phases moved blocks. Shifts are non-overlapping and may cascade.
        """
        rows = sorted(list(timeline or []), key=lambda x: (int(x[0]), str((x[2] or {}).get("name") or "").lower()))
        events: List[Dict[str, Any]] = []
        unresolved: List[Dict[str, Any]] = []
        shifted = 0
        max_iter = max(1, int(max_iterations or 1))

        for _ in range(max_iter):
            changed = False
            rows.sort(key=lambda x: (int(x[0]), str((x[2] or {}).get("name") or "").lower()))
            end_by_name: Dict[str, int] = {}
            for s, e, block in rows:
                name_key = self._normalize_key((block or {}).get("name"))
                if not name_key:
                    continue
                end_by_name[name_key] = max(int(e or 0), int(end_by_name.get(name_key, 0)))

            for idx, (s, e, block) in enumerate(rows):
                b = block or {}
                deps = self._depends_on_tokens(b)
                if not deps:
                    continue
                own = self._normalize_key(b.get("name"))
                req_start = int(day_floor or 0)
                dep_hits: List[str] = []
                for dep in deps:
                    if own and dep == own:
                        continue
                    dep_end = end_by_name.get(dep)
                    if dep_end is None:
                        continue
                    req_start = max(req_start, int(dep_end))
                    dep_hits.append(dep)
                if not dep_hits:
                    continue
                if int(s) >= req_start:
                    continue

                dur = max(1, int(e) - int(s))
                occupied = [row for j, row in enumerate(rows) if j != idx]
                new_start = self._find_non_overlapping_start(
                    req_start,
                    dur,
                    occupied,
                    day_floor=day_floor,
                    day_ceiling=day_ceiling,
                )
                if new_start is None:
                    unresolved.append(
                        {
                            "reason": "no_space_after_dependencies",
                            "item": b.get("name"),
                            "depends_on": dep_hits,
                            "required_start": self._to_hhmm(req_start),
                            "duration_minutes": dur,
                        }
                    )
                    continue

                new_end = int(new_start) + dur
                moved = dict(b)
                moved["start_time"] = self._to_hhmm(int(new_start))
                moved["end_time"] = self._to_hhmm(int(new_end))
                moved["dependency_shifted"] = True
                rows[idx] = (int(new_start), int(new_end), moved)
                shifted += 1
                changed = True
                events.append(
                    {
                        "action": "dependency_shift",
                        "item": moved.get("name"),
                        "from": self._to_hhmm(int(s)),
                        "to": self._to_hhmm(int(new_start)),
                        "depends_on": dep_hits,
                    }
                )
                break
            if not changed:
                break

        rows.sort(key=lambda x: (int(x[0]), str((x[2] or {}).get("name") or "").lower()))
        end_by_name: Dict[str, int] = {}
        for s, e, block in rows:
            name_key = self._normalize_key((block or {}).get("name"))
            if not name_key:
                continue
            end_by_name[name_key] = max(int(e or 0), int(end_by_name.get(name_key, 0)))

        remaining_violations = 0
        for s, _e, block in rows:
            b = block or {}
            deps = self._depends_on_tokens(b)
            if not deps:
                continue
            own = self._normalize_key(b.get("name"))
            req_start = int(day_floor or 0)
            hit = False
            for dep in deps:
                if own and dep == own:
                    continue
                dep_end = end_by_name.get(dep)
                if dep_end is None:
                    continue
                hit = True
                req_start = max(req_start, int(dep_end))
            if hit and int(s) < req_start:
                remaining_violations += 1

        return rows, {
            "enabled": True,
            "max_iterations": max_iter,
            "shifted": shifted,
            "events": events[:100],
            "remaining_violations": remaining_violations,
            "unresolved": unresolved[:50],
        }

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
                    # Consume the just-inserted template buffer from this gap so
                    # subsequent insertions (for example timer breaks) don't overlap.
                    gap_cursor += bmin
                    remaining_gap -= bmin
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

    def _is_locked_block_for_repair(self, block: Dict[str, Any]) -> bool:
        """Return True when block should not be moved by repair pass."""
        if not isinstance(block, dict):
            return True
        if str(block.get("window_name") or "").strip().upper() == "ANCHOR":
            return True
        if bool(block.get("essential")):
            return True
        if str(block.get("injection_mode") or "").strip().lower() == "hard":
            return True
        reschedule = block.get("reschedule")
        if isinstance(reschedule, bool):
            if reschedule is False:
                return True
        elif isinstance(reschedule, str) and reschedule.strip().lower() in ("never", "false", "no"):
            return True
        return False

    def _find_non_overlapping_start(
        self,
        start: int,
        duration: int,
        occupied: List[Tuple[int, int, Dict[str, Any]]],
        *,
        day_floor: int = 0,
        day_ceiling: int = 24 * 60,
    ) -> Optional[int]:
        """
        Find earliest start >= `start` that does not overlap with occupied spans.
        """
        dur = max(1, int(duration or 0))
        cursor = max(day_floor, int(start or 0))
        if cursor + dur > day_ceiling:
            return None
        rows = sorted(occupied, key=lambda x: (int(x[0]), int(x[1])))
        for s, e, _ in rows:
            s = int(s or 0)
            e = int(e or s)
            if cursor + dur <= s:
                return cursor
            if cursor < e:
                cursor = max(cursor, e)
                if cursor + dur > day_ceiling:
                    return None
        return cursor if cursor + dur <= day_ceiling else None

    def _available_span_from(
        self,
        start: int,
        occupied: List[Tuple[int, int, Dict[str, Any]]],
        *,
        day_floor: int = 0,
        day_ceiling: int = 24 * 60,
    ) -> int:
        """
        Return free minutes available from `start` until the next occupied span.
        Returns 0 when `start` is already inside an occupied span.
        """
        s0 = max(day_floor, int(start or 0))
        if s0 >= day_ceiling:
            return 0
        rows = sorted(occupied, key=lambda x: (int(x[0]), int(x[1])))
        for s, e, _ in rows:
            s = int(s or 0)
            e = int(e or s)
            if s0 < s:
                return max(0, min(day_ceiling, s) - s0)
            if s0 >= s and s0 < e:
                return 0
        return max(0, day_ceiling - s0)

    def _repair_timeline_shift(
        self,
        timeline: List[Tuple[int, int, Dict[str, Any]]],
        *,
        max_iterations: int = 3,
        enable_trim: bool = False,
        min_duration_minutes: int = 5,
        enable_cut: bool = False,
        cut_score_threshold: Optional[float] = None,
        day_floor: int = 0,
        day_ceiling: int = 24 * 60,
    ) -> Tuple[List[Tuple[int, int, Dict[str, Any]]], Dict[str, Any]]:
        """
        Phase 6 repair pass: resolve overlaps by shifting movable blocks, with
        optional bounded trim fallback.
        """
        rows = sorted(list(timeline or []), key=lambda x: (x[0], str((x[2] or {}).get("name") or "").lower()))
        events: List[Dict[str, Any]] = []
        unresolved: List[Dict[str, Any]] = []
        moved = 0
        trimmed = 0
        cut = 0
        min_dur = max(1, int(min_duration_minutes or 1))

        for _ in range(max(1, int(max_iterations or 1))):
            changed = False
            rows.sort(key=lambda x: (x[0], str((x[2] or {}).get("name") or "").lower()))
            local_overlap_found = False
            i = 0
            while i < len(rows) - 1:
                s1, e1, b1 = rows[i]
                s2, e2, b2 = rows[i + 1]
                if int(s2) >= int(e1):
                    i += 1
                    continue
                local_overlap_found = True

                lock1 = self._is_locked_block_for_repair(b1 or {})
                lock2 = self._is_locked_block_for_repair(b2 or {})
                score1 = float((b1 or {}).get("kairos_score") or 0.0)
                score2 = float((b2 or {}).get("kairos_score") or 0.0)

                move_idx = None
                anchor_idx = None
                if not lock1 and lock2:
                    move_idx = i
                    anchor_idx = i + 1
                elif lock1 and not lock2:
                    move_idx = i + 1
                    anchor_idx = i
                elif not lock1 and not lock2:
                    if score1 <= score2:
                        move_idx = i
                        anchor_idx = i + 1
                    else:
                        move_idx = i + 1
                        anchor_idx = i

                if move_idx is None:
                    # Both blocks are locked (anchors/essential/hard injection),
                    # so repair records the conflict but does not mutate.
                    unresolved.append(
                        {
                            "reason": "both_locked",
                            "a": {"name": (b1 or {}).get("name"), "start": self._to_hhmm(int(s1)), "end": self._to_hhmm(int(e1))},
                            "b": {"name": (b2 or {}).get("name"), "start": self._to_hhmm(int(s2)), "end": self._to_hhmm(int(e2))},
                        }
                    )
                    i += 1
                    continue

                move_s, move_e, move_b = rows[move_idx]
                anchor_s, anchor_e, anchor_b = rows[anchor_idx]
                dur = max(1, int(move_e) - int(move_s))
                desired_start = max(int(move_s), int(anchor_e))
                occupied = [row for idx, row in enumerate(rows) if idx != move_idx]
                new_start = self._find_non_overlapping_start(
                    desired_start,
                    dur,
                    occupied,
                    day_floor=day_floor,
                    day_ceiling=day_ceiling,
                )
                if new_start is None:
                    if not enable_trim:
                        if enable_cut:
                            candidate_score = float((move_b or {}).get("kairos_score") or 0.0)
                            allowed_by_threshold = (
                                True if cut_score_threshold is None else candidate_score <= float(cut_score_threshold)
                            )
                            if allowed_by_threshold:
                                cut += 1
                                changed = True
                                removed = rows.pop(move_idx)
                                events.append(
                                    {
                                        "action": "cut",
                                        "item": (removed[2] or {}).get("name"),
                                        "at": self._to_hhmm(int(removed[0])),
                                        "end": self._to_hhmm(int(removed[1])),
                                        "type": (removed[2] or {}).get("type"),
                                        "duration_minutes": max(1, int(removed[1]) - int(removed[0])),
                                        "block_id": (removed[2] or {}).get("block_id"),
                                        "score": candidate_score,
                                        "reason": f"overlap_with:{(anchor_b or {}).get('name')}",
                                    }
                                )
                                break
                        unresolved.append(
                            {
                                "reason": "no_space",
                                "moving": {"name": (move_b or {}).get("name"), "duration": dur},
                                "blocked_by": {"name": (anchor_b or {}).get("name"), "end": self._to_hhmm(int(anchor_e))},
                            }
                        )
                        i += 1
                        continue
                    # Trim fallback: shrink movable block to the nearest
                    # available post-anchor span, bounded by min duration.
                    occupied = [row for idx, row in enumerate(rows) if idx != move_idx]
                    trim_start = max(day_floor, int(move_s))
                    avail = self._available_span_from(
                        trim_start,
                        occupied,
                        day_floor=day_floor,
                        day_ceiling=day_ceiling,
                    )
                    if avail < min_dur:
                        probe_start = self._find_non_overlapping_start(
                            max(day_floor, int(anchor_e)),
                            min_dur,
                            occupied,
                            day_floor=day_floor,
                            day_ceiling=day_ceiling,
                        )
                        if probe_start is None:
                            unresolved.append(
                                {
                                    "reason": "no_space_for_trim",
                                    "moving": {"name": (move_b or {}).get("name"), "duration": dur},
                                    "blocked_by": {"name": (anchor_b or {}).get("name"), "end": self._to_hhmm(int(anchor_e))},
                                }
                            )
                            i += 1
                            continue
                        trim_start = int(probe_start)
                        avail = self._available_span_from(
                            trim_start,
                            occupied,
                            day_floor=day_floor,
                            day_ceiling=day_ceiling,
                        )
                    new_dur = min(int(dur), int(avail))
                    if new_dur < min_dur:
                        if enable_cut:
                            candidate_score = float((move_b or {}).get("kairos_score") or 0.0)
                            allowed_by_threshold = (
                                True if cut_score_threshold is None else candidate_score <= float(cut_score_threshold)
                            )
                            if allowed_by_threshold:
                                cut += 1
                                changed = True
                                removed = rows.pop(move_idx)
                                events.append(
                                    {
                                        "action": "cut",
                                        "item": (removed[2] or {}).get("name"),
                                        "at": self._to_hhmm(int(removed[0])),
                                        "score": candidate_score,
                                        "reason": f"trim_below_min_duration overlap_with:{(anchor_b or {}).get('name')}",
                                    }
                                )
                                break
                        unresolved.append(
                            {
                                "reason": "trim_below_min_duration",
                                "moving": {"name": (move_b or {}).get("name"), "duration": dur},
                                "available": int(avail),
                                "min_duration": min_dur,
                            }
                        )
                        i += 1
                        continue
                    trim_block = dict(move_b or {})
                    trim_end = int(trim_start) + int(new_dur)
                    trim_block["start_time"] = self._to_hhmm(int(trim_start))
                    trim_block["end_time"] = self._to_hhmm(int(trim_end))
                    trim_block["duration_minutes"] = int(new_dur)
                    trim_block["repair_trimmed"] = True
                    if int(trim_start) != int(move_s):
                        trim_block["repair_shifted"] = True
                    rows[move_idx] = (int(trim_start), int(trim_end), trim_block)
                    trimmed += 1
                    changed = True
                    events.append(
                        {
                            "action": "trim",
                            "item": trim_block.get("name"),
                            "from": self._to_hhmm(int(move_s)),
                            "to": self._to_hhmm(int(trim_start)),
                            "duration_from": int(dur),
                            "duration_to": int(new_dur),
                            "reason": f"overlap_with:{(anchor_b or {}).get('name')}",
                        }
                    )
                    break

                new_end = new_start + dur
                moved += 1
                changed = True
                move_block = dict(move_b or {})
                move_block["start_time"] = self._to_hhmm(new_start)
                move_block["end_time"] = self._to_hhmm(new_end)
                move_block["repair_shifted"] = True
                rows[move_idx] = (new_start, new_end, move_block)
                events.append(
                    {
                        "action": "shift",
                        "item": move_block.get("name"),
                        "from": self._to_hhmm(int(move_s)),
                        "to": self._to_hhmm(int(new_start)),
                        "reason": f"overlap_with:{(anchor_b or {}).get('name')}",
                    }
                )
                break
            if not changed:
                if not local_overlap_found:
                    break
                # Overlaps remain but no further shifts possible.
                break

        rows.sort(key=lambda x: (x[0], str((x[2] or {}).get("name") or "").lower()))
        remaining_overlaps = 0
        for i in range(len(rows) - 1):
            if int(rows[i + 1][0]) < int(rows[i][1]):
                remaining_overlaps += 1
        return rows, {
            "enabled": True,
            "strategy": (
                "shift_trim_cut"
                if enable_cut and enable_trim
                else "shift_cut"
                if enable_cut
                else "shift_then_trim"
                if enable_trim
                else "shift_only"
            ),
            "max_iterations": max(1, int(max_iterations or 1)),
            "trim_enabled": bool(enable_trim),
            "min_duration_minutes": min_dur,
            "cut_enabled": bool(enable_cut),
            "cut_score_threshold": cut_score_threshold,
            "moved": moved,
            "trimmed": trimmed,
            "cut": cut,
            "events": events,
            "remaining_overlaps": remaining_overlaps,
            "unresolved": unresolved[:30],
        }

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
        for idx, item in enumerate(ranked_items):
            # Assign runtime uid early so downstream `used`/`remaining` maps
            # don't collapse distinct unnamed/duplicate-name rows.
            self._runtime_item_uid(item, ordinal=idx)
            # Deduplicate only when a canonical identity exists.
            key = self._canonical_item_identity(item)
            if key and key in seen:
                dropped += 1
                continue
            if key:
                seen.add(key)
            deduped.append(item)
        timeline = []
        used = set()
        win_events = []
        anchor_events = {"placed": [], "conflicts": [], "skipped_no_time": []}
        injection_events = {"candidates": 0, "placed": []}
        manual_injection_events = {
            "requested": 0,
            "hard": {"placed": [], "conflicts": [], "displaced": []},
            "soft": {"boosted": [], "created": [], "queued": 0},
        }
        gap_events = {"strategy": "quick_wins", "max_minutes": 15, "placed": []}
        timeblock_events = {"placed": [], "template": []}
        completed_blocks_raw = self.runtime.get("completed_blocks")
        completed_blocks = (
            [dict(b) for b in completed_blocks_raw if isinstance(b, dict)]
            if isinstance(completed_blocks_raw, list)
            else []
        )
        completed_events = {"available": len(completed_blocks), "placed": 0, "sample": []}
        windows = list(self.windows or [])
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
                "manual_injections": manual_injection_events,
                "windows": [],
                "scheduled": len(timeline),
                "unscheduled_top": [],
                "aborted": True,
                "abort_reason": "anchor_conflicts",
            }
            timeline.sort(key=lambda x: (x[0], str(x[2].get("name") or "").lower()))
            schedule["blocks"] = [x[2] for x in timeline]
            return schedule

        # 1.5) Apply manual injections recorded via `today inject`.
        manual_injections_raw = self.user_context.get("manual_injections")
        if isinstance(manual_injections_raw, list):
            manual_injection_events["requested"] = len(manual_injections_raw)
        else:
            manual_injections_raw = []

        # Fast lookup maps for matching injections to ranked candidates.
        by_type_name: Dict[Tuple[str, str], Dict[str, Any]] = {}
        by_name: Dict[str, Dict[str, Any]] = {}
        for item in deduped:
            tkey = str(item.get("type") or "").strip().lower()
            nkey = str(item.get("name") or "").strip().lower()
            if not nkey:
                continue
            by_name.setdefault(nkey, item)
            if tkey:
                by_type_name.setdefault((tkey, nkey), item)

        soft_created: List[Dict[str, Any]] = []
        soft_manual_ids: set[str] = set()
        for req in manual_injections_raw:
            if not isinstance(req, dict):
                continue
            req_name = str(req.get("name") or "").strip()
            if not req_name:
                continue
            req_type = str(req.get("type") or "task").strip().lower() or "task"
            req_mode = str(req.get("mode") or ("hard" if req.get("start_time") else "soft")).strip().lower()
            if req_mode not in ("hard", "soft"):
                req_mode = "hard" if req.get("start_time") else "soft"
            force = self._as_bool(req.get("force"), False)
            override_anchor = self._as_bool(req.get("override_anchor"), False)
            source = str(req.get("source") or "manual_cli").strip() or "manual_cli"
            nkey = req_name.lower()
            target = by_type_name.get((req_type, nkey)) or by_name.get(nkey)

            if req_mode == "soft":
                if target is None:
                    # Soft injections can target ideas not currently present in
                    # the ranked pool. Create a temporary runtime stub so the
                    # request still participates in this run.
                    target = self._build_manual_injection_stub(req_name, req_type)
                    deduped.append(target)
                    soft_created.append(target)
                    by_name.setdefault(nkey, target)
                    by_type_name.setdefault((req_type, nkey), target)
                    manual_injection_events["soft"]["created"].append(
                        {"name": req_name, "type": req_type, "source": source}
                    )
                target["kairos_score"] = max(float(target.get("kairos_score") or 0.0), 1000.0)
                iid = self._item_id(target)
                soft_manual_ids.add(iid)
                manual_injection_events["soft"]["boosted"].append(
                    {
                        "name": target.get("name"),
                        "type": target.get("type"),
                        "id": iid,
                        "source": source,
                    }
                )
                continue

            # Hard injections pin a block at requested time.
            start_raw = req.get("start_time")
            start_min = self._parse_hhmm(start_raw)
            if start_min is None:
                manual_injection_events["hard"]["conflicts"].append(
                    {
                        "name": req_name,
                        "type": req_type,
                        "requested_start": start_raw,
                        "reason": "invalid_time",
                        "source": source,
                    }
                )
                continue
            base_item = target if isinstance(target, dict) else self._build_manual_injection_stub(req_name, req_type)
            dur = self._duration_minutes(base_item)
            end_min = start_min + max(1, dur)

            overlaps = [(s, e, b) for (s, e, b) in timeline if start_min < e and s < end_min]
            if overlaps:
                has_anchor_overlap = any(str((b or {}).get("window_name") or "").strip().upper() == "ANCHOR" for _, _, b in overlaps)
                can_displace = bool(force)
                if has_anchor_overlap and override_anchor:
                    can_displace = True
                elif has_anchor_overlap and not override_anchor:
                    can_displace = False
                if not can_displace:
                    manual_injection_events["hard"]["conflicts"].append(
                        {
                            "name": req_name,
                            "type": req_type,
                            "requested_start": self._to_hhmm(start_min),
                            "requested_end": self._to_hhmm(end_min),
                            "reason": "anchor_overlap" if has_anchor_overlap else "occupied",
                            "source": source,
                            "overlaps": [
                                {
                                    "name": (b or {}).get("name"),
                                    "type": (b or {}).get("type"),
                                    "start": (b or {}).get("start_time"),
                                    "end": (b or {}).get("end_time"),
                                }
                                for _, _, b in overlaps
                            ][:10],
                        }
                    )
                    continue

                keep_timeline = []
                removed = []
                for s, e, b in timeline:
                    if start_min < e and s < end_min:
                        removed.append((s, e, b))
                    else:
                        keep_timeline.append((s, e, b))
                timeline = keep_timeline
                if removed:
                    schedule["stats"]["scheduled_items"] = max(
                        0,
                        int(schedule["stats"].get("scheduled_items", 0)) - len(removed),
                    )
                    for _, _, b in removed:
                        # Keep a displacement trail for explainability and allow
                        # those items to be reconsidered as unscheduled output.
                        rid = self._item_id(b)
                        used.discard(rid)
                        manual_injection_events["hard"]["displaced"].append(
                            {
                                "name": b.get("name"),
                                "type": b.get("type"),
                                "start": b.get("start_time"),
                                "end": b.get("end_time"),
                                "window_name": b.get("window_name"),
                            }
                        )

            hard_iid = self._item_id(base_item)
            hard_block = dict(base_item)
            hard_block["duration_minutes"] = max(1, dur)
            hard_block["start_time"] = self._to_hhmm(start_min)
            hard_block["end_time"] = self._to_hhmm(end_min)
            hard_block["window_name"] = "INJECTION"
            hard_block["kairos_element"] = "manual_injection_hard"
            hard_block["injected"] = True
            hard_block["injection_mode"] = "hard"
            hard_block["injection_source"] = source
            hard_block["force"] = bool(force)
            hard_block["override_anchor"] = bool(override_anchor)
            hard_block["block_id"] = f"manualinject::{hard_iid}@{hard_block['start_time']}"
            timeline.append((start_min, end_min, hard_block))
            used.add(hard_iid)
            schedule["stats"]["scheduled_items"] += 1
            manual_injection_events["hard"]["placed"].append(
                {
                    "id": hard_block["block_id"],
                    "name": hard_block.get("name"),
                    "type": hard_block.get("type"),
                    "start": hard_block.get("start_time"),
                    "end": hard_block.get("end_time"),
                    "source": source,
                }
            )
        if soft_created:
            flex.extend(soft_created)

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
        if soft_manual_ids:
            injections.extend([it for it in flex if self._item_id(it) in soft_manual_ids])
            manual_injection_events["soft"]["queued"] = int(len(soft_manual_ids))
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

        # 6) Repair pass (shift-only): resolve residual overlaps without trim/cut.
        repair_max_iter = 3
        repair_trim = False
        repair_min_duration = 5
        repair_cut = False
        repair_cut_threshold = None
        try:
            repair_max_iter = max(1, int((self.user_context or {}).get("repair_max_iterations", 3) or 3))
        except Exception:
            repair_max_iter = 3
        try:
            repair_trim = self._as_bool((self.user_context or {}).get("repair_trim"), False)
        except Exception:
            repair_trim = False
        try:
            repair_min_duration = max(1, int((self.user_context or {}).get("repair_min_duration", 5) or 5))
        except Exception:
            repair_min_duration = 5
        try:
            repair_cut = self._as_bool((self.user_context or {}).get("repair_cut"), False)
        except Exception:
            repair_cut = False
        raw_cut_threshold = (self.user_context or {}).get("repair_cut_threshold")
        if raw_cut_threshold is not None and str(raw_cut_threshold).strip() != "":
            try:
                repair_cut_threshold = float(raw_cut_threshold)
            except Exception:
                repair_cut_threshold = None
        timeline, repair_events = self._repair_timeline_shift(
            timeline,
            max_iterations=repair_max_iter,
            enable_trim=repair_trim,
            min_duration_minutes=repair_min_duration,
            enable_cut=repair_cut,
            cut_score_threshold=repair_cut_threshold,
            day_floor=day_floor,
            day_ceiling=24 * 60,
        )
        timeline, dependency_events = self._propagate_dependency_shifts(
            timeline,
            day_floor=day_floor,
            day_ceiling=24 * 60,
            max_iterations=max(20, len(timeline) * 3),
        )
        # Keep completed blocks visible at their done time in the final output.
        # These markers are added after placement/repair so they don't distort scheduling.
        for done_block in completed_blocks:
            s = self._parse_hhmm_flexible(done_block.get("start_time"))
            if s is None:
                continue
            e = self._parse_hhmm_flexible(done_block.get("end_time"))
            if e is None or e <= s:
                e = min((24 * 60) - 1, int(s) + 1)
            block = dict(done_block)
            block["start_time"] = self._to_hhmm(int(s))
            block["end_time"] = self._to_hhmm(int(e))
            block.setdefault("window_name", "COMPLETED")
            block.setdefault("status", "completed")
            block.setdefault("reschedule", "never")
            block.setdefault("essential", True)
            if not block.get("block_id"):
                block["block_id"] = f"completed::{self._normalize_key(block.get('name') or 'item')}@{block['start_time']}"
            timeline.append((int(s), int(e), block))
            completed_events["placed"] += 1
            if len(completed_events["sample"]) < 20:
                completed_events["sample"].append(
                    {
                        "id": block.get("block_id"),
                        "name": block.get("name"),
                        "type": block.get("type"),
                        "status": block.get("status"),
                        "start": block.get("start_time"),
                        "end": block.get("end_time"),
                    }
                )

        timeline.sort(key=lambda x: (x[0], str(x[2].get("name") or "").lower()))
        schedule["blocks"] = [x[2] for x in timeline]
        schedule["stats"]["scheduled_items"] = len(schedule["blocks"])
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
            "manual_injections": manual_injection_events,
            "injections": injection_events,
            "windows": win_events,
            "gaps": gap_events,
            "timeblocks": timeblock_events,
            "completed_markers": completed_events,
            "repair": repair_events,
            "dependencies": dependency_events,
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
            from modules.item_manager import get_user_dir
            user_dir = get_user_dir()
        except Exception:
            user_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "User"))
        logs_dir = os.path.join(user_dir, "Logs")
        os.makedirs(logs_dir, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        run_date = self.last_target_date.isoformat() if self.last_target_date else "unknown"
        out = os.path.join(logs_dir, f"kairos_decision_log_{stamp}.md")
        latest = os.path.join(logs_dir, "kairos_decision_log_latest.md")
        out_yaml = os.path.join(logs_dir, f"kairos_decision_log_{stamp}.yml")
        latest_yaml = os.path.join(logs_dir, "kairos_decision_log_latest.yml")
        tmpl = self.phase_notes.get("template", {})
        gather = self.phase_notes.get("gather", {})
        anchors = self.phase_notes.get("anchors", {})
        filt = self.phase_notes.get("filter", {})
        score = self.phase_notes.get("score", {})
        trends = self.phase_notes.get("trends", {})
        hooks = self.phase_notes.get("pre_schedule_hooks", {})
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
        lines.append("## Pre-Schedule Hooks")
        lines.append(f"- enabled: {hooks.get('enabled')}")
        if hooks.get("reason"):
            lines.append(f"- reason: {hooks.get('reason')}")
        for h in (hooks.get("results") or [])[:10]:
            if h.get("ok"):
                lines.append(f"  - {h.get('hook')}: ok")
            else:
                lines.append(f"  - {h.get('hook')}: error={h.get('error')}")
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
        missed = self.phase_notes.get("missed_promotion", {}) or {}
        lines.append(f"- missed_promotion_enabled: {missed.get('enabled')}")
        lines.append(f"- missed_promotion_items: {missed.get('items', 0)}")
        if missed.get("reason"):
            lines.append(f"- missed_promotion_reason: {missed.get('reason')}")
        for m in (missed.get("sample") or [])[:10]:
            lines.append(
                f"  - missed_item {m.get('name')} net={m.get('net_missed')} "
                f"missed={m.get('missed')} done={m.get('done')} src={','.join(m.get('sources') or [])}"
            )
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
        manual_injections = construct.get("manual_injections") or {}
        hard_manual = manual_injections.get("hard") if isinstance(manual_injections, dict) else {}
        soft_manual = manual_injections.get("soft") if isinstance(manual_injections, dict) else {}
        lines.append(f"- manual injections requested: {manual_injections.get('requested', 0) if isinstance(manual_injections, dict) else 0}")
        lines.append(f"- manual hard placed: {len((hard_manual or {}).get('placed') or [])}")
        lines.append(f"- manual hard conflicts: {len((hard_manual or {}).get('conflicts') or [])}")
        lines.append(f"- manual hard displaced: {len((hard_manual or {}).get('displaced') or [])}")
        lines.append(f"- manual soft queued: {(soft_manual or {}).get('queued', 0) if isinstance(soft_manual, dict) else 0}")
        for p in ((hard_manual or {}).get("placed") or [])[:10]:
            lines.append(f"  - manual_hard {p.get('id')} {p.get('type')}:{p.get('name')} {p.get('start')}-{p.get('end')}")
        for c in ((hard_manual or {}).get("conflicts") or [])[:10]:
            lines.append(
                f"  - manual_hard_conflict {c.get('type')}:{c.get('name')} "
                f"{c.get('requested_start')}-{c.get('requested_end')} reason={c.get('reason')}"
            )
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
        repair = construct.get("repair") or {}
        lines.append(f"- repair strategy: {repair.get('strategy')}")
        lines.append(f"- repair max_iterations: {repair.get('max_iterations')}")
        lines.append(f"- repair trim_enabled: {repair.get('trim_enabled')}")
        lines.append(f"- repair min_duration_minutes: {repair.get('min_duration_minutes')}")
        lines.append(f"- repair cut_enabled: {repair.get('cut_enabled')}")
        lines.append(f"- repair cut_score_threshold: {repair.get('cut_score_threshold')}")
        lines.append(f"- repair moved: {repair.get('moved', 0)}")
        lines.append(f"- repair trimmed: {repair.get('trimmed', 0)}")
        lines.append(f"- repair cut: {repair.get('cut', 0)}")
        lines.append(f"- repair remaining_overlaps: {repair.get('remaining_overlaps', 0)}")
        for ev in (repair.get("events") or [])[:20]:
            if str(ev.get("action") or "") == "trim":
                lines.append(
                    f"  - repair_trim {ev.get('item')} {ev.get('from')} -> {ev.get('to')} "
                    f"dur {ev.get('duration_from')}->{ev.get('duration_to')} reason={ev.get('reason')}"
                )
            elif str(ev.get("action") or "") == "cut":
                lines.append(
                    f"  - repair_cut {ev.get('item')} at {ev.get('at')} "
                    f"score={ev.get('score')} reason={ev.get('reason')}"
                )
            else:
                lines.append(f"  - repair_shift {ev.get('item')} {ev.get('from')} -> {ev.get('to')} reason={ev.get('reason')}")
        for ur in (repair.get("unresolved") or [])[:10]:
            lines.append(f"  - repair_unresolved {ur}")
        deps = construct.get("dependencies") or {}
        lines.append(f"- dependency_shift enabled: {deps.get('enabled')}")
        lines.append(f"- dependency_shift max_iterations: {deps.get('max_iterations')}")
        lines.append(f"- dependency_shift shifted: {deps.get('shifted', 0)}")
        lines.append(f"- dependency_shift remaining_violations: {deps.get('remaining_violations', 0)}")
        for ev in (deps.get("events") or [])[:20]:
            lines.append(
                f"  - dependency_shift {ev.get('item')} {ev.get('from')} -> {ev.get('to')} "
                f"depends_on={','.join(ev.get('depends_on') or [])}"
            )
        for ur in (deps.get("unresolved") or [])[:10]:
            lines.append(f"  - dependency_unresolved {ur}")
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
        yaml_payload = {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "run_date": run_date,
            "stats": {
                "candidates_gathered": gather.get("total", 0),
                "candidates_kept": filt.get("kept", 0),
                "blocks_scheduled": len(blocks) if isinstance(blocks, list) else 0,
            },
            "phase_notes": self.phase_notes,
            "schedule": self.last_schedule if isinstance(self.last_schedule, dict) else {"blocks": blocks},
        }
        with open(out_yaml, "w", encoding="utf-8") as f:
            yaml.safe_dump(yaml_payload, f, sort_keys=False, allow_unicode=True)
        with open(latest_yaml, "w", encoding="utf-8") as f:
            yaml.safe_dump(yaml_payload, f, sort_keys=False, allow_unicode=True)
        self.decision_log = lines
        self._log(f"[Kairos] Decision log written: {out}", debug=True)
        self._log(f"[Kairos] Decision YAML written: {out_yaml}", debug=True)


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
