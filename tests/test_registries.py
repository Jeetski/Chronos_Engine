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

class TestRegistries(unittest.TestCase):
    def setUp(self):
        # Mock paths in registry_builder
        self.test_dir = tempfile.mkdtemp()
        self.original_user_dir = registry_builder.USER_DIR
        self.original_root_dir = registry_builder.ROOT_DIR
        
        registry_builder.USER_DIR = os.path.join(self.test_dir, "User")
        registry_builder.ROOT_DIR = self.test_dir
        registry_builder.SETTINGS_DIR = os.path.join(self.test_dir, "User", "Settings")
        
        os.makedirs(registry_builder.SETTINGS_DIR, exist_ok=True)

    def tearDown(self):
        registry_builder.USER_DIR = self.original_user_dir
        registry_builder.ROOT_DIR = self.original_root_dir
        shutil.rmtree(self.test_dir)

    def test_wizards_registry(self):
        # Create a dummy wizard under utilities/Dashboard/Wizards/<WizardName>/wizard.yml
        wizards_dir = os.path.join(registry_builder.ROOT_DIR, "utilities", "Dashboard", "Wizards", "MagicWizard")
        os.makedirs(wizards_dir, exist_ok=True)

        with open(os.path.join(wizards_dir, "wizard.yml"), "w", encoding="utf-8") as f:
            yaml.dump({"id": "magic", "label": "Magic Wizard", "module": "Magic"}, f)
            
        # Build registry
        reg = registry_builder.build_wizards_registry()
        
        # Verify
        self.assertEqual(len(reg["wizards"]), 1)
        self.assertEqual(reg["wizards"][0]["id"], "magic")
        self.assertEqual(reg["wizards"][0]["label"], "Magic Wizard")

    def test_themes_registry(self):
        # Create a dummy theme in User/Themes
        themes_dir = os.path.join(registry_builder.USER_DIR, "Themes")
        os.makedirs(themes_dir, exist_ok=True)
        
        css_content = "/* Theme: Dark Knight | Accent: #000000 */\nbody { background: #000; }"
        with open(os.path.join(themes_dir, "dark_knight.css"), "w") as f:
            f.write(css_content)
            
        # Build registry
        reg = registry_builder.build_themes_registry()
        
        # Verify
        # Note: core themes won't be found because ROOT_DIR is mocked to temp, 
        # so we expect only 1 user theme.
        self.assertEqual(len(reg["themes"]), 1)
        self.assertEqual(reg["themes"][0]["id"], "dark_knight")
        self.assertEqual(reg["themes"][0]["label"], "Dark Knight")
        self.assertEqual(reg["themes"][0]["accent"], "#000000")
        self.assertFalse(reg["themes"][0]["is_core"])

if __name__ == '__main__':
    unittest.main()

