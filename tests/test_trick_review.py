import json
import os
import sys
import unittest


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from utilities.dashboard import server
from utilities import registry_builder


class _FakeTextResponse:
    def __init__(self, text="", status=200):
        self.text = text
        self.status = status

    def read(self):
        return self.text.encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestTrickReview(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_review"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_review_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.review", surfaces)
        self.assertIn("widget.review.generate_button", reg.get("elements", {}))

    def test_set_type_press_and_open_review(self):
        original_urlopen = server.urlrequest.urlopen

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/review" in url:
                return _FakeTextResponse("period: 2026-03-10\nsummary: strong day\n")
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_set_value("widget.review.type_select", "daily", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.review.period_input", "2026-03-10", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_press_key("widget.review.period_input", "Enter", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.review.log_text", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("summary: strong day", payload["text"])
        finally:
            server.urlrequest.urlopen = original_urlopen

    def test_generate_export_shift_and_visibility(self):
        original_urlopen = server.urlrequest.urlopen
        original_run = server.run_console_command
        seen_calls = []

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/review" in url:
                return _FakeTextResponse("period: 2026-03\nsummary: monthly review\n")
            raise AssertionError(f"Unexpected URL: {url}")

        def fake_run_console_command(cmd, args, props=None):
            seen_calls.append((cmd, list(args), dict(props or {})))
            return True, "ok", ""

        server.urlrequest.urlopen = fake_urlopen
        server.run_console_command = fake_run_console_command
        try:
            ok, _, err = server._trick_set_value("widget.review.type_select", "monthly", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.review.this_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.review.prev_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.review.next_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.review.generate_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.review.export_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original_urlopen
            server.run_console_command = original_run

        self.assertEqual(seen_calls[0][0], "review")
        self.assertEqual(seen_calls[0][1][0], "monthly")
        self.assertEqual(seen_calls[1][1][0], "export")

        server._trick_note_surface_action("widget.review", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.review.status_text", None, self.actor)
        self.assertFalse(matched)

        server._trick_note_surface_action("widget.review", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.review.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
