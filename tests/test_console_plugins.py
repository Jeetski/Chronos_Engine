import io
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from modules import console as Console


class TestConsolePlugins(unittest.TestCase):
    def setUp(self):
        self.temp_root = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.temp_root, "user", "plugins"), exist_ok=True)

        self._orig = {
            "USER_PLUGINS_DIR": Console.USER_PLUGINS_DIR,
            "PLUGINS_CONFIG_PATH": Console.PLUGINS_CONFIG_PATH,
        }

        Console.USER_PLUGINS_DIR = os.path.join(self.temp_root, "user", "plugins")
        Console.PLUGINS_CONFIG_PATH = os.path.join(Console.USER_PLUGINS_DIR, "plugins.yml")

        Console._COMMAND_FILE_MAP.clear()
        Console._COMMAND_FILE_MAP_MTIME = None
        Console._PLUGIN_COMMANDS.clear()
        Console._PLUGIN_ALIAS_MAP.clear()
        Console._PLUGIN_BOOT_LOG["loaded"] = []
        Console._PLUGIN_BOOT_LOG["disabled"] = []
        Console._PLUGIN_BOOT_LOG["failed"] = []
        Console._PLUGINS_LOADED = False

    def tearDown(self):
        Console.USER_PLUGINS_DIR = self._orig["USER_PLUGINS_DIR"]
        Console.PLUGINS_CONFIG_PATH = self._orig["PLUGINS_CONFIG_PATH"]

        Console._COMMAND_FILE_MAP.clear()
        Console._COMMAND_FILE_MAP_MTIME = None
        Console._PLUGIN_COMMANDS.clear()
        Console._PLUGIN_ALIAS_MAP.clear()
        Console._PLUGIN_BOOT_LOG["loaded"] = []
        Console._PLUGIN_BOOT_LOG["disabled"] = []
        Console._PLUGIN_BOOT_LOG["failed"] = []
        Console._PLUGINS_LOADED = False
        shutil.rmtree(self.temp_root, ignore_errors=True)

    def test_plugin_command_and_alias_load(self):
        plugin_dir = os.path.join(Console.USER_PLUGINS_DIR, "demo")
        os.makedirs(plugin_dir, exist_ok=True)
        with open(Console.PLUGINS_CONFIG_PATH, "w", encoding="utf-8") as fh:
            fh.write("plugins:\n  - id: demo\n    enabled: true\n")
        with open(os.path.join(plugin_dir, "plugin.py"), "w", encoding="utf-8") as fh:
            fh.write(
                "def register(_ctx):\n"
                "    def run(args, _props):\n"
                "        print('PLUGIN_OK ' + ' '.join(args or []))\n"
                "    return {\n"
                "        'commands': {'hello_plugin': run},\n"
                "        'aliases': {'hp': 'hello_plugin'},\n"
                "        'help': {'hello_plugin': 'Usage: hello_plugin\\nDescription: demo plugin cmd'}\n"
                "    }\n"
            )

        Console._load_plugins(force=True)
        self.assertIn("hello_plugin", Console._PLUGIN_COMMANDS)
        self.assertEqual(Console.resolve_command_alias("hp"), "hello_plugin")

        out = io.StringIO()
        with redirect_stdout(out):
            Console.run_command_core("hp", ["world"], {})
        self.assertIn("PLUGIN_OK world", out.getvalue())

        out = io.StringIO()
        with redirect_stdout(out):
            Console.run_command_core("plugins", ["help", "hello_plugin"], {})
        self.assertIn("Usage: hello_plugin", out.getvalue())

        out = io.StringIO()
        with redirect_stdout(out):
            Console.run_command_core("help", ["hello_plugin"], {})
        self.assertIn("Usage: hello_plugin", out.getvalue())

        out = io.StringIO()
        with redirect_stdout(out):
            Console.run_command_core("plugin", ["status"], {})
        self.assertIn("Plugins: loaded=", out.getvalue())

    def test_failed_plugin_does_not_block_other_plugins(self):
        bad_dir = os.path.join(Console.USER_PLUGINS_DIR, "bad")
        good_dir = os.path.join(Console.USER_PLUGINS_DIR, "good")
        os.makedirs(bad_dir, exist_ok=True)
        os.makedirs(good_dir, exist_ok=True)

        with open(Console.PLUGINS_CONFIG_PATH, "w", encoding="utf-8") as fh:
            fh.write(
                "plugins:\n"
                "  - id: bad\n"
                "    enabled: true\n"
                "  - id: good\n"
                "    enabled: true\n"
                "  - id: off_plugin\n"
                "    enabled: false\n"
            )
        with open(os.path.join(bad_dir, "plugin.py"), "w", encoding="utf-8") as fh:
            fh.write("def register(_ctx):\n    raise RuntimeError('boom')\n")
        with open(os.path.join(good_dir, "plugin.py"), "w", encoding="utf-8") as fh:
            fh.write(
                "def register(_ctx):\n"
                "    def run(_args, _props):\n"
                "        print('GOOD_OK')\n"
                "    return {'commands': {'good_cmd': run}}\n"
            )

        log = Console._load_plugins(force=True)
        self.assertTrue(any(x.get("id") == "bad" for x in log.get("failed", [])))
        self.assertTrue(any(x.get("id") == "good" for x in log.get("loaded", [])))
        self.assertIn("off_plugin", log.get("disabled", []))

        out = io.StringIO()
        with redirect_stdout(out):
            Console.run_command_core("good_cmd", [], {})
        self.assertIn("GOOD_OK", out.getvalue())


if __name__ == "__main__":
    unittest.main()
