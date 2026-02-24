import io
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from Commands import Today
from Modules.Scheduler.Kairos import KairosScheduler
from Modules.Scheduler.WeeklyGenerator import WeeklyGenerator


class TestKairosEngine(unittest.TestCase):
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
