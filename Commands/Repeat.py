from Modules.Console import run_command, parse_input
from Modules import Variables as _V


def _parse_count(args):
    for tok in args:
        if isinstance(tok, str) and ':' in tok:
            key, _sep, val = tok.partition(':')
            if key.lower() in ('count', 'times', 'n'):
                return val
        elif str(tok).isdigit():
            return tok
    return None


def run(args, properties):
    """
    Repeat a single command a bounded number of times.
    """
    if not args:
        print(get_help_message())
        return

    try:
        then_index = args.index('then')
    except ValueError:
        print(get_help_message())
        return

    head = args[:then_index]
    cmd_parts = args[then_index + 1:]
    if not cmd_parts:
        print("Error: 'then' must be followed by a command.")
        return

    head_expanded = _V.expand_list(head)
    count_raw = _parse_count(head_expanded)
    try:
        count = int(str(count_raw))
    except Exception:
        count = None

    if not count or count < 1:
        print("Error: Invalid repeat count. Use: repeat count:<n> then <command>")
        return

    prev_i = _V.get_var('i')
    for idx in range(1, count + 1):
        _V.set_var('i', str(idx))
        cmd_name, cmd_args, cmd_props = parse_input(cmd_parts)
        if not cmd_name:
            break
        run_command(cmd_name, cmd_args, dict(cmd_props or {}))

    if prev_i is None:
        _V.unset_var('i')
    else:
        _V.set_var('i', prev_i)


def get_help_message():
    return """
Usage:
  repeat count:<n> then <command> [args...]

Description:
  Runs a single command N times. Sets @i each iteration (1-based).

Examples:
  repeat count:3 then echo Pass @i
  repeat count:5 then new note "Loop @i" category:work
"""
