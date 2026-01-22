from Modules.Console import run_command, parse_input, _is_property_token, _coerce_value
from Modules.ItemManager import list_all_items
from Modules import Variables as _V
import re


def _depluralize(word):
    if not word:
        return ""
    if word.lower() == 'people':
        return 'person'
    if word.endswith('ies'):
        return word[:-3] + 'y'
    if word.endswith('s') and not word.endswith('ss'):
        return word[:-1]
    return word


def run(args, properties):
    """
    Iterate items and run a command per item.
    """
    if not args:
        print(get_help_message())
        return

    lower = [str(t).lower() for t in args]
    try:
        in_index = lower.index('in')
    except ValueError:
        print(get_help_message())
        return
    try:
        then_index = lower.index('then')
    except ValueError:
        print(get_help_message())
        return

    if in_index == 0 or in_index + 1 >= len(args) or in_index >= then_index:
        print(get_help_message())
        return

    var_name = args[0]
    if not isinstance(var_name, str) or not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", var_name):
        print("Error: Invalid loop variable name.")
        return

    item_type_raw = str(args[in_index + 1])
    item_type = _depluralize(item_type_raw.lower())
    filter_tokens = _V.expand_list(args[in_index + 2:then_index])
    cmd_parts = args[then_index + 1:]

    if not cmd_parts:
        print("Error: 'then' must be followed by a command.")
        return

    props = {}
    for tok in filter_tokens:
        if _is_property_token(tok):
            key, _sep, val = tok.partition(':')
            props[key] = _coerce_value(val)

    sort_by = props.pop('sort_by', None)
    reverse_sort = props.pop('reverse_sort', False)

    items = list_all_items(item_type) or []
    filtered = []
    for item in items:
        ok = True
        for key, value in props.items():
            if str(item.get(key)) != str(value):
                ok = False
                break
        if ok:
            filtered.append(item)
    if sort_by:
        filtered.sort(key=lambda x: x.get(sort_by, 0), reverse=bool(reverse_sort))

    prev_i = _V.get_var('i')
    prev_var = _V.get_var(var_name)
    prev_var_type = _V.get_var(f"{var_name}_type")
    for idx, item in enumerate(filtered, start=1):
        name = item.get('name')
        if not name:
            continue
        item_type_val = item.get('type', item_type)
        _V.set_var('i', str(idx))
        _V.set_var(var_name, str(name))
        _V.set_var(f"{var_name}_type", str(item_type_val))
        cmd_name, cmd_args, cmd_props = parse_input(cmd_parts)
        if not cmd_name:
            break
        run_command(cmd_name, cmd_args, dict(cmd_props or {}))

    if prev_i is None:
        _V.unset_var('i')
    else:
        _V.set_var('i', prev_i)
    if prev_var is None:
        _V.unset_var(var_name)
    else:
        _V.set_var(var_name, prev_var)
    if prev_var_type is None:
        _V.unset_var(f"{var_name}_type")
    else:
        _V.set_var(f"{var_name}_type", prev_var_type)


def get_help_message():
    return """
Usage:
  for <var> in <type> [filters] then <command> [args...]

Description:
  Iterates items and runs the command for each. Sets @i, @<var>, and
  @<var>_type each iteration.

Examples:
  for item in tasks status:pending then echo @item
  for t in tasks priority:high then set task @t status:next
  for n in notes sort_by:updated reverse_sort:true then echo @n
"""
