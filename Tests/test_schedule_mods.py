import unittest
import tempfile
import os
from datetime import datetime, timedelta
import io
from contextlib import redirect_stdout, redirect_stderr

# Add root to sys.path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in os.sys.path:
    os.sys.path.insert(0, ROOT_DIR)

from Modules import Scheduler
from Modules import ItemManager

import Commands.stretch as cmd_stretch
import Commands.anchor as cmd_anchor
import Commands.split as cmd_split
import Commands.merge as cmd_merge
import Commands.template as cmd_template


class TestScheduleModifications(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = self.temp_dir.name
        self.user_dir = os.path.join(self.root, "User")
        os.makedirs(os.path.join(self.user_dir, "Schedules"), exist_ok=True)
        os.makedirs(os.path.join(self.user_dir, "Days"), exist_ok=True)
        os.makedirs(os.path.join(self.user_dir, "Tasks"), exist_ok=True)

        # Patch Scheduler + ItemManager roots
        self._scheduler_user_dir = Scheduler.USER_DIR
        self._item_root_dir = ItemManager.ROOT_DIR
        self._item_user_dir = ItemManager.USER_DIR
        Scheduler.USER_DIR = self.user_dir
        ItemManager.ROOT_DIR = self.root
        ItemManager.USER_DIR = self.user_dir

        # Patch template command roots
        self._template_root_dir = cmd_template.ROOT_DIR
        self._template_user_dir = cmd_template.USER_DIR
        cmd_template.ROOT_DIR = self.root
        cmd_template.USER_DIR = self.user_dir

    def tearDown(self):
        Scheduler.USER_DIR = self._scheduler_user_dir
        ItemManager.ROOT_DIR = self._item_root_dir
        ItemManager.USER_DIR = self._item_user_dir
        cmd_template.ROOT_DIR = self._template_root_dir
        cmd_template.USER_DIR = self._template_user_dir
        self.temp_dir.cleanup()

    def _basic_schedule(self, name="Block A", start_hour=9, minutes=30):
        start = datetime(2026, 1, 1, start_hour, 0)
        end = start + timedelta(minutes=minutes)
        return [
            {
                "name": name,
                "type": "task",
                "status": "pending",
                "duration": minutes,
                "start_time": start,
                "end_time": end,
                "children": [],
            }
        ]

    def _silent(self, fn, *args, **kwargs):
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            return fn(*args, **kwargs)

    def test_stretch_manual_mod(self):
        schedule = self._basic_schedule()
        schedule_path = Scheduler.schedule_path_for_date(datetime.now())
        self._silent(Scheduler.stretch_item_in_file, schedule_path, "Block A", 15)
        mods = Scheduler.load_manual_modifications(Scheduler.manual_modifications_path_for_schedule(schedule_path))
        self._silent(Scheduler.apply_manual_modifications, schedule, mods)
        self.assertEqual(schedule[0]["duration"], 45)
        self.assertEqual(schedule[0]["end_time"].strftime("%H:%M"), "09:45")

    def test_anchor_manual_mod(self):
        schedule = self._basic_schedule()
        schedule_path = Scheduler.schedule_path_for_date(datetime.now())
        self._silent(Scheduler.anchor_item_in_file, schedule_path, "Block A", scope="today")
        mods = Scheduler.load_manual_modifications(Scheduler.manual_modifications_path_for_schedule(schedule_path))
        self._silent(Scheduler.apply_manual_modifications, schedule, mods)
        self.assertEqual(schedule[0].get("reschedule"), "never")
        self.assertTrue(schedule[0].get("anchored"))

    def test_split_manual_mod(self):
        schedule = self._basic_schedule(minutes=30)
        schedule_path = Scheduler.schedule_path_for_date(datetime.now())
        self._silent(Scheduler.split_item_in_file, schedule_path, "Block A", count=3)
        mods = Scheduler.load_manual_modifications(Scheduler.manual_modifications_path_for_schedule(schedule_path))
        self._silent(Scheduler.apply_manual_modifications, schedule, mods)
        self.assertEqual(len(schedule), 3)
        self.assertEqual(schedule[0]["name"], "Block A (1/3)")
        self.assertEqual(schedule[1]["name"], "Block A (2/3)")
        self.assertEqual(schedule[2]["name"], "Block A (3/3)")
        self.assertEqual(schedule[0]["duration"], 10)

    def test_merge_manual_mod(self):
        start = datetime(2026, 1, 1, 9, 0)
        schedule = [
            {
                "name": "Block A",
                "type": "task",
                "status": "pending",
                "duration": 30,
                "start_time": start,
                "end_time": start + timedelta(minutes=30),
                "children": [],
            },
            {
                "name": "Block B",
                "type": "task",
                "status": "pending",
                "duration": 30,
                "start_time": start + timedelta(minutes=30),
                "end_time": start + timedelta(minutes=60),
                "children": [],
            },
        ]
        schedule_path = Scheduler.schedule_path_for_date(datetime.now())
        self._silent(Scheduler.merge_item_in_file, schedule_path, "Block A", "Block B")
        mods = Scheduler.load_manual_modifications(Scheduler.manual_modifications_path_for_schedule(schedule_path))
        self._silent(Scheduler.apply_manual_modifications, schedule, mods)
        self.assertEqual(len(schedule), 1)
        self.assertEqual(schedule[0]["duration"], 60)

    def test_anchor_command_item_scope(self):
        ItemManager.write_item_data("task", "Deep Work", {"name": "Deep Work", "type": "task"})
        self._silent(cmd_anchor.run, ["Deep", "Work"], {"scope": "item", "type": "task"})
        data = ItemManager.read_item_data("task", "Deep Work")
        self.assertEqual(data.get("reschedule"), "never")

    def test_split_command(self):
        schedule = self._basic_schedule()
        schedule_path = Scheduler.schedule_path_for_date(datetime.now())
        Scheduler.save_schedule(schedule, schedule_path)
        self._silent(cmd_split.run, ["Block", "A"], {"count": 2})
        mods = Scheduler.load_manual_modifications(Scheduler.manual_modifications_path_for_schedule(schedule_path))
        self._silent(Scheduler.apply_manual_modifications, schedule, mods)
        self.assertEqual(len(schedule), 2)

    def test_merge_command(self):
        start = datetime(2026, 1, 1, 9, 0)
        schedule = [
            {
                "name": "Block A",
                "type": "task",
                "status": "pending",
                "duration": 30,
                "start_time": start,
                "end_time": start + timedelta(minutes=30),
                "children": [],
            },
            {
                "name": "Block B",
                "type": "task",
                "status": "pending",
                "duration": 30,
                "start_time": start + timedelta(minutes=30),
                "end_time": start + timedelta(minutes=60),
                "children": [],
            },
        ]
        schedule_path = Scheduler.schedule_path_for_date(datetime.now())
        Scheduler.save_schedule(schedule, schedule_path)
        self._silent(cmd_merge.run, ["Block", "A", "with", "Block", "B"], {})
        mods = Scheduler.load_manual_modifications(Scheduler.manual_modifications_path_for_schedule(schedule_path))
        self._silent(Scheduler.apply_manual_modifications, schedule, mods)
        self.assertEqual(len(schedule), 1)

    def test_stretch_command(self):
        schedule = self._basic_schedule()
        schedule_path = Scheduler.schedule_path_for_date(datetime.now())
        Scheduler.save_schedule(schedule, schedule_path)
        self._silent(cmd_stretch.run, ["Block", "A", "10"], {})
        mods = Scheduler.load_manual_modifications(Scheduler.manual_modifications_path_for_schedule(schedule_path))
        self._silent(Scheduler.apply_manual_modifications, schedule, mods)
        self.assertEqual(schedule[0]["duration"], 40)

    def test_template_save_day(self):
        schedule = self._basic_schedule()
        schedule_path = Scheduler.schedule_path_for_date(datetime.now())
        Scheduler.save_schedule(schedule, schedule_path)
        self._silent(cmd_template.run, ["save", "day", "Focus Friday"], {})
        path = os.path.join(self.user_dir, "Days", "Focus Friday.yml")
        self.assertTrue(os.path.exists(path))


if __name__ == '__main__':
    unittest.main()
