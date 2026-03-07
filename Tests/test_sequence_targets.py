import unittest

from Commands import sequence as SequenceCommand
from Modules.sequence import registry as seq_registry


class TestSequenceTargets(unittest.TestCase):
    def test_default_databases_include_behavior_and_journal(self):
        keys = set(seq_registry.DEFAULT_DATABASES.keys())
        self.assertIn("behavior", keys)
        self.assertIn("journal", keys)
        self.assertNotIn("memory", keys)

    def test_memory_alias_resolves(self):
        targets = SequenceCommand._resolve_targets(["memory"], {})
        self.assertIn("behavior", targets)
        self.assertIn("journal", targets)


if __name__ == "__main__":
    unittest.main()
