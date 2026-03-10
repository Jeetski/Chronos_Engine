import os
import sys
import unittest


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from utilities.dashboard import server
from utilities import registry_builder


class TestTrickToday(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_today"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_today_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.today", surfaces)
        self.assertIn("widget.today.reschedule_button", reg.get("elements", {}))

    def test_set_and_get_today_values(self):
        ok, _, err = server._trick_set_value("widget.today.environment_slider", 9, self.actor)
        self.assertTrue(ok, err)
        ok, _, err = server._trick_set_value("widget.today.buffers_checkbox", False, self.actor)
        self.assertTrue(ok, err)
        ok, _, err = server._trick_set_value("widget.today.template_override_input", "Deep Work Day", self.actor)
        self.assertTrue(ok, err)

        ok, payload, err = server._trick_get_value("widget.today.environment_slider", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(payload["value"], 9)

        ok, payload, err = server._trick_get_value("widget.today.buffers_checkbox", self.actor)
        self.assertTrue(ok, err)
        self.assertFalse(payload["value"])

        ok, payload, err = server._trick_get_value("widget.today.template_override_input", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(payload["value"], "Deep Work Day")

    def test_preset_click_updates_controls(self):
        ok, result, err = server._trick_click("widget.today.preset_balanced_button", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(result["preset"], "balanced")

        ok, payload, err = server._trick_get_value("widget.today.repair_cut_checkbox", self.actor)
        self.assertTrue(ok, err)
        self.assertTrue(payload["value"])

        ok, payload, err = server._trick_get_value("widget.today.repair_min_duration_input", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(payload["value"], 12)

        ok, payload, err = server._trick_get_value("widget.today.repair_cut_threshold_input", self.actor)
        self.assertTrue(ok, err)
        self.assertAlmostEqual(payload["value"], 0.60)

    def test_reschedule_click_calls_today_command_with_props(self):
        calls = []
        original = server.run_console_command

        def fake_run_console_command(command_name, args_list, properties=None):
            calls.append((command_name, list(args_list or []), dict(properties or {})))
            return True, "ok", ""

        server.run_console_command = fake_run_console_command
        try:
            server._trick_set_value("widget.today.custom_property_key_input", "focus_depth", self.actor)
            server._trick_set_value("widget.today.custom_property_slider", 8, self.actor)
            server._trick_set_value("widget.today.quickwins_input", 25, self.actor)
            server._trick_set_value("widget.today.timer_breaks_checkbox", True, self.actor)

            ok, result, err = server._trick_click("widget.today.reschedule_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.run_console_command = original

        self.assertEqual(len(calls), 1)
        command_name, args_list, properties = calls[0]
        self.assertEqual(command_name, "today")
        self.assertEqual(args_list, ["reschedule"])
        self.assertEqual(properties["breaks"], "timer")
        self.assertEqual(properties["quickwins"], 25)
        self.assertEqual(properties["custom_property"], "focus_depth")
        self.assertEqual(properties["prioritize"], "custom_property=8")
        self.assertEqual(result["status_text"], "Schedule generated.")

    def test_open_close_changes_visibility(self):
        server._trick_note_surface_action("widget.today", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.today.status_text", None, self.actor)
        self.assertFalse(matched)

        server._trick_note_surface_action("widget.today", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.today.status_text", None, self.actor)
        self.assertTrue(matched)

    def test_copy_and_paste_today_fields(self):
        ok, result, err = server._trick_copy_value("widget.today.preset_hint_text", self.actor)
        self.assertTrue(ok, err)
        self.assertIn("Safe:", result["clipboard"])

        server._trick_set_value("widget.today.template_override_input", "Deep", self.actor)
        ok, _, err = server._trick_paste_value("widget.today.template_override_input", self.actor)
        self.assertTrue(ok, err)

        ok, payload, err = server._trick_get_value("widget.today.template_override_input", self.actor)
        self.assertTrue(ok, err)
        self.assertTrue(str(payload["value"]).startswith("DeepSafe:"))

    def test_press_today_backspace(self):
        server._trick_set_value("widget.today.template_override_input", "weekdayx", self.actor)
        ok, _, err = server._trick_press_key("widget.today.template_override_input", "Backspace", self.actor)
        self.assertTrue(ok, err)
        ok, payload, err = server._trick_get_value("widget.today.template_override_input", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(payload["value"], "weekday")


if __name__ == "__main__":
    unittest.main()
