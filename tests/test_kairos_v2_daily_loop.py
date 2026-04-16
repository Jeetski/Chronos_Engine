import io
import os
import sys
import unittest
from contextlib import ExitStack, redirect_stdout
from datetime import datetime
from unittest.mock import MagicMock, patch

import yaml


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TESTS_DIR = os.path.join(ROOT_DIR, "tests")
for path in (ROOT_DIR, TESTS_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

from chronos_fixture import (
    FIXTURE_BLOCK_NAMES,
    FIXTURE_NOW,
    temporary_kairos_user_fixture,
)
from commands import complete as Complete
from commands import did as Did
from commands import mark as Mark
from commands import start as Start
from commands import today as Today
from modules.item_manager import read_item_data
from modules.scheduler import build_block_key, load_day_runtime, schedule_path_for_date
from modules.scheduler.kairos_v2 import KairosV2Scheduler as RealKairosV2Scheduler


FIXTURE_DATE_STR = FIXTURE_NOW.strftime("%Y-%m-%d")


class FixedDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        if tz is not None:
            return tz.fromutc(FIXTURE_NOW.replace(tzinfo=tz))
        return cls(
            FIXTURE_NOW.year,
            FIXTURE_NOW.month,
            FIXTURE_NOW.day,
            FIXTURE_NOW.hour,
            FIXTURE_NOW.minute,
            FIXTURE_NOW.second,
            FIXTURE_NOW.microsecond,
        )


def _build_real_v2_scheduler(user_context=None):
    ctx = dict(user_context or {})
    ctx.setdefault("now", FIXTURE_NOW)
    return RealKairosV2Scheduler(ctx)


class TestKairosV2DailyLoop(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.fixture = self.stack.enter_context(temporary_kairos_user_fixture())
        self.stack.enter_context(patch("modules.scheduler.KairosV2Scheduler", side_effect=_build_real_v2_scheduler))
        self.stack.enter_context(patch("commands.today.datetime", FixedDateTime))
        self.stack.enter_context(patch("commands.start.datetime", FixedDateTime))
        self.stack.enter_context(patch("commands.mark.datetime", FixedDateTime))
        self.stack.enter_context(patch("commands.did.datetime", FixedDateTime))
        self.stack.enter_context(patch("commands.complete.datetime", FixedDateTime))
        self.stack.enter_context(patch("commands.today.build_sleep_interrupt", return_value=None))
        self.stack.enter_context(patch("commands.start.build_sleep_interrupt", return_value=None))
        self.stack.enter_context(patch("commands.mark.run_completion_effects", return_value=None))
        self.stack.enter_context(patch("commands.complete.run_completion_effects", return_value=None))
        self.stack.enter_context(patch("commands.did.Points", None))

    def tearDown(self):
        self.stack.close()

    def _run_today_reschedule(self, properties=None):
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            Today.run(["reschedule"], dict(properties or {}))
        return buffer.getvalue()

    def _load_completion_entries(self):
        path = os.path.join(
            self.fixture["user_dir"],
            "schedules",
            "completions",
            f"{FIXTURE_DATE_STR}.yml",
        )
        if not os.path.exists(path):
            return {}
        with open(path, "r", encoding="utf-8") as handle:
            payload = yaml.safe_load(handle) or {}
        entries = payload.get("entries", payload)
        return entries if isinstance(entries, dict) else {}

    def test_today_reschedule_writes_v2_runtime_day(self):
        self._run_today_reschedule()

        schedule_path = schedule_path_for_date(FIXTURE_DATE_STR)
        runtime_payload = load_day_runtime(FIXTURE_DATE_STR, path=schedule_path)
        self.assertEqual(runtime_payload.get("engine"), "kairos_v2")

        items = runtime_payload.get("items") or []
        self.assertEqual([item.get("name") for item in items], FIXTURE_BLOCK_NAMES)
        self.assertTrue(all(item.get("kind") == "fixed_time" for item in items))

        execution_units = (
            runtime_payload.get("schedule", {})
            .get("timer_handoff", {})
            .get("execution_units", [])
        )
        self.assertEqual([unit.get("name") for unit in execution_units], FIXTURE_BLOCK_NAMES)

    def test_start_day_builds_timer_queue_from_v2_runtime(self):
        captured = {}

        def fake_invoke_command(command_name, args_list, properties=None):
            self.assertEqual(command_name, "today")
            Today.run(list(args_list or []), dict(properties or {}))

        def fake_start_schedule_plan(plan, *, profile_name=None, confirm_completion=True):
            captured["plan"] = plan
            captured["profile_name"] = profile_name
            captured["confirm_completion"] = confirm_completion
            return {"ok": True, "plan": plan}

        with patch("commands.start.invoke_command", side_effect=fake_invoke_command):
            with patch("commands.start.Timer.start_schedule_plan", side_effect=fake_start_schedule_plan):
                with redirect_stdout(io.StringIO()):
                    Start.run(["day"], {})

        self.assertEqual(captured["profile_name"], "classic_pomodoro")
        self.assertFalse(captured["confirm_completion"])
        self.assertEqual(
            [block.get("name") for block in captured["plan"]["blocks"]],
            FIXTURE_BLOCK_NAMES,
        )
        self.assertEqual(captured["plan"]["blocks"][0].get("minutes"), 90)
        self.assertEqual(captured["plan"]["blocks"][1].get("minutes"), 30)
        self.assertEqual(captured["plan"]["blocks"][2].get("minutes"), 10)

    def test_mark_updates_item_and_completion_log_from_runtime_schedule(self):
        self._run_today_reschedule()

        with redirect_stdout(io.StringIO()):
            Mark.run(
                ["Deep Work Sprint:completed"],
                {
                    "date": FIXTURE_DATE_STR,
                    "start_time": "09:00",
                },
            )

        task_data = read_item_data("task", "Deep Work Sprint")
        self.assertEqual(task_data.get("status"), "completed")

        entries = self._load_completion_entries()
        entry = entries.get(build_block_key("Deep Work Sprint", "09:00"))
        self.assertIsNotNone(entry)
        self.assertEqual(entry.get("status"), "completed")
        self.assertEqual(entry.get("scheduled_start"), "09:00")
        self.assertEqual(entry.get("scheduled_end"), "10:30")

    def test_did_logs_actual_outcome_for_runtime_block(self):
        self._run_today_reschedule()

        with redirect_stdout(io.StringIO()):
            Did.run(
                ["Inbox Zero Sweep"],
                {
                    "date": FIXTURE_DATE_STR,
                    "start_time": "10:45",
                    "status": "partial",
                    "note": "Handled half",
                    "actual_end": "11:00",
                },
            )

        entries = self._load_completion_entries()
        entry = entries.get(build_block_key("Inbox Zero Sweep", "10:45"))
        self.assertIsNotNone(entry)
        self.assertEqual(entry.get("status"), "partial")
        self.assertEqual(entry.get("scheduled_start"), "10:45")
        self.assertEqual(entry.get("scheduled_end"), "11:15")
        self.assertEqual(entry.get("actual_end"), "11:00")
        self.assertEqual(entry.get("note"), "Handled half")

    def test_complete_logs_completion_against_runtime_schedule(self):
        self._run_today_reschedule()
        fake_dispatch = MagicMock()

        with patch("commands.complete.dispatch_command", fake_dispatch):
            with patch("commands.complete.is_trackable", return_value=False):
                with redirect_stdout(io.StringIO()):
                    Complete.run(["task", "Deep Work Sprint"], {})

        fake_dispatch.assert_called_once()
        entries = self._load_completion_entries()
        entry = entries.get(build_block_key("Deep Work Sprint", "09:00"))
        self.assertIsNotNone(entry)
        self.assertEqual(entry.get("status"), "completed")
        self.assertEqual(entry.get("scheduled_start"), "09:00")
        self.assertEqual(entry.get("scheduled_end"), "10:30")


if __name__ == "__main__":
    unittest.main()
