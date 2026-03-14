import os
import sys
import unittest
from unittest.mock import patch


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from utilities.dashboard import server


class TestDashboardGraph(unittest.TestCase):
    def test_graph_payload_extracts_structure_and_dependencies(self):
        sample_items = [
            {
                "name": "Chronos Engine",
                "type": "project",
                "goals": ["Ship Alpha"],
            },
            {
                "name": "Ship Alpha",
                "type": "goal",
                "project": "Chronos Engine",
                "milestones": ["Atlas View"],
            },
            {
                "name": "Atlas View",
                "type": "milestone",
                "goal": "Ship Alpha",
                "project": "Chronos Engine",
            },
            {
                "name": "Morning Routine",
                "type": "routine",
                "children": [{"name": "Boot Sequence", "type": "microroutine"}],
            },
            {
                "name": "Atlas UI",
                "type": "task",
                "project": "Chronos Engine",
                "goal": "Ship Alpha",
                "depends_on": ["Atlas API"],
            },
            {
                "name": "Atlas API",
                "type": "task",
                "project": "Chronos Engine",
            },
            {
                "name": "Creative Break",
                "type": "reward",
                "requirements": [{"name": "Atlas UI", "type": "task"}],
            },
        ]

        with patch("modules.item_manager.list_all_items_any", return_value=sample_items), patch(
            "modules.item_manager.get_item_path", return_value=""
        ):
            payload = server._graph_build_payload()

        self.assertEqual(payload["meta"]["node_count"], 8)
        self.assertTrue(payload["default_center"])

        nodes_by_id = {node["id"]: node for node in payload["nodes"]}
        edges = {(edge["kind"], edge["source"], edge["target"]) for edge in payload["edges"]}

        self.assertIn("project:chronos engine", nodes_by_id)
        self.assertIn("microroutine:boot sequence", nodes_by_id)
        self.assertIn(("contains", "routine:morning routine", "microroutine:boot sequence"), edges)
        self.assertIn(("belongs_to_project", "task:atlas ui", "project:chronos engine"), edges)
        self.assertIn(("belongs_to_goal", "task:atlas ui", "goal:ship alpha"), edges)
        self.assertIn(("depends_on", "task:atlas ui", "task:atlas api"), edges)
        self.assertIn(("requires", "reward:creative break", "task:atlas ui"), edges)


if __name__ == "__main__":
    unittest.main()
