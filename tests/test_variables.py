import unittest
import os
import tempfile
import yaml
from modules import variables as Variables

class TestVariables(unittest.TestCase):
    def setUp(self):
        # Clear variables before each test
        Variables._VARS.clear()
        Variables._STATUS_MANAGED.clear()
        self._old_root = Variables._PROJECT_ROOT
        self._old_bindings_path = Variables._BINDINGS_PATH
        Variables._BINDINGS_CACHE["mtime"] = None
        Variables._BINDINGS_CACHE["by_var"] = {}

    def tearDown(self):
        Variables._PROJECT_ROOT = self._old_root
        Variables._BINDINGS_PATH = self._old_bindings_path
        Variables._BINDINGS_CACHE["mtime"] = None
        Variables._BINDINGS_CACHE["by_var"] = {}

    def test_set_get_unset(self):
        Variables.set_var("foo", "bar")
        self.assertEqual(Variables.get_var("foo"), "bar")
        
        Variables.unset_var("foo")
        self.assertIsNone(Variables.get_var("foo"))

    def test_expansion_simple(self):
        Variables.set_var("user", "David")
        text = "Hello @user"
        self.assertEqual(Variables.expand_token(text), "Hello David")

    def test_expansion_braced(self):
        Variables.set_var("color", "red")
        text = "The @{color}bird"
        self.assertEqual(Variables.expand_token(text), "The redbird")

    def test_expansion_list(self):
        Variables.set_var("x", "1")
        tokens = ["Val: @x", "NoVar"]
        self.assertEqual(Variables.expand_list(tokens), ["Val: 1", "NoVar"])

    def test_escaping(self):
        Variables.set_var("x", "1")
        text = "Email me at david@@example.com"
        # Should become david@example.com, not expanded
        self.assertEqual(Variables.expand_token(text), "Email me at david@example.com")
        
    def test_missing_var(self):
        # Should collapse to empty string if missing? Or keep token?
        # Current implementation: returns "" if val is None
        text = "Hello @missing"
        self.assertEqual(Variables.expand_token(text), "Hello ")

    def test_sync_status_vars_sets_and_unsets_managed_status_keys(self):
        Variables.sync_status_vars({"energy": "high", "focus": "medium"})
        self.assertEqual(Variables.get_var("status_energy"), "high")
        self.assertEqual(Variables.get_var("status_focus"), "medium")

        Variables.sync_status_vars({"energy": "low"})
        self.assertEqual(Variables.get_var("status_energy"), "low")
        self.assertIsNone(Variables.get_var("status_focus"))

    def test_location_alias_maps_to_status_place(self):
        Variables.set_var("location", "office")
        self.assertEqual(Variables.get_var("status_place"), "office")
        self.assertEqual(Variables.get_var("location"), "office")

    def test_dotted_status_namespace_alias_maps_to_flat(self):
        Variables.set_var("status.energy", "high")
        self.assertEqual(Variables.get_var("status_energy"), "high")
        self.assertEqual(Variables.get_var("status.energy"), "high")

    def test_dotted_profile_and_timer_aliases(self):
        Variables.set_var("profile.nickname", "Alice")
        Variables.set_var("timer.profile", "classic_pomodoro")
        self.assertEqual(Variables.get_var("nickname"), "Alice")
        self.assertEqual(Variables.get_var("timer_profile"), "classic_pomodoro")
        self.assertEqual(Variables.get_var("profile.nickname"), "Alice")
        self.assertEqual(Variables.get_var("timer.profile"), "classic_pomodoro")

    def test_expansion_dotted_tokens(self):
        Variables.set_var("status.energy", "low")
        text = "Energy is @status.energy and braced @{status.energy}"
        self.assertEqual(Variables.expand_token(text), "Energy is low and braced low")

    def test_bound_read_fallback_from_yaml(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings_dir = os.path.join(tmp, "user", "settings")
            profile_dir = os.path.join(tmp, "user", "profile")
            os.makedirs(settings_dir, exist_ok=True)
            os.makedirs(profile_dir, exist_ok=True)

            with open(os.path.join(settings_dir, "variable_bindings.yml"), "w", encoding="utf-8") as f:
                yaml.dump({
                    "bindings": [
                        {
                            "var": "profile.nickname",
                            "file": "user/profile/profile.yml",
                            "path": "nickname",
                            "mode": "readwrite",
                        }
                    ]
                }, f, default_flow_style=False, sort_keys=False)
            with open(os.path.join(profile_dir, "profile.yml"), "w", encoding="utf-8") as f:
                yaml.dump({"nickname": "Neo"}, f, default_flow_style=False, sort_keys=False)

            Variables._PROJECT_ROOT = tmp
            Variables._BINDINGS_PATH = os.path.join(tmp, "user", "settings", "variable_bindings.yml")
            Variables._BINDINGS_CACHE["mtime"] = None
            Variables._BINDINGS_CACHE["by_var"] = {}

            self.assertEqual(Variables.get_var("profile.nickname"), "Neo")
            self.assertEqual(Variables.get_var("nickname"), "Neo")

    def test_bound_writeback_to_nested_yaml_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings_dir = os.path.join(tmp, "user", "settings")
            os.makedirs(settings_dir, exist_ok=True)

            with open(os.path.join(settings_dir, "variable_bindings.yml"), "w", encoding="utf-8") as f:
                yaml.dump({
                    "bindings": [
                        {
                            "var": "custom.answer",
                            "file": "user/profile/custom.yml",
                            "path": "prefs.answer",
                            "mode": "readwrite",
                        }
                    ]
                }, f, default_flow_style=False, sort_keys=False)

            Variables._PROJECT_ROOT = tmp
            Variables._BINDINGS_PATH = os.path.join(tmp, "user", "settings", "variable_bindings.yml")
            Variables._BINDINGS_CACHE["mtime"] = None
            Variables._BINDINGS_CACHE["by_var"] = {}

            handled, final_value, err, _ = Variables.write_bound_var("custom.answer", "42")
            self.assertTrue(handled)
            self.assertIsNone(err)
            self.assertEqual(final_value, "42")

            with open(os.path.join(tmp, "user", "profile", "custom.yml"), "r", encoding="utf-8") as f:
                payload = yaml.safe_load(f) or {}
            self.assertEqual(payload.get("prefs", {}).get("answer"), "42")

    def test_bound_read_only_binding_rejects_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings_dir = os.path.join(tmp, "user", "settings")
            os.makedirs(settings_dir, exist_ok=True)

            with open(os.path.join(settings_dir, "variable_bindings.yml"), "w", encoding="utf-8") as f:
                yaml.dump({
                    "bindings": [
                        {
                            "var": "readonly.foo",
                            "file": "user/profile/read.yml",
                            "path": "foo",
                            "mode": "read",
                        }
                    ]
                }, f, default_flow_style=False, sort_keys=False)

            Variables._PROJECT_ROOT = tmp
            Variables._BINDINGS_PATH = os.path.join(tmp, "user", "settings", "variable_bindings.yml")
            Variables._BINDINGS_CACHE["mtime"] = None
            Variables._BINDINGS_CACHE["by_var"] = {}

            handled, final_value, err, _ = Variables.write_bound_var("readonly.foo", "bar")
            self.assertTrue(handled)
            self.assertIsNone(final_value)
            self.assertIsNotNone(err)

if __name__ == '__main__':
    unittest.main()
