import unittest
import os
import sys
import shutil
import tempfile
import yaml

# Ensure project root is in path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from utilities import registry_builder

class TestRegistryBuilder(unittest.TestCase):
    def setUp(self):
        # Create a temp directory to mock the user/ environment
        self.test_dir = tempfile.mkdtemp()
        self.original_user_dir = registry_builder.USER_DIR
        self.original_settings_dir = registry_builder.SETTINGS_DIR
        
        # Override module paths
        registry_builder.USER_DIR = self.test_dir
        registry_builder.SETTINGS_DIR = os.path.join(self.test_dir, "Settings")
        os.makedirs(registry_builder.SETTINGS_DIR, exist_ok=True)

    def tearDown(self):
        # Restore module paths
        registry_builder.USER_DIR = self.original_user_dir
        registry_builder.SETTINGS_DIR = self.original_settings_dir
        shutil.rmtree(self.test_dir)

    def test_build_settings_registry(self):
        # Mock category_settings.yml
        cat_file = os.path.join(registry_builder.SETTINGS_DIR, "category_settings.yml")
        with open(cat_file, "w", encoding="utf-8") as f:
            yaml.safe_dump({"Category_Settings": {"Work": {}, "Personal": {}}}, f)

        # Mock status_settings.yml
        stat_file = os.path.join(registry_builder.SETTINGS_DIR, "status_settings.yml")
        with open(stat_file, "w", encoding="utf-8") as f:
            yaml.safe_dump({"Status_Settings": [{"Name": "Health"}]}, f)

        # Build registry
        reg = registry_builder.build_settings_registry()
        
        # Verify Categories
        cats = reg["properties"]["category"]["values"]
        self.assertIn("Work", cats)
        self.assertIn("Personal", cats)

        # Verify Status Indicators
        stats = reg["status_indicators"]
        self.assertIn("health", stats)

    def test_build_property_registry_deep_scan(self):
        # Create a dummy item type folder
        items_dir = os.path.join(self.test_dir, "Notes")
        os.makedirs(items_dir, exist_ok=True)

        # Create a note with a standard property and a RANDOM ad-hoc property
        note_path = os.path.join(items_dir, "test_note.yml")
        with open(note_path, "w", encoding="utf-8") as f:
            yaml.safe_dump({
                "name": "Test Note",
                "content": "Hidden content",
                "random_prop_xyz": "value"
            }, f)

        # Run Deep Scan
        reg = registry_builder.build_property_registry()
        
        # Infer type from dir "Notes" -> "note"
        keys_by_type = reg["keys_by_type"]
        self.assertIn("note", keys_by_type)
        
        note_keys = keys_by_type["note"]
        self.assertIn("name", note_keys)
        self.assertIn("content", note_keys)
        self.assertIn("random_prop_xyz", note_keys)  # The critical check for user request

if __name__ == '__main__':
    unittest.main()


