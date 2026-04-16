import os
import sys
import unittest


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TESTS_DIR = os.path.join(ROOT_DIR, "tests")
for path in (ROOT_DIR, TESTS_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

from chronos_fixture import (
    FIXTURE_BLOCK_NAMES,
    FIXTURE_DAY_TEMPLATE_NAME,
    FIXTURE_NOW,
    temporary_kairos_user_fixture,
)
from modules.scheduler import (
    build_day_runtime_payload,
    load_day_runtime,
    load_schedule_plan_for_date,
    save_day_runtime,
    schedule_path_for_date,
)
from modules.scheduler.kairos_v2 import KairosV2Scheduler


class TestKairosV2Fixture(unittest.TestCase):
    def test_fake_fixture_generates_v2_execution_units(self):
        with temporary_kairos_user_fixture():
            scheduler = KairosV2Scheduler({"now": FIXTURE_NOW})
            result = scheduler.generate_schedule(FIXTURE_NOW.date())

            self.assertEqual(result.get("engine"), "kairos_v2")
            self.assertEqual(
                (result.get("schedule", {}).get("day_template") or {}).get("name"),
                FIXTURE_DAY_TEMPLATE_NAME,
            )

            conceptual_blocks = (
                result.get("schedule", {})
                .get("conceptual_schedule", {})
                .get("conceptual_blocks", [])
            )
            self.assertEqual(
                [block.get("name") for block in conceptual_blocks],
                FIXTURE_BLOCK_NAMES,
            )
            self.assertTrue(all(block.get("kind") == "fixed_time" for block in conceptual_blocks))

            execution_units = (
                result.get("schedule", {})
                .get("timer_handoff", {})
                .get("execution_units", [])
            )
            self.assertEqual(
                [unit.get("name") for unit in execution_units],
                FIXTURE_BLOCK_NAMES,
            )
            self.assertTrue(all(unit.get("kind") == "fixed_time" for unit in execution_units))

    def test_fake_fixture_builds_runtime_plan(self):
        with temporary_kairos_user_fixture():
            scheduler = KairosV2Scheduler({"now": FIXTURE_NOW})
            result = scheduler.generate_schedule(FIXTURE_NOW.date())
            runtime_payload = build_day_runtime_payload(FIXTURE_NOW.date(), result)
            schedule_path = schedule_path_for_date(FIXTURE_NOW.date())
            save_day_runtime(schedule_path, runtime_payload)

            loaded = load_day_runtime(FIXTURE_NOW.date(), path=schedule_path)
            self.assertEqual(loaded.get("engine"), "kairos_v2")

            plan = load_schedule_plan_for_date(
                FIXTURE_NOW.date(),
                min_minutes=5,
                now_dt=FIXTURE_NOW,
            )
            self.assertEqual(
                [block.get("name") for block in plan.get("blocks", [])],
                FIXTURE_BLOCK_NAMES,
            )
            self.assertEqual(plan["blocks"][0].get("minutes"), 90)
            self.assertEqual(plan["blocks"][1].get("minutes"), 30)
            self.assertEqual(plan["blocks"][2].get("minutes"), 10)


if __name__ == "__main__":
    unittest.main()
