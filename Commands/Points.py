import os
from Utilities import points as Points


def run(args, properties):
    """
    points balance
    points add <n> [reason:...]
    points subtract <n> [reason:...]
    points history [last:N]
    """
    if not args:
        print(get_help_message())
        return

    sub = args[0].lower()
    if sub in ('--help', '-h', 'help'):
        print(get_help_message())
        return

    if sub == 'balance':
        bal = Points.get_balance()
        print(f"Points balance: {bal}")
        return

    if sub in ('add', 'subtract'):
        if len(args) < 2:
            print(get_help_message())
            return
        try:
            n = int(args[1])
        except Exception:
            print(get_help_message())
            return
        if sub == 'subtract':
            n = -abs(n)
        reason = properties.get('reason') or sub
        new_bal = Points.add_points(n, reason=reason)
        print(f"New balance: {new_bal}")
        return

    if sub == 'history':
        last = None
        if len(args) > 1 and args[1].isdigit():
            last = int(args[1])
        tx = Points.get_history(last=last)
        if not tx:
            print("No transactions.")
            return
        for t in tx:
            print(f"{t.get('date')}  {t.get('delta'):>5}  {t.get('reason','')}")
        return

    print(get_help_message())


def get_help_message():
    return """
Usage:
  points balance
  points add <n> [reason:<text>]
  points subtract <n> [reason:<text>]
  points history [<last_N>]
"""

