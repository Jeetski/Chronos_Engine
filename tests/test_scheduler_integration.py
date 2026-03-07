
import unittest
import os
import sys
import shutil
import tempfile
import yaml
from datetime import datetime

# Ensure modules/Commands can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Import the actual logic we want to test
from commands import today as Today
from modules.scheduler import v1 as Scheduler
from modules import item_manager as ItemManager
from unittest.mock import MagicMock
from modules import item_manager as ItemManager
from unittest.mock import MagicMock

class TestSchedulerIntegration(unittest.TestCase):
    
    def setUp(self):
        # Create a temp directory to act as the User root
        self.test_dir = tempfile.mkdtemp()
        self.user_dir = os.path.join(self.test_dir, "user")
        os.makedirs(os.path.join(self.user_dir, "Days"))
        os.makedirs(os.path.join(self.user_dir, "Tasks"))
        os.makedirs(os.path.join(self.user_dir, "Settings"))
        os.makedirs(os.path.join(self.user_dir, "Schedules"))

        # Monkey patch the paths in the modules to point to our temp dir
        # This is "risky" but effective for integration testing specific file logic
        self.original_user_dir = Today.USER_DIR
        self.original_root = Today.ROOT_DIR
        
        Today.USER_DIR = self.user_dir
        Scheduler.USER_DIR = self.user_dir
        
        # Write clean settings
        with open(os.path.join(self.user_dir, "Settings", "scheduling_priorities.yml"), "w") as f:
            yaml.dump({"Scheduling_Priorities": []}, f)
        with open(os.path.join(self.user_dir, "Settings", "priority_settings.yml"), "w") as f:
             yaml.dump({"Priority_Settings": {"High": {"value": 1}}}, f)
        with open(os.path.join(self.user_dir, "Settings", "category_settings.yml"), "w") as f:
             yaml.dump({"Category_Settings": {"Work": {"value": 1}}}, f)
        with open(os.path.join(self.user_dir, "Settings", "status_settings.yml"), "w") as f:
             yaml.dump({"Status_Settings": []}, f)
        with open(os.path.join(self.user_dir, "Settings", "buffer_settings.yml"), "w") as f:
             yaml.dump({}, f)

        # Mock ItemManager.read_item_data to read from our temp dir items
        self.original_read_item = ItemManager.read_item_data
        
        def side_effect_read(item_type, name):
            # Try to read from our temp user dir
            path = os.path.join(self.user_dir, f"{item_type.title()}s", f"{name}.yml")
            if os.path.exists(path):
                with open(path, 'r') as f:
                    return yaml.safe_load(f)
            return None
            
        ItemManager.read_item_data = MagicMock(side_effect=side_effect_read)
        Today.read_item_data = ItemManager.read_item_data # CRITICAL: Patch the function imported by Today


    def tearDown(self):
        # Restore paths
        Today.USER_DIR = self.original_user_dir
        Scheduler.USER_DIR = self.original_user_dir
        ItemManager.read_item_data = self.original_read_item
        shutil.rmtree(self.test_dir)

    def test_simple_schedule_build(self):
        """Test building a schedule from a simple template."""
        
        # 1. Create a dummy task
        task_path = os.path.join(self.user_dir, "Tasks", "My Task.yml")
        with open(task_path, "w") as f:
            yaml.dump({
                "name": "My Task",
                "type": "task",
                "duration": "30m",
                "category": "Work",
                "ideal_start_time": "09:00" # Explicitly set in item to ensure it is picked up
            }, f)

        # 2. Create a day template (e.g. Monday.yml)
        day_path = os.path.join(self.user_dir, "Days", "Monday.yml")
        with open(day_path, "w") as f:
            yaml.dump({
                "sequence": [
                    {"name": "My Task", "type": "task", "ideal_start_time": "09:00"}
                ]
            }, f)

        # 3. Invoke template selection (Manually force Monday)
        template_info = Today.select_template_for_day("Monday", status_context={})
        self.assertIsNotNone(template_info.get("template"), "Should find Monday template")

        # 4. Build schedule
        schedule, conflicts = Today.build_initial_schedule(template_info["template"])
        
        # 5. Assertions
        self.assertEqual(len(schedule), 1)
        self.assertEqual(schedule[0]["name"], "My Task")
        self.assertEqual(schedule[0]["duration"], 30)
        # Check derived start/end times
        expected_start = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)
        self.assertEqual(schedule[0]["start_time"].hour, 9)
        self.assertEqual(schedule[0]["start_time"].minute, 0)
        self.assertEqual(schedule[0]["end_time"].minute, 30)

    def test_overlap_conflict_logic(self):
        """Test that overlapping items are detected."""
        
        # Two tasks that overlap
        # Task A: 09:00 - 10:00 (60m)
        # Task B: 09:30 - 10:30 (60m)
        
        items = [
            {
                "name": "Task A",
                "start_time": datetime.now().replace(hour=9, minute=0),
                "end_time": datetime.now().replace(hour=10, minute=0),
                "duration": 60,
                "importance_score": 50
            },
            {
                "name": "Task B",
                "start_time": datetime.now().replace(hour=9, minute=30),
                "end_time": datetime.now().replace(hour=10, minute=30),
                "duration": 60,
                "importance_score": 60 # Higher = More Important in new model
            }
        ]
        
        conflicts = Today.identify_conflicts(items)
        self.assertTrue(len(conflicts) > 0, "Should detect overlap")
        self.assertIn("Task A", conflicts[0])
        self.assertIn("Task B", conflicts[0])

if __name__ == '__main__':
    unittest.main()




