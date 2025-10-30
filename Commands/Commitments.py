import os
from Modules.ItemManager import get_user_dir

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def get_help_message():
    return """
Usage: commitments [check]
Description: Evaluates all commitments and fires triggers.

Commitment YAML fields (examples):

  name: Exercise Twice Weekly
  type: commitment
  frequency: { times: 2, period: week }
  associated_items:
    - { type: habit, name: Exercise }
    - { type: task, name: Morning Run }
  triggers:
    on_met:
      - { type: achievement, name: Exercise streak! }
      - { type: script, path: Scripts/congrats.chs }

  name: Never Smoke
  type: commitment
  never: true
  forbidden_items:
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
            from Modules.Commitment import main as CommitmentModule  # type: ignore
            CommitmentModule.evaluate_and_trigger()
            print("Commitments evaluated.")
        except Exception as e:
            print(f"Error evaluating commitments: {e}")
        return

    print("Unknown subcommand.\n" + get_help_message())

