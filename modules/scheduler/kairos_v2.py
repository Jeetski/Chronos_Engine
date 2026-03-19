"""
Kairos v2 scheduler scaffold.

This module is intentionally being built beside the legacy scheduler instead of
replacing it immediately.

Why this file exists:
- the old scheduler is still the runnable production path
- Kairos v2 has a different philosophy and should not be forced into the old
  weighted-score-first structure
- we want a clean, heavily explained place to build the new engine phase by
  phase without breaking today's command

High-level Kairos v2 shape:
1. Gather information / research
   Load the configured world: settings, status, templates, sleep context,
   weighted priorities, and anything else needed for interpretation.
2. Reality modeling
   Establish what is true right now: current time, current status, remaining
   day budget, active sleep, and other immediate constraints.
3. Commit sleep first
   Sleep is the first real scheduling commitment. Kairos should understand the
   sleep boundary, raw sleep debt, and recovery pressure before trying to shape
   the rest of the day.
4. Later phases
   Week/day/template selection, anchor skeleton, dynamic windows, gap handling,
   trim/cut cleanup, timer handoff, and decision logging will be added
   incrementally after this scaffold is in place.

Important design constraints already decided in the spec:
- weighted priorities now only contain true weighted influences
- status alignment is mainly for choosing the best fitting template, not for
  globally scoring every item all the time
- anchors are defined by `reschedule: never`
- scheduler permissions are explicit: reschedule / trim / cut / shift
- sleep is modeled with both raw_sleep_debt and recovery_pressure

This file should stay extremely readable. Kairos is the most important codepath
in Chronos, so the comments are part of the product, not just code hygiene.
"""

from __future__ import annotations

import os
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

import yaml

from .sleep_gate import get_active_sleep_block, normalize_sleep_policy
from .v1 import (
    USER_DIR,
    is_template_eligible_for_day,
    list_all_day_templates,
    read_template,
    status_current_path,
)


@dataclass
class KairosV2RunState:
    """
    Mutable per-run state for one v2 scheduling pass.

    This is kept explicit so each phase can write down what it learned without
    hiding important reasoning in incidental locals.
    """

    target_date: date
    now: datetime
    decision_log: List[Dict[str, Any]] = field(default_factory=list)
    phase_notes: Dict[str, Any] = field(default_factory=dict)
    gathered: Dict[str, Any] = field(default_factory=dict)
    reality: Dict[str, Any] = field(default_factory=dict)
    sleep: Dict[str, Any] = field(default_factory=dict)
    schedule: Dict[str, Any] = field(default_factory=dict)


class KairosV2Scheduler:
    """
    Early Kairos v2 scheduler.

    Current responsibility:
    - gather the foundational world state
    - model immediate reality
    - model sleep
    - commit sleep as the first concrete scheduling truth

    Deliberately not implemented yet:
    - week template selection
    - day template swapping
    - anchor skeleton after sleep
    - dynamic windows
    - gap/buffer/trim/cut pipeline
    - timer handoff
    - environment semantics

    Environment is intentionally deferred. The spec already decided that it will
    be handled later, so we mark that explicitly instead of pretending it is
    solved right now.
    """

    def __init__(self, user_context: Optional[Dict[str, Any]] = None):
        self.user_context = user_context or {}

    def generate_schedule(self, target_date: Optional[date] = None) -> Dict[str, Any]:
        """
        Run the first Kairos v2 phases.

        This does not yet output a full day schedule. Instead it returns a
        strongly structured snapshot of what Kairos v2 currently knows after the
        first committed phases.
        """
        now = self._resolve_now()
        run_date = target_date or now.date()
        state = KairosV2RunState(target_date=run_date, now=now)

        self._record_commit(
            state,
            phase="run_start",
            title="Begin Kairos v2 run",
            body=f"Starting a v2 run for {run_date.isoformat()} at {now.isoformat(timespec='seconds')}.",
        )

        self.gather_information(state)
        self.model_reality(state)
        self.model_sleep(state)
        self.commit_sleep(state)
        self.ensure_week_context(state)
        self.select_week_template(state)
        self.derive_week_days(state)
        self.select_day_template(state)
        self.commit_anchor_skeleton(state)
        self.model_day_budget(state)
        self.build_candidate_universe(state)
        self.remove_reality_impossible_candidates(state)
        self.shape_week(state)
        self.populate_day_and_windows(state)
        self.narrow_window_candidate_pools(state)
        self.select_window_contents(state)
        self.handle_gaps_buffers_and_recovery(state)
        self.build_runtime_helper_windows(state)
        self.place_remaining_structure(state)
        self.run_pressure_relief_pipeline(state)
        self.fill_quick_wins(state)
        self.finalize_conceptual_schedule(state)
        self.build_timer_handoff(state)
        self.persist_decision_log_artifact(state)

        return {
            "engine": "kairos_v2",
            "target_date": state.target_date.isoformat(),
            "generated_at": state.now.isoformat(timespec="seconds"),
            "phase_notes": state.phase_notes,
            "decision_log": state.decision_log,
            "decision_log_markdown": self._render_decision_log_markdown(state),
            "gathered": state.gathered,
            "reality": state.reality,
            "sleep": state.sleep,
            "schedule": state.schedule,
        }

    def gather_information(self, state: KairosV2RunState) -> None:
        """
        Phase 1: gather information / research.

        This phase answers:
        - what configurable world does Kairos live inside?
        - what settings and mirrored data exist before we interpret "today"?

        This is intentionally broad and descriptive. It should load the world,
        not decide the world yet.
        """
        gathered: Dict[str, Any] = {
            "settings": {
                "scheduling_priorities": self._load_yaml("settings", "scheduling_priorities.yml") or {},
                "status_settings": self._load_yaml("settings", "status_settings.yml") or {},
                "priority_settings": self._load_yaml("settings", "priority_settings.yml") or {},
                "category_settings": self._load_yaml("settings", "category_settings.yml") or {},
                "map_of_happiness": self._load_yaml("settings", "map_of_happiness.yml") or {},
                "buffer_settings": self._load_yaml("settings", "buffer_settings.yml") or {},
                "quick_wins_settings": self._load_yaml("settings", "quick_wins_settings.yml") or {},
                "scheduling_settings": self._load_yaml("settings", "scheduling_settings.yml") or {},
            },
            "status": {
                "current_status_path": status_current_path(),
                "current_status": read_template(status_current_path()) or {},
            },
            "manual": {
                "manual_injections": self._manual_injections(),
                "manual_adjustments": self._manual_adjustments(),
            },
            "sleep_inputs": self._gather_sleep_inputs(state.target_date),
            "trends": self._gather_trend_inputs(),
            "deferred": {
                # Environment semantics are intentionally postponed. This note
                # keeps the omission visible to future readers.
                "environment": "deferred_for_later_kairos_v2_phase",
            },
        }

        state.gathered = gathered
        state.phase_notes["gather_information"] = {
            "loaded_settings": sorted(list(gathered["settings"].keys())),
            "has_current_status": bool(gathered["status"]["current_status"]),
            "has_sleep_inputs": bool(gathered["sleep_inputs"]),
            "manual_injection_count": len(gathered["manual"]["manual_injections"]),
            "manual_adjustment_count": len(gathered["manual"]["manual_adjustments"]),
            "environment_semantics": "deferred",
        }
        self._record_commit(
            state,
            phase="gather_information",
            title="Gathered configured world context",
            body="Loaded core scheduling settings, current status, sleep inputs, and trend placeholders for later synthesis.",
        )

    def model_reality(self, state: KairosV2RunState) -> None:
        """
        Phase 2: reality modeling.

        This phase starts from the present moment and establishes what is true
        now before any real schedule choices are made.
        """
        now = state.now
        start_of_day = datetime.combine(now.date(), datetime.min.time())
        minutes_elapsed = max(0, int((now - start_of_day).total_seconds() // 60))

        base_current_status = state.gathered.get("status", {}).get("current_status", {}) or {}
        current_status = self._apply_status_overrides(
            base_current_status,
            self.user_context.get("status_overrides"),
        )
        weighted_priorities = self._normalize_weighted_priorities(
            state.gathered.get("settings", {}).get("scheduling_priorities", {})
        )

        reality = {
            "now": now.isoformat(timespec="seconds"),
            "weekday_name": now.strftime("%A").lower(),
            "minutes_elapsed_since_start_of_day": minutes_elapsed,
            "remaining_day_mode": bool(self.user_context.get("start_from_now")) and state.target_date == now.date(),
            "time_budget_rule": "24h_minus_sleep_time_minus_elapsed_time_since_start_of_day",
            "base_current_status": base_current_status,
            "current_status": current_status,
            "weighted_priorities": weighted_priorities,
            "selection_preferences": self._build_template_selection_preferences(),
            "status_alignment_note": (
                "Status alignment is mainly a template-selection mechanism. "
                "Template-specific matching logic will be added in a later phase."
            ),
            "flags": dict(self.user_context),
        }

        state.reality = reality
        state.phase_notes["model_reality"] = {
            "weekday_name": reality["weekday_name"],
            "minutes_elapsed_since_start_of_day": minutes_elapsed,
            "remaining_day_mode": reality["remaining_day_mode"],
            "status_dimensions_seen": sorted(list(current_status.keys())) if isinstance(current_status, dict) else [],
            "status_overrides_applied": bool(self.user_context.get("status_overrides")),
            "selection_preferences": reality["selection_preferences"],
            "weighted_priority_names": [item["name"] for item in weighted_priorities],
        }
        self._record_commit(
            state,
            phase="model_reality",
            title="Modeled present reality",
            body="Established the current time, current status, weighted priority inputs, and the remaining-day budget framing.",
        )

    def model_sleep(self, state: KairosV2RunState) -> None:
        """
        Phase 3: sleep modeling.

        Sleep is the most important scheduler concern in Kairos v2. Before the
        engine shapes the day, it needs a factual sleep model:
        - current active sleep block
        - target sleep
        - raw sleep debt
        - recovery pressure
        """
        sleep_inputs = state.gathered.get("sleep_inputs", {})
        target_minutes = int(sleep_inputs.get("target_sleep_minutes") or 0)
        history = sleep_inputs.get("sleep_history", [])
        actual_last_7 = sum(int(entry.get("actual_minutes") or 0) for entry in history)
        target_last_7 = sum(int(entry.get("target_minutes") or 0) for entry in history)
        raw_sleep_debt_minutes = max(0, target_last_7 - actual_last_7)
        recovery_pressure = self._derive_recovery_pressure(raw_sleep_debt_minutes, history)
        active_sleep_block = get_active_sleep_block(now=state.now)
        sleep_policy = normalize_sleep_policy(self.user_context.get("sleep_policy"))

        state.sleep = {
            "target_sleep_minutes": target_minutes,
            "target_sleep_hours": round(target_minutes / 60.0, 2) if target_minutes else None,
            "sleep_history": history,
            "active_sleep_block": active_sleep_block,
            "sleep_policy": sleep_policy,
            "raw_sleep_debt_minutes": raw_sleep_debt_minutes,
            "raw_sleep_debt_hours": round(raw_sleep_debt_minutes / 60.0, 2),
            "recovery_pressure": recovery_pressure,
        }
        state.phase_notes["model_sleep"] = {
            "history_days_considered": len(history),
            "target_sleep_minutes": target_minutes,
            "raw_sleep_debt_minutes": raw_sleep_debt_minutes,
            "recovery_pressure": recovery_pressure,
            "inside_active_sleep_block": bool(active_sleep_block),
            "sleep_policy": sleep_policy,
        }
        self._record_commit(
            state,
            phase="model_sleep",
            title="Modeled sleep truth",
            body=(
                "Computed target sleep, rolling raw sleep debt, recovery pressure, "
                "and whether the user is currently inside an active sleep block."
            ),
        )

    def commit_sleep(self, state: KairosV2RunState) -> None:
        """
        Phase 4: commit sleep first.

        This is the first real scheduling commitment in Kairos v2. Even though
        the full day is not built yet, the engine should already lock down the
        biological boundary that the rest of the day must respect.
        """
        active_sleep_block = state.sleep.get("active_sleep_block")
        target_sleep_minutes = int(state.sleep.get("target_sleep_minutes") or 0)
        recovery_pressure = str(state.sleep.get("recovery_pressure") or "none")
        sleep_policy = normalize_sleep_policy(state.sleep.get("sleep_policy"))
        effective_active_sleep_block = active_sleep_block
        policy_effect = "none"

        committed_sleep = {
            "committed": True,
            "active_sleep_block": active_sleep_block,
            "effective_active_sleep_block": active_sleep_block,
            "sleep_policy": sleep_policy,
            "policy_effect": policy_effect,
            "bedtime_boundary_source": "sleep_anchor_or_target_sleep_policy",
            "target_sleep_minutes": target_sleep_minutes,
            "recovery_pressure": recovery_pressure,
        }

        # If the user is currently inside a sleep block, this becomes the first
        # and strongest near-term scheduling truth. Later day shaping must bend
        # around it instead of negotiating against it.
        if active_sleep_block and sleep_policy in {"stay_awake", "ignore_today", "woke_early"}:
            effective_active_sleep_block = None
            policy_effect = "ignore_active_sleep_block_for_scheduling"
            if sleep_policy == "woke_early":
                committed_sleep["current_day_state"] = "woke_early_inside_sleep_block"
            elif sleep_policy == "ignore_today":
                committed_sleep["current_day_state"] = "ignoring_sleep_block_for_today"
            else:
                committed_sleep["current_day_state"] = "staying_awake_inside_sleep_block"
        elif active_sleep_block and sleep_policy in {"go_back_to_sleep", "shift_later"}:
            effective_active_sleep_block = active_sleep_block
            policy_effect = "delay_remaining_day_until_sleep_block_end"
            if sleep_policy == "shift_later":
                committed_sleep["current_day_state"] = "shifting_day_later_from_sleep_block"
            else:
                committed_sleep["current_day_state"] = "inside_sleep_returning_to_sleep"
        elif active_sleep_block:
            committed_sleep["current_day_state"] = "inside_sleep"
        else:
            committed_sleep["current_day_state"] = "outside_sleep"

        committed_sleep["effective_active_sleep_block"] = effective_active_sleep_block
        committed_sleep["policy_effect"] = policy_effect
        state.schedule["sleep_commitment"] = committed_sleep
        state.phase_notes["commit_sleep"] = {
            "committed": True,
            "current_day_state": committed_sleep["current_day_state"],
            "recovery_pressure": recovery_pressure,
            "sleep_policy": sleep_policy,
            "policy_effect": policy_effect,
        }
        self._record_commit(
            state,
            phase="commit_sleep",
            title="Committed sleep as the first scheduling truth",
            body="Locked in sleep as the first real scheduler commitment so later structure must respect the user's biological boundary.",
        )

    def select_day_template(self, state: KairosV2RunState) -> None:
        """
        Phase 5: choose the current working day template.

        This is the first structural selection pass in v2. The rules here are
        intentionally narrow and explainable:
        - if the user explicitly forced a template, honor that first
        - otherwise consider only templates eligible for the current weekday
        - among those, pick the closest status fit

        This matches the current v2 design direction: status alignment is mainly
        a template-selection mechanism, not a generic global score slapped onto
        every schedulable all the time.
        """
        weekday_name = str(state.reality.get("weekday_name") or state.now.strftime("%A").lower())
        templates = list(state.schedule.get("week_days", {}).get("eligible_day_templates", []) or [])
        if not templates:
            templates = self._discover_eligible_day_templates(weekday_name)
        forced = self._select_forced_template(templates)
        scored_templates: List[Dict[str, Any]] = []

        for template_info in templates:
            preference = self._score_template_preference_matches(
                template_info["template"],
                state,
            )
            score = self._score_template_status_alignment(
                template_info["template"],
                state.reality.get("current_status", {}) or {},
                state.gathered.get("settings", {}).get("status_settings", {}) or {},
            )
            candidate = dict(template_info)
            candidate["property_preference"] = preference
            candidate["status_alignment"] = score
            scored_templates.append(candidate)

        if forced:
            chosen = self._match_scored_template(forced, scored_templates) or forced
            selection_reason = "forced_template"
        else:
            scored_templates.sort(
                key=lambda item: (
                    -item.get("property_preference", {}).get("score", 0.0),
                    item.get("status_alignment", {}).get("weighted_distance", 10**9),
                    -item.get("status_alignment", {}).get("matched_dimensions", 0),
                    item.get("name", ""),
                )
            )
            chosen = scored_templates[0] if scored_templates else None
            templates = scored_templates
            selection_reason = "status_alignment_closest_match"

        candidate_summary = self._summarize_template_candidates(scored_templates, include_status=True)
        state.schedule["day_template"] = chosen
        state.phase_notes["select_day_template"] = {
            "weekday_name": weekday_name,
            "selection_reason": selection_reason,
            "candidate_count": len(templates),
            "chosen_template": chosen.get("name") if isinstance(chosen, dict) else None,
            "chosen_template_path": chosen.get("path") if isinstance(chosen, dict) else None,
            "chosen_property_preference_score": (
                (chosen.get("property_preference") or {}).get("score")
                if isinstance(chosen, dict)
                else None
            ),
            "chosen_status_alignment": (
                chosen.get("status_alignment")
                if isinstance(chosen, dict)
                else None
            ),
            "candidate_summary": candidate_summary,
        }
        self._record_commit(
            state,
            phase="select_day_template",
            title="Selected the working day template",
            body=(
                f"Chose the day template for {weekday_name} using "
                f"{selection_reason.replace('_', ' ')}. "
                f"Top candidates: {self._format_template_candidate_summary(candidate_summary)}."
            ),
        )

    def ensure_week_context(self, state: KairosV2RunState) -> None:
        """
        Phase 5: make sure the week exists as a scheduling object.

        This does not yet mean persisting a week file. It means Kairos has a
        concrete runtime week frame to reason inside before shaping the day.
        """
        target = state.target_date
        week_start = target - timedelta(days=target.weekday())
        week_days = []
        existing_schedule_paths = []

        for offset in range(7):
            current_day = week_start + timedelta(days=offset)
            schedule_path = os.path.join(USER_DIR, "schedules", f"schedule_{current_day.isoformat()}.yml")
            exists = os.path.exists(schedule_path)
            if exists:
                existing_schedule_paths.append(schedule_path)
            week_days.append(
                {
                    "date": current_day.isoformat(),
                    "weekday_name": current_day.strftime("%A").lower(),
                    "schedule_exists": exists,
                    "schedule_path": schedule_path,
                }
            )

        state.schedule["week_context"] = {
            "exists": True,
            "week_start_date": week_start.isoformat(),
            "week_end_date": (week_start + timedelta(days=6)).isoformat(),
            "days": week_days,
            "existing_schedule_count": len(existing_schedule_paths),
            "existing_schedule_paths": existing_schedule_paths,
        }
        state.phase_notes["ensure_week_context"] = {
            "week_start_date": week_start.isoformat(),
            "existing_schedule_count": len(existing_schedule_paths),
        }
        self._record_commit(
            state,
            phase="ensure_week_context",
            title="Established the runtime week context",
            body="Created the current runtime week object so day-level interpretation stays inside a real weekly frame.",
        )

    def select_week_template(self, state: KairosV2RunState) -> None:
        """
        Phase 6: choose the week template.

        Current first-pass rules:
        - do not use temporary current status as the primary driver
        - honor an explicit forced week template if one exists
        - otherwise choose the first active authored week template

        This keeps week selection strategic rather than overfitting to the
        user's momentary state.
        """
        templates = self._discover_week_templates()
        forced = self._select_forced_week_template(templates)
        scored_templates: List[Dict[str, Any]] = []

        for template_info in templates:
            candidate = dict(template_info)
            candidate["property_preference"] = self._score_template_preference_matches(
                template_info["template"],
                state,
            )
            candidate["day_support"] = self._score_week_template_day_support(
                template_info["template"],
                state,
            )
            scored_templates.append(candidate)

        if forced:
            chosen = self._match_scored_template(forced, scored_templates) or forced
            selection_reason = "forced_week_template"
        else:
            scored_templates.sort(
                key=lambda item: (
                    -int((item.get("day_support") or {}).get("target_weekday_matches", 0)),
                    -item.get("property_preference", {}).get("score", 0.0),
                    -int((item.get("day_support") or {}).get("resolvable_day_count", 0)),
                    item.get("name", ""),
                )
            )
            chosen = scored_templates[0] if scored_templates else None
            templates = scored_templates
            selection_reason = "property_preference_then_first_active"

        state.schedule["week_template"] = chosen
        state.phase_notes["select_week_template"] = {
            "candidate_count": len(templates),
            "selection_reason": selection_reason,
            "chosen_template": chosen.get("name") if isinstance(chosen, dict) else None,
            "chosen_template_path": chosen.get("path") if isinstance(chosen, dict) else None,
            "chosen_property_preference_score": (
                (chosen.get("property_preference") or {}).get("score")
                if isinstance(chosen, dict)
                else None
            ),
            "chosen_day_support": (
                chosen.get("day_support")
                if isinstance(chosen, dict)
                else None
            ),
            "candidate_summary": self._summarize_template_candidates(scored_templates),
        }
        self._record_commit(
            state,
            phase="select_week_template",
            title="Selected the week template",
            body=(
                "Chose the working week template using authored property preferences and flags "
                "without letting temporary current status dominate the broader weekly structure. "
                f"Top candidates: {self._format_template_candidate_summary(self._summarize_template_candidates(scored_templates))}."
            ),
        )

    def derive_week_days(self, state: KairosV2RunState) -> None:
        """
        Phase 7: derive the week's day structures from the chosen week template.

        Week templates only contain day references plus properties, so this phase
        resolves those references into concrete day templates.
        """
        chosen = state.schedule.get("week_template")
        template = chosen.get("template") if isinstance(chosen, dict) else {}
        children = (template or {}).get("children") or []
        derived_days: List[Dict[str, Any]] = []

        for child in children:
            if not isinstance(child, dict):
                continue
            if str(child.get("type") or "").strip().lower() != "day":
                continue
            resolved = self._resolve_day_template_reference(child)
            if resolved:
                derived_days.append(resolved)

        weekday_name = str(state.reality.get("weekday_name") or state.now.strftime("%A").lower())
        eligible_day_templates = [
            day for day in derived_days
            if is_template_eligible_for_day(day.get("template") or {}, weekday_name)
        ]

        state.schedule["week_days"] = {
            "count": len(derived_days),
            "days": derived_days,
            "eligible_day_templates": eligible_day_templates,
        }
        state.phase_notes["derive_week_days"] = {
            "derived_day_count": len(derived_days),
            "eligible_day_template_count": len(eligible_day_templates),
            "eligible_day_template_names": [day.get("name") for day in eligible_day_templates],
        }
        self._record_commit(
            state,
            phase="derive_week_days",
            title="Derived the week's day structures",
            body="Resolved the chosen week template's day references into concrete day templates for the current weekly frame.",
        )

    def commit_anchor_skeleton(self, state: KairosV2RunState) -> None:
        """
        Phase 6: commit the non-sleep hard-anchor skeleton.

        The spec says sleep commits first, then the rest of the hard anchors
        build the structural skeleton from the day template.
        """
        chosen = state.schedule.get("day_template")
        template = chosen.get("template") if isinstance(chosen, dict) else None
        authored_anchors: List[Dict[str, Any]] = []
        active_anchors: List[Dict[str, Any]] = []

        for node in self._walk_nodes((template or {}).get("children") or []):
            if not self._is_hard_anchor(node):
                continue
            if self._is_sleep_like_node(node):
                continue
            normalized = self._normalize_anchor(node, state.target_date)
            authored_anchors.append(normalized)
            clipped = self._clip_timed_surface_to_runtime_horizon(
                normalized,
                state,
                duration_keys=("duration_minutes", "duration"),
            )
            if clipped is None:
                continue
            active_anchors.append(clipped)

        manual_hard_injections = 0
        manual_hard_events = {
            "placed": [],
            "rejected": [],
            "displaced": [],
        }
        for request in state.gathered.get("manual", {}).get("manual_injections", []):
            if str(request.get("mode") or "").strip().lower() != "hard":
                continue
            normalized = self._build_manual_anchor_from_request(
                request,
                state,
                start_key="start_time",
                source_rule="manual_hard_injection",
            )
            if not isinstance(normalized, dict):
                continue
            overlaps = [
                anchor for anchor in authored_anchors
                if self._anchors_overlap(anchor, normalized)
            ]
            can_override = bool(request.get("override_anchor")) or bool(request.get("force"))
            if overlaps and not can_override:
                manual_hard_events["rejected"].append(
                    {
                        "name": normalized.get("name"),
                        "start_time": normalized.get("start_time"),
                        "end_time": normalized.get("end_time"),
                        "reason": "anchor_overlap",
                        "overlaps": [anchor.get("name") for anchor in overlaps],
                    }
                )
                continue
            if overlaps and can_override:
                overlapped_names = [anchor.get("name") for anchor in overlaps]
                authored_anchors = [
                    anchor for anchor in authored_anchors
                    if not self._anchors_overlap(anchor, normalized)
                ]
                active_anchors = [
                    anchor for anchor in active_anchors
                    if not self._anchors_overlap(anchor, normalized)
                ]
                manual_hard_events["displaced"].append(
                    {
                        "name": normalized.get("name"),
                        "overlaps": overlapped_names,
                    }
                )
            authored_anchors.append(normalized)
            clipped = self._clip_timed_surface_to_runtime_horizon(
                normalized,
                state,
                duration_keys=("duration_minutes", "duration"),
            )
            if clipped is not None:
                active_anchors.append(clipped)
            manual_hard_events["placed"].append(
                {
                    "name": normalized.get("name"),
                    "start_time": normalized.get("start_time"),
                    "end_time": normalized.get("end_time"),
                }
            )
            manual_hard_injections += 1

        manual_change_anchors = 0
        manual_change_events = {
            "placed": [],
            "rejected": [],
        }
        for adjustment in state.gathered.get("manual", {}).get("manual_adjustments", []):
            if str(adjustment.get("action") or "").strip().lower() != "change":
                continue
            normalized = self._build_manual_anchor_from_request(
                adjustment,
                state,
                start_key="new_start_time",
                source_rule="manual_change",
            )
            if not isinstance(normalized, dict):
                continue
            overlaps = [
                anchor for anchor in authored_anchors
                if self._anchors_overlap(anchor, normalized)
            ]
            if overlaps:
                manual_change_events["rejected"].append(
                    {
                        "name": normalized.get("name"),
                        "start_time": normalized.get("start_time"),
                        "end_time": normalized.get("end_time"),
                        "reason": "anchor_overlap",
                        "overlaps": [anchor.get("name") for anchor in overlaps],
                    }
                )
                continue
            authored_anchors.append(normalized)
            clipped = self._clip_timed_surface_to_runtime_horizon(
                normalized,
                state,
                duration_keys=("duration_minutes", "duration"),
            )
            if clipped is not None:
                active_anchors.append(clipped)
            manual_change_events["placed"].append(
                {
                    "name": normalized.get("name"),
                    "start_time": normalized.get("start_time"),
                    "end_time": normalized.get("end_time"),
                }
            )
            manual_change_anchors += 1

        authored_anchors.sort(
            key=lambda item: (
                item.get("start_minutes") if item.get("start_minutes") is not None else 10**9,
                item.get("name", ""),
            )
        )
        active_anchors.sort(
            key=lambda item: (
                item.get("start_minutes") if item.get("start_minutes") is not None else 10**9,
                item.get("name", ""),
            )
        )

        state.schedule["anchor_skeleton"] = {
            "committed": True,
            "count": len(active_anchors),
            "anchors": active_anchors,
            "authored_anchor_count": len(authored_anchors),
            "all_anchors": authored_anchors,
            "manual_hard_events": manual_hard_events,
            "manual_change_events": manual_change_events,
        }
        state.phase_notes["commit_anchor_skeleton"] = {
            "committed": True,
            "anchor_count": len(active_anchors),
            "authored_anchor_count": len(authored_anchors),
            "anchor_names": [anchor.get("name") for anchor in active_anchors],
            "manual_hard_injection_count": manual_hard_injections,
            "manual_change_anchor_count": manual_change_anchors,
            "manual_hard_rejected_count": len(manual_hard_events["rejected"]),
            "manual_change_rejected_count": len(manual_change_events["rejected"]),
            "remaining_day_mode": self._remaining_day_mode(state),
        }
        self._record_commit(
            state,
            phase="commit_anchor_skeleton",
            title="Committed the hard-anchor skeleton",
            body="Committed the non-sleep hard anchors from the chosen day template so later flexible reasoning must work around them.",
        )

    def build_candidate_universe(self, state: KairosV2RunState) -> None:
        """
        Phase 7: build the first candidate universe.

        We are still before detailed window population and final placement.
        This phase only decides what belongs in scope at all after the first
        structural commitments are made.
        """
        chosen = state.schedule.get("day_template")
        template = chosen.get("template") if isinstance(chosen, dict) else {}
        candidates: List[Dict[str, Any]] = []
        seen: set[str] = set()
        manual_adjustment_events: List[Dict[str, Any]] = []

        # Chosen template children are included by default, except for anchors
        # that have already been committed into the skeleton.
        for node in (template or {}).get("children") or []:
            if not isinstance(node, dict):
                continue
            if self._is_hard_anchor(node):
                continue
            effective_node = self._build_effective_template_child_node(template or {}, node)
            if (
                bool(effective_node.get("window"))
                or self._is_explicit_free_node(effective_node)
                or self._is_explicit_buffer_node(effective_node)
            ):
                continue
            candidate, events = self._apply_manual_adjustments_to_candidate(
                self._normalize_candidate(
                    effective_node,
                    source="template_membership",
                    reasons=["included_by_chosen_day_template"],
                )
            )
            manual_adjustment_events.extend(events)
            if candidate is None:
                continue
            self._append_candidate(
                candidates,
                seen,
                candidate,
            )

        # Recurring and due-driven granular work stays in scope even when the
        # current template does not explicitly contain it.
        for item in self._iter_schedulable_library_items():
            if self._is_inactive_status(item):
                continue
            if self._is_bad_habit(item):
                continue
            if self._is_hard_anchor(item):
                continue
            if self._is_sleep_like_node(item):
                continue
            if self._is_explicit_free_node(item) or self._is_explicit_buffer_node(item):
                continue
            if bool(item.get("window")):
                continue

            reasons: List[str] = []
            if item.get("frequency") and self._frequency_applies_to_date(item.get("frequency"), state.target_date):
                reasons.append("active_recurring_item")
            if item.get("due_date"):
                reasons.append("has_due_date")
            if item.get("deadline"):
                reasons.append("has_deadline")

            if not reasons:
                continue

            candidate, events = self._apply_manual_adjustments_to_candidate(
                self._normalize_candidate(
                    item,
                    source="global_candidate_rules",
                    reasons=reasons,
                )
            )
            manual_adjustment_events.extend(events)
            if candidate is None:
                continue
            self._append_candidate(
                candidates,
                seen,
                candidate,
            )

        manual_soft_injections_applied = 0
        for request in state.gathered.get("manual", {}).get("manual_injections", []):
            if str(request.get("mode") or "").strip().lower() != "soft":
                continue

            candidate, events = self._apply_manual_adjustments_to_candidate(
                self._normalize_candidate(
                    self._build_manual_runtime_node(request.get("name"), request.get("type")),
                    source="manual_injection",
                    reasons=["manual_soft_injection"],
                )
            )
            manual_adjustment_events.extend(events)
            if candidate is None:
                continue
            candidate["manual_injected"] = True
            candidate["manual_injection_mode"] = "soft"
            candidate["manual_injection_source"] = request.get("source")
            existing = next(
                (
                    row for row in candidates
                    if str(row.get("identity") or "").strip() == str(candidate.get("identity") or "").strip()
                ),
                None,
            )
            if isinstance(existing, dict):
                existing["manual_injected"] = True
                existing["manual_injection_mode"] = "soft"
                existing["manual_injection_source"] = request.get("source")
                existing["reasons"] = list(dict.fromkeys(list(existing.get("reasons") or []) + ["manual_soft_injection"]))
            else:
                self._append_candidate(candidates, seen, candidate)
            manual_soft_injections_applied += 1

        state.schedule["candidate_universe"] = {
            "count": len(candidates),
            "candidates": candidates,
            "manual_adjustment_events": manual_adjustment_events,
        }
        state.phase_notes["build_candidate_universe"] = {
            "candidate_count": len(candidates),
            "candidate_names": [candidate.get("name") for candidate in candidates],
            "manual_soft_injection_count": manual_soft_injections_applied,
            "manual_adjustment_event_count": len(manual_adjustment_events),
        }
        self._record_commit(
            state,
            phase="build_candidate_universe",
            title="Built the first candidate universe",
            body="Merged template-membership candidates with recurring and due-driven schedulables that must remain in scope regardless of template.",
        )

    def remove_reality_impossible_candidates(self, state: KairosV2RunState) -> None:
        """
        Phase 9: remove anything present reality makes impossible.

        This phase stays intentionally conservative. It only removes candidates
        when reality has already made the answer obvious.
        """
        universe = state.schedule.get("candidate_universe", {})
        candidates = list(universe.get("candidates", []) if isinstance(universe, dict) else [])
        completed_names = self._completed_names_before_now(state.target_date, state.now)
        anchor_name_tokens = self._hard_anchor_semantic_tokens(state)
        open_flexible_minutes = int(
            state.schedule.get("day_budget", {}).get("open_flexible_minutes_before_sleep") or 0
        )
        no_time_left_today = state.target_date == state.now.date() and open_flexible_minutes <= 0

        viable: List[Dict[str, Any]] = []
        impossible: List[Dict[str, Any]] = []

        for candidate in candidates:
            candidate = self._attach_candidate_status_fit(candidate, state)
            name = str(candidate.get("name") or "").strip().lower()
            name_token = self._normalize_token(candidate.get("name"))

            if name in completed_names:
                record = dict(candidate)
                record["impossible_reason"] = "already_completed_today"
                impossible.append(record)
                continue

            if name_token and name_token in anchor_name_tokens:
                record = dict(candidate)
                record["impossible_reason"] = "already_represented_by_hard_anchor"
                impossible.append(record)
                continue

            if no_time_left_today:
                record = dict(candidate)
                record["impossible_reason"] = "no_schedulable_time_left_before_sleep"
                impossible.append(record)
                continue

            viable.append(candidate)

        state.schedule["reality_filtered_candidates"] = {
            "count": len(viable),
            "candidates": viable,
            "impossible_count": len(impossible),
            "impossible_candidates": impossible,
        }
        state.phase_notes["remove_reality_impossible_candidates"] = {
            "viable_count": len(viable),
            "impossible_count": len(impossible),
            "completed_names_seen": sorted(list(completed_names)),
            "hard_anchor_semantic_tokens": sorted(list(anchor_name_tokens)),
            "no_time_left_today": no_time_left_today,
        }
        self._record_commit(
            state,
            phase="remove_reality_impossible_candidates",
            title="Removed candidates reality already ruled out",
            body="Dropped candidates that are already completed today or impossible because the remaining live day budget is gone.",
        )

    def shape_week(self, state: KairosV2RunState) -> None:
        """
        Phase 10: shape the week.

        This phase does not place blocks yet. It builds the weekly pressure
        context that later day/window population should respect.
        """
        viable = list(
            state.schedule.get("reality_filtered_candidates", {}).get("candidates", [])
            if isinstance(state.schedule.get("reality_filtered_candidates"), dict)
            else []
        )
        category_settings = state.gathered.get("settings", {}).get("category_settings", {}) or {}
        happiness_map = state.gathered.get("settings", {}).get("map_of_happiness", {}) or {}

        category_weights = self._normalize_ranked_map(category_settings.get("Category_Settings", {}), rank_key="value")
        happiness_weights = self._normalize_happiness_map(happiness_map)

        category_counts: Dict[str, int] = {}
        happiness_counts: Dict[str, int] = {}
        for candidate in viable:
            category = self._normalize_token(candidate.get("category"))
            if category:
                category_counts[category] = category_counts.get(category, 0) + 1

            for happiness_key in self._extract_happiness_keys(candidate):
                happiness_counts[happiness_key] = happiness_counts.get(happiness_key, 0) + 1

        category_pressure = []
        for key, weight_info in category_weights.items():
            category_pressure.append(
                {
                    "category": key,
                    "rank": weight_info["rank"],
                    "weight": weight_info["weight"],
                    "candidate_count": category_counts.get(key, 0),
                    "pressure_score": category_counts.get(key, 0) * weight_info["weight"],
                }
            )
        category_pressure.sort(key=lambda item: (-item["pressure_score"], item["rank"], item["category"]))

        happiness_pressure = []
        for key, weight_info in happiness_weights.items():
            happiness_pressure.append(
                {
                    "happiness_key": key,
                    "rank": weight_info["rank"],
                    "weight": weight_info["weight"],
                    "candidate_count": happiness_counts.get(key, 0),
                    "pressure_score": happiness_counts.get(key, 0) * weight_info["weight"],
                }
            )
        happiness_pressure.sort(key=lambda item: (-item["pressure_score"], item["rank"], item["happiness_key"]))

        state.schedule["week_shaping"] = {
            "category_pressure": category_pressure,
            "happiness_pressure": happiness_pressure,
            "viable_candidate_count": len(viable),
        }
        state.phase_notes["shape_week"] = {
            "viable_candidate_count": len(viable),
            "top_category_pressure": category_pressure[:5],
            "top_happiness_pressure": happiness_pressure[:5],
        }
        self._record_commit(
            state,
            phase="shape_week",
            title="Built the weekly shaping context",
            body="Turned category and happiness configuration into a weekly pressure context that later day and window population can follow.",
        )

    def populate_day_and_windows(self, state: KairosV2RunState) -> None:
        """
        Phase 11: populate the day structure and its windows.

        This is still not final clock placement. It is the stage where Kairos
        turns the chosen day template into an expanded structure, then finds any
        dynamic windows inside that structure and builds their local candidate
        pools.
        """
        chosen_day = state.schedule.get("day_template")
        template = chosen_day.get("template") if isinstance(chosen_day, dict) else {}
        root_children = (template or {}).get("children") or []
        expanded_children = [
            self._expand_structured_node(template or {}, child)
            for child in root_children
            if isinstance(child, dict)
        ]
        root_sequence = (template or {}).get("sequence") or []
        expanded_sequence = [
            self._expand_structured_node(template or {}, item)
            for item in root_sequence
            if isinstance(item, dict)
        ]
        expanded_nodes = expanded_children + expanded_sequence
        active_fixed_time_nodes = self._apply_runtime_horizon_to_surfaces(
            self._discover_fixed_time_structure_nodes(expanded_sequence),
            state,
            duration_keys=("duration_minutes", "duration"),
        )

        viable_candidates = list(
            state.schedule.get("reality_filtered_candidates", {}).get("candidates", [])
            if isinstance(state.schedule.get("reality_filtered_candidates"), dict)
            else []
        )
        authored_window_nodes = self._discover_windows_in_structure(expanded_nodes)
        windows: List[Dict[str, Any]] = []
        for window in authored_window_nodes:
            clipped_window = self._clip_timed_surface_to_runtime_horizon(
                window,
                state,
                duration_keys=("duration", "duration_minutes"),
            )
            if clipped_window is None:
                continue
            clipped_window["window_identity"] = self._window_identity_for_node(window)
            windows.append(clipped_window)

        populated_windows = []
        for window in windows:
            local_candidates = [
                candidate for candidate in viable_candidates
                if self._candidate_matches_window(candidate, window)
            ]
            populated_windows.append(
                {
                    "name": window.get("name"),
                    "type": window.get("type"),
                    "filters": window.get("filters") or {},
                    "duration": window.get("duration"),
                    "candidate_count": len(local_candidates),
                    "candidate_names": [candidate.get("name") for candidate in local_candidates],
                }
            )

        state.schedule["day_population"] = {
            "expanded_child_count": len(expanded_children),
            "expanded_children": expanded_children,
            "expanded_sequence_count": len(expanded_sequence),
            "expanded_sequence": expanded_sequence,
            "expanded_node_count": len(expanded_nodes),
            "expanded_nodes": expanded_nodes,
            "active_fixed_time_node_count": len(active_fixed_time_nodes),
            "active_fixed_time_nodes": active_fixed_time_nodes,
            "all_window_nodes": [
                {
                    **window,
                    "window_identity": self._window_identity_for_node(window),
                }
                for window in authored_window_nodes
            ],
            "active_window_nodes": windows,
            "window_count": len(populated_windows),
            "windows": populated_windows,
        }
        state.phase_notes["populate_day_and_windows"] = {
            "expanded_child_count": len(expanded_children),
            "expanded_sequence_count": len(expanded_sequence),
            "all_window_count": len(authored_window_nodes),
            "window_count": len(populated_windows),
            "active_fixed_time_node_count": len(active_fixed_time_nodes),
            "window_names": [window.get("name") for window in populated_windows],
        }
        self._record_commit(
            state,
            phase="populate_day_and_windows",
            title="Expanded the day structure and populated local windows",
            body="Expanded the chosen day template into a real day graph and built local candidate pools for any dynamic windows inside it.",
        )

    def handle_gaps_buffers_and_recovery(self, state: KairosV2RunState) -> None:
        """
        Phase 12: handle gaps, buffers, and recovery.

        True emergent gaps require final clock placement, which this scaffold
        does not do yet. So this first pass focuses on the slack and recovery
        surfaces that are already knowable now.
        """
        expanded_nodes = list(
            state.schedule.get("day_population", {}).get("expanded_nodes", [])
            if isinstance(state.schedule.get("day_population"), dict)
            else []
        )
        explicit_free_blocks = self._apply_runtime_horizon_to_surfaces(
            self._discover_explicit_free_blocks(expanded_nodes),
            state,
            duration_keys=("duration", "duration_minutes"),
        )
        explicit_buffer_blocks = self._apply_runtime_horizon_to_surfaces(
            self._discover_explicit_buffer_blocks(expanded_nodes),
            state,
            duration_keys=("duration", "duration_minutes"),
        )
        buffer_settings = state.gathered.get("settings", {}).get("buffer_settings", {}) or {}
        quick_wins_settings = state.gathered.get("settings", {}).get("quick_wins_settings", {}) or {}
        recovery_pressure = state.sleep.get("recovery_pressure")
        emergent_gaps = self._derive_emergent_gaps(state, explicit_free_blocks)

        state.schedule["gap_buffer_recovery"] = {
            "explicit_free_block_count": len(explicit_free_blocks),
            "explicit_free_blocks": explicit_free_blocks,
            "explicit_buffer_block_count": len(explicit_buffer_blocks),
            "explicit_buffer_blocks": explicit_buffer_blocks,
            "emergent_gap_count": len(emergent_gaps),
            "emergent_gaps": emergent_gaps,
            "buffer_settings": buffer_settings,
            "quick_wins_settings": quick_wins_settings,
            "recovery_pressure": recovery_pressure,
            "emergent_gap_status": "derived_from_known_timed_surfaces_only",
        }
        state.phase_notes["handle_gaps_buffers_and_recovery"] = {
            "explicit_free_block_count": len(explicit_free_blocks),
            "explicit_buffer_block_count": len(explicit_buffer_blocks),
            "emergent_gap_count": len(emergent_gaps),
            "recovery_pressure": recovery_pressure,
            "emergent_gap_status": "derived_from_known_timed_surfaces_only",
        }
        self._record_commit(
            state,
            phase="handle_gaps_buffers_and_recovery",
            title="Identified slack, buffer, and recovery surfaces",
            body="Mapped explicit free blocks, derived emergent gaps from known timed surfaces, and carried forward buffer, quick-win, and sleep-recovery context.",
        )

    def build_runtime_helper_windows(self, state: KairosV2RunState) -> None:
        """
        Phase 12a: create narrow runtime-only helper windows when strong reasons exist.

        The spec allows Kairos to invent a very small number of helper windows
        for situations like due pressure or manual-injected work. These windows
        are:
        - temporary
        - explainable
        - settings-driven
        - never confused with authored templates
        """
        settings = self._runtime_helper_settings(state)
        existing_window_selections = state.schedule.get("window_selections", {})
        authored_windows = list(existing_window_selections.get("windows", []) if isinstance(existing_window_selections, dict) else [])
        gap_context = state.schedule.get("gap_buffer_recovery", {})
        original_gaps = list(gap_context.get("emergent_gaps", []) if isinstance(gap_context, dict) else [])
        viable_candidates = list(
            state.schedule.get("reality_filtered_candidates", {}).get("candidates", [])
            if isinstance(state.schedule.get("reality_filtered_candidates"), dict)
            else []
        )

        if not settings["enabled"] or not original_gaps:
            state.schedule["runtime_helper_windows"] = {
                "enabled": settings["enabled"],
                "count": 0,
                "windows": [],
                "adjusted_gap_count": len(original_gaps),
            }
            state.phase_notes["build_runtime_helper_windows"] = {
                "enabled": settings["enabled"],
                "helper_window_count": 0,
                "adjusted_gap_count": len(original_gaps),
            }
            self._record_commit(
                state,
                phase="build_runtime_helper_windows",
                title="Evaluated runtime helper windows",
                body="Checked whether due-pressure or manual-opportunity helper windows should be created and found no strong qualifying case.",
            )
            return

        category_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("category_settings", {}) or {}).get("Category_Settings", {}),
            rank_key="value",
        )
        priority_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("priority_settings", {}) or {}).get("Priority_Settings", {}),
            rank_key="value",
        )
        happiness_weights = self._normalize_happiness_map(
            state.gathered.get("settings", {}).get("map_of_happiness", {}) or {}
        )
        factor_weights = self._priority_factor_weights(state)

        selected_identities = self._selected_candidate_identities(state)
        helper_windows: List[Dict[str, Any]] = []
        adjusted_gaps: List[Dict[str, Any]] = []

        for gap in original_gaps:
            gap_minutes = int(gap.get("duration_minutes") or 0)
            if len(helper_windows) >= settings["max_windows_per_day"]:
                adjusted_gaps.append(dict(gap))
                continue
            if gap_minutes < settings["minimum_gap_minutes"]:
                adjusted_gaps.append(dict(gap))
                continue

            candidate_pool = [
                candidate
                for candidate in viable_candidates
                if str(candidate.get("identity") or "").strip() not in selected_identities
                and self._candidate_eligible_for_runtime_helper(candidate)
            ]
            if not candidate_pool:
                adjusted_gaps.append(dict(gap))
                continue

            scored_pool = []
            for candidate in candidate_pool:
                scored_pool.append(
                    {
                        "candidate": candidate,
                        "score": self._score_runtime_helper_candidate(
                            candidate=candidate,
                            category_weights=category_weights,
                            priority_weights=priority_weights,
                            happiness_weights=happiness_weights,
                            priority_factor_weights=factor_weights,
                            target_date=state.target_date,
                        ),
                    }
                )
            scored_pool.sort(key=lambda row: (-row["score"], row["candidate"].get("name", "")))

            chosen: List[Dict[str, Any]] = []
            used_minutes = 0
            cursor = int(gap.get("start_minutes") or 0)
            for row in scored_pool:
                candidate = row["candidate"]
                duration_minutes = self._coerce_minutes(candidate.get("duration"))
                if duration_minutes is None or duration_minutes <= 0:
                    continue
                if used_minutes + duration_minutes > gap_minutes:
                    continue
                chosen.append(
                    {
                        "name": candidate.get("name"),
                        "identity": candidate.get("identity"),
                        "type": candidate.get("type"),
                        "duration_minutes": duration_minutes,
                        "score": row["score"],
                        "category": candidate.get("category"),
                        "priority": candidate.get("priority"),
                        "due_date": candidate.get("due_date"),
                        "deadline": candidate.get("deadline"),
                        "local_status_fit": candidate.get("local_status_fit"),
                        "trim": candidate.get("trim"),
                        "cut": candidate.get("cut"),
                        "shift": candidate.get("shift"),
                        "max_trim_percent": candidate.get("max_trim_percent"),
                        "mini_of": candidate.get("mini_of"),
                        "mini_variant": candidate.get("mini_variant"),
                        "manual_injected": candidate.get("manual_injected"),
                        "start_time": self._minutes_to_hm(cursor),
                        "end_time": self._minutes_to_hm(cursor + duration_minutes),
                    }
                )
                used_minutes += duration_minutes
                cursor += duration_minutes
                selected_identities.add(str(candidate.get("identity") or "").strip())

            if not chosen:
                adjusted_gaps.append(dict(gap))
                continue

            helper_kind = self._runtime_helper_kind(chosen)
            helper_name = self._runtime_helper_name(helper_kind)
            helper_window = {
                "window_name": helper_name,
                "runtime_helper": True,
                "helper_kind": helper_kind,
                "source_gap_start_time": gap.get("start_time"),
                "source_gap_end_time": gap.get("end_time"),
                "start_time": gap.get("start_time"),
                "end_time": self._minutes_to_hm(int(gap.get("start_minutes") or 0) + used_minutes),
                "start_minutes": int(gap.get("start_minutes") or 0),
                "end_minutes": int(gap.get("start_minutes") or 0) + used_minutes,
                "window_duration_minutes": used_minutes,
                "selected_count": len(chosen),
                "selected_minutes": used_minutes,
                "remaining_window_minutes": 0,
                "selected": chosen,
            }
            helper_windows.append(helper_window)

            if used_minutes < gap_minutes:
                adjusted_gaps.append(
                    self._build_gap_record(
                        int(gap.get("start_minutes") or 0) + used_minutes,
                        int(gap.get("end_minutes") or 0),
                    )
                )

        merged_windows = authored_windows + helper_windows
        state.schedule["window_selections"] = {
            "count": len(merged_windows),
            "authored_window_count": len(authored_windows),
            "runtime_helper_window_count": len(helper_windows),
            "windows": merged_windows,
        }
        if isinstance(gap_context, dict):
            updated_gap_context = dict(gap_context)
            updated_gap_context["base_emergent_gaps"] = original_gaps
            updated_gap_context["emergent_gaps"] = adjusted_gaps
            updated_gap_context["emergent_gap_count"] = len(adjusted_gaps)
            state.schedule["gap_buffer_recovery"] = updated_gap_context
        state.schedule["runtime_helper_windows"] = {
            "enabled": settings["enabled"],
            "count": len(helper_windows),
            "windows": helper_windows,
            "adjusted_gap_count": len(adjusted_gaps),
            "minimum_gap_minutes": settings["minimum_gap_minutes"],
            "max_windows_per_day": settings["max_windows_per_day"],
        }
        state.phase_notes["build_runtime_helper_windows"] = {
            "helper_window_count": len(helper_windows),
            "helper_window_names": [window.get("window_name") for window in helper_windows],
            "adjusted_gap_count": len(adjusted_gaps),
        }
        self._record_commit(
            state,
            phase="build_runtime_helper_windows",
            title="Created runtime helper windows where pressure justified them",
            body="Reserved a small number of emergent gap segments for due-pressure or manual-opportunity helper windows before generic late placement consumed the remaining slack.",
        )

    def narrow_window_candidate_pools(self, state: KairosV2RunState) -> None:
        """
        Phase 11a: narrow window candidate pools before final local choice.

        Kairos v2 is meant to be narrowing-first, not score-first. This phase
        trims the local pool down using obvious local structure and affinity
        before the later chooser decides what actually gets placed.
        """
        day_population = state.schedule.get("day_population", {})
        expanded_children = list(day_population.get("expanded_children", []) if isinstance(day_population, dict) else [])
        viable_candidates = list(
            state.schedule.get("reality_filtered_candidates", {}).get("candidates", [])
            if isinstance(state.schedule.get("reality_filtered_candidates"), dict)
            else []
        )

        windows = list(day_population.get("active_window_nodes", []) if isinstance(day_population, dict) else [])
        narrowed_windows = []
        for window in windows:
            local_candidates = [
                candidate for candidate in viable_candidates
                if self._candidate_matches_window(candidate, window)
            ]
            narrowed = self._narrow_candidates_for_window(window, local_candidates, state)
            narrowed_windows.append(
                {
                    "window_name": window.get("name"),
                    "initial_candidate_count": len(local_candidates),
                    "narrowed_candidate_count": len(narrowed["candidates"]),
                    "narrowing_rule": narrowed["rule"],
                    "candidate_names": [candidate.get("name") for candidate in narrowed["candidates"]],
                    "candidates": narrowed["candidates"],
                }
            )

        state.schedule["window_narrowing"] = {
            "count": len(narrowed_windows),
            "windows": narrowed_windows,
        }
        state.phase_notes["narrow_window_candidate_pools"] = {
            "window_count": len(narrowed_windows),
            "narrowed_windows": [
                {
                    "window_name": window.get("window_name"),
                    "initial": window.get("initial_candidate_count"),
                    "narrowed": window.get("narrowed_candidate_count"),
                }
                for window in narrowed_windows
            ],
        }
        self._record_commit(
            state,
            phase="narrow_window_candidate_pools",
            title="Narrowed local window candidate pools",
            body="Reduced each window's candidate pool using obvious local structure and affinity before the final chooser selected actual contents.",
        )

    def select_window_contents(self, state: KairosV2RunState) -> None:
        """
        Phase 11b: select actual contents for each populated window.

        The previous pass only built local candidate pools. This pass makes the
        first real local choices inside those windows by selecting candidates
        that fit both the semantic filter and the available window duration.
        """
        day_population = state.schedule.get("day_population", {})
        expanded_children = list(day_population.get("expanded_children", []) if isinstance(day_population, dict) else [])
        narrowed_lookup = {
            str(window.get("window_name") or ""): list(window.get("candidates", []))
            for window in (
                state.schedule.get("window_narrowing", {}).get("windows", [])
                if isinstance(state.schedule.get("window_narrowing"), dict)
                else []
            )
        }
        viable_candidates = list(
            state.schedule.get("reality_filtered_candidates", {}).get("candidates", [])
            if isinstance(state.schedule.get("reality_filtered_candidates"), dict)
            else []
        )
        category_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("category_settings", {}) or {}).get("Category_Settings", {}),
            rank_key="value",
        )
        priority_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("priority_settings", {}) or {}).get("Priority_Settings", {}),
            rank_key="value",
        )
        happiness_weights = self._normalize_happiness_map(
            state.gathered.get("settings", {}).get("map_of_happiness", {}) or {}
        )
        factor_weights = self._priority_factor_weights(state)

        windows = list(day_population.get("active_window_nodes", []) if isinstance(day_population, dict) else [])
        selections = []
        selected_identities: set[str] = set()

        for window in windows:
            duration_limit = self._coerce_minutes(window.get("duration")) or 0
            local_candidates = narrowed_lookup.get(str(window.get("name") or "")) or [
                candidate for candidate in viable_candidates
                if candidate.get("identity") not in selected_identities and self._candidate_matches_window(candidate, window)
            ]
            local_candidates = [
                candidate for candidate in local_candidates
                if candidate.get("identity") not in selected_identities
            ]

            scored = []
            for candidate in local_candidates:
                score = self._score_candidate_for_window(
                    candidate=candidate,
                    window=window,
                    category_weights=category_weights,
                    priority_weights=priority_weights,
                    happiness_weights=happiness_weights,
                    priority_factor_weights=factor_weights,
                    target_date=state.target_date,
                )
                scored.append({"candidate": candidate, "score": score})

            scored.sort(key=lambda item: (-item["score"], item["candidate"].get("name", "")))

            chosen = []
            used_minutes = 0
            window_cursor = self._parse_hm(window.get("start_time") or window.get("start")) or 0
            for row in scored:
                candidate = row["candidate"]
                candidate_minutes = self._coerce_minutes(candidate.get("duration"))
                if candidate_minutes is None or candidate_minutes <= 0:
                    continue
                if duration_limit and used_minutes + candidate_minutes > duration_limit:
                    continue
                chosen.append(
                    self._build_timed_selected_item(
                        candidate,
                        start_minutes=window_cursor,
                        duration_minutes=candidate_minutes,
                        extra_fields={
                            "score": row["score"],
                            "top_level_parent_name": candidate.get("_top_level_parent_name") or window.get("_top_level_parent_name"),
                            "top_level_parent_type": candidate.get("_top_level_parent_type") or window.get("_top_level_parent_type"),
                        },
                    )
                )
                selected_identities.add(str(candidate.get("identity")))
                used_minutes += candidate_minutes
                window_cursor += candidate_minutes

            selections.append(
                {
                    "window_name": window.get("name"),
                    "start_time": window.get("start_time") or window.get("start"),
                    "end_time": window.get("end_time") or window.get("end"),
                    "start_minutes": self._parse_hm(window.get("start_time") or window.get("start")),
                    "end_minutes": self._parse_hm(window.get("end_time") or window.get("end")),
                    "window_duration_minutes": duration_limit,
                    "selected_count": len(chosen),
                    "selected_minutes": used_minutes,
                    "remaining_window_minutes": max(0, duration_limit - used_minutes) if duration_limit else 0,
                    "selected": chosen,
                    "top_level_parent_name": window.get("_top_level_parent_name"),
                    "top_level_parent_type": window.get("_top_level_parent_type"),
                }
            )

        state.schedule["window_selections"] = {
            "count": len(selections),
            "windows": selections,
        }
        state.phase_notes["select_window_contents"] = {
            "window_count": len(selections),
            "selected_window_names": [window["window_name"] for window in selections if window.get("selected_count")],
        }
        self._record_commit(
            state,
            phase="select_window_contents",
            title="Selected concrete contents for dynamic windows",
            body="Chose the best-fitting candidate set for each window using local window logic and available window duration.",
        )

    def finalize_conceptual_schedule(self, state: KairosV2RunState) -> None:
        """
        Phase 13: finalize the conceptual schedule.

        This is the scheduler-facing shape before the timer turns it into an
        execution flow.
        """
        conceptual_blocks = self._build_conceptual_blocks(state)
        conceptual = {
            "week_template": (state.schedule.get("week_template") or {}).get("name"),
            "day_template": (state.schedule.get("day_template") or {}).get("name"),
            "sleep_commitment": state.schedule.get("sleep_commitment"),
            "anchor_skeleton": state.schedule.get("anchor_skeleton"),
            "day_budget": state.schedule.get("day_budget"),
            "viable_candidates": state.schedule.get("reality_filtered_candidates", {}).get("candidates", []),
            "week_shaping": state.schedule.get("week_shaping"),
            "day_population": state.schedule.get("day_population"),
            "window_selections": state.schedule.get("window_selections"),
            "gap_buffer_recovery": state.schedule.get("gap_buffer_recovery"),
            "quick_wins": state.schedule.get("quick_wins"),
            "conceptual_blocks": conceptual_blocks,
            "status": {
                "conceptual_ready": True,
                "final_clock_placement_deferred": True,
            },
        }
        state.schedule["conceptual_schedule"] = conceptual
        state.phase_notes["finalize_conceptual_schedule"] = {
            "conceptual_ready": True,
            "day_template": conceptual["day_template"],
            "window_count": state.schedule.get("day_population", {}).get("window_count", 0),
            "conceptual_block_count": len(conceptual_blocks),
        }
        self._record_commit(
            state,
            phase="finalize_conceptual_schedule",
            title="Finalized the conceptual schedule",
            body="Assembled the current v2 schedule truth into a conceptual schedule artifact ready for timer-side execution shaping.",
        )

    def fill_quick_wins(self, state: KairosV2RunState) -> None:
        """
        Phase 12b: fill small residual gaps with quick wins.

        Quick wins are the last fill layer. They never shape the day. They only
        opportunistically use small residual gaps after the real structure is
        already known.
        """
        settings = state.gathered.get("settings", {}).get("quick_wins_settings", {}) or {}
        max_minutes = int(settings.get("max_minutes") or 15)
        quick_label = self._normalize_token(settings.get("quick_label") or "quick")
        post_relief_layout = state.schedule.get("post_relief_layout", {})
        if isinstance(post_relief_layout, dict) and post_relief_layout:
            gaps = list(post_relief_layout.get("residual_gaps", []))
        else:
            gaps = list(
                state.schedule.get("remaining_structure_placement", {}).get("residual_gaps", [])
                if isinstance(state.schedule.get("remaining_structure_placement"), dict)
                else []
            )
        viable_candidates = list(
            state.schedule.get("reality_filtered_candidates", {}).get("candidates", [])
            if isinstance(state.schedule.get("reality_filtered_candidates"), dict)
            else []
        )
        already_selected = {
            str(item.get("identity") or "").strip()
            for item in self._iter_placed_children(state)
            if str(item.get("identity") or "").strip()
        }

        quick_gap_fills = []
        for gap in gaps:
            gap_minutes = int(gap.get("duration_minutes") or 0)
            if gap_minutes <= 0 or gap_minutes > max_minutes:
                continue

            eligible = []
            for candidate in viable_candidates:
                identity = str(candidate.get("identity") or "")
                if not identity or identity in already_selected:
                    continue
                duration = self._coerce_minutes(candidate.get("duration"))
                if duration is None or duration <= 0 or duration > gap_minutes:
                    continue

                tags = [self._normalize_token(tag) for tag in (candidate.get("tags") or [])]
                quick_bonus = 50.0 if quick_label and quick_label in tags else 0.0
                score = quick_bonus + self._urgency_bonus(candidate, state.target_date)
                eligible.append({"candidate": candidate, "score": score, "duration": duration})

            eligible.sort(key=lambda item: (-item["score"], item["duration"], item["candidate"].get("name", "")))

            chosen = []
            used = 0
            gap_start_minutes = self._parse_hm(gap.get("start_time")) or 0
            for row in eligible:
                duration = int(row["duration"])
                if used + duration > gap_minutes:
                    continue
                chosen.append(
                    self._build_timed_selected_item(
                        row["candidate"],
                        start_minutes=gap_start_minutes + used,
                        duration_minutes=duration,
                        extra_fields={"score": row["score"]},
                    )
                )
                already_selected.add(str(row["candidate"].get("identity")))
                used += duration

            quick_gap_fills.append(
                {
                    "gap_start_time": gap.get("start_time"),
                    "gap_end_time": gap.get("end_time"),
                    "gap_duration_minutes": gap_minutes,
                    "selected_minutes": used,
                    "selected": chosen,
                }
            )

        state.schedule["quick_wins"] = {
            "max_minutes": max_minutes,
            "quick_label": quick_label,
            "fills": quick_gap_fills,
        }
        state.phase_notes["fill_quick_wins"] = {
            "gap_fill_count": len(quick_gap_fills),
            "total_selected_items": sum(len(fill.get("selected", [])) for fill in quick_gap_fills),
        }
        self._record_commit(
            state,
            phase="fill_quick_wins",
            title="Applied the quick-win fill layer",
            body="Tried to use only small residual gaps for quick-win items after the main day structure was already established.",
        )

    def run_pressure_relief_pipeline(self, state: KairosV2RunState) -> None:
        """
        Phase 12aa: run the pressure-relief pipeline.

        Current implemented shape:
        - mini substitution evaluation
        - authored free time consumption status
        - emergent gap consumption status
        - trim/cut opportunity discovery

        This is still an early v2 implementation. It reports honest current
        relief options and applies only what the current authored data can
        support.
        """
        placement = state.schedule.get("remaining_structure_placement", {}) if isinstance(state.schedule.get("remaining_structure_placement"), dict) else {}
        overflow_items = list(placement.get("overflow_items", []))

        mini_substitutions = self._find_available_mini_substitutions(overflow_items)
        overflow_items_after_minis, mini_actions = self._apply_mini_substitutions_to_overflow_items(
            overflow_items,
            mini_substitutions,
        )
        trimmables = self._find_trimmable_items(state)
        cuttables = self._find_cuttable_items(state)
        category_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("category_settings", {}) or {}).get("Category_Settings", {}),
            rank_key="value",
        )
        priority_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("priority_settings", {}) or {}).get("Priority_Settings", {}),
            rank_key="value",
        )
        happiness_weights = self._normalize_happiness_map(
            state.gathered.get("settings", {}).get("map_of_happiness", {}) or {}
        )
        factor_weights = self._priority_factor_weights(state)
        relief_plan = self._plan_pressure_relief_actions(
            overflow_items=overflow_items_after_minis,
            placed_children=self._iter_placed_children(state),
            category_weights=category_weights,
            priority_weights=priority_weights,
            happiness_weights=happiness_weights,
            priority_factor_weights=factor_weights,
            target_date=state.target_date,
            mini_actions=mini_actions,
            repair_trim_enabled=bool(self.user_context.get("repair_trim", True)),
            repair_cut_enabled=bool(self.user_context.get("repair_cut", True)),
            repair_min_duration=int(self.user_context.get("repair_min_duration", 5) or 5),
            repair_cut_threshold=self.user_context.get("repair_cut_threshold"),
            overflow_minutes_before_minis=sum(int(item.get("duration_minutes") or 0) for item in overflow_items),
        )
        applied_layout = self._apply_pressure_relief_plan(state, relief_plan)
        applied_layout = self._repack_overflow_after_relief(
            applied_layout,
            list(relief_plan.get("overflow_items_for_repack", overflow_items_after_minis)),
        )
        free_time_remaining = sum(int(p.get("remaining_minutes") or 0) for p in placement.get("free_block_placements", []))
        gap_time_remaining = sum(int(g.get("duration_minutes") or 0) for g in placement.get("residual_gaps", []))
        buffer_time_remaining = sum(int(g.get("duration_minutes") or 0) for g in placement.get("residual_buffers", []))

        state.schedule["pressure_relief"] = {
            "overflow_count": len(overflow_items),
            "overflow_minutes": sum(int(item.get("duration_minutes") or 0) for item in overflow_items),
            "mini_substitutions": mini_substitutions,
            "mini_actions": mini_actions,
            "authored_free_time_remaining_minutes": free_time_remaining,
            "emergent_gap_remaining_minutes": gap_time_remaining,
            "buffer_remaining_minutes": buffer_time_remaining,
            "trimmables": trimmables,
            "cuttables": cuttables,
            "relief_plan": relief_plan,
            "applied_layout": applied_layout,
            "status": "planned_non_destructive_relief_actions",
        }
        state.phase_notes["run_pressure_relief_pipeline"] = {
            "overflow_count": len(overflow_items),
            "mini_substitution_count": len(mini_substitutions),
            "mini_action_count": len(mini_actions),
            "trimmable_count": len(trimmables),
            "cuttable_count": len(cuttables),
            "planned_relief_action_count": len(relief_plan.get("actions", [])),
            "remaining_overflow_minutes_after_plan": relief_plan.get("remaining_overflow_minutes_after_plan"),
            "applied_gap_residual_count": len(applied_layout.get("residual_gaps", [])),
            "remaining_overflow_minutes_after_repack": applied_layout.get("remaining_overflow_minutes_after_repack"),
        }
        self._record_commit(
            state,
            phase="run_pressure_relief_pipeline",
            title="Evaluated the pressure-relief pipeline",
            body="Planned mini substitution, remaining free time, remaining gaps, remaining buffers, and least-important-first trim/cut actions so overflow can be resolved in the intended order.",
        )

    def place_remaining_structure(self, state: KairosV2RunState) -> None:
        """
        Phase 12a: place remaining structured content into authored slack first.

        This is the first real ordered placement pass for the untimed structured
        day content:
        1. explicit authored free blocks
        2. remaining emergent gaps
        3. leave overflow visible if it still does not fit
        """
        expanded_nodes = list(
            state.schedule.get("day_population", {}).get("expanded_nodes", [])
            if isinstance(state.schedule.get("day_population"), dict)
            else []
        )
        viable_candidates = list(
            state.schedule.get("reality_filtered_candidates", {}).get("candidates", [])
            if isinstance(state.schedule.get("reality_filtered_candidates"), dict)
            else []
        )
        selected_identities = self._selected_candidate_identities(state)
        active_window_identities = {
            str(window.get("window_identity") or self._window_identity_for_node(window)).strip()
            for window in (
                state.schedule.get("day_population", {}).get("active_window_nodes", [])
                if isinstance(state.schedule.get("day_population"), dict)
                else []
            )
            if isinstance(window, dict)
            and str(window.get("window_identity") or self._window_identity_for_node(window)).strip()
        }
        active_fixed_time_identities = {
            str(node.get("identity") or self._candidate_identity_for_node(node)).strip()
            for node in (
                state.schedule.get("day_population", {}).get("active_fixed_time_nodes", [])
                if isinstance(state.schedule.get("day_population"), dict)
                else []
            )
            if isinstance(node, dict)
            and str(node.get("identity") or self._candidate_identity_for_node(node)).strip()
        }
        structural_sequence = self._build_ordered_structural_sequence(
            expanded_nodes,
            viable_candidates,
            selected_identities,
            active_window_identities,
        )
        structural_identities = {
            str(item.get("identity") or "").strip()
            for item in structural_sequence
            if str(item.get("identity") or "").strip()
        }
        flexible_sequence = self._build_flexible_candidate_sequence(
            state=state,
            viable_candidates=viable_candidates,
            excluded_identities=selected_identities.union(structural_identities).union(active_fixed_time_identities),
        )
        placement_sequence = structural_sequence + flexible_sequence

        free_surfaces = [
            dict(block) for block in (
                state.schedule.get("gap_buffer_recovery", {}).get("explicit_free_blocks", [])
                if isinstance(state.schedule.get("gap_buffer_recovery"), dict)
                else []
            )
        ]
        gap_surfaces = [
            dict(gap) for gap in (
                state.schedule.get("gap_buffer_recovery", {}).get("emergent_gaps", [])
                if isinstance(state.schedule.get("gap_buffer_recovery"), dict)
                else []
            )
        ]
        buffer_surfaces = [
            dict(block) for block in (
                state.schedule.get("gap_buffer_recovery", {}).get("explicit_buffer_blocks", [])
                if isinstance(state.schedule.get("gap_buffer_recovery"), dict)
                else []
            )
        ]

        free_placements, remaining_after_free = self._fill_surfaces_with_sequence(
            surfaces=free_surfaces,
            sequence=placement_sequence,
            surface_kind="free_block",
        )
        gap_placements, remaining_after_gaps = self._fill_surfaces_with_sequence(
            surfaces=gap_surfaces,
            sequence=remaining_after_free,
            surface_kind="gap",
        )
        buffer_placements, remaining_after_buffers = self._fill_surfaces_with_sequence(
            surfaces=buffer_surfaces,
            sequence=remaining_after_gaps,
            surface_kind="buffer",
        )

        residual_gaps = [
            {
                "start_time": placement.get("residual_start_time"),
                "end_time": placement.get("end_time"),
                "duration_minutes": placement.get("remaining_minutes"),
            }
            for placement in gap_placements
            if int(placement.get("remaining_minutes") or 0) > 0 and placement.get("residual_start_time")
        ]
        residual_buffers = [
            {
                "start_time": placement.get("residual_start_time"),
                "end_time": placement.get("end_time"),
                "duration_minutes": placement.get("remaining_minutes"),
            }
            for placement in buffer_placements
            if int(placement.get("remaining_minutes") or 0) > 0 and placement.get("residual_start_time")
        ]

        state.schedule["remaining_structure_placement"] = {
            "structural_sequence_count": len(structural_sequence),
            "flexible_sequence_count": len(flexible_sequence),
            "free_block_placements": free_placements,
            "gap_placements": gap_placements,
            "buffer_placements": buffer_placements,
            "residual_gaps": residual_gaps,
            "residual_buffers": residual_buffers,
            "overflow_items": remaining_after_buffers,
        }
        state.phase_notes["place_remaining_structure"] = {
            "ordered_item_count": len(placement_sequence),
            "structural_sequence_count": len(structural_sequence),
            "flexible_sequence_count": len(flexible_sequence),
            "free_block_placement_count": len(free_placements),
            "gap_placement_count": len(gap_placements),
            "buffer_placement_count": len(buffer_placements),
            "overflow_count": len(remaining_after_buffers),
        }
        self._record_commit(
            state,
            phase="place_remaining_structure",
            title="Placed remaining structured content into slack surfaces",
            body="Placed ordered untimed structured content into authored free time first, then emergent gaps, then authored buffers, and left overflow visible when it still did not fit.",
        )

    def build_timer_handoff(self, state: KairosV2RunState) -> None:
        """
        Phase 14: hand the conceptual schedule to the timer.

        The timer owns the final chopping and execution pacing. Kairos should
        hand over structure, not swallow timer responsibilities.
        """
        timer_profiles = self._load_yaml("settings", "timer_profiles.yml") or {}
        timer_state = read_template(os.path.join(USER_DIR, "timers", "state.yml")) or {}
        requested_profile = str(self.user_context.get("timer_profile") or "").strip()
        current_profile = (
            requested_profile
            or str(timer_state.get("profile_name") or "").strip()
            or next(iter(timer_profiles.keys()), None)
        )

        handoff = {
            "ready": True,
            "profile_name": current_profile,
            "profile": timer_profiles.get(current_profile) if isinstance(timer_profiles, dict) else None,
            "available_profile_count": len(timer_profiles) if isinstance(timer_profiles, dict) else 0,
            "conceptual_schedule": state.schedule.get("conceptual_schedule"),
            "conceptual_block_count": len(
                state.schedule.get("conceptual_schedule", {}).get("conceptual_blocks", [])
                if isinstance(state.schedule.get("conceptual_schedule"), dict)
                else []
            ),
            "execution_units": self._build_timer_execution_units(state),
            "timer_owns_execution_shaping": True,
        }
        handoff["execution_unit_count"] = len(handoff["execution_units"])
        handoff["active_execution_unit"] = self._active_execution_unit(handoff["execution_units"], state)
        handoff["next_execution_unit"] = self._next_execution_unit(handoff["execution_units"], state)
        state.schedule["timer_handoff"] = handoff
        state.phase_notes["build_timer_handoff"] = {
            "ready": True,
            "profile_name": current_profile,
            "available_profile_count": len(timer_profiles) if isinstance(timer_profiles, dict) else 0,
            "execution_unit_count": handoff["execution_unit_count"],
            "active_execution_unit": (
                (handoff.get("active_execution_unit") or {}).get("name")
                if isinstance(handoff.get("active_execution_unit"), dict)
                else None
            ),
            "next_execution_unit": (
                (handoff.get("next_execution_unit") or {}).get("name")
                if isinstance(handoff.get("next_execution_unit"), dict)
                else None
            ),
        }
        self._record_commit(
            state,
            phase="build_timer_handoff",
            title="Prepared the timer handoff",
            body="Packaged the conceptual schedule for the timer so execution pacing and block chopping stay on the timer side of the boundary.",
        )

    def persist_decision_log_artifact(self, state: KairosV2RunState) -> None:
        """
        Final artifact pass: write the Markdown decision log to disk.

        The spec treats Kairos's decision log as a real product artifact, not
        just an in-memory debug string, so this phase persists it after the run
        has enough structure to be meaningful.
        """
        logs_dir = os.path.join(USER_DIR, "logs")
        os.makedirs(logs_dir, exist_ok=True)
        timestamp = state.now.strftime("%Y%m%d_%H%M%S")
        filename = f"kairos_v2_decision_log_{timestamp}.md"
        path = os.path.join(logs_dir, filename)
        markdown = self._render_decision_log_markdown(state)

        with open(path, "w", encoding="utf-8") as handle:
            handle.write(markdown)

        latest_path = os.path.join(logs_dir, "kairos_v2_decision_log_latest.md")
        with open(latest_path, "w", encoding="utf-8") as handle:
            handle.write(markdown)

        state.schedule["decision_log_artifact"] = {
            "written": True,
            "path": path,
            "latest_path": latest_path,
        }
        state.phase_notes["persist_decision_log_artifact"] = {
            "written": True,
            "path": path,
            "latest_path": latest_path,
        }

    def model_day_budget(self, state: KairosV2RunState) -> None:
        """
        Phase 7: model the remaining day budget.

        Kairos treats time as a budget, not just as positions on a clock. After
        sleep and hard anchors are known, the engine can already describe how
        much open time realistically remains before the next sleep boundary.
        """
        chosen = state.schedule.get("day_template")
        template = chosen.get("template") if isinstance(chosen, dict) else {}
        sleep_anchor = self._find_primary_sleep_anchor(template or {}, state.target_date)
        anchor_skeleton = state.schedule.get("anchor_skeleton", {})
        anchors = anchor_skeleton.get("anchors", []) if isinstance(anchor_skeleton, dict) else []
        current_minutes = int(state.reality.get("minutes_elapsed_since_start_of_day") or 0)
        target_sleep_minutes = int(state.sleep.get("target_sleep_minutes") or 0)

        if sleep_anchor and sleep_anchor.get("start_minutes") is not None:
            sleep_boundary_minutes = int(sleep_anchor["start_minutes"])
            sleep_boundary_source = "sleep_anchor"
        else:
            sleep_boundary_minutes = max(0, (24 * 60) - target_sleep_minutes)
            sleep_boundary_source = "target_sleep_minutes_fallback"

        if state.target_date == state.now.date():
            floor_minutes = max(current_minutes, self._sleep_policy_floor_minutes(state))
        else:
            floor_minutes = 0
        remaining_minutes_before_sleep = max(0, sleep_boundary_minutes - floor_minutes)
        remaining_anchor_minutes = 0
        for anchor in anchors:
            anchor_start = anchor.get("start_minutes")
            anchor_end = anchor.get("end_minutes")
            if anchor_start is None:
                continue
            if anchor_end is None and anchor.get("duration_minutes") is not None:
                anchor_end = int(anchor_start) + int(anchor.get("duration_minutes") or 0)
            if anchor_end is None:
                continue
            effective_start = max(int(anchor_start), floor_minutes)
            effective_end = min(int(anchor_end), sleep_boundary_minutes)
            if effective_end <= effective_start:
                continue
            remaining_anchor_minutes += effective_end - effective_start

        open_flexible_minutes = max(0, remaining_minutes_before_sleep - remaining_anchor_minutes)
        state.schedule["day_budget"] = {
            "sleep_boundary_minutes": sleep_boundary_minutes,
            "sleep_boundary_time": self._minutes_to_hm(sleep_boundary_minutes),
            "sleep_boundary_source": sleep_boundary_source,
            "remaining_minutes_before_sleep": remaining_minutes_before_sleep,
            "remaining_anchor_minutes_before_sleep": remaining_anchor_minutes,
            "open_flexible_minutes_before_sleep": open_flexible_minutes,
        }
        state.phase_notes["model_day_budget"] = {
            "sleep_boundary_time": self._minutes_to_hm(sleep_boundary_minutes),
            "remaining_minutes_before_sleep": remaining_minutes_before_sleep,
            "remaining_anchor_minutes_before_sleep": remaining_anchor_minutes,
            "open_flexible_minutes_before_sleep": open_flexible_minutes,
        }
        self._record_commit(
            state,
            phase="model_day_budget",
            title="Modeled the remaining day budget",
            body="Turned the sleep boundary and hard anchors into a concrete remaining-time budget before the day closes.",
        )

    def _resolve_now(self) -> datetime:
        """
        Resolve the current timestamp for this run.

        Tests or future tooling may pass `now` directly in user_context so the
        first phases can be exercised deterministically.
        """
        override = self.user_context.get("now")
        if isinstance(override, datetime):
            return override
        if isinstance(override, str):
            try:
                return datetime.fromisoformat(override)
            except ValueError:
                pass
        return datetime.now()

    def _load_yaml(self, *parts: str) -> Any:
        """
        Read a YAML file from the user directory.

        The scheduler already has helper utilities in legacy code. We reuse them
        here so the file layout stays consistent while the v2 architecture grows.
        """
        path = os.path.join(USER_DIR, *parts)
        if not os.path.exists(path):
            return None
        return read_template(path)

    def _normalize_weighted_priorities(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Normalize the reduced v2 scheduling priorities file into a simple list.

        The spec already decided this file should only contain true weighted
        influences, not hard constraints or structural rules.
        """
        rows = payload.get("Scheduling_Priorities", []) if isinstance(payload, dict) else []
        normalized: List[Dict[str, Any]] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            normalized.append(
                {
                    "name": str(row.get("Name") or "").strip(),
                    "order": int(row.get("Order") or 0),
                    "rank": int(row.get("Rank") or 0),
                    "description": str(row.get("Description") or "").strip(),
                }
            )
        normalized.sort(key=lambda item: (item["order"], -item["rank"], item["name"]))
        return normalized

    def _priority_factor_weights(self, state: KairosV2RunState) -> Dict[str, float]:
        """
        Convert the reduced scheduling priority list into a simple factor map.

        The v2 priorities file now only contains true weighted influences, so
        these ranks should directly shape local selection and sacrifice logic.
        """
        factors: Dict[str, float] = {}
        for row in state.reality.get("weighted_priorities", []) if isinstance(state.reality.get("weighted_priorities"), list) else []:
            name = self._normalize_token(row.get("name"))
            rank = float(row.get("rank") or 0.0)
            if name and rank > 0:
                factors[name] = rank
        return factors

    def _apply_status_overrides(self, current_status: Any, overrides: Any) -> Dict[str, Any]:
        """
        Apply runtime status overrides from CLI/dashboard context.

        Kairos should reason from the effective current status for this run,
        not only from whatever was last persisted on disk.
        """
        base = dict(current_status) if isinstance(current_status, dict) else {}
        if not isinstance(overrides, dict):
            return base
        for key, value in overrides.items():
            normalized_key = self._normalize_token(key)
            if normalized_key:
                base[normalized_key] = value
        return base

    def _manual_injections(self) -> List[Dict[str, Any]]:
        """
        Return normalized per-run manual injections passed in from `today`.
        """
        raw = self.user_context.get("manual_injections")
        if not isinstance(raw, list):
            return []

        out: List[Dict[str, Any]] = []
        for row in raw:
            if not isinstance(row, dict):
                continue
            name = str(row.get("name") or "").strip()
            if not name:
                continue
            item_type = str(row.get("type") or "task").strip().lower() or "task"
            start_time = str(row.get("start_time") or "").strip() or None
            mode = str(row.get("mode") or ("hard" if start_time else "soft")).strip().lower()
            if mode not in {"hard", "soft"}:
                mode = "hard" if start_time else "soft"
            out.append(
                {
                    "name": name,
                    "type": item_type,
                    "start_time": start_time,
                    "mode": mode,
                    "force": bool(row.get("force")),
                    "override_anchor": bool(row.get("override_anchor")),
                    "source": str(row.get("source") or "manual_cli").strip() or "manual_cli",
                }
            )
        return out

    def _manual_adjustments(self) -> List[Dict[str, Any]]:
        """
        Return normalized per-run manual trim/cut/change requests.
        """
        raw = self.user_context.get("manual_adjustments")
        if not isinstance(raw, list):
            return []

        out: List[Dict[str, Any]] = []
        for row in raw:
            if not isinstance(row, dict):
                continue
            action = str(row.get("action") or "").strip().lower()
            if action not in {"trim", "cut", "change"}:
                continue
            name = str(row.get("name") or "").strip()
            if not name:
                continue
            normalized = {
                "action": action,
                "name": name,
                "type": str(row.get("type") or "").strip().lower() or None,
                "source": str(row.get("source") or "manual_cli").strip() or "manual_cli",
            }
            if action == "trim":
                try:
                    normalized["amount"] = max(0, int(row.get("amount") or 0))
                except Exception:
                    continue
            elif action == "change":
                new_start_time = str(row.get("new_start_time") or "").strip()
                if not new_start_time:
                    continue
                normalized["new_start_time"] = new_start_time
            out.append(normalized)
        return out

    def _matching_manual_adjustments(self, candidate: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Return manual adjustments that target this candidate by name/type.
        """
        name_key = self._normalize_token(candidate.get("name"))
        type_key = self._normalize_token(candidate.get("type"))
        if not name_key:
            return []

        matches: List[Dict[str, Any]] = []
        for adjustment in self._manual_adjustments():
            adjustment_name = self._normalize_token(adjustment.get("name"))
            if adjustment_name != name_key:
                continue
            adjustment_type = self._normalize_token(adjustment.get("type"))
            if adjustment_type and type_key and adjustment_type != type_key:
                continue
            matches.append(dict(adjustment))
        return matches

    def _apply_manual_adjustments_to_candidate(
        self,
        candidate: Dict[str, Any],
    ) -> tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Apply trim/cut/change directives to a v2 candidate record.

        `change` is consumed by the early anchor phase, so at candidate scope it
        simply suppresses the original flexible copy to avoid duplicates.
        """
        target = dict(candidate or {})
        events: List[Dict[str, Any]] = []
        adjustments = self._matching_manual_adjustments(target)
        if not adjustments:
            return target, events

        for adjustment in adjustments:
            action = str(adjustment.get("action") or "").strip().lower()
            if action == "cut":
                events.append(
                    {
                        "action": "cut",
                        "name": target.get("name"),
                        "type": target.get("type"),
                        "source": adjustment.get("source"),
                    }
                )
                return None, events

            if action == "trim":
                current_duration = self._coerce_minutes(target.get("duration")) or 0
                trim_amount = max(0, int(adjustment.get("amount") or 0))
                trimmed_duration = max(0, current_duration - trim_amount)
                if current_duration <= 0 or trimmed_duration < 5:
                    events.append(
                        {
                            "action": "trim_skipped",
                            "name": target.get("name"),
                            "type": target.get("type"),
                            "amount": trim_amount,
                            "reason": "min_duration",
                            "source": adjustment.get("source"),
                        }
                    )
                    continue
                target["duration"] = trimmed_duration
                events.append(
                    {
                        "action": "trim",
                        "name": target.get("name"),
                        "type": target.get("type"),
                        "from_duration": current_duration,
                        "to_duration": trimmed_duration,
                        "source": adjustment.get("source"),
                    }
                )
                continue

            if action == "change":
                events.append(
                    {
                        "action": "change",
                        "name": target.get("name"),
                        "type": target.get("type"),
                        "new_start_time": adjustment.get("new_start_time"),
                        "source": adjustment.get("source"),
                    }
                )
                return None, events

        return target, events

    def _find_schedulable_by_name_and_type(self, name: Any, item_type: Any = None) -> Optional[Dict[str, Any]]:
        """
        Resolve a schedulable library item by loose name/type matching.
        """
        wanted_name = str(name or "").strip().lower()
        wanted_type = str(item_type or "").strip().lower()
        if not wanted_name:
            return None

        for item in self._iter_schedulable_library_items():
            candidate_name = str(item.get("name") or "").strip().lower()
            candidate_type = str(item.get("type") or "").strip().lower()
            if candidate_name != wanted_name:
                continue
            if wanted_type and candidate_type and candidate_type != wanted_type:
                continue
            return item
        return None

    def _build_manual_runtime_node(self, name: Any, item_type: Any = None) -> Dict[str, Any]:
        """
        Build a runtime node for a manual request from authored data or a stub.
        """
        resolved = self._find_schedulable_by_name_and_type(name, item_type)
        if isinstance(resolved, dict):
            node = dict(resolved)
        else:
            node = {
                "name": str(name or "Manual Item").strip() or "Manual Item",
                "type": str(item_type or "task").strip().lower() or "task",
                "duration": 30,
            }
        if self._coerce_minutes(node.get("duration")) is None:
            node["duration"] = 30
        return node

    def _build_manual_anchor_from_request(
        self,
        request: Dict[str, Any],
        state: KairosV2RunState,
        *,
        start_key: str = "start_time",
        source_rule: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Build a hard-anchor record from a manual request or change directive.
        """
        if not isinstance(request, dict):
            return None
        start_time = str(request.get(start_key) or "").strip()
        if not start_time:
            return None

        runtime_node = self._build_manual_runtime_node(
            request.get("name"),
            request.get("type"),
        )
        start_minutes = self._parse_hm(start_time)
        duration_minutes = self._coerce_minutes(runtime_node.get("duration")) or 30
        if start_minutes is None or duration_minutes <= 0:
            return None

        anchor_node = dict(runtime_node)
        anchor_node["name"] = str(request.get("name") or runtime_node.get("name") or "Manual Item").strip()
        anchor_node["type"] = str(request.get("type") or runtime_node.get("type") or "task").strip().lower() or "task"
        anchor_node["start_time"] = start_time
        anchor_node["end_time"] = self._minutes_to_hm(start_minutes + duration_minutes)
        anchor_node["duration"] = duration_minutes
        anchor_node["reschedule"] = "never"

        normalized = self._normalize_anchor(anchor_node, state.target_date)
        normalized["source_rule"] = source_rule
        normalized["manual"] = True
        normalized["source"] = str(request.get("source") or "manual_cli").strip() or "manual_cli"
        return normalized

    def _build_template_selection_preferences(self) -> Dict[str, Any]:
        """
        Normalize user-supplied selection preferences for template choice.

        This is intentionally small and honest for the current v2 pass:
        - `prioritize` key/value pairs are the main preference surface
        - a few direct keys are also allowed for convenience
        """
        preferences: Dict[str, Any] = {}
        prioritize = self.user_context.get("prioritize")
        if isinstance(prioritize, dict):
            for key, value in prioritize.items():
                normalized_key = self._normalize_token(key)
                if normalized_key and value is not None and str(value).strip():
                    preferences[normalized_key] = value

        for key in ("category", "theme", "planet", "priority", "priority_property", "happiness"):
            value = self.user_context.get(key)
            if value is not None and str(value).strip():
                preferences.setdefault(self._normalize_token(key), value)

        custom_property = self.user_context.get("custom_property")
        if custom_property is not None and str(custom_property).strip():
            preferences["_custom_property_presence"] = str(custom_property).strip()

        return preferences

    def _score_template_preference_matches(
        self,
        template: Dict[str, Any],
        state: KairosV2RunState,
    ) -> Dict[str, Any]:
        """
        Score authored template properties against runtime preferences.

        This is the property-driven half of template selection:
        flags and authored properties should matter before we fall back to
        simple filename/order behavior.
        """
        preferences = state.reality.get("selection_preferences", {}) or {}
        if not isinstance(preferences, dict) or not preferences:
            return {"score": 0.0, "matched_preferences": []}

        category_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("category_settings", {}) or {}).get("Category_Settings", {}),
            rank_key="value",
        )
        priority_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("priority_settings", {}) or {}).get("Priority_Settings", {}),
            rank_key="value",
        )
        happiness_weights = self._normalize_happiness_map(
            state.gathered.get("settings", {}).get("map_of_happiness", {}) or {}
        )

        score = 0.0
        matched_preferences: List[Dict[str, Any]] = []

        for raw_key, desired_value in preferences.items():
            if raw_key == "_custom_property_presence":
                prop_name = self._normalize_token(desired_value)
                if self._template_has_property_presence(template, prop_name):
                    score += 5.0
                    matched_preferences.append({"key": raw_key, "value": prop_name})
                continue

            if not self._template_property_matches(template, raw_key, desired_value):
                continue

            normalized_value = self._normalize_token(desired_value)
            bonus = 15.0
            if raw_key == "category" and normalized_value in category_weights:
                bonus += float(category_weights[normalized_value]["weight"]) * 5.0
            elif raw_key in {"priority", "priority_property"} and normalized_value in priority_weights:
                bonus += float(priority_weights[normalized_value]["weight"]) * 3.0
            elif raw_key == "happiness" and normalized_value in happiness_weights:
                bonus += float(happiness_weights[normalized_value]["weight"]) * 4.0
            elif raw_key == "planet":
                bonus += 10.0

            score += bonus
            matched_preferences.append({"key": raw_key, "value": desired_value, "bonus": bonus})

        return {"score": score, "matched_preferences": matched_preferences}

    def _template_property_matches(self, template: Dict[str, Any], key: str, desired_value: Any) -> bool:
        """
        Return whether a template property satisfies a desired runtime value.
        """
        desired_token = self._normalize_token(desired_value)
        actual_values = self._template_property_values(template, key)
        if not actual_values:
            return False
        actual_tokens: List[str] = []
        for actual_value in actual_values:
            if isinstance(actual_value, list):
                actual_tokens.extend(self._normalize_token(value) for value in actual_value if self._normalize_token(value))
            else:
                token = self._normalize_token(actual_value)
                if token:
                    actual_tokens.append(token)
        return desired_token in actual_tokens

    def _template_property_values(self, template: Dict[str, Any], key: str) -> List[Any]:
        """
        Return authored values for a template property across supported surfaces.

        v2 should not assume every author stores properties in exactly one flat
        YAML shape. We look at top-level fields first and also at a nested
        `properties:` map when present.
        """
        normalized_key = self._normalize_token(key)
        if not normalized_key or not isinstance(template, dict):
            return []

        values: List[Any] = []
        for raw_key, raw_value in template.items():
            if self._normalize_token(raw_key) == normalized_key:
                values.append(raw_value)

        nested_properties = template.get("properties")
        if isinstance(nested_properties, dict):
            for raw_key, raw_value in nested_properties.items():
                if self._normalize_token(raw_key) == normalized_key:
                    values.append(raw_value)

        if normalized_key in {"weekday", "weekday_name", "day"}:
            authored_days = template.get("days")
            if isinstance(authored_days, list):
                values.extend(authored_days)
            elif authored_days is not None:
                values.append(authored_days)

        return values

    def _template_has_property_presence(self, template: Dict[str, Any], key: str) -> bool:
        """
        Return whether a template explicitly carries a named authored property.
        """
        normalized_key = self._normalize_token(key)
        if not normalized_key or not isinstance(template, dict):
            return False

        for raw_key, raw_value in template.items():
            if self._normalize_token(raw_key) != normalized_key:
                continue
            if isinstance(raw_value, bool):
                return raw_value
            return True

        nested_properties = template.get("properties")
        if isinstance(nested_properties, dict):
            for raw_key, raw_value in nested_properties.items():
                if self._normalize_token(raw_key) != normalized_key:
                    continue
                if isinstance(raw_value, bool):
                    return raw_value
                return True

        template_tags = self._extract_template_tags(template)
        return normalized_key in template_tags

    def _extract_template_tags(self, template: Dict[str, Any]) -> List[str]:
        """
        Extract normalized authored tags from a template.
        """
        tags: List[str] = []
        for container in (template, template.get("properties") if isinstance(template, dict) else None):
            if not isinstance(container, dict):
                continue
            raw_tags = container.get("tags")
            if isinstance(raw_tags, list):
                tags.extend(self._normalize_token(tag) for tag in raw_tags if self._normalize_token(tag))
            elif raw_tags is not None:
                token = self._normalize_token(raw_tags)
                if token:
                    tags.append(token)
        return tags

    def _normalize_ranked_map(self, payload: Dict[str, Any], *, rank_key: str) -> Dict[str, Dict[str, int]]:
        """
        Normalize a dict-style ranked settings map into rank/weight pairs.
        """
        normalized: Dict[str, Dict[str, int]] = {}
        max_rank = 0
        for raw_key, metadata in (payload or {}).items():
            if not isinstance(metadata, dict):
                continue
            rank = int(metadata.get(rank_key) or 0)
            max_rank = max(max_rank, rank)
            normalized[self._normalize_token(raw_key)] = {"rank": rank, "weight": 0}

        for value in normalized.values():
            value["weight"] = max(1, (max_rank + 1) - value["rank"])
        return normalized

    def _normalize_happiness_map(self, payload: Dict[str, Any]) -> Dict[str, Dict[str, int]]:
        """
        Normalize `map_of_happiness.yml` into rank/weight pairs.
        """
        rows = payload.get("map", []) if isinstance(payload, dict) else []
        normalized: Dict[str, Dict[str, int]] = {}
        max_rank = 0
        for row in rows:
            if not isinstance(row, dict):
                continue
            rank = int(row.get("priority") or 0)
            max_rank = max(max_rank, rank)
            normalized[self._normalize_token(row.get("key"))] = {"rank": rank, "weight": 0}

        for value in normalized.values():
            value["weight"] = max(1, (max_rank + 1) - value["rank"])
        return normalized

    def _extract_happiness_keys(self, candidate: Dict[str, Any]) -> List[str]:
        """
        Extract any authored happiness-alignment keys from a candidate.
        """
        raw = candidate.get("happiness")
        if raw is None:
            return []
        if isinstance(raw, list):
            return [self._normalize_token(value) for value in raw if self._normalize_token(value)]
        return [self._normalize_token(raw)] if self._normalize_token(raw) else []

    def _discover_eligible_day_templates(self, weekday_name: str) -> List[Dict[str, Any]]:
        """
        Return the day templates eligible for the target weekday.
        """
        templates: List[Dict[str, Any]] = []
        for path in list_all_day_templates():
            template = read_template(path)
            if not isinstance(template, dict):
                continue
            if not is_template_eligible_for_day(template, weekday_name):
                continue
            templates.append(
                {
                    "name": str(template.get("name") or os.path.splitext(os.path.basename(path))[0]).strip(),
                    "path": path,
                    "template": template,
                }
            )
        return templates

    def _discover_week_templates(self) -> List[Dict[str, Any]]:
        """
        Return the active authored week templates.
        """
        weeks_dir = os.path.join(USER_DIR, "weeks")
        templates: List[Dict[str, Any]] = []
        if not os.path.isdir(weeks_dir):
            return templates

        for filename in os.listdir(weeks_dir):
            if not filename.endswith(".yml"):
                continue
            path = os.path.join(weeks_dir, filename)
            template = read_template(path)
            if not isinstance(template, dict):
                continue
            if self._is_inactive_status(template):
                continue
            templates.append(
                {
                    "name": str(template.get("name") or os.path.splitext(filename)[0]).strip(),
                    "path": path,
                    "template": template,
                }
            )

        templates.sort(key=lambda item: item.get("name", "").lower())
        return templates

    def _select_forced_week_template(self, templates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Honor an explicit user-selected week template if one was provided.
        """
        requested = str(
            self.user_context.get("force_week_template")
            or self.user_context.get("week_template")
            or ""
        ).strip().lower()
        if not requested:
            return None

        for template in templates:
            template_name = str(template.get("name") or "").strip().lower()
            template_stem = os.path.splitext(os.path.basename(str(template.get("path") or "")))[0].lower()
            if requested in {template_name, template_stem}:
                return template
        return None

    def _resolve_day_template_reference(self, child: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Resolve a week child day reference back to the authored day template.
        """
        child_name = str(child.get("name") or "").strip().lower()
        child_name_token = self._normalize_token(child.get("name"))
        for path in list_all_day_templates():
            template = read_template(path)
            if not isinstance(template, dict):
                continue
            template_name = str(template.get("name") or "").strip().lower()
            template_name_token = self._normalize_token(template.get("name"))
            template_stem = os.path.splitext(os.path.basename(path))[0].lower()
            if child_name in {template_name, template_stem} or child_name_token in {template_name_token, template_stem}:
                return {
                    "name": str(template.get("name") or os.path.splitext(os.path.basename(path))[0]).strip(),
                    "path": path,
                    "template": template,
                }
        return None

    def _select_forced_template(self, templates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Honor an explicit user-selected template if one was provided.
        """
        requested = str(self.user_context.get("force_template") or "").strip().lower()
        if not requested:
            return None

        for template in templates:
            template_name = str(template.get("name") or "").strip().lower()
            template_stem = os.path.splitext(os.path.basename(str(template.get("path") or "")))[0].lower()
            if requested in {template_name, template_stem}:
                return template
        return None

    def _match_scored_template(
        self,
        template: Dict[str, Any],
        scored_templates: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """
        Resolve an already-chosen template against the scored candidate list.

        This keeps forced selections explainable by attaching the same scoring
        metadata the normal chooser would have produced.
        """
        wanted_path = str(template.get("path") or "").strip()
        wanted_name = str(template.get("name") or "").strip().lower()
        for candidate in scored_templates:
            candidate_path = str(candidate.get("path") or "").strip()
            candidate_name = str(candidate.get("name") or "").strip().lower()
            if wanted_path and candidate_path == wanted_path:
                return candidate
            if wanted_name and candidate_name == wanted_name:
                return candidate
        return None

    def _summarize_template_candidates(
        self,
        templates: List[Dict[str, Any]],
        *,
        include_status: bool = False,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Build a small human-readable template ranking summary.
        """
        summary: List[Dict[str, Any]] = []
        for template in templates[:limit]:
            row = {
                "name": template.get("name"),
                "path": template.get("path"),
                "property_preference_score": (template.get("property_preference") or {}).get("score", 0.0),
            }
            day_support = template.get("day_support") or {}
            if day_support:
                row["target_weekday_matches"] = day_support.get("target_weekday_matches")
                row["resolvable_day_count"] = day_support.get("resolvable_day_count")
            if include_status:
                status_alignment = template.get("status_alignment") or {}
                row["status_weighted_distance"] = status_alignment.get("weighted_distance")
                row["status_matched_dimensions"] = status_alignment.get("matched_dimensions")
            summary.append(row)
        return summary

    def _format_template_candidate_summary(self, summary: List[Dict[str, Any]]) -> str:
        """
        Turn a small candidate summary list into one readable sentence fragment.
        """
        if not summary:
            return "no viable candidates were available"

        parts: List[str] = []
        for row in summary:
            name = str(row.get("name") or "Unnamed Template")
            preference_score = row.get("property_preference_score", 0.0)
            if row.get("status_weighted_distance") is not None:
                parts.append(
                    f"{name} (preference {preference_score}, status distance {row.get('status_weighted_distance')})"
                )
            elif row.get("target_weekday_matches") is not None:
                parts.append(
                    f"{name} (preference {preference_score}, weekday support {row.get('target_weekday_matches')})"
                )
            else:
                parts.append(f"{name} (preference {preference_score})")
        return "; ".join(parts)

    def _score_week_template_day_support(
        self,
        template: Dict[str, Any],
        state: KairosV2RunState,
    ) -> Dict[str, int]:
        """
        Score whether a week template actually supports the current target day.

        Week choice should not just be "first active with nice properties". A
        week template that cannot resolve a real eligible day for the current
        weekday is structurally weaker than one that can.
        """
        children = template.get("children") or []
        weekday_name = str(state.reality.get("weekday_name") or state.now.strftime("%A").lower())
        total_day_refs = 0
        resolvable_day_count = 0
        target_weekday_matches = 0

        for child in children:
            if not isinstance(child, dict):
                continue
            if self._normalize_token(child.get("type")) != "day":
                continue
            total_day_refs += 1
            resolved = self._resolve_day_template_reference(child)
            if not isinstance(resolved, dict):
                continue
            resolvable_day_count += 1
            if is_template_eligible_for_day(resolved.get("template") or {}, weekday_name):
                target_weekday_matches += 1

        return {
            "target_weekday_matches": target_weekday_matches,
            "resolvable_day_count": resolvable_day_count,
            "total_day_refs": total_day_refs,
        }

    def _score_template_status_alignment(
        self,
        template: Dict[str, Any],
        current_status: Dict[str, Any],
        status_settings: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Score a template by closeness of status fit.

        Lower weighted distance is better.

        This is intentionally "closest match" rather than must-match. That
        follows the v2 design choice already captured in the spec and notes.
        """
        requirements = template.get("status_requirements") or {}
        ordered_dimensions = self._normalize_status_dimensions(status_settings)
        value_maps = self._load_status_value_maps()
        total_distance = 0
        matched_dimensions = 0
        considered_dimensions: List[Dict[str, Any]] = []

        for dimension in ordered_dimensions:
            key = dimension["key"]
            if key == "place":
                # Place/environment semantics are intentionally deferred.
                continue

            allowed = requirements.get(key)
            if not allowed:
                continue

            allowed_values = allowed if isinstance(allowed, list) else [allowed]
            current_value = current_status.get(key)
            current_score = value_maps.get(key, {}).get(self._normalize_token(current_value))
            allowed_scores = [
                value_maps.get(key, {}).get(self._normalize_token(value))
                for value in allowed_values
                if value_maps.get(key, {}).get(self._normalize_token(value)) is not None
            ]

            # If the status dimension is configured but the values are unknown,
            # we leave a note and treat it as weakly unresolved rather than
            # pretending we can compare it numerically.
            if current_score is None or not allowed_scores:
                considered_dimensions.append(
                    {
                        "dimension": key,
                        "matched": False,
                        "reason": "unresolved_value_mapping",
                    }
                )
                continue

            distance = min(abs(current_score - allowed_score) for allowed_score in allowed_scores)
            weight = dimension["weight"]
            weighted_distance = distance * weight
            total_distance += weighted_distance
            matched_dimensions += 1
            considered_dimensions.append(
                {
                    "dimension": key,
                    "matched": distance == 0,
                    "distance": distance,
                    "weighted_distance": weighted_distance,
                }
            )

        return {
            "weighted_distance": total_distance,
            "matched_dimensions": matched_dimensions,
            "considered_dimensions": considered_dimensions,
        }

    def _normalize_status_dimensions(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Convert status_settings.yml into ordered weighted dimensions.
        """
        rows = payload.get("Status_Settings", []) if isinstance(payload, dict) else []
        normalized: List[Dict[str, Any]] = []
        max_rank = 0
        for row in rows:
            if not isinstance(row, dict):
                continue
            rank = int(row.get("Rank") or 0)
            max_rank = max(max_rank, rank)
            normalized.append(
                {
                    "key": self._normalize_token(row.get("Name")),
                    "rank": rank,
                }
            )

        for row in normalized:
            # Lower rank means more important, so invert it into a stronger
            # weight. This keeps the logic simple and readable.
            row["weight"] = max(1, (max_rank + 1) - row["rank"])

        normalized.sort(key=lambda item: (item["rank"], item["key"]))
        return normalized

    def _attach_candidate_status_fit(
        self,
        candidate: Dict[str, Any],
        state: KairosV2RunState,
    ) -> Dict[str, Any]:
        """
        Attach local status-fit metadata to a candidate.

        The chosen template already carries most status reasoning by default.
        This local fit layer only matters when a candidate explicitly declares
        its own status requirements or overrides inherited ones.
        """
        enriched = dict(candidate)
        requirements = candidate.get("status_requirements")
        if not isinstance(requirements, dict) or not requirements:
            enriched["local_status_fit"] = {
                "has_explicit_requirements": False,
                "weighted_distance": 0,
                "matched_dimensions": 0,
            }
            return enriched

        fit = self._score_template_status_alignment(
            {"status_requirements": requirements},
            state.reality.get("current_status", {}) or {},
            state.gathered.get("settings", {}).get("status_settings", {}) or {},
        )
        enriched["local_status_fit"] = {
            "has_explicit_requirements": True,
            "weighted_distance": fit.get("weighted_distance", 0),
            "matched_dimensions": fit.get("matched_dimensions", 0),
            "considered_dimensions": fit.get("considered_dimensions", []),
        }
        return enriched

    def _load_status_value_maps(self) -> Dict[str, Dict[str, int]]:
        """
        Load the per-status ordered value maps from the user's settings.
        """
        value_maps: Dict[str, Dict[str, int]] = {}
        settings_dir = os.path.join(USER_DIR, "settings")
        if not os.path.isdir(settings_dir):
            return value_maps

        for filename in os.listdir(settings_dir):
            if not filename.endswith("_settings.yml"):
                continue
            if filename in {
                "status_settings.yml",
                "scheduling_settings.yml",
                "scheduling_priorities.yml",
                "priority_settings.yml",
                "category_settings.yml",
                "buffer_settings.yml",
                "quick_wins_settings.yml",
            }:
                continue

            path = os.path.join(settings_dir, filename)
            payload = read_template(path)
            if not isinstance(payload, dict) or len(payload) != 1:
                continue

            root_key = next(iter(payload.keys()))
            root = payload.get(root_key)
            if not isinstance(root, dict):
                continue

            dimension_key = self._normalize_token(filename.replace("_settings.yml", ""))
            value_maps[dimension_key] = {}
            for raw_value, metadata in root.items():
                if not isinstance(metadata, dict):
                    continue
                numeric = metadata.get("value")
                if isinstance(numeric, (int, float)):
                    value_maps[dimension_key][self._normalize_token(raw_value)] = int(numeric)

        return value_maps

    def _gather_sleep_inputs(self, target_date: date) -> Dict[str, Any]:
        """
        Gather the minimum sleep inputs needed for the first v2 phases.

        This intentionally stays simple:
        - target sleep is taken from the best available configured source
        - recent sleep history is derived from the last 7 days of completion
          files if they contain sleep-related entries

        More advanced sleep synthesis can replace this later without changing
        the top-level Kairos phase shape.
        """
        target_sleep_minutes = self._resolve_target_sleep_minutes()
        history: List[Dict[str, Any]] = []

        for day_offset in range(6, -1, -1):
            day = target_date - timedelta(days=day_offset)
            actual_minutes = self._read_sleep_minutes_from_completion_file(day)
            history.append(
                {
                    "date": day.isoformat(),
                    "target_minutes": target_sleep_minutes,
                    "actual_minutes": actual_minutes,
                }
            )

        return {
            "target_sleep_minutes": target_sleep_minutes,
            "sleep_history": history,
        }

    def _gather_trend_inputs(self) -> Dict[str, Any]:
        """
        Gather trend placeholders.

        Kairos v2 will eventually consume synthesized `trends.json` rather than
        directly reading raw `trends.db`. For now this is a stubbed boundary so
        the phase contract exists before the trend pipeline is implemented.
        """
        trends_json_path = os.path.join(USER_DIR, "data", "trends.json")
        trends_md_path = os.path.join(USER_DIR, "docs", "trends.md")
        return {
            "trends_json_path": trends_json_path,
            "trends_md_path": trends_md_path,
            "exists": os.path.exists(trends_json_path),
            "status": "placeholder_until_trends_pipeline_is_built",
        }

    def _resolve_target_sleep_minutes(self) -> int:
        """
        Resolve the user's target sleep duration.

        This uses the same flexible field style the dashboard already tolerates:
        multiple aliases are accepted because real user files are not always
        perfectly normalized yet.
        """
        explicit = self.user_context.get("target_sleep_minutes")
        if isinstance(explicit, (int, float)) and explicit > 0:
            return int(explicit)

        candidate_paths = [
            os.path.join(USER_DIR, "habits", "bedtime.yml"),
            os.path.join(USER_DIR, "examples", "habits", "sleep_7h_plus_example.yml"),
        ]

        for path in candidate_paths:
            node = read_template(path)
            minutes = self._extract_minutes_from_node(node)
            if minutes:
                return minutes

        # Fall back to a sane adult default if the user has not configured sleep
        # targets yet. This should eventually come from stronger onboarding data.
        return 8 * 60

    def _extract_minutes_from_node(self, node: Any) -> int:
        """
        Extract a target duration from a loose Chronos YAML node.
        """
        if not isinstance(node, dict):
            return 0

        # Common minute-style fields first.
        for key in ("target_sleep_minutes", "sleep_minutes", "target_minutes"):
            value = node.get(key)
            if isinstance(value, (int, float)) and value > 0:
                return int(value)

        # Common hour-style fields next.
        for key in ("target_sleep_hours", "sleep_hours", "target_hours"):
            value = node.get(key)
            if isinstance(value, (int, float)) and value > 0:
                return int(round(float(value) * 60))

        duration = node.get("duration")
        if isinstance(duration, (int, float)) and duration > 0:
            return int(duration)

        if isinstance(duration, str):
            text = duration.strip().lower()
            if text.endswith("h"):
                try:
                    return int(round(float(text[:-1]) * 60))
                except ValueError:
                    return 0
            if text.isdigit():
                return int(text)

        return 0

    def _read_sleep_minutes_from_completion_file(self, day: date) -> int:
        """
        Read sleep-like completion entries for a given day.

        This is intentionally a first-pass heuristic. It is enough to support the
        v2 sleep scaffold before a richer sleep mirror exists.
        """
        path = os.path.join(USER_DIR, "schedules", "completions", f"{day.isoformat()}.yml")
        payload = read_template(path)
        if not isinstance(payload, dict):
            return 0

        entries = payload.get("entries", payload)
        if not isinstance(entries, dict):
            return 0

        total = 0
        for entry in entries.values():
            if not isinstance(entry, dict):
                continue
            if not self._looks_like_sleep_entry(entry):
                continue
            total += self._extract_minutes_from_node(entry)
        return total

    def _read_completion_entries_for_day(self, day: date) -> Dict[str, Any]:
        """
        Read the raw completion entries for a given date.
        """
        path = os.path.join(USER_DIR, "schedules", "completions", f"{day.isoformat()}.yml")
        payload = read_template(path)
        if not isinstance(payload, dict):
            return {}
        entries = payload.get("entries", payload)
        return entries if isinstance(entries, dict) else {}

    def _completed_names_before_now(self, day: date, now: datetime) -> set[str]:
        """
        Return names completed on the target date up to the current runtime moment.

        This avoids using "future" completion events when deterministic test
        runs set `now` earlier in the day.
        """
        completed: set[str] = set()
        entries = self._read_completion_entries_for_day(day)
        for entry in entries.values():
            if not isinstance(entry, dict):
                continue
            status = str(entry.get("status") or "").strip().lower()
            if status != "completed":
                continue

            logged_at = str(entry.get("logged_at") or "").strip()
            if logged_at:
                try:
                    logged_dt = datetime.fromisoformat(logged_at)
                    if day == now.date() and logged_dt > now:
                        continue
                except ValueError:
                    pass

            name = str(entry.get("name") or entry.get("item_name") or "").strip().lower()
            if name:
                completed.add(name)
        return completed

    def _looks_like_sleep_entry(self, entry: Dict[str, Any]) -> bool:
        """
        Heuristic for whether a completion entry is sleep-related.
        """
        if entry.get("sleep") is True:
            return True
        category = str(entry.get("category") or "").strip().lower()
        name = str(entry.get("name") or entry.get("item_name") or "").strip().lower()
        tags = [str(tag or "").strip().lower() for tag in (entry.get("tags") or [])]
        return category == "sleep" or "sleep" in tags or "sleep" in name or "bedtime" in name

    def _derive_recovery_pressure(self, raw_sleep_debt_minutes: int, history: List[Dict[str, Any]]) -> str:
        """
        Turn raw sleep debt into a scheduler-facing urgency tier.

        The spec decided that Kairos should track both:
        - raw_sleep_debt: factual cumulative shortfall
        - recovery_pressure: how strongly sleep recovery should influence the day

        This first version stays simple and explainable rather than clever.
        """
        recent_short_nights = 0
        for entry in history[-3:]:
            if int(entry.get("actual_minutes") or 0) < int(entry.get("target_minutes") or 0):
                recent_short_nights += 1

        if raw_sleep_debt_minutes >= 8 * 60 or recent_short_nights == 3:
            return "critical"
        if raw_sleep_debt_minutes >= 5 * 60:
            return "high"
        if raw_sleep_debt_minutes >= 2 * 60 or recent_short_nights >= 2:
            return "moderate"
        if raw_sleep_debt_minutes > 0 or recent_short_nights == 1:
            return "low"
        return "none"

    def _iter_schedulable_library_items(self) -> List[Dict[str, Any]]:
        """
        Read schedulable items from the main authored libraries.

        This first pass stays conservative and only scans the core schedulable
        directories we already know v2 should care about.
        """
        schedulable_dirs = {
            "habit": "habits",
            "task": "tasks",
            "routine": "routines",
            "subroutine": "subroutines",
            "microroutine": "microroutines",
            "timeblock": "timeblocks",
        }

        items: List[Dict[str, Any]] = []
        for expected_type, dirname in schedulable_dirs.items():
            folder = os.path.join(USER_DIR, dirname)
            if not os.path.isdir(folder):
                continue
            for filename in os.listdir(folder):
                if not filename.endswith(".yml"):
                    continue
                path = os.path.join(folder, filename)
                payload = read_template(path)
                if not isinstance(payload, dict):
                    continue
                item = dict(payload)
                item.setdefault("type", expected_type)
                item["_source_path"] = path
                items.append(item)
        return items

    def _append_candidate(
        self,
        candidates: List[Dict[str, Any]],
        seen: set[str],
        candidate: Dict[str, Any],
    ) -> None:
        """
        Deduplicate candidates while preserving the first inclusion path.
        """
        identity = candidate.get("identity")
        if not identity or identity in seen:
            return
        seen.add(identity)
        candidates.append(candidate)

    def _normalize_candidate(self, node: Dict[str, Any], *, source: str, reasons: List[str]) -> Dict[str, Any]:
        """
        Convert a raw schedulable node into a small readable candidate record.
        """
        candidate_type = str(node.get("type") or "").strip().lower()
        name = str(node.get("name") or "Unnamed Item").strip()
        source_path = str(node.get("_source_path") or "").strip() or None
        resolved_source_path = str(node.get("_resolved_source_path") or "").strip() or None
        identity = f"{candidate_type}:{name.lower()}"
        return {
            "identity": identity,
            "name": name,
            "type": candidate_type,
            "category": str(node.get("category") or "").strip().lower() or None,
            "status_requirements": node.get("status_requirements"),
            "frequency": node.get("frequency"),
            "due_date": node.get("due_date"),
            "deadline": node.get("deadline"),
            "duration": node.get("duration"),
            "tags": [str(tag or "").strip().lower() for tag in (node.get("tags") or [])],
            "priority": node.get("priority"),
            "trim": node.get("trim"),
            "cut": node.get("cut"),
            "shift": node.get("shift"),
            "max_trim_percent": node.get("max_trim_percent"),
            "mini_of": node.get("mini_of"),
            "mini_variant": node.get("mini_variant"),
            "source": source,
            "reasons": reasons,
            "source_path": source_path,
            "resolved_source_path": resolved_source_path,
        }

    def _is_inactive_status(self, node: Dict[str, Any]) -> bool:
        """
        Return whether the item's status clearly means Kairos should ignore it.
        """
        status = str(node.get("status") or "").strip().lower()
        return status in {"inactive", "archived", "disabled", "paused"}

    def _is_bad_habit(self, node: Dict[str, Any]) -> bool:
        """
        Kairos explicitly ignores bad habits and never schedules them.
        """
        node_type = str(node.get("type") or "").strip().lower()
        polarity = str(node.get("polarity") or "").strip().lower()
        return node_type == "habit" and polarity == "bad"

    def _frequency_applies_to_date(self, frequency: Any, target_date: date) -> bool:
        """
        Check whether a frequency rule should include the item for this date.
        """
        if frequency is None:
            return False
        weekday = target_date.strftime("%A").lower()

        if isinstance(frequency, list):
            tokens = [self._normalize_token(value) for value in frequency]
        else:
            text = str(frequency).strip().lower()
            if not text:
                return False
            tokens = [self._normalize_token(token) for token in text.replace("/", ",").split(",")]

        tokens = [token for token in tokens if token]
        if not tokens:
            return False
        if "daily" in tokens:
            return True
        if "weekly" in tokens:
            return True
        return weekday in tokens

    def _discover_windows_in_structure(self, nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Walk the expanded day structure and collect dynamic windows.
        """
        windows: List[Dict[str, Any]] = []
        for node in nodes:
            if not isinstance(node, dict):
                continue
            if bool(node.get("window")):
                windows.append(node)
            children = node.get("children") or []
            if isinstance(children, list):
                windows.extend(self._discover_windows_in_structure(children))
        return windows

    def _discover_explicit_free_blocks(self, nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Walk the expanded day structure and collect authored free/slack blocks.
        """
        free_blocks: List[Dict[str, Any]] = []
        for node in nodes:
            if not isinstance(node, dict):
                continue

            if self._is_explicit_free_node(node):
                free_blocks.append(
                    {
                        "name": node.get("name"),
                        "type": node.get("type"),
                        "subtype": str(node.get("subtype") or "").strip().lower() or None,
                        "duration": node.get("duration"),
                        "start_time": node.get("start_time") or node.get("start"),
                        "end_time": node.get("end_time") or node.get("end"),
                        "absorbable": bool(node.get("absorbable")),
                    }
                )

            children = node.get("children") or []
            if isinstance(children, list):
                free_blocks.extend(self._discover_explicit_free_blocks(children))

        return free_blocks

    def _discover_explicit_buffer_blocks(self, nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Walk the expanded day structure and collect authored buffer blocks.

        Buffers are distinct from free time:
        - free time is authored slack the user intentionally wants open
        - buffers are protective transition/recovery/overflow surfaces

        Kairos should consume free time before gaps, and gaps before buffers.
        """
        buffer_blocks: List[Dict[str, Any]] = []
        for node in nodes:
            if not isinstance(node, dict):
                continue

            if self._is_explicit_buffer_node(node):
                buffer_blocks.append(
                    {
                        "name": node.get("name"),
                        "type": node.get("type"),
                        "subtype": str(node.get("subtype") or "").strip().lower() or None,
                        "duration": node.get("duration"),
                        "start_time": node.get("start_time") or node.get("start"),
                        "end_time": node.get("end_time") or node.get("end"),
                        "absorbable": bool(node.get("absorbable")),
                    }
                )

            children = node.get("children") or []
            if isinstance(children, list):
                buffer_blocks.extend(self._discover_explicit_buffer_blocks(children))

        return buffer_blocks

    def _derive_emergent_gaps(self, state: KairosV2RunState, explicit_free_blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Derive gaps from the known timed surfaces we already trust.

        This is not full final-placement gap derivation yet. It only uses:
        - committed anchors
        - selected windows with authored times
        - explicit free blocks with authored times
        - authored fixed-time structural items
        """
        sleep_boundary = int(state.schedule.get("day_budget", {}).get("sleep_boundary_minutes") or 0)
        floor = int(state.reality.get("minutes_elapsed_since_start_of_day") or 0) if state.target_date == state.now.date() else 0

        surfaces = []
        for anchor in state.schedule.get("anchor_skeleton", {}).get("anchors", []):
            start_minutes = anchor.get("start_minutes")
            duration_minutes = anchor.get("duration_minutes")
            if start_minutes is None or duration_minutes is None:
                continue
            end_minutes = int(start_minutes) + int(duration_minutes)
            surfaces.append({"kind": "anchor", "name": anchor.get("name"), "start_minutes": int(start_minutes), "end_minutes": end_minutes})

        for window in state.schedule.get("window_selections", {}).get("windows", []):
            start_minutes = window.get("start_minutes")
            end_minutes = window.get("end_minutes")
            if start_minutes is None or end_minutes is None:
                continue
            surfaces.append({"kind": "window", "name": window.get("window_name"), "start_minutes": int(start_minutes), "end_minutes": int(end_minutes)})

        for block in explicit_free_blocks:
            start_minutes = self._parse_hm(block.get("start_time"))
            end_minutes = self._parse_hm(block.get("end_time"))
            if start_minutes is None or end_minutes is None:
                continue
            surfaces.append({"kind": "free", "name": block.get("name"), "start_minutes": int(start_minutes), "end_minutes": int(end_minutes)})

        for item in (
            state.schedule.get("day_population", {}).get("active_fixed_time_nodes", [])
            if isinstance(state.schedule.get("day_population"), dict)
            else []
        ):
            start_minutes = item.get("start_minutes")
            end_minutes = item.get("end_minutes")
            if start_minutes is None or end_minutes is None:
                continue
            surfaces.append(
                {
                    "kind": "fixed_time",
                    "name": item.get("name"),
                    "start_minutes": int(start_minutes),
                    "end_minutes": int(end_minutes),
                }
            )

        surfaces = [surface for surface in surfaces if surface["end_minutes"] > floor and surface["start_minutes"] < sleep_boundary]
        surfaces.sort(key=lambda item: (item["start_minutes"], item["end_minutes"], str(item.get("name") or "")))

        merged = []
        for surface in surfaces:
            start_minutes = max(floor, surface["start_minutes"])
            end_minutes = min(sleep_boundary, surface["end_minutes"])
            if end_minutes <= start_minutes:
                continue
            if not merged or start_minutes > merged[-1]["end_minutes"]:
                merged.append({"start_minutes": start_minutes, "end_minutes": end_minutes})
            else:
                merged[-1]["end_minutes"] = max(merged[-1]["end_minutes"], end_minutes)

        gaps = []
        cursor = floor
        for surface in merged:
            if surface["start_minutes"] > cursor:
                gaps.append(self._build_gap_record(cursor, surface["start_minutes"]))
            cursor = max(cursor, surface["end_minutes"])

        if sleep_boundary > cursor:
            gaps.append(self._build_gap_record(cursor, sleep_boundary))

        return gaps

    def _build_gap_record(self, start_minutes: int, end_minutes: int) -> Dict[str, Any]:
        """
        Build a simple gap record from minute bounds.
        """
        duration = max(0, end_minutes - start_minutes)
        return {
            "start_minutes": start_minutes,
            "end_minutes": end_minutes,
            "start_time": self._minutes_to_hm(start_minutes),
            "end_time": self._minutes_to_hm(end_minutes),
            "duration_minutes": duration,
        }

    def _remaining_day_mode(self, state: KairosV2RunState) -> bool:
        """
        Return whether this run should behave like a remaining-day reschedule.

        `today reschedule engine:v2` passes `start_from_now: true`. In that mode,
        Kairos should stop pretending the day starts at midnight and instead work
        from the current moment forward.
        """
        return bool(self.user_context.get("start_from_now")) and state.target_date == state.now.date()

    def _runtime_floor_minutes(self, state: KairosV2RunState) -> int:
        """
        Return the current minute floor for remaining-day runs.
        """
        if not self._remaining_day_mode(state):
            return 0
        current_floor = int(state.reality.get("minutes_elapsed_since_start_of_day") or 0)
        return max(current_floor, self._sleep_policy_floor_minutes(state))

    def _sleep_policy_floor_minutes(self, state: KairosV2RunState) -> int:
        """
        Return the earliest minute the day should resume after sleep-policy handling.

        `stay_awake`/`ignore_today`/`woke_early` drop the active sleep block for
        scheduling purposes. `go_back_to_sleep`/`shift_later` delay the day until
        the active sleep block ends.
        """
        commitment = state.schedule.get("sleep_commitment", {})
        if not isinstance(commitment, dict):
            return 0
        sleep_policy = normalize_sleep_policy(commitment.get("sleep_policy"))
        if sleep_policy not in {"go_back_to_sleep", "shift_later"}:
            return 0
        block = commitment.get("effective_active_sleep_block")
        if not isinstance(block, dict):
            return 0
        return self._parse_hm(block.get("end_time")) or 0

    def _apply_runtime_horizon_to_surfaces(
        self,
        surfaces: List[Dict[str, Any]],
        state: KairosV2RunState,
        *,
        duration_keys: tuple[str, ...] = ("duration_minutes", "duration"),
    ) -> List[Dict[str, Any]]:
        """
        Clip a list of timed surfaces to the current runtime horizon.

        When Kairos is doing remaining-day repair, past-only surfaces should
        disappear and active surfaces should start "now" instead of at their
        original morning timestamp.
        """
        adjusted: List[Dict[str, Any]] = []
        for surface in surfaces:
            clipped = self._clip_timed_surface_to_runtime_horizon(
                surface,
                state,
                duration_keys=duration_keys,
            )
            if clipped is not None:
                adjusted.append(clipped)
        return adjusted

    def _clip_timed_surface_to_runtime_horizon(
        self,
        surface: Dict[str, Any],
        state: KairosV2RunState,
        *,
        duration_keys: tuple[str, ...] = ("duration_minutes", "duration"),
    ) -> Optional[Dict[str, Any]]:
        """
        Clip a timed surface so it reflects only the remaining part of the day.
        """
        if not isinstance(surface, dict):
            return None

        start_minutes = self._surface_start_minutes(surface)
        end_minutes = self._surface_end_minutes(surface, duration_keys=duration_keys)
        if start_minutes is None or end_minutes is None or end_minutes <= start_minutes:
            return dict(surface)

        clipped_start = int(start_minutes)
        clipped_end = int(end_minutes)
        if self._remaining_day_mode(state):
            floor = self._runtime_floor_minutes(state)
            if clipped_end <= floor:
                return None
            clipped_start = max(clipped_start, floor)

        clipped = dict(surface)
        clipped["start_minutes"] = clipped_start
        clipped["end_minutes"] = clipped_end
        clipped["start_time"] = self._minutes_to_hm(clipped_start)
        clipped["end_time"] = self._minutes_to_hm(clipped_end)
        if "start" in clipped or surface.get("start") is not None:
            clipped["start"] = clipped["start_time"]
        if "end" in clipped or surface.get("end") is not None:
            clipped["end"] = clipped["end_time"]

        adjusted_duration = max(0, clipped_end - clipped_start)
        for key in duration_keys:
            if key in clipped or surface.get(key) is not None:
                clipped[key] = adjusted_duration
        return clipped

    def _surface_start_minutes(self, surface: Dict[str, Any]) -> Optional[int]:
        """
        Resolve a surface start minute from the common v2 surface fields.
        """
        if surface.get("start_minutes") is not None:
            try:
                return int(surface.get("start_minutes"))
            except Exception:
                return None
        return self._parse_hm(surface.get("start_time") or surface.get("start"))

    def _surface_end_minutes(
        self,
        surface: Dict[str, Any],
        *,
        duration_keys: tuple[str, ...] = ("duration_minutes", "duration"),
    ) -> Optional[int]:
        """
        Resolve a surface end minute from common end or duration fields.
        """
        if surface.get("end_minutes") is not None:
            try:
                return int(surface.get("end_minutes"))
            except Exception:
                return None

        parsed_end = self._parse_hm(surface.get("end_time") or surface.get("end"))
        if parsed_end is not None:
            return parsed_end

        start_minutes = self._surface_start_minutes(surface)
        if start_minutes is None:
            return None
        for key in duration_keys:
            duration = self._coerce_minutes(surface.get(key))
            if duration is not None:
                return int(start_minutes) + int(duration)
        return None

    def _selected_candidate_identities(self, state: KairosV2RunState) -> set[str]:
        """
        Collect candidate identities already consumed by earlier local selections.
        """
        selected: set[str] = set()
        for window in state.schedule.get("window_selections", {}).get("windows", []):
            for item in window.get("selected", []):
                identity = str(item.get("identity") or "").strip()
                if identity:
                    selected.add(identity)
        return selected

    def _runtime_helper_settings(self, state: KairosV2RunState) -> Dict[str, int | bool]:
        """
        Resolve runtime helper-window settings with small sane defaults.
        """
        scheduling_settings = state.gathered.get("settings", {}).get("scheduling_settings", {}) or {}
        payload = scheduling_settings.get("runtime_helper_windows", {}) if isinstance(scheduling_settings, dict) else {}
        enabled = payload.get("enabled", True)
        minimum_gap_minutes = payload.get("minimum_gap_minutes", payload.get("min_gap_minutes", 30))
        max_windows_per_day = payload.get("maximum_windows_per_day", payload.get("max_windows_per_day", 2))
        try:
            minimum_gap_minutes = max(1, int(minimum_gap_minutes))
        except Exception:
            minimum_gap_minutes = 30
        try:
            max_windows_per_day = max(0, int(max_windows_per_day))
        except Exception:
            max_windows_per_day = 2
        return {
            "enabled": bool(enabled),
            "minimum_gap_minutes": minimum_gap_minutes,
            "max_windows_per_day": max_windows_per_day,
        }

    def _candidate_eligible_for_runtime_helper(self, candidate: Dict[str, Any]) -> bool:
        """
        Return whether a candidate deserves helper-window treatment.

        Helper windows stay narrow on purpose. They are for strong runtime
        pressures, not for every leftover candidate in the universe.
        """
        return bool(candidate.get("manual_injected") or candidate.get("due_date") or candidate.get("deadline"))

    def _score_runtime_helper_candidate(
        self,
        *,
        candidate: Dict[str, Any],
        category_weights: Dict[str, Dict[str, int]],
        priority_weights: Dict[str, Dict[str, int]],
        happiness_weights: Dict[str, Dict[str, int]],
        priority_factor_weights: Dict[str, float],
        target_date: date,
    ) -> float:
        """
        Score a candidate for helper-window capture.
        """
        return self._score_preservation_value(
            candidate=candidate,
            category_weights=category_weights,
            priority_weights=priority_weights,
            happiness_weights=happiness_weights,
            priority_factor_weights=priority_factor_weights,
            target_date=target_date,
        )

    def _runtime_helper_kind(self, selected_children: List[Dict[str, Any]]) -> str:
        """
        Classify a helper window by the strongest reason it exists.
        """
        if any(bool(child.get("manual_injected")) for child in selected_children):
            return "manual_opportunity"
        if any(str(child.get("deadline") or "").strip() for child in selected_children):
            return "deadline_pressure"
        if any(str(child.get("due_date") or "").strip() for child in selected_children):
            return "due_pressure"
        return "opportunity"

    def _runtime_helper_name(self, helper_kind: str) -> str:
        """
        Convert a helper kind into a readable title.
        """
        if helper_kind == "manual_opportunity":
            return "Manual Opportunity Window"
        if helper_kind == "deadline_pressure":
            return "Deadline Window"
        if helper_kind == "due_pressure":
            return "Due Window"
        return "Opportunity Window"

    def _build_ordered_structural_sequence(
        self,
        nodes: List[Dict[str, Any]],
        viable_candidates: List[Dict[str, Any]],
        excluded_identities: set[str],
        active_window_identities: set[str],
    ) -> List[Dict[str, Any]]:
        """
        Build the ordered untimed structural sequence from the expanded day tree.
        """
        candidate_by_identity = {
            str(candidate.get("identity") or ""): candidate
            for candidate in viable_candidates
            if str(candidate.get("identity") or "")
        }
        sequence: List[Dict[str, Any]] = []
        self._collect_structural_sequence(
            nodes=nodes,
            candidate_by_identity=candidate_by_identity,
            excluded_identities=excluded_identities,
            active_window_identities=active_window_identities,
            out=sequence,
        )
        return sequence

    def _build_flexible_candidate_sequence(
        self,
        *,
        state: KairosV2RunState,
        viable_candidates: List[Dict[str, Any]],
        excluded_identities: set[str],
    ) -> List[Dict[str, Any]]:
        """
        Build a placement sequence for remaining flexible candidates.

        This is the bridge between candidate-universe truth and real late-day
        placement. Recurring items, due items, manual soft injections, and
        window leftovers should still have a chance to land in free/gap/buffer
        space even when they are not explicitly authored as structural leaves.
        """
        category_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("category_settings", {}) or {}).get("Category_Settings", {}),
            rank_key="value",
        )
        priority_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("priority_settings", {}) or {}).get("Priority_Settings", {}),
            rank_key="value",
        )
        happiness_weights = self._normalize_happiness_map(
            state.gathered.get("settings", {}).get("map_of_happiness", {}) or {}
        )
        factor_weights = self._priority_factor_weights(state)

        sequence: List[Dict[str, Any]] = []
        for candidate in viable_candidates:
            identity = str(candidate.get("identity") or "").strip()
            if not identity or identity in excluded_identities:
                continue
            duration_minutes = self._coerce_minutes(candidate.get("duration"))
            if duration_minutes is None or duration_minutes <= 0:
                continue
            sequence.append(
                {
                    "identity": identity,
                    "name": candidate.get("name"),
                    "duration_minutes": duration_minutes,
                    "type": candidate.get("type"),
                    "category": candidate.get("category"),
                    "priority": candidate.get("priority"),
                    "due_date": candidate.get("due_date"),
                    "deadline": candidate.get("deadline"),
                    "local_status_fit": candidate.get("local_status_fit"),
                    "trim": candidate.get("trim"),
                    "cut": candidate.get("cut"),
                    "shift": candidate.get("shift"),
                    "max_trim_percent": candidate.get("max_trim_percent"),
                    "mini_of": candidate.get("mini_of"),
                    "mini_variant": candidate.get("mini_variant"),
                    "manual_injected": candidate.get("manual_injected"),
                    "top_level_parent_name": candidate.get("_top_level_parent_name"),
                    "top_level_parent_type": candidate.get("_top_level_parent_type"),
                    "placement_score": self._score_preservation_value(
                        candidate=candidate,
                        category_weights=category_weights,
                        priority_weights=priority_weights,
                        happiness_weights=happiness_weights,
                        priority_factor_weights=factor_weights,
                        target_date=state.target_date,
                    ),
                }
            )

        sequence.sort(
            key=lambda item: (
                -float(item.get("placement_score") or 0.0),
                str(item.get("name") or ""),
            )
        )
        return sequence

    def _collect_structural_sequence(
        self,
        *,
        nodes: List[Dict[str, Any]],
        candidate_by_identity: Dict[str, Dict[str, Any]],
        excluded_identities: set[str],
        active_window_identities: set[str],
        out: List[Dict[str, Any]],
    ) -> None:
        """
        Depth-first ordered extraction of untimed structural leaves.
        """
        for node in nodes:
            if not isinstance(node, dict):
                continue
            if self._is_hard_anchor(node) or self._is_explicit_free_node(node) or self._is_explicit_buffer_node(node):
                continue
            if self._is_fixed_time_structural_node(node):
                continue

            children = node.get("children") or []
            if bool(node.get("window")):
                # A live/active window owns its children through window selection.
                # A missed/inactive window should not kill unfinished children; its
                # children remain valid later-day structural candidates.
                if self._window_identity_for_node(node) in active_window_identities:
                    continue
                if isinstance(children, list) and children:
                    self._collect_structural_sequence(
                        nodes=children,
                        candidate_by_identity=candidate_by_identity,
                        excluded_identities=excluded_identities,
                        active_window_identities=active_window_identities,
                        out=out,
                    )
                continue
            if isinstance(children, list) and children:
                self._collect_structural_sequence(
                    nodes=children,
                    candidate_by_identity=candidate_by_identity,
                    excluded_identities=excluded_identities,
                    active_window_identities=active_window_identities,
                    out=out,
                )
                continue

            identity = self._candidate_identity_for_node(node)
            if not identity or identity in excluded_identities:
                continue
            candidate = candidate_by_identity.get(identity)
            if not candidate:
                continue
            duration_minutes = self._coerce_minutes(candidate.get("duration"))
            if duration_minutes is None or duration_minutes <= 0:
                continue
            out.append(
                {
                    "identity": identity,
                    "name": candidate.get("name"),
                    "duration_minutes": duration_minutes,
                    "type": candidate.get("type"),
                    "category": candidate.get("category"),
                    "priority": candidate.get("priority"),
                    "due_date": candidate.get("due_date"),
                    "deadline": candidate.get("deadline"),
                    "local_status_fit": candidate.get("local_status_fit"),
                    "trim": candidate.get("trim"),
                    "cut": candidate.get("cut"),
                    "shift": candidate.get("shift"),
                    "max_trim_percent": candidate.get("max_trim_percent"),
                    "mini_of": candidate.get("mini_of"),
                    "mini_variant": candidate.get("mini_variant"),
                    "top_level_parent_name": node.get("_top_level_parent_name") or candidate.get("_top_level_parent_name"),
                    "top_level_parent_type": node.get("_top_level_parent_type") or candidate.get("_top_level_parent_type"),
                }
            )
            excluded_identities.add(identity)

    def _discover_fixed_time_structure_nodes(self, nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Collect authored non-anchor fixed-time structure nodes.

        These are real timed commitments the template authored directly, such as
        `day.sequence` items with explicit `start`/`end`. They should reserve
        their own slot in the day instead of leaking into generic late gap fill.
        """
        fixed_nodes: List[Dict[str, Any]] = []
        for node in nodes:
            if not isinstance(node, dict):
                continue
            children = node.get("children") or []
            if isinstance(children, list) and children:
                fixed_nodes.extend(self._discover_fixed_time_structure_nodes(children))
            if not self._is_fixed_time_structural_node(node):
                continue
            normalized = dict(node)
            start_minutes = self._surface_start_minutes(node)
            end_minutes = self._surface_end_minutes(node, duration_keys=("duration_minutes", "duration"))
            if start_minutes is None or end_minutes is None or end_minutes <= start_minutes:
                continue
            normalized["start_minutes"] = int(start_minutes)
            normalized["end_minutes"] = int(end_minutes)
            normalized["start_time"] = self._minutes_to_hm(int(start_minutes))
            normalized["end_time"] = self._minutes_to_hm(int(end_minutes))
            normalized["duration_minutes"] = int(end_minutes) - int(start_minutes)
            normalized["identity"] = normalized.get("identity") or self._candidate_identity_for_node(normalized)
            normalized["top_level_parent_name"] = normalized.get("_top_level_parent_name")
            normalized["top_level_parent_type"] = normalized.get("_top_level_parent_type")
            fixed_nodes.append(normalized)
        return fixed_nodes

    def _is_fixed_time_structural_node(self, node: Dict[str, Any]) -> bool:
        """
        Detect authored fixed-time non-anchor structure.
        """
        if not isinstance(node, dict):
            return False
        if bool(node.get("window")):
            return False
        if self._is_hard_anchor(node) or self._is_explicit_free_node(node) or self._is_explicit_buffer_node(node):
            return False
        start_minutes = self._surface_start_minutes(node)
        end_minutes = self._surface_end_minutes(node, duration_keys=("duration_minutes", "duration"))
        return start_minutes is not None and end_minutes is not None and int(end_minutes) > int(start_minutes)

    def _window_identity_for_node(self, node: Dict[str, Any]) -> str:
        """
        Build a stable identity token for an authored window container.

        The token intentionally uses the authored window shape instead of the
        runtime-clipped shape so the same logical window can be recognized even
        when remaining-day mode clips its visible start time.
        """
        existing_identity = str(node.get("window_identity") or "").strip()
        if existing_identity:
            return existing_identity

        window_type = self._normalize_token(node.get("type")) or "window"
        window_name = self._normalize_token(node.get("name")) or "unnamed"
        start_minutes = self._surface_start_minutes(node)
        end_minutes = self._surface_end_minutes(node, duration_keys=("duration", "duration_minutes"))

        parts = [window_type, window_name]
        if start_minutes is not None:
            parts.append(f"start:{int(start_minutes)}")
        if end_minutes is not None:
            parts.append(f"end:{int(end_minutes)}")
        return "|".join(parts)

    def _candidate_identity_for_node(self, node: Dict[str, Any]) -> str:
        """
        Build the candidate identity token for a structured node.
        """
        node_type = str(node.get("type") or "").strip().lower()
        node_name = str(node.get("name") or "").strip().lower()
        if not node_type or not node_name:
            return ""
        return f"{node_type}:{node_name}"

    def _is_explicit_free_node(self, node: Dict[str, Any]) -> bool:
        """
        Detect authored free/slack nodes inside the structure.
        """
        subtype = str(node.get("subtype") or "").strip().lower()
        tags = [self._normalize_token(tag) for tag in (node.get("tags") or [])]
        return subtype == "free" or "free" in tags

    def _is_explicit_buffer_node(self, node: Dict[str, Any]) -> bool:
        """
        Detect authored buffer nodes inside the structure.

        Buffers should not be confused with free time even if both are
        absorbable/flexible. The subtype and tags carry the semantic intent.
        """
        subtype = str(node.get("subtype") or "").strip().lower()
        tags = [self._normalize_token(tag) for tag in (node.get("tags") or [])]
        is_free = subtype == "free" or "free" in tags
        return not is_free and (subtype == "buffer" or "buffer" in tags)

    def _fill_surfaces_with_sequence(
        self,
        *,
        surfaces: List[Dict[str, Any]],
        sequence: List[Dict[str, Any]],
        surface_kind: str,
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Fill timed surfaces in order with the ordered structure sequence.
        """
        remaining = [dict(item) for item in sequence]
        placements = []

        for surface in surfaces:
            start_minutes = self._parse_hm(surface.get("start_time")) if surface.get("start_time") else surface.get("start_minutes")
            end_minutes = self._parse_hm(surface.get("end_time")) if surface.get("end_time") else surface.get("end_minutes")
            if start_minutes is None or end_minutes is None or end_minutes <= start_minutes:
                continue

            cursor = int(start_minutes)
            chosen = []
            still_remaining = []
            for item in remaining:
                duration = int(item.get("duration_minutes") or 0)
                if duration <= 0:
                    continue
                if cursor + duration <= int(end_minutes):
                    chosen.append(
                        self._build_timed_selected_item(
                            item,
                            start_minutes=cursor,
                            duration_minutes=duration,
                        )
                    )
                    cursor += duration
                else:
                    still_remaining.append(item)

            remaining = still_remaining
            placements.append(
                {
                    "surface_kind": surface_kind,
                    "name": surface.get("name"),
                    "start_time": self._minutes_to_hm(int(start_minutes)),
                    "end_time": self._minutes_to_hm(int(end_minutes)),
                    "surface_duration_minutes": int(end_minutes) - int(start_minutes),
                    "selected": chosen,
                    "selected_minutes": cursor - int(start_minutes),
                    "remaining_minutes": int(end_minutes) - cursor,
                    "residual_start_time": self._minutes_to_hm(cursor) if cursor < int(end_minutes) else None,
                }
            )

        return placements, remaining

    def _find_available_mini_substitutions(self, overflow_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Find authored mini variants for overflow items when such metadata exists.
        """
        minis = []
        for item in overflow_items:
            resolved = self._resolve_authored_mini_variant(item)
            if not isinstance(resolved, dict):
                continue
            original_duration = int(item.get("duration_minutes") or 0)
            mini_duration = int(resolved.get("duration_minutes") or 0)
            if mini_duration <= 0 or original_duration <= 0 or mini_duration >= original_duration:
                continue
            minis.append(
                {
                    "name": item.get("name"),
                    "identity": item.get("identity"),
                    "mini_name": resolved.get("name"),
                    "mini_identity": resolved.get("identity"),
                    "mini_duration_minutes": mini_duration,
                    "freed_minutes": original_duration - mini_duration,
                    "mini_of": resolved.get("mini_of") or self._normalize_token(item.get("name")),
                    "mini_variant": resolved.get("mini_variant") or self._normalize_token(resolved.get("name")),
                }
            )
        return minis

    def _resolve_authored_mini_variant(self, item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Resolve an authored mini variant for an overflow item when possible.

        The authored model may point to a mini by explicit `mini_variant`, or a
        mini item may point back to the full item through `mini_of`. We support
        both so user-authored structure can stay compact.
        """
        if not isinstance(item, dict):
            return None

        item_name_token = self._normalize_token(item.get("name"))
        item_identity_token = self._normalize_token(item.get("identity"))
        requested_variant = self._normalize_token(item.get("mini_variant"))

        library = self._iter_schedulable_library_items()
        for candidate in library:
            candidate_name_token = self._normalize_token(candidate.get("name"))
            candidate_identity_token = self._normalize_token(
                f"{candidate.get('type') or ''}:{str(candidate.get('name') or '').strip().lower()}"
            )
            candidate_mini_of = self._normalize_token(candidate.get("mini_of"))

            direct_match = bool(requested_variant) and requested_variant in {
                candidate_name_token,
                candidate_identity_token,
            }
            reverse_match = candidate_mini_of and candidate_mini_of in {
                item_name_token,
                item_identity_token,
            }
            if not direct_match and not reverse_match:
                continue

            duration = self._coerce_minutes(candidate.get("duration"))
            if duration is None or duration <= 0:
                continue

            resolved = self._normalize_candidate(
                candidate,
                source="authored_mini_variant",
                reasons=["mini_variant"],
            )
            resolved["duration_minutes"] = int(duration)
            return resolved
        return None

    def _apply_mini_substitutions_to_overflow_items(
        self,
        overflow_items: List[Dict[str, Any]],
        mini_substitutions: List[Dict[str, Any]],
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Apply authored mini substitutions onto overflow items before trim/cut.

        This is the first relief stage because it preserves user-authored
        structure better than trimming or cutting unrelated already-placed work.
        """
        substitution_by_identity = {
            str(row.get("identity") or "").strip(): row
            for row in mini_substitutions
            if str(row.get("identity") or "").strip()
        }
        adjusted: List[Dict[str, Any]] = []
        actions: List[Dict[str, Any]] = []

        for item in overflow_items:
            identity = str(item.get("identity") or "").strip()
            substitution = substitution_by_identity.get(identity)
            if not substitution:
                adjusted.append(dict(item))
                continue

            rewritten = dict(item)
            rewritten["name"] = substitution.get("mini_name") or rewritten.get("name")
            rewritten["identity"] = substitution.get("mini_identity") or rewritten.get("identity")
            rewritten["duration_minutes"] = int(substitution.get("mini_duration_minutes") or rewritten.get("duration_minutes") or 0)
            rewritten["mini_applied"] = True
            rewritten["original_identity"] = identity
            rewritten["original_name"] = item.get("name")
            adjusted.append(rewritten)
            actions.append(
                {
                    "kind": "mini_substitution",
                    "name": item.get("name"),
                    "identity": identity,
                    "mini_name": rewritten.get("name"),
                    "mini_identity": rewritten.get("identity"),
                    "duration_minutes_before": int(item.get("duration_minutes") or 0),
                    "duration_minutes_after": int(rewritten.get("duration_minutes") or 0),
                    "freed_minutes": int(substitution.get("freed_minutes") or 0),
                }
            )

        return adjusted, actions

    def _find_trimmable_items(self, state: KairosV2RunState) -> List[Dict[str, Any]]:
        """
        Find items that explicitly allow trimming.
        """
        category_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("category_settings", {}) or {}).get("Category_Settings", {}),
            rank_key="value",
        )
        priority_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("priority_settings", {}) or {}).get("Priority_Settings", {}),
            rank_key="value",
        )
        happiness_weights = self._normalize_happiness_map(
            state.gathered.get("settings", {}).get("map_of_happiness", {}) or {}
        )
        factor_weights = self._priority_factor_weights(state)
        trimmables = []
        for child in self._build_pressure_relief_rows_from_children(
            placed_children=self._iter_placed_children(state),
            category_weights=category_weights,
            priority_weights=priority_weights,
            happiness_weights=happiness_weights,
            priority_factor_weights=factor_weights,
            target_date=state.target_date,
        ):
            if str(child.get("trim") or "").strip().lower() != "allow":
                continue
            max_trim_percent = self._resolve_max_trim_percent(child.get("max_trim_percent"))
            max_trim_minutes = int((int(child.get("duration_minutes") or 0) * max_trim_percent) // 100)
            trimmables.append(
                {
                    "name": child.get("name"),
                    "identity": child.get("identity"),
                    "duration_minutes": child.get("duration_minutes"),
                    "max_trim_percent": max_trim_percent,
                    "max_trim_minutes": max_trim_minutes,
                    "preservation_score": child.get("preservation_score"),
                }
            )
        return trimmables

    def _find_cuttable_items(self, state: KairosV2RunState) -> List[Dict[str, Any]]:
        """
        Find items that explicitly allow cutting.
        """
        category_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("category_settings", {}) or {}).get("Category_Settings", {}),
            rank_key="value",
        )
        priority_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("priority_settings", {}) or {}).get("Priority_Settings", {}),
            rank_key="value",
        )
        happiness_weights = self._normalize_happiness_map(
            state.gathered.get("settings", {}).get("map_of_happiness", {}) or {}
        )
        factor_weights = self._priority_factor_weights(state)
        cuttables = []
        for child in self._build_pressure_relief_rows_from_children(
            placed_children=self._iter_placed_children(state),
            category_weights=category_weights,
            priority_weights=priority_weights,
            happiness_weights=happiness_weights,
            priority_factor_weights=factor_weights,
            target_date=state.target_date,
        ):
            if str(child.get("cut") or "").strip().lower() != "allow":
                continue
            cuttables.append(
                {
                    "name": child.get("name"),
                    "identity": child.get("identity"),
                    "duration_minutes": child.get("duration_minutes"),
                    "preservation_score": child.get("preservation_score"),
                }
            )
        return cuttables

    def _build_pressure_relief_rows_from_children(
        self,
        *,
        placed_children: List[Dict[str, Any]],
        category_weights: Dict[str, Dict[str, int]],
        priority_weights: Dict[str, Dict[str, int]],
        happiness_weights: Dict[str, Dict[str, int]],
        priority_factor_weights: Dict[str, float],
        target_date: date,
    ) -> List[Dict[str, Any]]:
        """
        Build an ordered least-important-first view of placed children.

        Kairos should use the same broad reasoning family for sacrifice as for
        placement. This first v2 pass uses the weighted pieces we already have
        in hand here: category, priority property, and due/deadline urgency.
        Lower preservation score means safer to sacrifice first.
        """
        rows: List[Dict[str, Any]] = []
        for child in placed_children:
            duration_minutes = int(child.get("duration_minutes") or 0)
            if duration_minutes <= 0:
                continue
            row = dict(child)
            row["duration_minutes"] = duration_minutes
            row["preservation_score"] = self._score_preservation_value(
                candidate=row,
                category_weights=category_weights,
                priority_weights=priority_weights,
                happiness_weights=happiness_weights,
                priority_factor_weights=priority_factor_weights,
                target_date=target_date,
            )
            rows.append(row)

        rows.sort(
            key=lambda row: (
                float(row.get("preservation_score") or 0.0),
                int(row.get("duration_minutes") or 0),
                str(row.get("name") or ""),
            )
        )
        return rows

    def _score_preservation_value(
        self,
        *,
        candidate: Dict[str, Any],
        category_weights: Dict[str, Dict[str, int]],
        priority_weights: Dict[str, Dict[str, int]],
        happiness_weights: Optional[Dict[str, Dict[str, int]]] = None,
        priority_factor_weights: Optional[Dict[str, float]] = None,
        target_date: date,
    ) -> float:
        """
        Estimate how strongly a placed item should be preserved.

        This is intentionally modest and readable rather than pretending Kairos
        already has a finished grand chooser. It reuses the same weighted
        signals that still exist as meaningful scheduler influences.
        """
        score = 0.0
        happiness_weights = happiness_weights or {}
        priority_factor_weights = priority_factor_weights or {}
        category = self._normalize_token(candidate.get("category"))
        if category in category_weights:
            category_factor = float(priority_factor_weights.get("category", 1.0))
            score += float(category_weights[category]["weight"]) * category_factor

        priority_value = self._normalize_token(candidate.get("priority"))
        if priority_value in priority_weights:
            priority_factor = float(priority_factor_weights.get("priority_property", 1.0))
            score += float(priority_weights[priority_value]["weight"]) * priority_factor

        score += self._happiness_bonus(
            candidate,
            happiness_weights=happiness_weights,
            priority_factor_weights=priority_factor_weights,
        )
        score += self._urgency_bonus(
            candidate,
            target_date,
            priority_factor_weights=priority_factor_weights,
        )
        if candidate.get("manual_injected"):
            score += 1000.0

        local_status_fit = candidate.get("local_status_fit")
        if isinstance(local_status_fit, dict) and local_status_fit.get("has_explicit_requirements"):
            weighted_distance = float(local_status_fit.get("weighted_distance") or 0.0)
            # Poorer local fit should make the item safer to sacrifice later.
            score -= min(25.0, weighted_distance)

        return score

    def _resolve_max_trim_percent(self, value: Any) -> int:
        """
        Normalize an authored max trim percentage into an integer 0..100.

        If the user allowed trimming but did not specify a max yet, v2 stays
        conservative and treats it as non-trimmable until that policy is
        authored explicitly.
        """
        if isinstance(value, (int, float)):
            return max(0, min(100, int(round(value))))

        text = str(value or "").strip().lower().replace("%", "")
        if not text:
            return 0
        try:
            return max(0, min(100, int(round(float(text)))))
        except ValueError:
            return 0

    def _plan_pressure_relief_actions(
        self,
        *,
        overflow_items: List[Dict[str, Any]],
        placed_children: List[Dict[str, Any]],
        category_weights: Dict[str, Dict[str, int]],
        priority_weights: Dict[str, Dict[str, int]],
        happiness_weights: Dict[str, Dict[str, int]],
        priority_factor_weights: Dict[str, float],
        target_date: date,
        mini_actions: Optional[List[Dict[str, Any]]] = None,
        repair_trim_enabled: bool = True,
        repair_cut_enabled: bool = True,
        repair_min_duration: int = 5,
        repair_cut_threshold: Any = None,
        overflow_minutes_before_minis: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Plan least-important-first trim/cut actions for remaining overflow.

        This is deliberately non-destructive. Kairos records what it would do
        before we let later phases physically rewrite the conceptual schedule.
        """
        overflow_minutes = sum(int(item.get("duration_minutes") or 0) for item in overflow_items)
        original_overflow_minutes = (
            int(overflow_minutes_before_minis)
            if overflow_minutes_before_minis is not None
            else overflow_minutes
        )
        ordered_rows = self._build_pressure_relief_rows_from_children(
            placed_children=placed_children,
            category_weights=category_weights,
            priority_weights=priority_weights,
            happiness_weights=happiness_weights,
            priority_factor_weights=priority_factor_weights,
            target_date=target_date,
        )

        actions: List[Dict[str, Any]] = []
        trimmed_minutes_by_identity: Dict[str, int] = {}
        remaining_overflow = overflow_minutes
        trim_freed_minutes = 0
        cut_freed_minutes = 0
        mini_freed_minutes = sum(int(action.get("freed_minutes") or 0) for action in (mini_actions or []))
        cut_threshold_value: Optional[float]
        try:
            cut_threshold_value = float(repair_cut_threshold) if repair_cut_threshold is not None else None
        except Exception:
            cut_threshold_value = None

        if mini_actions:
            actions.extend(dict(action) for action in mini_actions)

        for row in ordered_rows:
            if remaining_overflow <= 0:
                break
            if not repair_trim_enabled:
                break
            if str(row.get("trim") or "").strip().lower() != "allow":
                continue

            max_trim_percent = self._resolve_max_trim_percent(row.get("max_trim_percent"))
            if max_trim_percent <= 0:
                continue

            duration_minutes = int(row.get("duration_minutes") or 0)
            max_trim_minutes = int((duration_minutes * max_trim_percent) // 100)
            if max_trim_minutes <= 0:
                continue

            max_trim_minutes = min(
                max_trim_minutes,
                max(0, duration_minutes - max(1, int(repair_min_duration))),
            )
            if max_trim_minutes <= 0:
                continue

            freed_minutes = min(max_trim_minutes, remaining_overflow)
            if freed_minutes <= 0:
                continue

            trimmed_minutes_by_identity[str(row.get("identity") or "")] = freed_minutes
            trim_freed_minutes += freed_minutes
            remaining_overflow -= freed_minutes
            actions.append(
                {
                    "kind": "trim",
                    "name": row.get("name"),
                    "identity": row.get("identity"),
                    "duration_minutes_before": duration_minutes,
                    "freed_minutes": freed_minutes,
                    "duration_minutes_after": max(0, duration_minutes - freed_minutes),
                    "max_trim_percent": max_trim_percent,
                    "preservation_score": row.get("preservation_score"),
                }
            )

        for row in ordered_rows:
            if remaining_overflow <= 0:
                break
            if not repair_cut_enabled:
                break
            if str(row.get("cut") or "").strip().lower() != "allow":
                continue

            identity = str(row.get("identity") or "")
            duration_minutes = int(row.get("duration_minutes") or 0)
            duration_after_trim = max(0, duration_minutes - trimmed_minutes_by_identity.get(identity, 0))
            if duration_after_trim <= 0:
                continue
            if cut_threshold_value is not None and float(row.get("preservation_score") or 0.0) > cut_threshold_value:
                continue

            cut_freed_minutes += duration_after_trim
            remaining_overflow -= duration_after_trim
            actions.append(
                {
                    "kind": "cut",
                    "name": row.get("name"),
                    "identity": row.get("identity"),
                    "duration_minutes_before": duration_after_trim,
                    "freed_minutes": duration_after_trim,
                    "preservation_score": row.get("preservation_score"),
                    "preserve_elsewhere_in_week": True,
                }
            )

        if remaining_overflow > 0:
            actions.append(
                {
                    "kind": "surface_impossibility",
                    "remaining_overflow_minutes": remaining_overflow,
                }
            )

        return {
            "overflow_minutes_before_plan": original_overflow_minutes,
            "overflow_minutes_after_mini_substitution": overflow_minutes,
            "overflow_items_for_repack": [dict(item) for item in overflow_items],
            "planned_freed_minutes": mini_freed_minutes + trim_freed_minutes + cut_freed_minutes,
            "mini_freed_minutes": mini_freed_minutes,
            "trim_freed_minutes": trim_freed_minutes,
            "cut_freed_minutes": cut_freed_minutes,
            "remaining_overflow_minutes_after_plan": max(0, remaining_overflow),
            "resolved": remaining_overflow <= 0,
            "actions": actions,
        }

    def _iter_placed_children(self, state: KairosV2RunState) -> List[Dict[str, Any]]:
        """
        Collect already placed child items from the live placement surfaces.
        """
        children: List[Dict[str, Any]] = []
        post_relief = state.schedule.get("post_relief_layout", {}) if isinstance(state.schedule.get("post_relief_layout"), dict) else {}
        active_windows = (
            post_relief.get("window_selections", {}).get("windows", [])
            if post_relief
            else state.schedule.get("window_selections", {}).get("windows", [])
        )
        active_free = (
            post_relief.get("free_block_placements", [])
            if post_relief
            else state.schedule.get("remaining_structure_placement", {}).get("free_block_placements", [])
        )
        active_gaps = (
            post_relief.get("gap_placements", [])
            if post_relief
            else state.schedule.get("remaining_structure_placement", {}).get("gap_placements", [])
        )
        active_buffers = (
            post_relief.get("buffer_placements", [])
            if post_relief
            else state.schedule.get("remaining_structure_placement", {}).get("buffer_placements", [])
        )

        for window in active_windows:
            children.extend(window.get("selected", []))
        for placement in active_free:
            children.extend(placement.get("selected", []))
        for placement in active_gaps:
            children.extend(placement.get("selected", []))
        for placement in active_buffers:
            children.extend(placement.get("selected", []))
        for fill in state.schedule.get("quick_wins", {}).get("fills", []):
            children.extend(fill.get("selected", []))
        return children

    def _apply_pressure_relief_plan(self, state: KairosV2RunState, relief_plan: Dict[str, Any]) -> Dict[str, Any]:
        """
        Apply the planned relief actions onto copied placement surfaces.

        This keeps the current v2 implementation honest:
        - the relief plan becomes visible in the schedule artifact
        - timed surfaces are recomputed after trim/cut
        - overflow repacking remains explicitly deferred
        """
        action_map: Dict[str, List[Dict[str, Any]]] = {}
        for action in relief_plan.get("actions", []):
            identity = str(action.get("identity") or "").strip()
            if not identity:
                continue
            action_map.setdefault(identity, []).append(action)

        copied_windows = deepcopy(state.schedule.get("window_selections", {}).get("windows", []))
        copied_free = deepcopy(state.schedule.get("remaining_structure_placement", {}).get("free_block_placements", []))
        copied_gaps = deepcopy(state.schedule.get("remaining_structure_placement", {}).get("gap_placements", []))
        copied_buffers = deepcopy(state.schedule.get("remaining_structure_placement", {}).get("buffer_placements", []))

        for window in copied_windows:
            self._apply_actions_to_window_surface(window, action_map)
        for placement in copied_free:
            self._apply_actions_to_timed_surface(placement, action_map)
        for placement in copied_gaps:
            self._apply_actions_to_timed_surface(placement, action_map)
        for placement in copied_buffers:
            self._apply_actions_to_timed_surface(placement, action_map)

        residual_gaps = [
            {
                "start_time": placement.get("residual_start_time"),
                "end_time": placement.get("end_time"),
                "duration_minutes": placement.get("remaining_minutes"),
            }
            for placement in copied_gaps
            if int(placement.get("remaining_minutes") or 0) > 0 and placement.get("residual_start_time")
        ]
        residual_buffers = [
            {
                "start_time": placement.get("residual_start_time"),
                "end_time": placement.get("end_time"),
                "duration_minutes": placement.get("remaining_minutes"),
            }
            for placement in copied_buffers
            if int(placement.get("remaining_minutes") or 0) > 0 and placement.get("residual_start_time")
        ]

        applied_layout = {
            "window_selections": {"count": len(copied_windows), "windows": copied_windows},
            "free_block_placements": copied_free,
            "gap_placements": copied_gaps,
            "buffer_placements": copied_buffers,
            "residual_gaps": residual_gaps,
            "residual_buffers": residual_buffers,
            "remaining_overflow_minutes_after_plan": relief_plan.get("remaining_overflow_minutes_after_plan"),
            "overflow_repacking_status": "not_yet_repacked_after_relief",
        }
        state.schedule["post_relief_layout"] = applied_layout
        return applied_layout

    def _apply_actions_to_window_surface(
        self,
        window: Dict[str, Any],
        action_map: Dict[str, List[Dict[str, Any]]],
    ) -> None:
        """
        Apply trim/cut actions to a window surface and recompute timing.
        """
        start_minutes = window.get("start_minutes")
        if start_minutes is None:
            start_minutes = self._parse_hm(window.get("start_time"))
        if start_minutes is None:
            return

        selected = self._apply_actions_to_selected_items(
            selected=window.get("selected", []),
            action_map=action_map,
            start_minutes=int(start_minutes),
        )
        window["selected"] = selected
        window["selected_count"] = len(selected)
        window["selected_minutes"] = sum(int(item.get("duration_minutes") or 0) for item in selected)
        window_duration = int(window.get("window_duration_minutes") or 0)
        window["remaining_window_minutes"] = max(0, window_duration - int(window["selected_minutes"])) if window_duration else 0

    def _apply_actions_to_timed_surface(
        self,
        placement: Dict[str, Any],
        action_map: Dict[str, List[Dict[str, Any]]],
    ) -> None:
        """
        Apply trim/cut actions to a timed placement surface and recompute slack.
        """
        start_minutes = self._parse_hm(placement.get("start_time"))
        end_minutes = self._parse_hm(placement.get("end_time"))
        if start_minutes is None or end_minutes is None or end_minutes <= start_minutes:
            return

        selected = self._apply_actions_to_selected_items(
            selected=placement.get("selected", []),
            action_map=action_map,
            start_minutes=start_minutes,
        )
        placement["selected"] = selected
        placement["selected_minutes"] = sum(int(item.get("duration_minutes") or 0) for item in selected)
        placement["remaining_minutes"] = max(0, int(end_minutes) - int(start_minutes) - int(placement["selected_minutes"]))
        placement["residual_start_time"] = (
            self._minutes_to_hm(int(start_minutes) + int(placement["selected_minutes"]))
            if int(placement["selected_minutes"]) < (int(end_minutes) - int(start_minutes))
            else None
        )

    def _apply_actions_to_selected_items(
        self,
        *,
        selected: List[Dict[str, Any]],
        action_map: Dict[str, List[Dict[str, Any]]],
        start_minutes: int,
    ) -> List[Dict[str, Any]]:
        """
        Apply trim/cut actions to a selected sequence and recompute start/end times.
        """
        cursor = int(start_minutes)
        rewritten: List[Dict[str, Any]] = []
        for item in selected:
            identity = str(item.get("identity") or "").strip()
            actions = action_map.get(identity, [])
            if any(str(action.get("kind") or "") == "cut" for action in actions):
                continue

            trim_freed = sum(
                int(action.get("freed_minutes") or 0)
                for action in actions
                if str(action.get("kind") or "") == "trim"
            )
            duration_minutes = max(0, int(item.get("duration_minutes") or 0) - trim_freed)
            if duration_minutes <= 0:
                continue

            rewritten_item = self._build_timed_selected_item(
                item,
                start_minutes=cursor,
                duration_minutes=duration_minutes,
            )
            rewritten.append(rewritten_item)
            cursor += duration_minutes
        return rewritten

    def _repack_overflow_after_relief(
        self,
        applied_layout: Dict[str, Any],
        overflow_items: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Try to place overflow items into any newly freed free/gap/buffer space.

        This stays within the current v2 boundary:
        - it does not invent new structure
        - it only uses capacity that already exists on authored surfaces
        - it fills those surfaces in the same free -> gap -> buffer order
        """
        remaining = [dict(item) for item in overflow_items]

        copied_free = deepcopy(applied_layout.get("free_block_placements", []))
        copied_gaps = deepcopy(applied_layout.get("gap_placements", []))
        copied_buffers = deepcopy(applied_layout.get("buffer_placements", []))

        copied_free, remaining = self._append_sequence_into_existing_placements(copied_free, remaining)
        copied_gaps, remaining = self._append_sequence_into_existing_placements(copied_gaps, remaining)
        copied_buffers, remaining = self._append_sequence_into_existing_placements(copied_buffers, remaining)

        residual_gaps = [
            {
                "start_time": placement.get("residual_start_time"),
                "end_time": placement.get("end_time"),
                "duration_minutes": placement.get("remaining_minutes"),
            }
            for placement in copied_gaps
            if int(placement.get("remaining_minutes") or 0) > 0 and placement.get("residual_start_time")
        ]
        residual_buffers = [
            {
                "start_time": placement.get("residual_start_time"),
                "end_time": placement.get("end_time"),
                "duration_minutes": placement.get("remaining_minutes"),
            }
            for placement in copied_buffers
            if int(placement.get("remaining_minutes") or 0) > 0 and placement.get("residual_start_time")
        ]

        applied_layout["free_block_placements"] = copied_free
        applied_layout["gap_placements"] = copied_gaps
        applied_layout["buffer_placements"] = copied_buffers
        applied_layout["residual_gaps"] = residual_gaps
        applied_layout["residual_buffers"] = residual_buffers
        applied_layout["remaining_overflow_items_after_repack"] = remaining
        applied_layout["remaining_overflow_minutes_after_repack"] = sum(
            int(item.get("duration_minutes") or 0) for item in remaining
        )
        applied_layout["repacked_item_count"] = len(overflow_items) - len(remaining)
        applied_layout["overflow_repacking_status"] = (
            "resolved_into_existing_surfaces"
            if not remaining
            else "partially_repacked_into_existing_surfaces"
        )
        return applied_layout

    def _append_sequence_into_existing_placements(
        self,
        placements: List[Dict[str, Any]],
        sequence: List[Dict[str, Any]],
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Append an ordered sequence into the residual capacity of existing placements.
        """
        remaining = [dict(item) for item in sequence]

        for placement in placements:
            residual_start = placement.get("residual_start_time")
            start_minutes = self._parse_hm(residual_start) if residual_start else None
            end_minutes = self._parse_hm(placement.get("end_time"))
            if start_minutes is None or end_minutes is None or end_minutes <= start_minutes:
                continue

            cursor = int(start_minutes)
            still_remaining: List[Dict[str, Any]] = []
            appended: List[Dict[str, Any]] = []
            for item in remaining:
                duration = int(item.get("duration_minutes") or 0)
                if duration <= 0:
                    continue
                if cursor + duration <= int(end_minutes):
                    appended.append(
                        self._build_timed_selected_item(
                            item,
                            start_minutes=cursor,
                            duration_minutes=duration,
                        )
                    )
                    cursor += duration
                else:
                    still_remaining.append(item)

            placement["selected"] = list(placement.get("selected", [])) + appended
            placement["selected_minutes"] = sum(int(item.get("duration_minutes") or 0) for item in placement.get("selected", []))
            placement["remaining_minutes"] = max(0, int(end_minutes) - self._parse_hm(placement.get("start_time")) - int(placement["selected_minutes"]))
            placement["residual_start_time"] = (
                self._minutes_to_hm(self._parse_hm(placement.get("start_time")) + int(placement["selected_minutes"]))
                if int(placement["remaining_minutes"]) > 0
                else None
            )
            remaining = still_remaining

        return placements, remaining

    def _build_timed_selected_item(
        self,
        item: Dict[str, Any],
        *,
        start_minutes: int,
        duration_minutes: int,
        extra_fields: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create a consistent timed child record for any placed schedulable item.

        Kairos places children inside windows, free blocks, gaps, buffers, and
        post-relief repacks. They should all share one exact timed shape so the
        timer can consume them without surface-specific parsing rules.
        """
        payload = {
            "name": item.get("name"),
            "identity": item.get("identity"),
            "type": item.get("type"),
            "category": item.get("category"),
            "priority": item.get("priority"),
            "due_date": item.get("due_date"),
            "deadline": item.get("deadline"),
            "local_status_fit": item.get("local_status_fit"),
            "trim": item.get("trim"),
            "cut": item.get("cut"),
            "shift": item.get("shift"),
            "max_trim_percent": item.get("max_trim_percent"),
            "mini_of": item.get("mini_of"),
            "mini_variant": item.get("mini_variant"),
            "manual_injected": item.get("manual_injected"),
            "top_level_parent_name": item.get("top_level_parent_name") or item.get("_top_level_parent_name"),
            "top_level_parent_type": item.get("top_level_parent_type") or item.get("_top_level_parent_type"),
            "duration_minutes": int(duration_minutes),
            "start_minutes": int(start_minutes),
            "end_minutes": int(start_minutes) + int(duration_minutes),
            "start_time": self._minutes_to_hm(int(start_minutes)),
            "end_time": self._minutes_to_hm(int(start_minutes) + int(duration_minutes)),
        }
        if extra_fields:
            payload.update(extra_fields)
        return payload

    def _infer_group_parent_from_children(self, children: List[Dict[str, Any]]) -> tuple[Optional[str], Optional[str]]:
        """
        Infer a shared structural parent for a timed surface from its children.
        """
        parent_names = {
            str(child.get("top_level_parent_name") or "").strip()
            for child in (children or [])
            if str(child.get("top_level_parent_name") or "").strip()
        }
        if len(parent_names) != 1:
            return None, None
        parent_name = next(iter(parent_names))
        parent_types = {
            str(child.get("top_level_parent_type") or "").strip().lower()
            for child in (children or [])
            if str(child.get("top_level_parent_type") or "").strip()
        }
        parent_type = next(iter(parent_types)) if len(parent_types) == 1 else None
        return parent_name, parent_type

    def _build_conceptual_blocks(self, state: KairosV2RunState) -> List[Dict[str, Any]]:
        """
        Build an ordered conceptual block list from trusted timed surfaces.
        """
        blocks: List[Dict[str, Any]] = []
        post_relief = state.schedule.get("post_relief_layout", {}) if isinstance(state.schedule.get("post_relief_layout"), dict) else {}
        active_windows = (
            post_relief.get("window_selections", {}).get("windows", [])
            if post_relief
            else state.schedule.get("window_selections", {}).get("windows", [])
        )
        active_free_placements = (
            post_relief.get("free_block_placements", [])
            if post_relief
            else state.schedule.get("remaining_structure_placement", {}).get("free_block_placements", [])
        )
        active_gap_placements = (
            post_relief.get("gap_placements", [])
            if post_relief
            else state.schedule.get("remaining_structure_placement", {}).get("gap_placements", [])
        )
        active_buffer_placements = (
            post_relief.get("buffer_placements", [])
            if post_relief
            else state.schedule.get("remaining_structure_placement", {}).get("buffer_placements", [])
        )

        for anchor in state.schedule.get("anchor_skeleton", {}).get("anchors", []):
            if anchor.get("start_minutes") is None:
                continue
            anchor_end_minutes = anchor.get("end_minutes")
            if anchor_end_minutes is None and anchor.get("duration_minutes") is not None:
                anchor_end_minutes = int(anchor.get("start_minutes")) + int(anchor.get("duration_minutes") or 0)
            anchor_duration_minutes = anchor.get("duration_minutes")
            if anchor_duration_minutes is None and anchor_end_minutes is not None:
                anchor_duration_minutes = max(0, int(anchor_end_minutes) - int(anchor.get("start_minutes") or 0))
            blocks.append(
                {
                    "kind": "anchor",
                    "name": anchor.get("name"),
                    "start_time": anchor.get("start_time"),
                    "end_time": anchor.get("end_time") or (
                        self._minutes_to_hm(anchor_end_minutes) if anchor_end_minutes is not None else None
                    ),
                    "start_minutes": anchor.get("start_minutes"),
                    "end_minutes": anchor_end_minutes if anchor_end_minutes is not None else anchor.get("start_minutes"),
                    "duration_minutes": anchor_duration_minutes,
                    "children": [],
                }
            )

        for item in (
            state.schedule.get("day_population", {}).get("active_fixed_time_nodes", [])
            if isinstance(state.schedule.get("day_population"), dict)
            else []
        ):
            start_minutes = item.get("start_minutes")
            end_minutes = item.get("end_minutes")
            if start_minutes is None or end_minutes is None:
                continue
            blocks.append(
                {
                    "kind": "fixed_time",
                    "name": item.get("name"),
                    "identity": item.get("identity"),
                    "type": item.get("type"),
                    "start_time": item.get("start_time"),
                    "end_time": item.get("end_time"),
                    "start_minutes": int(start_minutes),
                    "end_minutes": int(end_minutes),
                    "duration_minutes": item.get("duration_minutes"),
                    "children": [],
                    "top_level_parent_name": item.get("top_level_parent_name"),
                    "top_level_parent_type": item.get("top_level_parent_type"),
                }
            )

        for window in active_windows:
            if window.get("start_minutes") is None:
                continue
            group_parent_name, group_parent_type = self._infer_group_parent_from_children(window.get("selected", []))
            blocks.append(
                {
                    "kind": "window",
                    "name": window.get("window_name"),
                    "start_time": window.get("start_time"),
                    "end_time": window.get("end_time"),
                    "start_minutes": window.get("start_minutes"),
                    "end_minutes": window.get("end_minutes"),
                    "duration_minutes": window.get("window_duration_minutes"),
                    "children": window.get("selected", []),
                    "top_level_parent_name": window.get("top_level_parent_name") or group_parent_name,
                    "top_level_parent_type": window.get("top_level_parent_type") or group_parent_type,
                }
            )

        for free_block in state.schedule.get("gap_buffer_recovery", {}).get("explicit_free_blocks", []):
            start_minutes = self._parse_hm(free_block.get("start_time"))
            end_minutes = self._parse_hm(free_block.get("end_time"))
            if start_minutes is None:
                continue
            placement = self._find_surface_placement(
                active_free_placements,
                free_block.get("name"),
            )
            selected_children = placement.get("selected", []) if isinstance(placement, dict) else []
            group_parent_name, group_parent_type = self._infer_group_parent_from_children(selected_children)
            blocks.append(
                {
                    "kind": "free",
                    "name": free_block.get("name"),
                    "start_time": free_block.get("start_time"),
                    "end_time": free_block.get("end_time"),
                    "start_minutes": start_minutes,
                    "end_minutes": end_minutes,
                    "duration_minutes": free_block.get("duration"),
                    "children": selected_children,
                    "top_level_parent_name": group_parent_name,
                    "top_level_parent_type": group_parent_type,
                }
            )

        for buffer_block in state.schedule.get("gap_buffer_recovery", {}).get("explicit_buffer_blocks", []):
            start_minutes = self._parse_hm(buffer_block.get("start_time"))
            end_minutes = self._parse_hm(buffer_block.get("end_time"))
            if start_minutes is None:
                continue
            placement = self._find_surface_placement(
                active_buffer_placements,
                buffer_block.get("name"),
            )
            selected_children = placement.get("selected", []) if isinstance(placement, dict) else []
            group_parent_name, group_parent_type = self._infer_group_parent_from_children(selected_children)
            blocks.append(
                {
                    "kind": "buffer",
                    "name": buffer_block.get("name"),
                    "start_time": buffer_block.get("start_time"),
                    "end_time": buffer_block.get("end_time"),
                    "start_minutes": start_minutes,
                    "end_minutes": end_minutes,
                    "duration_minutes": buffer_block.get("duration"),
                    "children": selected_children,
                    "top_level_parent_name": group_parent_name,
                    "top_level_parent_type": group_parent_type,
                }
            )

        for placement in active_gap_placements:
            if not placement.get("selected"):
                continue
            group_parent_name, group_parent_type = self._infer_group_parent_from_children(placement.get("selected", []))
            span = self._occupied_child_span(
                placement.get("selected", []),
                fallback_start_time=placement.get("start_time"),
                fallback_end_time=placement.get("end_time"),
            )
            blocks.append(
                {
                    "kind": "gap_fill",
                    "name": f"Gap Fill {span.get('start_time')}-{span.get('end_time')}",
                    "start_time": span.get("start_time"),
                    "end_time": span.get("end_time"),
                    "start_minutes": span.get("start_minutes"),
                    "end_minutes": span.get("end_minutes"),
                    "duration_minutes": placement.get("selected_minutes"),
                    "children": placement.get("selected", []),
                    "top_level_parent_name": group_parent_name,
                    "top_level_parent_type": group_parent_type,
                }
            )

        for fill in state.schedule.get("quick_wins", {}).get("fills", []):
            if not fill.get("selected"):
                continue
            group_parent_name, group_parent_type = self._infer_group_parent_from_children(fill.get("selected", []))
            span = self._occupied_child_span(
                fill.get("selected", []),
                fallback_start_time=fill.get("gap_start_time"),
                fallback_end_time=fill.get("gap_end_time"),
            )
            blocks.append(
                {
                    "kind": "quick_wins",
                    "name": f"Quick Wins {span.get('start_time')}-{span.get('end_time')}",
                    "start_time": span.get("start_time"),
                    "end_time": span.get("end_time"),
                    "start_minutes": span.get("start_minutes"),
                    "end_minutes": span.get("end_minutes"),
                    "duration_minutes": fill.get("selected_minutes"),
                    "children": fill.get("selected", []),
                    "top_level_parent_name": group_parent_name,
                    "top_level_parent_type": group_parent_type,
                }
            )

        blocks.sort(
            key=lambda item: (
                item.get("start_minutes") if item.get("start_minutes") is not None else 10**9,
                str(item.get("name") or ""),
            )
        )
        if self._remaining_day_mode(state):
            floor = self._runtime_floor_minutes(state)
            blocks = [
                block
                for block in blocks
                if int(block.get("end_minutes") or -1) > floor
            ]
        return blocks

    def _build_timer_execution_units(self, state: KairosV2RunState) -> List[Dict[str, Any]]:
        """
        Flatten the conceptual schedule into timer-facing execution units.

        Anchors remain top-level units. Timed children inside windows, free
        blocks, gap fills, buffers, and quick wins become their own execution
        units so the timer receives a real ordered runlist.
        """
        conceptual_blocks = (
            state.schedule.get("conceptual_schedule", {}).get("conceptual_blocks", [])
            if isinstance(state.schedule.get("conceptual_schedule"), dict)
            else []
        )
        execution_units: List[Dict[str, Any]] = []

        for block in conceptual_blocks:
            if not isinstance(block, dict):
                continue

            children = block.get("children")
            if isinstance(children, list) and children:
                for child in children:
                    if not isinstance(child, dict):
                        continue
                    execution_units.append(
                        {
                            "kind": "scheduled_child",
                            "parent_kind": block.get("kind"),
                            "parent_name": block.get("name"),
                            "name": child.get("name"),
                            "identity": child.get("identity"),
                            "type": child.get("type"),
                            "start_time": child.get("start_time"),
                            "end_time": child.get("end_time"),
                            "start_minutes": child.get("start_minutes"),
                            "end_minutes": child.get("end_minutes"),
                            "duration_minutes": child.get("duration_minutes"),
                        }
                    )
                continue

            execution_units.append(
                {
                    "kind": block.get("kind"),
                    "parent_kind": None,
                    "parent_name": None,
                    "name": block.get("name"),
                    "identity": block.get("identity"),
                    "type": block.get("type") or ("timeblock" if block.get("kind") == "anchor" else block.get("kind")),
                    "start_time": block.get("start_time"),
                    "end_time": block.get("end_time"),
                    "start_minutes": block.get("start_minutes"),
                    "end_minutes": block.get("end_minutes"),
                    "duration_minutes": block.get("duration_minutes"),
                }
            )

        execution_units.sort(
            key=lambda unit: (
                unit.get("start_minutes") if unit.get("start_minutes") is not None else 10**9,
                str(unit.get("name") or ""),
            )
        )
        return execution_units

    def _active_execution_unit(
        self,
        execution_units: List[Dict[str, Any]],
        state: KairosV2RunState,
    ) -> Optional[Dict[str, Any]]:
        """
        Return the unit currently in progress for the run timestamp.
        """
        if state.target_date != state.now.date():
            return None
        current_minutes = (state.now.hour * 60) + state.now.minute
        for unit in execution_units:
            start_minutes = unit.get("start_minutes")
            end_minutes = unit.get("end_minutes")
            if start_minutes is None or end_minutes is None:
                continue
            if int(start_minutes) <= current_minutes < int(end_minutes):
                return dict(unit)
        return None

    def _next_execution_unit(
        self,
        execution_units: List[Dict[str, Any]],
        state: KairosV2RunState,
    ) -> Optional[Dict[str, Any]]:
        """
        Return the next upcoming execution unit after the run timestamp.
        """
        if state.target_date != state.now.date():
            return dict(execution_units[0]) if execution_units else None
        current_minutes = (state.now.hour * 60) + state.now.minute
        for unit in execution_units:
            start_minutes = unit.get("start_minutes")
            if start_minutes is None:
                continue
            if int(start_minutes) >= current_minutes:
                return dict(unit)
        return None

    def _occupied_child_span(
        self,
        children: List[Dict[str, Any]],
        *,
        fallback_start_time: Any = None,
        fallback_end_time: Any = None,
    ) -> Dict[str, Any]:
        """
        Return the actual occupied span of a selected-child list.

        Runtime-generated blocks like gap fills and quick wins should present
        the span that is actually occupied by their children, not the whole
        residual shell they were drawn from.
        """
        if isinstance(children, list) and children:
            first = children[0] if isinstance(children[0], dict) else {}
            last = children[-1] if isinstance(children[-1], dict) else {}
            start_time = first.get("start_time") or fallback_start_time
            end_time = last.get("end_time") or fallback_end_time
        else:
            start_time = fallback_start_time
            end_time = fallback_end_time

        return {
            "start_time": start_time,
            "end_time": end_time,
            "start_minutes": self._parse_hm(start_time),
            "end_minutes": self._parse_hm(end_time),
        }

    def _find_surface_placement(self, placements: List[Dict[str, Any]], name: Any) -> Optional[Dict[str, Any]]:
        """
        Find a surface placement by name.
        """
        target = str(name or "").strip().lower()
        for placement in placements:
            if str(placement.get("name") or "").strip().lower() == target:
                return placement
        return None

    def _candidate_matches_window(self, candidate: Dict[str, Any], window: Dict[str, Any]) -> bool:
        """
        Check whether a viable candidate belongs in a specific window.
        """
        filters = window.get("filters") or {}
        if not isinstance(filters, dict):
            filters = {}

        filter_tags = [self._normalize_token(tag) for tag in (filters.get("tags") or []) if self._normalize_token(tag)]
        candidate_tags = [self._normalize_token(tag) for tag in (candidate.get("tags") or []) if self._normalize_token(tag)]
        if filter_tags and not set(filter_tags).intersection(candidate_tags):
            return False

        filter_category = self._normalize_token(filters.get("category"))
        candidate_category = self._normalize_token(candidate.get("category"))
        if filter_category and filter_category != candidate_category:
            return False

        return True

    def _narrow_candidates_for_window(
        self,
        window: Dict[str, Any],
        candidates: List[Dict[str, Any]],
        state: KairosV2RunState,
    ) -> Dict[str, Any]:
        """
        Narrow a local window pool before final local selection.

        Current narrowing rules:
        - prefer candidates with explicit semantic affinity to the window when
          any such candidates exist
        - otherwise keep the full local pool
        - if the survivor set is still very large, keep only the strongest few
          preliminary survivors for the final chooser
        """
        if not candidates:
            return {"rule": "empty_pool", "candidates": []}

        category_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("category_settings", {}) or {}).get("Category_Settings", {}),
            rank_key="value",
        )
        priority_weights = self._normalize_ranked_map(
            (state.gathered.get("settings", {}).get("priority_settings", {}) or {}).get("Priority_Settings", {}),
            rank_key="value",
        )
        happiness_weights = self._normalize_happiness_map(
            state.gathered.get("settings", {}).get("map_of_happiness", {}) or {}
        )
        factor_weights = self._priority_factor_weights(state)

        annotated = []
        for candidate in candidates:
            affinity = self._score_window_affinity(candidate, window)
            prelim = affinity + self._score_candidate_for_window(
                candidate=candidate,
                window=window,
                category_weights=category_weights,
                priority_weights=priority_weights,
                happiness_weights=happiness_weights,
                priority_factor_weights=factor_weights,
                target_date=state.target_date,
            )
            annotated.append({"candidate": candidate, "affinity": affinity, "preliminary_score": prelim})

        if any(row["affinity"] > 0 for row in annotated):
            survivors = [row for row in annotated if row["affinity"] > 0]
            rule = "explicit_window_affinity_only"
        else:
            survivors = annotated
            rule = "no_strong_affinity_keep_local_pool"

        survivors.sort(
            key=lambda row: (
                -row["affinity"],
                -row["preliminary_score"],
                row["candidate"].get("name", ""),
            )
        )

        if len(survivors) > 8:
            survivors = survivors[:8]
            rule = f"{rule}_capped_to_top_survivors"

        return {"rule": rule, "candidates": [row["candidate"] for row in survivors]}

    def _score_window_affinity(self, candidate: Dict[str, Any], window: Dict[str, Any]) -> float:
        """
        Score direct semantic affinity between a candidate and a window.

        This is stronger than general weighted desirability because it reflects
        explicit local fit inside this one window.
        """
        score = 0.0
        filters = window.get("filters") or {}
        candidate_tags = [self._normalize_token(tag) for tag in (candidate.get("tags") or []) if self._normalize_token(tag)]
        filter_tags = [self._normalize_token(tag) for tag in (filters.get("tags") or []) if self._normalize_token(tag)]
        score += float(len(set(candidate_tags).intersection(filter_tags))) * 25.0

        candidate_category = self._normalize_token(candidate.get("category"))
        filter_category = self._normalize_token(filters.get("category") or window.get("category"))
        if filter_category and filter_category == candidate_category:
            score += 30.0

        return score

    def _score_candidate_for_window(
        self,
        *,
        candidate: Dict[str, Any],
        window: Dict[str, Any],
        category_weights: Dict[str, Dict[str, int]],
        priority_weights: Dict[str, Dict[str, int]],
        happiness_weights: Dict[str, Dict[str, int]],
        priority_factor_weights: Dict[str, float],
        target_date: date,
    ) -> float:
        """
        Score a viable candidate inside one local window context.
        """
        score = 0.0

        filters = window.get("filters") or {}
        filter_tags = [self._normalize_token(tag) for tag in (filters.get("tags") or []) if self._normalize_token(tag)]
        candidate_tags = [self._normalize_token(tag) for tag in (candidate.get("tags") or []) if self._normalize_token(tag)]
        tag_overlap = len(set(filter_tags).intersection(candidate_tags))
        score += tag_overlap * 20.0

        candidate_category = self._normalize_token(candidate.get("category"))
        filter_category = self._normalize_token(filters.get("category") or window.get("category"))
        if filter_category and filter_category == candidate_category:
            score += 15.0

        if candidate_category in category_weights:
            category_factor = float(priority_factor_weights.get("category", 1.0))
            score += float(category_weights[candidate_category]["weight"]) * category_factor

        priority_value = self._normalize_token(candidate.get("priority"))
        if priority_value in priority_weights:
            priority_factor = float(priority_factor_weights.get("priority_property", 1.0))
            score += float(priority_weights[priority_value]["weight"]) * priority_factor

        score += self._happiness_bonus(
            candidate,
            happiness_weights=happiness_weights,
            priority_factor_weights=priority_factor_weights,
        )
        score += self._urgency_bonus(
            candidate,
            target_date,
            priority_factor_weights=priority_factor_weights,
        )
        if candidate.get("manual_injected"):
            score += 1000.0
        return score

    def _happiness_bonus(
        self,
        candidate: Dict[str, Any],
        *,
        happiness_weights: Dict[str, Dict[str, int]],
        priority_factor_weights: Dict[str, float],
    ) -> float:
        """
        Add happiness alignment using the configured map and weighted factors.
        """
        keys = self._extract_happiness_keys(candidate)
        if not keys:
            return 0.0
        best_weight = max(
            float(happiness_weights[key]["weight"])
            for key in keys
            if key in happiness_weights
        ) if any(key in happiness_weights for key in keys) else 0.0
        if best_weight <= 0:
            return 0.0
        factor = float(priority_factor_weights.get("happiness", 1.0))
        return best_weight * factor

    def _urgency_bonus(
        self,
        candidate: Dict[str, Any],
        target_date: date,
        priority_factor_weights: Optional[Dict[str, float]] = None,
    ) -> float:
        """
        Add a simple due/deadline urgency bonus.
        """
        bonus = 0.0
        priority_factor_weights = priority_factor_weights or {}
        due_date = self._parse_date(candidate.get("due_date"))
        deadline = self._parse_date(candidate.get("deadline"))
        due_factor = float(priority_factor_weights.get("due_date", 4.0)) / 4.0
        deadline_factor = float(priority_factor_weights.get("deadline", 5.0)) / 5.0

        if due_date:
            days_until_due = (due_date - target_date).days
            if days_until_due <= 0:
                bonus += 20.0 * due_factor
            elif days_until_due == 1:
                bonus += 10.0 * due_factor
            elif days_until_due <= 3:
                bonus += 5.0 * due_factor

        if deadline:
            days_until_deadline = (deadline - target_date).days
            if days_until_deadline <= 0:
                bonus += 25.0 * deadline_factor
            elif days_until_deadline == 1:
                bonus += 12.0 * deadline_factor
            elif days_until_deadline <= 3:
                bonus += 6.0 * deadline_factor

        return bonus

    def _parse_date(self, value: Any) -> Optional[date]:
        """
        Parse YYYY-MM-DD values into a date when possible.
        """
        text = str(value or "").strip()
        if not text:
            return None
        try:
            return date.fromisoformat(text)
        except ValueError:
            return None

    def _build_effective_template_child_node(self, parent_template: Dict[str, Any], child_node: Dict[str, Any]) -> Dict[str, Any]:
        """
        Build the effective schedulable node for a template child.

        Inheritance rule:
        - parent template properties apply by default
        - the authored child/backing item can specify otherwise
        - the explicit child node inside the template can override again

        That matches the current v2 rule that parents dictate context unless a
        child explicitly rebels on a specific property.
        """
        backing = self._resolve_authored_schedulable(child_node) or {}
        parent_inherited = self._extract_inheritable_properties(parent_template)
        effective = self._deep_merge_dicts(parent_inherited, backing)
        effective = self._deep_merge_dicts(effective, child_node)
        if backing.get("_source_path"):
            effective["_resolved_source_path"] = backing.get("_source_path")
        return effective

    def _expand_structured_node(
        self,
        parent_node: Dict[str, Any],
        node: Dict[str, Any],
        depth: int = 0,
        top_level_parent_name: Optional[str] = None,
        top_level_parent_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Recursively expand a structured schedulable node.
        """
        if depth > 12:
            return dict(node)

        effective = self._build_effective_template_child_node(parent_node, node)
        children = effective.get("children") or []
        if not isinstance(children, list):
            children = []

        current_top_level_name = top_level_parent_name
        current_top_level_type = top_level_parent_type
        if depth == 0 and children:
            current_top_level_name = str(effective.get("name") or "").strip() or top_level_parent_name
            current_top_level_type = str(effective.get("type") or "").strip().lower() or top_level_parent_type

        if current_top_level_name:
            effective["_top_level_parent_name"] = current_top_level_name
        if current_top_level_type:
            effective["_top_level_parent_type"] = current_top_level_type

        expanded_children = []
        for child in children:
            if not isinstance(child, dict):
                continue
            expanded_children.append(
                self._expand_structured_node(
                    effective,
                    child,
                    depth + 1,
                    current_top_level_name,
                    current_top_level_type,
                )
            )

        effective["children"] = expanded_children
        return effective

    def _resolve_authored_schedulable(self, node: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Resolve a template child reference back to its authored schedulable YAML.
        """
        name = str(node.get("name") or "").strip()
        item_type = str(node.get("type") or "").strip().lower()
        if not name or not item_type:
            return None

        for item in self._iter_schedulable_library_items():
            candidate_type = str(item.get("type") or "").strip().lower()
            candidate_name = str(item.get("name") or "").strip()
            if candidate_type != item_type:
                continue
            if candidate_name.lower() == name.lower():
                return item
        return None

    def _extract_inheritable_properties(self, node: Dict[str, Any]) -> Dict[str, Any]:
        """
        Pull the subset of parent properties that should flow downward.
        """
        inheritable: Dict[str, Any] = {}
        for key in (
            "category",
            "theme",
            "status_requirements",
            "priority",
            "priority_property",
            "happiness",
            "planet",
            "days",
            "tags",
            "window",
            "filters",
        ):
            if key in node:
                inheritable[key] = node.get(key)
        return inheritable

    def _deep_merge_dicts(self, base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
        """
        Merge two dictionaries with override-winning semantics.

        For nested dicts we merge recursively. For lists/scalars the override
        replaces the inherited value entirely, which keeps local rebellion
        explicit and predictable.
        """
        merged = dict(base)
        for key, value in override.items():
            if isinstance(merged.get(key), dict) and isinstance(value, dict):
                merged[key] = self._deep_merge_dicts(merged[key], value)
            else:
                merged[key] = value
        return merged

    def _walk_nodes(self, nodes: List[Any]) -> List[Dict[str, Any]]:
        """
        Flatten a nested schedule/template subtree into a simple node list.
        """
        flattened: List[Dict[str, Any]] = []
        for node in nodes:
            if not isinstance(node, dict):
                continue
            flattened.append(node)
            children = node.get("children") or []
            if isinstance(children, list):
                flattened.extend(self._walk_nodes(children))
        return flattened

    def _is_hard_anchor(self, node: Dict[str, Any]) -> bool:
        """
        Hard anchors are currently defined by `reschedule: never`.
        """
        return str(node.get("reschedule") or "").strip().lower() == "never"

    def _is_sleep_like_node(self, node: Dict[str, Any]) -> bool:
        """
        Detect whether an anchor belongs to the sleep system.
        """
        if node.get("sleep") is True:
            return True
        category = str(node.get("category") or "").strip().lower()
        name = str(node.get("name") or "").strip().lower()
        tags = [str(tag or "").strip().lower() for tag in (node.get("tags") or [])]
        return category == "sleep" or "sleep" in tags or "sleep" in name or "bedtime" in name

    def _normalize_anchor(self, node: Dict[str, Any], anchor_date: date) -> Dict[str, Any]:
        """
        Normalize a hard anchor into a scheduler-facing structure.
        """
        start_minutes = self._parse_hm(node.get("start_time"))
        duration_minutes = self._coerce_minutes(node.get("duration"))
        end_minutes = self._parse_hm(node.get("end_time"))
        start_iso = None
        end_iso = None
        normalized_end_time = node.get("end_time")

        if start_minutes is not None:
            start_dt = datetime.combine(anchor_date, datetime.min.time()) + timedelta(minutes=start_minutes)
            start_iso = start_dt.isoformat(timespec="seconds")
            if duration_minutes is not None:
                end_dt = start_dt + timedelta(minutes=duration_minutes)
                end_minutes = start_minutes + duration_minutes
                normalized_end_time = self._minutes_to_hm(end_minutes)
                end_iso = end_dt.isoformat(timespec="seconds")
            elif end_minutes is not None:
                end_dt = datetime.combine(anchor_date, datetime.min.time()) + timedelta(minutes=end_minutes)
                if end_dt <= start_dt:
                    end_dt += timedelta(days=1)
                end_iso = end_dt.isoformat(timespec="seconds")
                normalized_end_time = self._minutes_to_hm(end_minutes)

        return {
            "name": str(node.get("name") or "Unnamed Anchor").strip(),
            "type": str(node.get("type") or "").strip().lower(),
            "subtype": str(node.get("subtype") or "").strip().lower(),
            "category": str(node.get("category") or "").strip().lower(),
            "start_time": node.get("start_time"),
            "end_time": normalized_end_time,
            "duration": node.get("duration"),
            "start_minutes": start_minutes,
            "end_minutes": end_minutes,
            "duration_minutes": duration_minutes,
            "start_iso": start_iso,
            "end_iso": end_iso,
            "source_rule": "reschedule_never",
        }

    def _anchors_overlap(self, left: Dict[str, Any], right: Dict[str, Any]) -> bool:
        """
        Return whether two anchor records overlap in time.
        """
        left_start = left.get("start_minutes")
        right_start = right.get("start_minutes")
        left_end = left.get("end_minutes")
        right_end = right.get("end_minutes")
        if left_start is None or right_start is None:
            return False
        if left_end is None and left.get("duration_minutes") is not None:
            left_end = int(left_start) + int(left.get("duration_minutes") or 0)
        if right_end is None and right.get("duration_minutes") is not None:
            right_end = int(right_start) + int(right.get("duration_minutes") or 0)
        if left_end is None or right_end is None:
            return False
        return int(left_start) < int(right_end) and int(right_start) < int(left_end)

    def _hard_anchor_semantic_tokens(self, state: KairosV2RunState) -> set[str]:
        """
        Build the set of semantic name tokens already represented by hard anchors.

        This stays intentionally narrow. It only uses exact normalized anchor
        names and the common `_anchor` suffix form so Kairos can avoid obvious
        duplicate semantics like `Breakfast` plus `Breakfast Anchor`.
        """
        tokens: set[str] = set()
        for anchor in state.schedule.get("anchor_skeleton", {}).get("all_anchors", []):
            name_token = self._normalize_token(anchor.get("name"))
            if not name_token:
                continue
            tokens.add(name_token)
            if name_token.endswith("_anchor"):
                stripped = name_token[: -len("_anchor")].strip("_")
                if stripped:
                    tokens.add(stripped)
        return tokens

    def _find_primary_sleep_anchor(self, template: Dict[str, Any], anchor_date: date) -> Optional[Dict[str, Any]]:
        """
        Find the main sleep anchor for the chosen template.
        """
        sleep_anchors: List[Dict[str, Any]] = []
        for node in self._walk_nodes(template.get("children") or []):
            if not self._is_hard_anchor(node):
                continue
            if not self._is_sleep_like_node(node):
                continue
            sleep_anchors.append(self._normalize_anchor(node, anchor_date))

        sleep_anchors.sort(
            key=lambda item: (
                item.get("start_minutes") if item.get("start_minutes") is not None else 10**9,
                item.get("name", ""),
            )
        )
        return sleep_anchors[0] if sleep_anchors else None

    def _parse_hm(self, value: Any) -> Optional[int]:
        """
        Parse HH:MM-ish values into minutes from midnight.
        """
        text = str(value or "").strip()
        if not text:
            return None
        for fmt in ("%H:%M", "%H:%M:%S"):
            try:
                parsed = datetime.strptime(text, fmt)
                return parsed.hour * 60 + parsed.minute
            except ValueError:
                continue
        return None

    def _coerce_minutes(self, value: Any) -> Optional[int]:
        """
        Convert loose duration values into minutes when possible.
        """
        if isinstance(value, (int, float)):
            return max(0, int(round(value)))
        text = str(value or "").strip().lower()
        if not text:
            return None
        if text.isdigit():
            return max(0, int(text))
        if text.endswith("h"):
            try:
                return max(0, int(round(float(text[:-1]) * 60)))
            except ValueError:
                return None
        return None

    def _minutes_to_hm(self, minutes: int) -> str:
        """
        Format minutes from midnight as HH:MM.
        """
        normalized = max(0, int(minutes)) % (24 * 60)
        hours = normalized // 60
        mins = normalized % 60
        return f"{hours:02d}:{mins:02d}"

    def _normalize_token(self, value: Any) -> str:
        """
        Normalize free-form text into a simple matching token.
        """
        return str(value or "").strip().lower().replace(" ", "_").replace("-", "_")

    def _render_decision_log_markdown(self, state: KairosV2RunState) -> str:
        """
        Render the current in-memory decision log as markdown.

        The long-term product will likely write a real `decision_log.md` file.
        For now we render the markdown string directly so the contract exists
        before file output is wired into commands/UI.
        """
        lines = [
            "# Kairos v2 Decision Log",
            "",
            f"- Target Date: `{state.target_date.isoformat()}`",
            f"- Generated At: `{state.now.isoformat(timespec='seconds')}`",
            "",
        ]

        for index, entry in enumerate(state.decision_log, start=1):
            lines.extend(
                [
                    f"## Commit {index}: {entry.get('title')}",
                    "",
                    f"- Phase: `{entry.get('phase')}`",
                    f"- Timestamp: `{entry.get('timestamp')}`",
                    "",
                    str(entry.get("body") or "").strip(),
                    "",
                ]
            )

        return "\n".join(lines).strip() + "\n"

    def _record_commit(self, state: KairosV2RunState, *, phase: str, title: str, body: str) -> None:
        """
        Append a commit-style entry to the run decision log.

        The spec describes Kairos as a commit-like flow: each chosen truth should
        leave behind a human-readable record, both live and later in markdown.
        For now we keep the in-memory structure clean and markdown-friendly.
        """
        entry = {
            "phase": phase,
            "title": title,
            "body": body,
            "timestamp": datetime.now().isoformat(timespec="seconds"),
        }
        state.decision_log.append(entry)
        self._emit_live_commit(state, entry)

    def _emit_live_commit(self, state: KairosV2RunState, entry: Dict[str, Any]) -> None:
        """
        Stream a short, structured "thinking" update during the run.

        This intentionally does not expose raw internal chain-of-thought. It
        emits the same human-readable commit surface Kairos already stores in
        its decision log, optionally enriched with a couple of concrete facts
        from the phase notes.
        """
        if not self._thinking_visible():
            return

        phase = str(entry.get("phase") or "").strip()
        title = str(entry.get("title") or "").strip() or phase or "Kairos update"
        summary_lines = self._build_live_commit_summary(phase, state.phase_notes.get(phase))
        payload = {
            "phase": phase,
            "title": title,
            "body": str(entry.get("body") or "").strip(),
            "summary_lines": summary_lines,
            "timestamp": entry.get("timestamp"),
        }

        callback = self.user_context.get("thinking_callback")
        if callable(callback):
            try:
                callback(payload)
                return
            except Exception:
                pass

        print(f"[Kairos Thinking] {title}", flush=True)
        for line in summary_lines[:3]:
            if str(line).strip():
                print(f"  - {line}", flush=True)

    def _thinking_visible(self) -> bool:
        """
        Decide whether live "thinking" updates should be surfaced.
        """
        raw = self.user_context.get("show_thinking")
        if raw is None:
            raw = self.user_context.get("thinking")
        if raw is None:
            raw = self.user_context.get("live_thinking")
        return self._coerce_bool(raw, False)

    def _coerce_bool(self, raw: Any, default: bool = False) -> bool:
        """
        Small local bool coercion helper for runtime flags.
        """
        if isinstance(raw, bool):
            return raw
        if raw is None:
            return default
        low = str(raw).strip().lower()
        if low in {"1", "true", "yes", "on", "y"}:
            return True
        if low in {"0", "false", "no", "off", "n"}:
            return False
        return default

    def _build_live_commit_summary(self, phase: str, notes: Any) -> List[str]:
        """
        Build terse, phase-specific lines for the live thinking feed.
        """
        if not isinstance(notes, dict):
            return []

        if phase == "gather_information":
            return [
                f"settings={len(notes.get('loaded_settings', []))}",
                f"status={'yes' if notes.get('has_current_status') else 'no'} sleep={'yes' if notes.get('has_sleep_inputs') else 'no'}",
                f"manual={notes.get('manual_injection_count', 0)} injections, {notes.get('manual_adjustment_count', 0)} adjustments",
            ]
        if phase == "model_reality":
            return [
                f"weekday={notes.get('weekday_name')} elapsed={notes.get('minutes_elapsed_since_start_of_day')}m",
                f"remaining_day_mode={'yes' if notes.get('remaining_day_mode') else 'no'}",
                f"weighted_priorities={', '.join(notes.get('weighted_priority_names', [])[:5])}",
            ]
        if phase == "model_sleep":
            return [
                f"sleep_debt={notes.get('raw_sleep_debt_minutes', 0)}m recovery={notes.get('recovery_pressure')}",
                f"inside_sleep={'yes' if notes.get('inside_active_sleep_block') else 'no'} policy={notes.get('sleep_policy') or 'none'}",
            ]
        if phase == "commit_sleep":
            return [
                f"state={notes.get('current_day_state')}",
                f"policy_effect={notes.get('policy_effect') or 'none'}",
            ]
        if phase == "ensure_week_context":
            return [
                f"week_start={notes.get('week_start_date')}",
                f"existing_schedule_count={notes.get('existing_schedule_count', 0)}",
            ]
        if phase == "select_week_template":
            return [
                f"chosen={notes.get('chosen_template') or 'none'}",
                f"reason={notes.get('selection_reason') or 'unknown'} candidates={notes.get('candidate_count', 0)}",
            ]
        if phase == "derive_week_days":
            return [
                f"derived_days={notes.get('derived_day_count', 0)}",
                f"eligible_day_templates={notes.get('eligible_day_template_count', 0)}",
            ]
        if phase == "select_day_template":
            return [
                f"chosen={notes.get('chosen_template') or 'none'}",
                f"reason={notes.get('selection_reason') or 'unknown'} candidates={notes.get('candidate_count', 0)}",
            ]
        if phase == "commit_anchor_skeleton":
            return [
                f"anchors={notes.get('anchor_count', 0)}",
                f"anchor_names={', '.join((notes.get('anchor_names') or [])[:3]) or 'none'}",
            ]
        if phase == "model_day_budget":
            return [
                f"sleep_boundary={notes.get('sleep_boundary_time')}",
                f"open_flexible_minutes={notes.get('open_flexible_minutes_before_sleep', 0)}",
            ]
        if phase == "build_candidate_universe":
            return [
                f"candidates={notes.get('candidate_count', 0)}",
                f"manual_soft_injections={notes.get('manual_soft_injection_count', 0)}",
            ]
        if phase == "remove_reality_impossible_candidates":
            return [
                f"viable={notes.get('viable_count', 0)} impossible={notes.get('impossible_count', 0)}",
                f"no_time_left_today={'yes' if notes.get('no_time_left_today') else 'no'}",
            ]
        if phase == "shape_week":
            return [
                f"viable_candidates={notes.get('viable_candidate_count', 0)}",
            ]
        if phase == "populate_day_and_windows":
            return [
                f"windows={notes.get('window_count', 0)} expanded_children={notes.get('expanded_child_count', 0)}",
                f"window_names={', '.join((notes.get('window_names') or [])[:3]) or 'none'}",
            ]
        if phase == "narrow_window_candidate_pools":
            narrowed = notes.get("narrowed_windows") or []
            if narrowed:
                first = narrowed[0] or {}
                return [
                    f"windows_narrowed={notes.get('window_count', 0)}",
                    f"{first.get('window_name')}: {first.get('initial', 0)} -> {first.get('narrowed', 0)}",
                ]
            return [f"windows_narrowed={notes.get('window_count', 0)}"]
        if phase == "select_window_contents":
            return [
                f"selected_windows={notes.get('window_count', 0)}",
                f"window_names={', '.join((notes.get('selected_window_names') or [])[:3]) or 'none'}",
            ]
        if phase == "handle_gaps_buffers_and_recovery":
            return [
                f"free_blocks={notes.get('explicit_free_block_count', 0)} gaps={notes.get('emergent_gap_count', 0)} buffers={notes.get('explicit_buffer_block_count', 0)}",
                f"recovery={notes.get('recovery_pressure')}",
            ]
        if phase == "build_runtime_helper_windows":
            return [
                f"helper_windows={notes.get('helper_window_count', 0)}",
            ]
        if phase == "place_remaining_structure":
            return [
                f"free={notes.get('free_block_placement_count', 0)} gap={notes.get('gap_placement_count', 0)} buffer={notes.get('buffer_placement_count', 0)}",
                f"overflow_items={notes.get('overflow_count', 0)}",
            ]
        if phase == "run_pressure_relief_pipeline":
            return [
                f"mini={notes.get('mini_substitution_count', 0)} trim={notes.get('trim_action_count', 0)} cut={notes.get('cut_action_count', 0)}",
                f"freed={notes.get('freed_minutes', 0)}m needed={notes.get('needed_minutes', 0)}m",
            ]
        if phase == "fill_quick_wins":
            return [
                f"quick_gap_fills={notes.get('gap_fill_count', 0)}",
                f"selected_items={notes.get('total_selected_items', 0)}",
            ]
        if phase == "finalize_conceptual_schedule":
            return [
                f"conceptual_blocks={notes.get('conceptual_block_count', 0)}",
                f"day_template={notes.get('day_template') or 'none'}",
            ]
        if phase == "build_timer_handoff":
            return [
                f"profile={notes.get('profile_name') or 'none'}",
                f"execution_units={notes.get('execution_unit_count', 0)} active={notes.get('active_execution_unit') or 'none'}",
            ]
        if phase == "persist_decision_log_artifact":
            return [
                f"log={notes.get('path') or 'unwritten'}",
            ]
        return []
