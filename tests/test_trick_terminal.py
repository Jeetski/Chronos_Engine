import os
import sys
import unittest


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from utilities.dashboard import server
from utilities import registry_builder


class TestTrickTerminal(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_terminal"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_terminal_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.terminal", surfaces)
        self.assertIn("widget.terminal.run_button", reg.get("elements", {}))

    def test_set_and_get_terminal_values(self):
        ok, _, err = server._trick_set_value("widget.terminal.input_field", 'help', self.actor)
        self.assertTrue(ok, err)
        ok, _, err = server._trick_set_value("widget.terminal.expand_checkbox", False, self.actor)
        self.assertTrue(ok, err)

        ok, payload, err = server._trick_get_value("widget.terminal.input_field", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(payload["value"], "help")

        ok, payload, err = server._trick_get_value("widget.terminal.expand_checkbox", self.actor)
        self.assertTrue(ok, err)
        self.assertFalse(payload["value"])

    def test_run_button_executes_cli_command(self):
        calls = []
        original = server.run_console_command

        def fake_run_console_command(command_name, args_list, properties=None):
            calls.append((command_name, list(args_list or []), dict(properties or {})))
            return True, "usage text", ""

        server.run_console_command = fake_run_console_command
        try:
            server._trick_set_value("widget.terminal.input_field", "help", self.actor)
            ok, result, err = server._trick_click("widget.terminal.run_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.run_console_command = original

        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "help")
        self.assertEqual(calls[0][1], [])
        self.assertEqual(result["mode"], "cli")

        ok, payload, err = server._trick_get_value("widget.terminal.output_text", self.actor)
        self.assertTrue(ok, err)
        self.assertIn("chronos@you> help", payload["text"])
        self.assertIn("usage text", payload["text"])

    def test_run_button_executes_shell_fallback(self):
        server._trick_set_value("widget.terminal.input_field", 'python -c "print(123)"', self.actor)
        ok, result, err = server._trick_click("widget.terminal.run_button", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(result["mode"], "shell")

        ok, payload, err = server._trick_get_value("widget.terminal.output_text", self.actor)
        self.assertTrue(ok, err)
        self.assertIn("123", payload["text"])

    def test_open_close_changes_visibility(self):
        server._trick_note_surface_action("widget.terminal", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.terminal.status_text", None, self.actor)
        self.assertFalse(matched)

        server._trick_note_surface_action("widget.terminal", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.terminal.status_text", None, self.actor)
        self.assertTrue(matched)

    def test_type_copy_and_paste_terminal(self):
        ok, _, err = server._trick_type_value("widget.terminal.input_field", "help", self.actor)
        self.assertTrue(ok, err)

        ok, payload, err = server._trick_get_value("widget.terminal.input_field", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(payload["value"], "help")

        server._trick_terminal_session(self.actor)["output_text"] = "hello world"
        ok, result, err = server._trick_copy_value("widget.terminal.output_text", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(result["clipboard"], "hello world")

        ok, _, err = server._trick_paste_value("widget.terminal.input_field", self.actor)
        self.assertTrue(ok, err)
        ok, payload, err = server._trick_get_value("widget.terminal.input_field", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(payload["value"], "helphello world")

    def test_press_terminal_keys(self):
        original = server.run_console_command
        calls = []

        def fake_run_console_command(command_name, args_list, properties=None):
            calls.append((command_name, list(args_list or [])))
            return True, "ok", ""

        server.run_console_command = fake_run_console_command
        try:
            server._trick_set_value("widget.terminal.input_field", "helpx", self.actor)
            ok, _, err = server._trick_press_key("widget.terminal.input_field", "Backspace", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.terminal.input_field", self.actor)
            self.assertTrue(ok, err)
            self.assertEqual(payload["value"], "help")

            ok, result, err = server._trick_press_key("widget.terminal.input_field", "Enter", self.actor)
            self.assertTrue(ok, err)
            self.assertEqual(result["mode"], "cli")
            self.assertEqual(calls[0][0], "help")

            ok, result, err = server._trick_press_key("widget.terminal.input_field", "Ctrl+L", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.terminal.output_text", self.actor)
            self.assertTrue(ok, err)
            self.assertEqual(payload["value"], "")
        finally:
            server.run_console_command = original


if __name__ == "__main__":
    unittest.main()
