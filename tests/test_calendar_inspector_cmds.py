import unittest
import tempfile
import os
import io
from contextlib import redirect_stdout, redirect_stderr
from datetime import datetime, timedelta

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in os.sys.path:
    os.sys.path.insert(0, ROOT_DIR)

from modules.scheduler import v1 as Scheduler
from modules import item_manager as ItemManager
import commands.stretch as cmd_stretch
import commands.anchor as cmd_anchor
import commands.split as cmd_split
import commands.merge as cmd_merge
import commands.template as cmd_template


class TestNewCommands(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = self.temp_dir.name
        self.user_dir = os.path.join(self.root, "User")
        os.makedirs(os.path.join(self.user_dir, "Schedules"), exist_ok=True)
        os.makedirs(os.path.join(self.user_dir, "Days"), exist_ok=True)
        os.makedirs(os.path.join(self.user_dir, "Tasks"), exist_ok=True)

        # Patch globals
        self._scheduler_user_dir = Scheduler.USER_DIR
        self._item_root_dir = ItemManager.ROOT_DIR
        self._item_user_dir = ItemManager.USER_DIR
        Scheduler.USER_DIR = self.user_dir
        ItemManager.ROOT_DIR = self.root
        ItemManager.USER_DIR = self.user_dir

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

    def _silent(self, fn, *args, **kwargs):
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            return fn(*args, **kwargs)

    def _schedule(self, name, start_hour, minutes):
        start = datetime(2026, 1, 1, start_hour, 0)
        return [{
            "name": name,
            "type": "task",
            "status": "pending",
            "duration": minutes,
            "start_time": start,
            "end_time": start + timedelta(minutes=minutes),
            "children": [],
        }]

    def test_stretch_apply(self):
        schedule = self._schedule("Block", 9, 30)
        path = Scheduler.schedule_path_for_date(datetime.now())
        self._silent(Scheduler.stretch_item_in_file, path, "Block", 10)
        mods = Scheduler.load_manual_modifications(Scheduler.manual_modifications_path_for_schedule(path))
        self._silent(Scheduler.apply_manual_modifications, schedule, mods)
        self.assertEqual(schedule[0]["duration"], 40)

    def test_split_apply(self):
        schedule = self._schedule("Block", 9, 30)
        path = Scheduler.schedule_path_for_date(datetime.now())
        self._silent(Scheduler.split_item_in_file, path, "Block", count=3)
        mods = Scheduler.load_manual_modifications(Scheduler.manual_modifications_path_for_schedule(path))
        self._silent(Scheduler.apply_manual_modifications, schedule, mods)
        self.assertEqual(len(schedule), 3)
        self.assertEqual(schedule[0]["name"], "Block (1/3)")

    def test_merge_apply(self):
        start = datetime(2026, 1, 1, 9, 0)
        schedule = [
            {"name": "A", "type": "task", "status": "pending", "duration": 30, "start_time": start, "end_time": start + timedelta(minutes=30), "children": []},
            {"name": "B", "type": "task", "status": "pending", "duration": 30, "start_time": start + timedelta(minutes=30), "end_time": start + timedelta(minutes=60), "children": []},
        ]
        path = Scheduler.schedule_path_for_date(datetime.now())
        self._silent(Scheduler.merge_item_in_file, path, "A", "B")
        mods = Scheduler.load_manual_modifications(Scheduler.manual_modifications_path_for_schedule(path))
        self._silent(Scheduler.apply_manual_modifications, schedule, mods)
        self.assertEqual(len(schedule), 1)
        self.assertEqual(schedule[0]["duration"], 60)

    def test_anchor_scope_item(self):
        ItemManager.write_item_data("task", "Focus", {"name": "Focus", "type": "task"})
        self._silent(cmd_anchor.run, ["Focus"], {"scope": "item", "type": "task"})
        data = ItemManager.read_item_data("task", "Focus")
        self.assertEqual(data.get("reschedule"), "never")

    def test_template_save_day(self):
        schedule = self._schedule("Block", 9, 30)
        path = Scheduler.schedule_path_for_date(datetime.now())
        Scheduler.save_schedule(schedule, path)
        self._silent(cmd_template.run, ["save", "day", "Focus Friday"], {})
        out = os.path.join(self.user_dir, "Days", "Focus Friday.yml")
        self.assertTrue(os.path.exists(out))


if __name__ == '__main__':
    unittest.main()



