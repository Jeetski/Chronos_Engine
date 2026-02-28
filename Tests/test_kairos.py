import io
import os
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from Commands import Today
from Modules.Scheduler.Kairos import KairosScheduler
from Modules.Scheduler.WeeklyGenerator import WeeklyGenerator


class TestKairosEngine(unittest.TestCase):
    def test_pre_schedule_hooks_enabled_runs_commitment_and_milestone(self):
        scheduler = KairosScheduler()
        called = {"commitment": 0, "milestone": 0}
        commitment_main = types.ModuleType("Modules.Commitment.main")
        milestone_main = types.ModuleType("Modules.Milestone.main")

        def _commitment():
            called["commitment"] += 1

        def _milestone():
            called["milestone"] += 1

        commitment_main.evaluate_and_trigger = _commitment
        milestone_main.evaluate_and_update_milestones = _milestone
        commitment_pkg = types.ModuleType("Modules.Commitment")
        milestone_pkg = types.ModuleType("Modules.Milestone")
        commitment_pkg.main = commitment_main
        milestone_pkg.main = milestone_main

        with patch.dict(
            sys.modules,
            {
                "Modules.Commitment": commitment_pkg,
                "Modules.Commitment.main": commitment_main,
                "Modules.Milestone": milestone_pkg,
                "Modules.Milestone.main": milestone_main,
            },
        ):
            scheduler._run_pre_schedule_hooks()

        self.assertEqual(called["commitment"], 1)
        self.assertEqual(called["milestone"], 1)
        notes = scheduler.phase_notes.get("pre_schedule_hooks", {})
        self.assertTrue(notes.get("enabled"))
        self.assertTrue(all(bool(r.get("ok")) for r in notes.get("results", [])))

    def test_pre_schedule_hooks_disabled_skips_execution(self):
        scheduler = KairosScheduler(user_context={"evaluate_hooks": False})
        scheduler._run_pre_schedule_hooks()
        notes = scheduler.phase_notes.get("pre_schedule_hooks", {})
        self.assertFalse(notes.get("enabled"))
        self.assertEqual(notes.get("reason"), "evaluate_hooks=false")

    def test_anchor_conflict_fail_fast(self):
        scheduler = KairosScheduler()
        scheduler.windows = [{"name": "W", "start": "09:00", "end": "10:00", "filter": {}}]
        ranked = [
            {
                "id": "a1",
                "name": "Anchor A",
                "type": "task",
                "kairos_score": 1.0,
                "_raw": {"reschedule": "never", "start_time": "22:30", "end_time": "23:00", "duration": "30m"},
            },
            {
                "id": "a2",
                "name": "Anchor B",
                "type": "task",
                "kairos_score": 1.0,
                "_raw": {"reschedule": "never", "start_time": "22:45", "end_time": "23:15", "duration": "30m"},
            },
        ]
        result = scheduler.construct_schedule(ranked, __import__("datetime").date.today())
        stats = result.get("stats", {})
        self.assertFalse(stats.get("valid", True))
        self.assertEqual(stats.get("invalid_reason"), "anchor_conflicts")
        self.assertEqual(len(result.get("blocks", [])), 1)

    def test_timer_break_insertion(self):
        scheduler = KairosScheduler()
        scheduler.runtime = {
            "options": {"use_buffers": False, "use_timer_breaks": True},
            "timer_settings": {"default_profile": "p"},
            "timer_profiles": {"p": {"focus_minutes": 25, "short_break_minutes": 5}},
            "buffer_settings": {},
        }
        timeline = [
            (
                540,
                565,
                {"name": "Task 1", "type": "task", "window_name": "WIN", "start_time": "09:00", "end_time": "09:25"},
            ),
            (
                570,
                600,
                {"name": "Task 2", "type": "task", "window_name": "WIN", "start_time": "09:30", "end_time": "10:00"},
            ),
        ]
        out, events = scheduler._insert_timeblocks(timeline)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].get("subtype"), "break")
        self.assertEqual(events[0].get("buffer_type"), "timer_profile")
        self.assertEqual(len(out), 3)

    def test_sprint_split(self):
        scheduler = KairosScheduler(user_context={"use_timer_sprints": True})
        scheduler.runtime = {
            "options": {"use_timer_sprints": True, "use_buffers": False, "use_timer_breaks": False},
            "timer_settings": {"default_profile": "p"},
            "timer_profiles": {"p": {"focus_minutes": 25, "short_break_minutes": 5}},
            "quick_wins_settings": {"max_minutes": 15},
            "buffer_settings": {},
        }
        scheduler.windows = [{"name": "Work", "start": "09:00", "end": "10:00", "filter": {}}]
        ranked = [
            {"id": "t1", "name": "Deep Work", "type": "task", "duration": "50m", "kairos_score": 10.0, "_raw": {}},
        ]
        result = scheduler.construct_schedule(ranked, __import__("datetime").date.today())
        blocks = [b for b in result.get("blocks", []) if b.get("name") == "Deep Work"]
        self.assertEqual(len(blocks), 2)
        self.assertTrue(blocks[0].get("sprint", {}).get("enabled"))
        self.assertEqual(blocks[0].get("duration_minutes"), 25)
        self.assertEqual(blocks[1].get("duration_minutes"), 25)

    def test_ignore_trends_short_circuit(self):
        scheduler = KairosScheduler()
        trend_map, notes = scheduler._load_trend_map(ignore_trends=True)
        self.assertEqual(trend_map, {})
        self.assertFalse(notes.get("enabled"))
        self.assertEqual(notes.get("reason"), "ignore_trends=true")

    def test_custom_property_weight_changes_scoring(self):
        scheduler = KairosScheduler(user_context={"custom_property": "focus_depth", "prioritize": {"custom_property": "8"}})
        scheduler.runtime = {
            "weights": {
                "priority_property": 0.0,
                "category": 0.0,
                "environment": 0.0,
                "due_date": 0.0,
                "deadline": 0.0,
                "happiness": 0.0,
                "status_alignment": 0.0,
                "trend_reliability": 0.0,
                "custom_property": 8.0,
            },
            "status_context": {"types": {}, "current": {}},
            "happiness_map": None,
            "trend_map": {},
            "Today": None,
            "options": {"custom_property": "focus_depth"},
        }
        scheduler.last_target_date = __import__("datetime").date.today()
        ranked = scheduler.score_candidates(
            [
                {"name": "A", "type": "task", "priority": "low", "_raw": {"focus_depth": 10}},
                {"name": "B", "type": "task", "priority": "low", "_raw": {}},
            ]
        )
        self.assertGreater(float(ranked[0].get("kairos_score") or 0.0), float(ranked[1].get("kairos_score") or 0.0))
        self.assertEqual(ranked[0].get("name"), "A")
        self.assertTrue(any("custom_property[focus_depth]" in r for r in ranked[0].get("_score_reasons", [])))

    def test_missed_promotion_boost_applies_when_score_meets_threshold(self):
        scheduler = KairosScheduler()
        scheduler.runtime = {
            "weights": {
                "priority_property": 10.0,
                "category": 0.0,
                "environment": 0.0,
                "due_date": 0.0,
                "deadline": 0.0,
                "happiness": 0.0,
                "status_alignment": 0.0,
                "trend_reliability": 0.0,
                "custom_property": 0.0,
            },
            "status_context": {"types": {}, "current": {}},
            "happiness_map": None,
            "trend_map": {},
            "Today": None,
            "options": {},
            "missed_promotions": {
                "enabled": True,
                "threshold": 30,
                "boost": 20.0,
                "by_name": {"task_a": {"net_missed": 1, "sources": ["2026-02-27"]}},
            },
        }
        scheduler.last_target_date = __import__("datetime").date.today()
        ranked = scheduler.score_candidates(
            [
                {"name": "Task A", "type": "task", "priority": "medium", "_raw": {}},
                {"name": "Task B", "type": "task", "priority": "medium", "_raw": {}},
            ]
        )
        self.assertEqual(ranked[0].get("name"), "Task A")
        self.assertTrue(any("missed_promotion=+20.00" in r for r in ranked[0].get("_score_reasons", [])))

    def test_missed_promotion_respects_threshold(self):
        scheduler = KairosScheduler()
        scheduler.runtime = {
            "weights": {
                "priority_property": 10.0,
                "category": 0.0,
                "environment": 0.0,
                "due_date": 0.0,
                "deadline": 0.0,
                "happiness": 0.0,
                "status_alignment": 0.0,
                "trend_reliability": 0.0,
                "custom_property": 0.0,
            },
            "status_context": {"types": {}, "current": {}},
            "happiness_map": None,
            "trend_map": {},
            "Today": None,
            "options": {},
            "missed_promotions": {
                "enabled": True,
                "threshold": 80,  # baseline score is 50, so boost should not apply
                "boost": 20.0,
                "by_name": {"task_a": {"net_missed": 1, "sources": ["2026-02-27"]}},
            },
        }
        scheduler.last_target_date = __import__("datetime").date.today()
        ranked = scheduler.score_candidates(
            [
                {"name": "Task A", "type": "task", "priority": "medium", "_raw": {}},
                {"name": "Task B", "type": "task", "priority": "medium", "_raw": {}},
            ]
        )
        a = next(row for row in ranked if row.get("name") == "Task A")
        self.assertFalse(any("missed_promotion=" in r for r in a.get("_score_reasons", [])))

    def test_filter_candidates_normalizes_place_matching(self):
        scheduler = KairosScheduler()
        scheduler.runtime = {
            "status_context": {"types": {}, "current": {"place": "At Home"}},
            "Today": None,
        }
        candidates = [
            {
                "id": "t1",
                "name": "Home Task",
                "type": "task",
                "_raw": {"place": "at_home"},
                "duration": "30m",
            }
        ]
        kept = scheduler.filter_candidates(candidates)
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0].get("name"), "Home Task")

    def test_env_score_normalizes_place_tokens(self):
        scheduler = KairosScheduler()
        status_context = {"types": {}, "current": {"place": "At Home"}}
        score = scheduler._env_score({"place": "at_home"}, status_context, 7.0)
        self.assertEqual(score, 7.0)

    def test_window_candidates_generic_filter_scalar_property(self):
        scheduler = KairosScheduler()
        ranked = [
            {"id": "a", "name": "Alpha", "type": "task", "kairos_score": 10.0, "_raw": {"energy_mode": "high"}, "duration": "30m"},
            {"id": "b", "name": "Beta", "type": "task", "kairos_score": 9.0, "_raw": {"energy_mode": "low"}, "duration": "30m"},
        ]
        out = scheduler._window_candidates(
            ranked,
            used=set(),
            win={"name": "Focus", "filter": {"energy_mode": "high"}},
            fill=0,
            cap=60,
            remaining={"a": 30, "b": 30},
            sprint_cap=0,
        )
        self.assertEqual([x.get("name") for x in out], ["Alpha"])

    def test_window_candidates_generic_filter_list_intersection(self):
        scheduler = KairosScheduler()
        ranked = [
            {"id": "a", "name": "Alpha", "type": "task", "kairos_score": 10.0, "_raw": {"contexts": ["quiet", "deep"]}, "duration": "30m"},
            {"id": "b", "name": "Beta", "type": "task", "kairos_score": 9.0, "_raw": {"contexts": ["social"]}, "duration": "30m"},
        ]
        out = scheduler._window_candidates(
            ranked,
            used=set(),
            win={"name": "Deep", "filter": {"contexts": ["quiet"]}},
            fill=0,
            cap=60,
            remaining={"a": 30, "b": 30},
            sprint_cap=0,
        )
        self.assertEqual([x.get("name") for x in out], ["Alpha"])

    def test_resolve_windows_applies_runtime_filter_overrides(self):
        scheduler = KairosScheduler(
            user_context={
                "window_filter_overrides": [
                    {"key": "energy_mode", "value": "high"},
                ]
            }
        )
        scheduler.runtime = {}
        windows = scheduler._resolve_windows(__import__("datetime").date.today())
        self.assertTrue(windows)
        filt = windows[0].get("filter") if isinstance(windows[0], dict) else {}
        self.assertEqual((filt or {}).get("energy_mode"), "high")

    def test_manual_hard_injection_conflicts_with_anchor_without_override(self):
        scheduler = KairosScheduler(
            user_context={
                "manual_injections": [
                    {"name": "Injected Block", "type": "task", "mode": "hard", "start_time": "09:10", "source": "test"}
                ]
            }
        )
        scheduler.runtime = {
            "options": {"use_buffers": False, "use_timer_breaks": False, "use_timer_sprints": False},
            "timer_settings": {},
            "timer_profiles": {},
            "quick_wins_settings": {"max_minutes": 15},
            "buffer_settings": {},
        }
        scheduler.windows = [{"name": "W", "start": "09:00", "end": "10:00", "filter": {}}]
        ranked = [
            {
                "id": "a1",
                "name": "Anchor A",
                "type": "task",
                "kairos_score": 1.0,
                "_raw": {"reschedule": "never", "start_time": "09:00", "end_time": "09:30", "duration": "30m"},
            }
        ]
        result = scheduler.construct_schedule(ranked, __import__("datetime").date.today())
        names = [str(b.get("name") or "") for b in result.get("blocks", [])]
        self.assertNotIn("Injected Block", names)
        manual = (scheduler.phase_notes.get("construct", {}) or {}).get("manual_injections", {})
        hard = manual.get("hard", {}) if isinstance(manual, dict) else {}
        conflicts = hard.get("conflicts", []) if isinstance(hard, dict) else []
        self.assertTrue(conflicts)
        self.assertEqual(str(conflicts[0].get("reason")), "anchor_overlap")

    def test_manual_hard_injection_can_override_anchor(self):
        scheduler = KairosScheduler(
            user_context={
                "manual_injections": [
                    {
                        "name": "Injected Block",
                        "type": "task",
                        "mode": "hard",
                        "start_time": "09:10",
                        "override_anchor": True,
                        "source": "test",
                    }
                ]
            }
        )
        scheduler.runtime = {
            "options": {"use_buffers": False, "use_timer_breaks": False, "use_timer_sprints": False},
            "timer_settings": {},
            "timer_profiles": {},
            "quick_wins_settings": {"max_minutes": 15},
            "buffer_settings": {},
        }
        scheduler.windows = [{"name": "W", "start": "09:00", "end": "10:00", "filter": {}}]
        ranked = [
            {
                "id": "a1",
                "name": "Anchor A",
                "type": "task",
                "kairos_score": 1.0,
                "_raw": {"reschedule": "never", "start_time": "09:00", "end_time": "09:30", "duration": "30m"},
            }
        ]
        result = scheduler.construct_schedule(ranked, __import__("datetime").date.today())
        names = [str(b.get("name") or "") for b in result.get("blocks", [])]
        self.assertIn("Injected Block", names)
        self.assertNotIn("Anchor A", names)
        manual = (scheduler.phase_notes.get("construct", {}) or {}).get("manual_injections", {})
        hard = manual.get("hard", {}) if isinstance(manual, dict) else {}
        displaced = hard.get("displaced", []) if isinstance(hard, dict) else []
        self.assertTrue(displaced)

    def test_repair_shift_moves_flexible_overlap(self):
        scheduler = KairosScheduler()
        timeline = [
            (540, 600, {"name": "Anchor", "type": "task", "window_name": "ANCHOR", "reschedule": "never"}),
            (570, 630, {"name": "Flexible", "type": "task", "kairos_score": 1.0, "reschedule": "auto"}),
        ]
        repaired, info = scheduler._repair_timeline_shift(timeline, max_iterations=3)
        self.assertEqual(info.get("moved"), 1)
        names = [row[2].get("name") for row in repaired]
        self.assertIn("Flexible", names)
        flex = next(row for row in repaired if row[2].get("name") == "Flexible")
        self.assertGreaterEqual(int(flex[0]), 600)
        self.assertEqual(int(info.get("remaining_overlaps", 0)), 0)

    def test_repair_trim_enabled_resolves_when_shift_has_no_space(self):
        scheduler = KairosScheduler()
        timeline = [
            (540, 570, {"name": "Anchor", "type": "task", "window_name": "ANCHOR", "reschedule": "never"}),
            (560, 620, {"name": "Flexible", "type": "task", "kairos_score": 1.0, "reschedule": "auto"}),
            (600, 660, {"name": "Late Lock", "type": "task", "window_name": "ANCHOR", "reschedule": "never"}),
        ]
        repaired, info = scheduler._repair_timeline_shift(
            timeline,
            max_iterations=3,
            enable_trim=True,
            min_duration_minutes=5,
            day_floor=0,
            day_ceiling=620,
        )
        self.assertGreaterEqual(int(info.get("trimmed", 0)), 1)
        self.assertEqual(int(info.get("remaining_overlaps", 0)), 0)
        flex = next(row for row in repaired if row[2].get("name") == "Flexible")
        # Flexible should be trimmed to fit the 570-600 slot.
        self.assertEqual(int(flex[0]), 570)
        self.assertEqual(int(flex[1]), 600)
        self.assertEqual(int(flex[2].get("duration_minutes") or 0), 30)

    def test_repair_cut_enabled_removes_low_score_overlap(self):
        scheduler = KairosScheduler()
        timeline = [
            (540, 570, {"name": "Anchor", "type": "task", "window_name": "ANCHOR", "reschedule": "never"}),
            (560, 620, {"name": "Flexible", "type": "task", "kairos_score": 1.0, "reschedule": "auto"}),
            (600, 660, {"name": "Late Lock", "type": "task", "window_name": "ANCHOR", "reschedule": "never"}),
        ]
        repaired, info = scheduler._repair_timeline_shift(
            timeline,
            max_iterations=3,
            enable_trim=False,
            enable_cut=True,
            cut_score_threshold=5.0,
            day_floor=0,
            day_ceiling=620,
        )
        self.assertGreaterEqual(int(info.get("cut", 0)), 1)
        self.assertEqual(int(info.get("remaining_overlaps", 0)), 0)
        names = [row[2].get("name") for row in repaired]
        self.assertNotIn("Flexible", names)

    def test_dependency_shift_moves_after_prerequisite_end(self):
        scheduler = KairosScheduler()
        timeline = [
            (540, 600, {"name": "Prepare", "type": "task"}),
            (570, 600, {"name": "Execute", "type": "task", "depends_on": ["Prepare"]}),
            (600, 630, {"name": "Anchor", "type": "task", "window_name": "ANCHOR", "reschedule": "never"}),
        ]
        shifted, info = scheduler._propagate_dependency_shifts(
            timeline,
            day_floor=0,
            day_ceiling=24 * 60,
            max_iterations=50,
        )
        self.assertGreaterEqual(int(info.get("shifted", 0)), 1)
        execute = next(row for row in shifted if row[2].get("name") == "Execute")
        # Must land after Prepare, and avoid overlap with the anchor at 10:00-10:30.
        self.assertEqual(int(execute[0]), 630)
        self.assertEqual(int(execute[1]), 660)
        self.assertEqual(int(info.get("remaining_violations", 0)), 0)

    def test_dependency_shift_cascades_chain(self):
        scheduler = KairosScheduler()
        timeline = [
            (540, 600, {"name": "A", "type": "task"}),
            (550, 580, {"name": "B", "type": "task", "depends_on": ["A"]}),
            (560, 590, {"name": "C", "type": "task", "depends_on": ["B"]}),
        ]
        shifted, info = scheduler._propagate_dependency_shifts(
            timeline,
            day_floor=0,
            day_ceiling=24 * 60,
            max_iterations=50,
        )
        by_name = {row[2].get("name"): row for row in shifted}
        self.assertEqual(int(by_name["B"][0]), 600)
        self.assertEqual(int(by_name["C"][0]), 630)
        self.assertEqual(int(info.get("remaining_violations", 0)), 0)


class TestKairosCommandParsing(unittest.TestCase):
    def test_today_kairos_native_syntax_parsing(self):
        captured = {}

        class FakeKairos:
            def __init__(self, user_context=None):
                captured["ctx"] = user_context or {}
                self.phase_notes = {"gather": {}, "filter": {}, "construct": {}}

            def generate_schedule(self, _):
                return {"date": "2026-02-21", "blocks": [], "stats": {}}

        old_user_dir = Today.USER_DIR
        with tempfile.TemporaryDirectory() as td:
            Today.USER_DIR = td
            os.makedirs(os.path.join(td, "Schedules"), exist_ok=True)
            with patch("Modules.Scheduler.KairosScheduler", FakeKairos):
                with redirect_stdout(io.StringIO()):
                    Today.run(
                        [
                            "kairos",
                            "template:Saturday",
                            "status:energy=high,focus=high",
                            "prioritize:happiness=9,deadline=5",
                            "buffers:false",
                            "breaks:timer",
                            "sprints:true",
                            "timer_profile:classic_pomodoro",
                            "quickwins:10",
                            "ignore-trends",
                            "custom_property:focus_depth",
                            "repair-trim:true",
                            "repair-min-duration:7",
                            "repair-cut:true",
                            "repair-cut-threshold:4",
                            "evaluate-hooks:false",
                        ],
                        {},
                    )
        Today.USER_DIR = old_user_dir
        ctx = captured.get("ctx", {})
        self.assertEqual(ctx.get("force_template"), "Saturday")
        self.assertEqual(ctx.get("status_overrides", {}).get("energy"), "high")
        self.assertEqual(ctx.get("status_overrides", {}).get("focus"), "high")
        self.assertEqual(ctx.get("prioritize", {}).get("happiness"), "9")
        self.assertFalse(ctx.get("use_buffers"))
        self.assertTrue(ctx.get("use_timer_breaks"))
        self.assertTrue(ctx.get("use_timer_sprints"))
        self.assertEqual(ctx.get("timer_profile"), "classic_pomodoro")
        self.assertEqual(ctx.get("quickwins_max_minutes"), 10)
        self.assertTrue(ctx.get("ignore_trends"))
        self.assertEqual(ctx.get("custom_property"), "focus_depth")
        self.assertTrue(ctx.get("repair_trim"))
        self.assertEqual(ctx.get("repair_min_duration"), 7)
        self.assertTrue(ctx.get("repair_cut"))
        self.assertEqual(ctx.get("repair_cut_threshold"), 4.0)
        self.assertFalse(ctx.get("evaluate_hooks"))

    def test_today_reschedule_properties_map_into_kairos_context(self):
        captured = {}

        class FakeKairos:
            def __init__(self, user_context=None):
                captured["ctx"] = user_context or {}
                self.phase_notes = {"construct": {"windows": []}}

            def generate_schedule(self, _):
                return {"date": "2026-02-21", "blocks": [], "stats": {}}

        old_user_dir = Today.USER_DIR
        with tempfile.TemporaryDirectory() as td:
            Today.USER_DIR = td
            os.makedirs(os.path.join(td, "Schedules"), exist_ok=True)
            with patch("Modules.Scheduler.KairosScheduler", FakeKairos):
                with redirect_stdout(io.StringIO()):
                    Today.run(
                        ["reschedule"],
                        {
                            "buffers": False,
                            "breaks": "timer",
                            "sprints": True,
                            "ignore-trends": True,
                            "repair-trim": True,
                            "repair-cut": True,
                            "repair-min-duration": 7,
                            "repair-cut-threshold": 4,
                            "evaluate-hooks": False,
                            "window_filter_name": "Deep Work",
                            "window_filter_key": "energy_mode",
                            "window_filter_value": "high,deep",
                        },
                    )
        Today.USER_DIR = old_user_dir
        ctx = captured.get("ctx", {})
        self.assertIn("start_from_now", ctx)
        self.assertFalse(ctx.get("use_buffers"))
        self.assertTrue(ctx.get("use_timer_breaks"))
        self.assertTrue(ctx.get("use_timer_sprints"))
        self.assertTrue(ctx.get("ignore_trends"))
        self.assertTrue(ctx.get("repair_trim"))
        self.assertTrue(ctx.get("repair_cut"))
        self.assertEqual(ctx.get("repair_min_duration"), 7)
        self.assertEqual(ctx.get("repair_cut_threshold"), 4.0)
        self.assertFalse(ctx.get("evaluate_hooks"))
        wfo = ctx.get("window_filter_overrides") or []
        self.assertTrue(wfo)
        self.assertEqual(str(wfo[0].get("window")), "Deep Work")
        self.assertEqual(str(wfo[0].get("key")), "energy_mode")
        self.assertEqual(wfo[0].get("value"), ["high", "deep"])

    def test_today_reschedule_accepts_multiple_window_filter_overrides(self):
        captured = {}

        class FakeKairos:
            def __init__(self, user_context=None):
                captured["ctx"] = user_context or {}
                self.phase_notes = {"construct": {"windows": []}}

            def generate_schedule(self, _):
                return {"date": "2026-02-21", "blocks": [], "stats": {}}

        old_user_dir = Today.USER_DIR
        with tempfile.TemporaryDirectory() as td:
            Today.USER_DIR = td
            os.makedirs(os.path.join(td, "Schedules"), exist_ok=True)
            with patch("Modules.Scheduler.KairosScheduler", FakeKairos):
                with redirect_stdout(io.StringIO()):
                    Today.run(
                        ["reschedule"],
                        {
                            "window_filter_overrides": [
                                {"window": "Deep Work", "key": "energy_mode", "value": "high"},
                                {"window": "", "key": "contexts", "value": "quiet,deep"},
                            ]
                        },
                    )
        Today.USER_DIR = old_user_dir
        ctx = captured.get("ctx", {})
        wfo = ctx.get("window_filter_overrides") or []
        self.assertEqual(len(wfo), 2)
        self.assertEqual(str(wfo[0].get("window")), "Deep Work")
        self.assertEqual(str(wfo[0].get("key")), "energy_mode")
        self.assertEqual(wfo[0].get("value"), "high")
        self.assertIsNone(wfo[1].get("window"))
        self.assertEqual(str(wfo[1].get("key")), "contexts")
        self.assertEqual(wfo[1].get("value"), ["quiet", "deep"])


class TestWeeklyGenerator(unittest.TestCase):
    def test_weekly_skeleton_days_and_commitment_plan(self):
        fake_schedule = {
            "date": "2026-02-21",
            "blocks": [
                {"name": "Morning Walk", "type": "habit", "start_time": "09:00", "end_time": "09:30", "window_name": "Work", "kairos_score": 8.0}
            ],
            "stats": {"valid": True, "scheduled_items": 1},
        }

        class FakeKairos:
            def __init__(self, user_context=None):
                self.user_context = user_context or {}
                self.phase_notes = {"template": {"template_path": "x.yml", "windows_found": 1}, "anchors": {"placed": 0}}

            def generate_schedule(self, _):
                return dict(fake_schedule)

        with patch("Modules.Scheduler.WeeklyGenerator.KairosScheduler", FakeKairos), patch(
            "Modules.Scheduler.WeeklyGenerator.list_all_items",
            return_value=[
                {
                    "name": "Fitness 3x Weekly",
                    "type": "commitment",
                    "status": "active",
                }
            ],
        ), patch(
            "Modules.Scheduler.WeeklyGenerator.get_commitment_status",
            return_value={
                "kind": "frequency",
                "times": 3,
                "period": "week",
                "progress": 1,
                "targets": [{"type": "habit", "name": "Morning Walk"}],
            },
        ):
            gen = WeeklyGenerator()
            payload = gen.generate_skeleton(days=3)
            self.assertEqual(payload.get("days"), 3)
            self.assertEqual(len(payload.get("skeleton", [])), 3)
            plans = payload.get("commitment_plan", [])
            self.assertEqual(len(plans), 1)
            self.assertEqual(plans[0].get("remaining"), 2)
            self.assertTrue(len(plans[0].get("recommended_days", [])) >= 1)


if __name__ == "__main__":
    unittest.main()
