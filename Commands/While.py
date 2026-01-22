from Modules.Console import run_command, parse_input
from Modules import Variables as _V
import Modules.Conditions as Conditions


def _split_max(tokens):
    max_val = None
    cond_tokens = []
    for tok in tokens:
        if isinstance(tok, str) and ':' in tok:
            key, _sep, val = tok.partition(':')
            if key.lower() in ('max', 'limit'):
                max_val = val
                continue
        cond_tokens.append(tok)
    return cond_tokens, max_val


def run(args, properties):
    """
    Execute a command while a condition is true, bounded by max.
    """
    if not args:
        print(get_help_message())
        return

    try:
        then_index = [str(t).lower() for t in args].index('then')
    except ValueError:
        print(get_help_message())
        return

    cond_tokens_raw = args[:then_index]
    cmd_parts = args[then_index + 1:]
    if not cmd_parts:
        print("Error: 'then' must be followed by a command.")
        return

    cond_tokens, max_raw = _split_max(cond_tokens_raw)
    if not max_raw:
        print("Error: Missing max:<n> for while loop.")
        return
    max_expanded = _V.expand_list([str(max_raw)])[0]
    try:
        max_iters = int(str(max_expanded))
    except Exception:
        max_iters = None
    if not max_iters or max_iters < 1:
        print("Error: Invalid max:<n> for while loop.")
        return

    prev_i = _V.get_var('i')
    for idx in range(1, max_iters + 1):
        cond_expanded = _V.expand_list(cond_tokens)
        try:
            truth = Conditions.evaluate_cond_tokens(cond_expanded)
        except Exception as e:
            print(f"Condition error: {e}")
            break
        if not truth:
            break
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
  while <condition> max:<n> then <command> [args...]

Description:
  Runs a command while the condition is true, stopping after max iterations.
  Sets @i each iteration (1-based).

Examples:
  while status:energy eq high max:3 then echo Still going @i
  while exists task:"Draft" max:5 then echo Draft exists
"""
