from Modules.Console import run_command, parse_input
from Modules import Conditions


def _exists_target(target: str) -> bool:
    return Conditions.exists_target(target)


def run(args, properties):
    """
    if <left> <op> <right> then <command> [args...] [else <command> ...]
    or: if exists <target> then <command> ... [else ...]
    """
    if not args:
        print(get_help_message())
        return

    # Find 'then' and optional 'else'
    al = [str(a) for a in args]
    try:
        then_idx = next(i for i, t in enumerate(al) if t.lower() == 'then')
    except StopIteration:
        print("Error: 'then' is required.")
        return
    else_idx = None
    for i in range(then_idx + 1, len(al)):
        if al[i].lower() == 'else':
            else_idx = i
            break

    cond_tokens = args[:then_idx]
    then_tokens = args[then_idx + 1: else_idx if else_idx is not None else None]
    else_tokens = args[else_idx + 1:] if else_idx is not None else []

    # Evaluate condition (supports and/or/not, matches, parentheses)
    try:
        is_true = Conditions.evaluate_cond_tokens(cond_tokens)
    except Exception as e:
        line = None
        try:
            line = Conditions.get_context_line()
        except Exception:
            line = None
        if line is not None:
            print(f"Condition error on line {line}: {e}")
        else:
            print(f"Condition error: {e}")
        return

    # Execute appropriate branch
    if is_true:
        if not then_tokens:
            return
        cmd, cargs, cprops = parse_input(then_tokens)
        if cmd:
            run_command(cmd, cargs, cprops)
    else:
        if else_tokens:
            cmd, cargs, cprops = parse_input(else_tokens)
            if cmd:
                run_command(cmd, cargs, cprops)


def get_help_message():
    return """
Usage: if <left> <op> <right> then <command> [args...] [else <command> ...]
       if exists <type>[:<name>[:<property>]] then <command> [else <command> ...]
       if exists file:<path> | dir:<path> | env:<NAME> then <command> [else ...]
Operators: =, !=, >, <, >=, <=, eq, ne, gt, lt, ge, le, matches
Logic: and, or, not/! , parentheses ( ... )
Left/Right forms:
  - status:<key>
  - <type>:<name>:<property>
  - literals (after @var expansion)
Examples:
  if status:energy eq high and exists note:"Journal" then echo "rest"
  if task:Morning_Run:duration > 20 then trim "Morning Run" 5 else echo ok
  if note:"IF Note":priority matches ^h.* then echo HIGH
  if exists note:Journal then echo "journal exists"
  if exists file:README.md then echo HAVE_README
  if exists dir:User/Notes then echo NOTES_DIR
  if exists env:PATH then echo HAS_PATH
"""
