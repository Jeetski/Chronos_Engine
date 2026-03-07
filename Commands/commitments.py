import os
from modules.item_manager import get_user_dir

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def get_help_message():
    return """
Usage: commitments [check]
Description: Evaluates all commitments and fires triggers.

Commitment YAML fields (examples):

  name: Exercise Twice Weekly
  type: commitment
  rule: { kind: frequency, times: 2, period: week }
  targets:
    - { type: habit, name: Exercise }
    - { type: task, name: Morning Run }
  triggers:
    on_met:
      - { type: achievement, name: Exercise streak! }
      - { type: script, path: Scripts/congrats.chs }

  name: Grow Honeycomb Lab
  type: commitment
  rule: { kind: frequency, period: week }
  targets:
    - { type: habit, name: Beat Upload, count: 1 }
    - { type: habit, name: Post on Socials, count: 10 }

  name: Never Smoke
  type: commitment
  rule: { kind: never }
  targets:
    - { type: habit, name: Smoke }
  triggers:
    on_violation:
      - { type: reward, name: Reflection Needed, properties: { category: Health } }
"""


def run(args, properties):
    sub = (args[0].lower() if args else 'check')
    if sub in ('help', '-h', '--help'):
        print(get_help_message())
        return

    if sub == 'check':
        try:
            # Evaluate via module logic
            from modules.commitment import main as CommitmentModule  # type: ignore
            CommitmentModule.evaluate_and_trigger()
            print("Commitments evaluated.")
        except Exception as e:
            print(f"Error evaluating commitments: {e}")
        return

    print("Unknown subcommand.\n" + get_help_message())

