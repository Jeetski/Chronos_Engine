import os
import tempfile
import unittest

import yaml

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in os.sys.path:
    os.sys.path.insert(0, ROOT_DIR)

import commands.start as cmd_start
from modules.timer import main as timer_main


class TestTimerBreakBufferBehavior(unittest.TestCase):
    def test_start_block_to_plan_marks_break_subtype_as_buffer(self):
        block = {
            "name": "Break",
            "type": "timeblock",
            "subtype": "break",
            "duration": 10,
            "start_time": "10:00",
            "end_time": "10:10",
        }
        plan = cmd_start._block_to_plan(block)
        self.assertIsNotNone(plan)
        self.assertTrue(plan.get("is_buffer"))

    def test_timer_build_schedule_plan_marks_break_subtype_as_buffer(self):
        with tempfile.TemporaryDirectory() as td:
            schedule_path = os.path.join(td, "schedule_2026-01-01.yml")
            payload = [
                {
                    "name": "Break",
                    "type": "timeblock",
                    "subtype": "break",
                    "duration": 10,
                    "start_time": "10:00",
                    "end_time": "10:10",
                }
            ]
            with open(schedule_path, "w", encoding="utf-8") as fh:
                yaml.safe_dump(payload, fh, sort_keys=False)

            old_schedule_path_for_date = timer_main.schedule_path_for_date
            old_get_flattened_schedule = timer_main.get_flattened_schedule
            try:
                timer_main.schedule_path_for_date = lambda _date_key: schedule_path
                timer_main.get_flattened_schedule = lambda data: data
                blocks = timer_main._build_schedule_plan_for_date("2026-01-01")
            finally:
                timer_main.schedule_path_for_date = old_schedule_path_for_date
                timer_main.get_flattened_schedule = old_get_flattened_schedule

            self.assertEqual(len(blocks), 1)
            self.assertEqual(blocks[0].get("name"), "Break")
            self.assertTrue(blocks[0].get("is_buffer"))


if __name__ == "__main__":
    unittest.main()

