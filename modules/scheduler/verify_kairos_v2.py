import os
import sys

from datetime import date, datetime


# Keep imports aligned with the project root when this script is run directly.
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))


def main() -> int:
    print("--- Kairos v2 Smoke Check ---")

    try:
        from commands.today import _kairos_v2_conceptual_to_legacy_schedule
        import modules.scheduler.kairos_v2 as kairos_v2_module
        from modules.scheduler.kairos_v2 import KairosV2RunState, KairosV2Scheduler

        deterministic_now = datetime.combine(date.today(), datetime.min.time()).replace(hour=12)
        early_now = datetime.combine(date.today(), datetime.min.time()).replace(hour=0, minute=40)
        scheduler = KairosV2Scheduler(
            {
                "now": deterministic_now,
                "status_overrides": {"focus": "laser"},
                "prioritize": {"planet": "mercury"},
            }
        )
        result = scheduler.generate_schedule()

        assert result["engine"] == "kairos_v2"
        assert result["schedule"]["sleep_commitment"]["committed"] is True
        assert result["schedule"]["anchor_skeleton"]["committed"] is True
        assert result["schedule"]["candidate_universe"]["count"] >= 1
        assert result["schedule"]["conceptual_schedule"]["status"]["conceptual_ready"] is True
        assert result["schedule"]["timer_handoff"]["ready"] is True
        assert result["schedule"]["timer_handoff"]["execution_unit_count"] >= 1
        assert result["decision_log_markdown"].startswith("# Kairos v2 Decision Log")
        assert result["schedule"]["decision_log_artifact"]["written"] is True
        assert os.path.exists(result["schedule"]["decision_log_artifact"]["path"])
        with open(result["schedule"]["decision_log_artifact"]["path"], "r", encoding="utf-8") as handle:
            assert handle.read().startswith("# Kairos v2 Decision Log")
        assert result["reality"]["current_status"].get("focus") == "laser"
        assert result["reality"]["selection_preferences"].get("planet") == "mercury"
        assert result["phase_notes"]["select_week_template"]["candidate_summary"]
        assert result["phase_notes"]["select_day_template"]["candidate_summary"]
        assert result["phase_notes"]["select_week_template"]["candidate_summary"][0].get("target_weekday_matches", 0) >= 1
        assert result["schedule"]["window_narrowing"]["count"] >= 1
        assert any(
            (candidate.get("local_status_fit") or {}).get("has_explicit_requirements")
            for candidate in result["schedule"]["reality_filtered_candidates"]["candidates"]
        )
        for window in result["schedule"]["window_selections"]["windows"]:
            for item in window.get("selected", []):
                assert "local_status_fit" in item
                assert item.get("start_minutes") is not None
                assert item.get("end_minutes") is not None
                assert int(item.get("end_minutes")) > int(item.get("start_minutes"))
        execution_units = result["schedule"]["timer_handoff"]["execution_units"]
        assert execution_units == sorted(
            execution_units,
            key=lambda unit: (
                unit.get("start_minutes") if unit.get("start_minutes") is not None else 10**9,
                str(unit.get("name") or ""),
            ),
        )
        assert any(unit.get("kind") == "scheduled_child" for unit in execution_units)
        assert "next_execution_unit" in result["schedule"]["timer_handoff"]

        remaining_day_scheduler = KairosV2Scheduler(
            {
                "now": deterministic_now,
                "start_from_now": True,
                "status_overrides": {"focus": "laser"},
                "prioritize": {"planet": "mercury"},
            }
        )
        remaining_day_result = remaining_day_scheduler.generate_schedule()
        remaining_day_blocks = remaining_day_result["schedule"]["conceptual_schedule"]["conceptual_blocks"]
        noon_minutes = 12 * 60
        assert remaining_day_result["reality"]["remaining_day_mode"] is True
        assert remaining_day_blocks
        assert all(int(block.get("end_minutes") or -1) > noon_minutes for block in remaining_day_blocks)
        assert all(
            int(window.get("end_minutes") or -1) > noon_minutes
            for window in remaining_day_result["schedule"]["window_selections"]["windows"]
        )
        missed_window = {
            "name": "Missed Morning Window",
            "type": "window",
            "window": True,
            "start": "08:00",
            "end": "09:00",
            "children": [
                {
                    "name": "Brush Teeth",
                    "type": "task",
                }
            ],
        }
        active_window = {
            "name": "Active Midday Window",
            "type": "window",
            "window": True,
            "start": "12:00",
            "end": "13:00",
            "children": [
                {
                    "name": "Journal",
                    "type": "task",
                }
            ],
        }
        structural_viable_candidates = [
            {
                "identity": "task:brush teeth",
                "name": "Brush Teeth",
                "type": "task",
                "duration": 5,
            },
            {
                "identity": "task:journal",
                "name": "Journal",
                "type": "task",
                "duration": 10,
            },
        ]
        structural_sequence = scheduler._build_ordered_structural_sequence(
            [missed_window, active_window],
            structural_viable_candidates,
            set(),
            {scheduler._window_identity_for_node(active_window)},
        )
        structural_names = [item.get("name") for item in structural_sequence]
        assert "Brush Teeth" in structural_names
        assert "Journal" not in structural_names
        assert scheduler._template_property_matches(
            {"properties": {"theme": "admin"}},
            "theme",
            "admin",
        ) is True
        assert scheduler._template_has_property_presence(
            {"properties": {"travel_week": True}},
            "travel_week",
        ) is True

        quick_win_state = KairosV2RunState(target_date=date.today(), now=deterministic_now)
        quick_win_state.gathered = {
            "settings": {
                "quick_wins_settings": {
                    "max_minutes": 15,
                    "quick_label": "quick_win",
                }
            }
        }
        quick_win_state.schedule = {
            "post_relief_layout": {
                "residual_gaps": [
                    {
                        "start_time": "14:00",
                        "end_time": "14:15",
                        "duration_minutes": 15,
                    }
                ]
            },
            "reality_filtered_candidates": {
                "candidates": [
                    {
                        "name": "Tiny Admin Win",
                        "identity": "task:tiny_admin_win",
                        "type": "task",
                        "duration": 10,
                        "tags": ["quick_win"],
                    }
                ]
            },
        }
        scheduler.fill_quick_wins(quick_win_state)
        quick_win_fill = quick_win_state.schedule["quick_wins"]["fills"][0]
        quick_win_item = quick_win_fill["selected"][0]
        assert quick_win_item["start_time"] == "14:00"
        assert quick_win_item["end_time"] == "14:10"
        assert quick_win_item["start_minutes"] == 14 * 60
        assert quick_win_item["end_minutes"] == (14 * 60) + 10
        quick_win_blocks = scheduler._build_conceptual_blocks(quick_win_state)
        assert quick_win_blocks[0]["start_time"] == "14:00"
        assert quick_win_blocks[0]["end_time"] == "14:10"

        fixed_time_scheduler = KairosV2Scheduler(
            {
                "now": early_now,
                "status_overrides": {"energy": "medium"},
                "prioritize": {"planet": "jupiter"},
            }
        )
        fixed_time_result = fixed_time_scheduler.generate_schedule()
        fixed_time_nodes = fixed_time_result["schedule"]["day_population"]["active_fixed_time_nodes"]
        assert any(node.get("name") == "Tidy up Bedroom" and node.get("start_time") == "06:20" for node in fixed_time_nodes)
        conceptual_blocks = fixed_time_result["schedule"]["conceptual_schedule"]["conceptual_blocks"]
        tidy_blocks = [block for block in conceptual_blocks if block.get("name") == "Tidy up Bedroom"]
        assert tidy_blocks
        assert tidy_blocks[0]["kind"] == "fixed_time"
        assert tidy_blocks[0]["start_time"] == "06:20"
        execution_units = fixed_time_result["schedule"]["timer_handoff"]["execution_units"]
        tidy_units = [unit for unit in execution_units if unit.get("name") == "Tidy up Bedroom"]
        assert tidy_units
        assert tidy_units[0]["type"] == "habit"
        assert tidy_units[0]["start_time"] == "06:20"
        assert all(
            not (unit.get("name") == "Tidy up Bedroom" and unit.get("start_minutes", 10**9) < (6 * 60 + 20))
            for unit in execution_units
        )
        grouped_rows = _kairos_v2_conceptual_to_legacy_schedule(conceptual_blocks, date.today(), execution_units)
        morning_routine_rows = [row for row in grouped_rows if row.get("name") == "Morning Routine"]
        assert morning_routine_rows
        morning_children = morning_routine_rows[0].get("children") or []
        assert any(child.get("name") in {"Workout Window", "Morning Free Time 60", "Gap Fill 00:40-00:55"} for child in morning_children)

        gap_fill_state = KairosV2RunState(target_date=date.today(), now=deterministic_now)
        gap_fill_state.schedule = {
            "remaining_structure_placement": {
                "gap_placements": [
                    {
                        "start_time": "00:04",
                        "end_time": "06:30",
                        "selected_minutes": 25,
                        "selected": [
                            scheduler._build_timed_selected_item(
                                {"name": "Night Catchup", "identity": "task:night_catchup", "type": "task"},
                                start_minutes=4,
                                duration_minutes=25,
                            )
                        ],
                    }
                ]
            }
        }
        gap_fill_blocks = scheduler._build_conceptual_blocks(gap_fill_state)
        assert gap_fill_blocks[0]["kind"] == "gap_fill"
        assert gap_fill_blocks[0]["start_time"] == "00:04"
        assert gap_fill_blocks[0]["end_time"] == "00:29"

        mini_scheduler = KairosV2Scheduler({"now": deterministic_now})
        mini_scheduler._iter_schedulable_library_items = lambda: [
            {
                "name": "Morning Routine Mini",
                "type": "routine",
                "duration": 15,
                "mini_of": "morning routine",
            }
        ]
        mini_substitutions = mini_scheduler._find_available_mini_substitutions(
            [
                {
                    "name": "Morning Routine",
                    "identity": "routine:morning routine",
                    "type": "routine",
                    "duration_minutes": 180,
                }
            ]
        )
        assert mini_substitutions
        adjusted_overflow, mini_actions = mini_scheduler._apply_mini_substitutions_to_overflow_items(
            [
                {
                    "name": "Morning Routine",
                    "identity": "routine:morning routine",
                    "type": "routine",
                    "duration_minutes": 180,
                }
            ],
            mini_substitutions,
        )
        assert adjusted_overflow[0]["name"] == "Morning Routine Mini"
        assert adjusted_overflow[0]["duration_minutes"] == 15
        assert mini_actions[0]["kind"] == "mini_substitution"
        mini_relief_plan = mini_scheduler._plan_pressure_relief_actions(
            overflow_items=adjusted_overflow,
            placed_children=[],
            category_weights={},
            priority_weights={},
            happiness_weights={},
            priority_factor_weights={},
            target_date=date.today(),
            mini_actions=mini_actions,
            overflow_minutes_before_minis=180,
        )
        assert mini_relief_plan["overflow_minutes_before_plan"] == 180
        assert mini_relief_plan["overflow_minutes_after_mini_substitution"] == 15
        assert mini_relief_plan["mini_freed_minutes"] == 165

        manual_scheduler = KairosV2Scheduler(
            {
                "now": deterministic_now,
                "manual_injections": [
                    {
                        "name": "Manual Hard Injection Conflict",
                        "type": "task",
                        "mode": "hard",
                        "start_time": "13:15",
                        "source": "test",
                    },
                    {
                        "name": "Manual Hard Injection Test",
                        "type": "task",
                        "mode": "hard",
                        "start_time": "15:15",
                        "source": "test",
                    },
                    {
                        "name": "Manual Soft Injection Test",
                        "type": "task",
                        "mode": "soft",
                        "source": "test",
                    },
                ],
                "manual_adjustments": [
                    {
                        "action": "trim",
                        "name": "Manual Soft Injection Test",
                        "type": "task",
                        "amount": 10,
                        "source": "test",
                    },
                ],
            }
        )
        manual_result = manual_scheduler.generate_schedule()
        assert not any(
            anchor.get("name") == "Manual Hard Injection Conflict"
            for anchor in manual_result["schedule"]["anchor_skeleton"]["all_anchors"]
        )
        assert any(
            anchor.get("name") == "Manual Hard Injection Test"
            for anchor in manual_result["schedule"]["anchor_skeleton"]["all_anchors"]
        )
        assert any(
            event.get("name") == "Manual Hard Injection Conflict"
            for event in manual_result["schedule"]["anchor_skeleton"]["manual_hard_events"]["rejected"]
        )
        manual_soft_candidate = next(
            candidate
            for candidate in manual_result["schedule"]["candidate_universe"]["candidates"]
            if candidate.get("name") == "Manual Soft Injection Test"
        )
        assert manual_soft_candidate.get("manual_injected") is True
        assert int(manual_soft_candidate.get("duration") or 0) == 20
        assert any(
            event.get("action") == "trim" and event.get("name") == "Manual Soft Injection Test"
            for event in manual_result["schedule"]["candidate_universe"]["manual_adjustment_events"]
        )
        assert any(
            child.get("name") == "Manual Soft Injection Test"
            for window in manual_result["schedule"]["window_selections"]["windows"]
            if window.get("runtime_helper") is True
            for child in window.get("selected", [])
        )

        dawn_now = datetime.combine(date.today(), datetime.min.time()).replace(hour=6)
        original_sleep_gate = kairos_v2_module.get_active_sleep_block
        kairos_v2_module.get_active_sleep_block = lambda now=None: {
            "name": "Mock Sleep Block",
            "template_name": "Mock Sleep Template",
            "template_path": "mock://sleep",
            "start_iso": dawn_now.replace(hour=0, minute=0).isoformat(timespec="seconds"),
            "end_iso": dawn_now.replace(hour=7, minute=0).isoformat(timespec="seconds"),
            "start_time": "00:00",
            "end_time": "07:00",
            "duration_minutes": 420,
        }
        try:
            stay_awake_result = KairosV2Scheduler(
                {"now": dawn_now, "start_from_now": True, "sleep_policy": "stay_awake"}
            ).generate_schedule()
            shift_later_result = KairosV2Scheduler(
                {"now": dawn_now, "start_from_now": True, "sleep_policy": "shift_later"}
            ).generate_schedule()
        finally:
            kairos_v2_module.get_active_sleep_block = original_sleep_gate
        assert stay_awake_result["schedule"]["sleep_commitment"]["sleep_policy"] == "stay_awake"
        assert shift_later_result["schedule"]["sleep_commitment"]["sleep_policy"] == "shift_later"
        assert stay_awake_result["schedule"]["sleep_commitment"]["effective_active_sleep_block"] is None
        shift_block = shift_later_result["schedule"]["sleep_commitment"]["effective_active_sleep_block"]
        assert isinstance(shift_block, dict)
        assert shift_later_result["schedule"]["sleep_commitment"]["policy_effect"] == "delay_remaining_day_until_sleep_block_end"
        assert (
            shift_later_result["schedule"]["day_budget"]["remaining_minutes_before_sleep"]
            < stay_awake_result["schedule"]["day_budget"]["remaining_minutes_before_sleep"]
        )

        pressure_plan = scheduler._plan_pressure_relief_actions(
            overflow_items=[
                {"name": "Overflow A", "duration_minutes": 50},
                {"name": "Overflow B", "duration_minutes": 10},
            ],
            placed_children=[
                {
                    "name": "Low Value Admin",
                    "identity": "task:low_value_admin",
                    "duration_minutes": 40,
                    "category": "admin",
                    "priority": "low",
                    "trim": "allow",
                    "cut": "allow",
                    "max_trim_percent": 50,
                },
                {
                    "name": "Admin Cleanup",
                    "identity": "task:admin_cleanup",
                    "duration_minutes": 15,
                    "category": "admin",
                    "priority": "low",
                    "trim": "never",
                    "cut": "allow",
                },
                {
                    "name": "Deadline Work",
                    "identity": "task:deadline_work",
                    "duration_minutes": 30,
                    "category": "work",
                    "priority": "high",
                    "deadline": date.today().isoformat(),
                    "trim": "allow",
                    "cut": "never",
                    "max_trim_percent": 25,
                },
            ],
            category_weights={"admin": {"rank": 5, "weight": 1}, "work": {"rank": 1, "weight": 5}},
            priority_weights={"low": {"rank": 5, "weight": 1}, "high": {"rank": 1, "weight": 5}},
            happiness_weights={},
            priority_factor_weights={"category": 6.0, "priority_property": 4.0, "deadline": 5.0, "due_date": 4.0},
            target_date=date.today(),
        )

        assert pressure_plan["overflow_minutes_before_plan"] == 60
        assert pressure_plan["planned_freed_minutes"] >= 60
        assert pressure_plan["resolved"] is True
        assert pressure_plan["actions"][0]["kind"] == "trim"
        assert any(action["kind"] == "cut" for action in pressure_plan["actions"])

        preference_score = scheduler._score_template_preference_matches(
            {"planet": "mercury", "category": "weekly_cycle"},
            type("StubState", (), {
                "reality": {"selection_preferences": {"planet": "mercury", "category": "weekly_cycle"}},
                "gathered": {
                    "settings": {
                        "category_settings": {
                            "Category_Settings": {
                                "weekly_cycle": {"value": 1},
                            }
                        },
                        "priority_settings": {"Priority_Settings": {}},
                        "map_of_happiness": {},
                    }
                },
            })(),
        )
        assert preference_score["score"] > 0
        assert any(match["key"] == "planet" for match in preference_score["matched_preferences"])

        low_fit_score = scheduler._score_preservation_value(
            candidate={
                "category": "work",
                "priority": "high",
                "local_status_fit": {
                    "has_explicit_requirements": True,
                    "weighted_distance": 10,
                },
            },
            category_weights={"work": {"rank": 1, "weight": 5}},
            priority_weights={"high": {"rank": 1, "weight": 5}},
            target_date=date.today(),
        )
        good_fit_score = scheduler._score_preservation_value(
            candidate={
                "category": "work",
                "priority": "high",
                "local_status_fit": {
                    "has_explicit_requirements": True,
                    "weighted_distance": 0,
                },
            },
            category_weights={"work": {"rank": 1, "weight": 5}},
            priority_weights={"high": {"rank": 1, "weight": 5}},
            target_date=date.today(),
        )
        assert low_fit_score < good_fit_score

        happiness_score = scheduler._score_candidate_for_window(
            candidate={"happiness": ["meaning"]},
            window={"filters": {}},
            category_weights={},
            priority_weights={},
            happiness_weights={"meaning": {"rank": 1, "weight": 7}},
            priority_factor_weights={"happiness": 4.0},
            target_date=date.today(),
        )
        neutral_score = scheduler._score_candidate_for_window(
            candidate={},
            window={"filters": {}},
            category_weights={},
            priority_weights={},
            happiness_weights={"meaning": {"rank": 1, "weight": 7}},
            priority_factor_weights={"happiness": 4.0},
            target_date=date.today(),
        )
        assert happiness_score > neutral_score

        print(f"Engine: {result['engine']}")
        print(f"Target Date: {result['target_date']}")
        print(f"Chosen Day Template: {result['schedule']['day_template']['name']}")
        print(f"Hard Anchors: {result['schedule']['anchor_skeleton']['count']}")
        print(f"Candidates: {result['schedule']['candidate_universe']['count']}")
        print(f"Window Narrowing: {result['schedule']['window_narrowing']['count']}")
        print(f"Day Budget: {result['schedule']['day_budget']}")
        print(f"Timer Profile: {result['schedule']['timer_handoff']['profile_name']}")
        print(f"Focus Override: {result['reality']['current_status'].get('focus')}")
        print(
            "Pressure Relief Plan: "
            f"{pressure_plan['planned_freed_minutes']} freed / "
            f"{pressure_plan['overflow_minutes_before_plan']} needed"
        )
        print(f"Decision Log File: {result['schedule']['decision_log_artifact']['path']}")
        print("Decision Log Markdown: OK")
        print("Smoke Check: PASS")
        return 0

    except Exception as exc:
        print(f"Smoke Check: FAIL -> {exc}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
