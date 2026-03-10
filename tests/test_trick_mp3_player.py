import json
import os
import sys
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from utilities.dashboard import server
from utilities import registry_builder


class _FakeResponse:
    def __init__(self, payload=None):
        self.payload = payload or {}

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestTrickMp3Player(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_mp3_player"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_mp3_player(self):
        reg = registry_builder.build_trick_registry(force=True)
        self.assertIn("widget.mp3_player", {row["id"] for row in reg.get("surfaces", [])})

    def test_refresh_and_toggle_play(self):
        original = server.urlrequest.urlopen

        def fake(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/media/mp3" in url:
                return _FakeResponse({"ok": True, "files": [{"name": "track.mp3", "title": "Track", "artist": "Artist"}]})
            if "/api/media/playlists" in url:
                return _FakeResponse({"ok": True, "playlists": [{"slug": "default"}]})
            raise AssertionError(url)

        server.urlrequest.urlopen = fake
        try:
            ok, _, err = server._trick_click("widget.mp3_player.refresh_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.mp3_player.play_pause_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original

        ok, payload, err = server._trick_get_value("widget.mp3_player.status_text", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(payload["text"], "Playing.")


if __name__ == "__main__":
    unittest.main()
