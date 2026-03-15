import os
import sys
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from modules import console as Console


class TestConsoleComments(unittest.TestCase):
    def test_inline_comments_are_ignored(self):
        self.assertEqual(
            Console._split_args_safe('echo hello # trailing note'),
            ["echo", "hello"],
        )

    def test_quoted_hash_is_preserved(self):
        self.assertEqual(
            Console._split_args_safe('echo "# keep this" # strip this'),
            ["echo", "# keep this"],
        )

    def test_cli_parse_ignores_inline_comment_properties(self):
        command, args, props = Console.parse_input(
            Console._split_args_safe('new task "Test" priority:high # note')
        )
        self.assertEqual(command, "new")
        self.assertEqual(args, ["task", "Test"])
        self.assertEqual(props.get("priority"), "high")

    def test_block_headers_allow_inline_comments(self):
        self.assertEqual(
            Console._split_args_safe("repeat count:2 then # run twice"),
            ["repeat", "count:2", "then"],
        )


if __name__ == "__main__":
    unittest.main()
