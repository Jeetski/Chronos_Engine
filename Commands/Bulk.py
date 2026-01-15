from Modules.FilterManager import FilterManager
from Modules.ItemManager import get_filtered_items
from Modules.Console import run_command


ALLOWED = {
    "set",
    "append",
    "remove",
    "mark",
    "trim",
    "change",
    "cut",
    "did",
    "delete",
    "copy",
    "move",
}


def get_help_message():
    return """
Usage:
  bulk <command> [args...] [properties...]

Description:
  Runs a supported command against every item in the active filter.
  Defaults to a dry-run preview; set dry:false (or run:true) to execute.

Flags:
  dry:true|false   Preview only (default true). Set false/run:true to execute.
  limit:<n>        Process at most n items.
  force:true       Required for delete in bulk.
  no_macros:true   Skip BEFORE/AFTER hooks for each invocation.
"""


def _require_active_filter():
    active = FilterManager.get_filter()
    if not active:
        print("No active filter. Set a filter first (e.g., 'filter task status:pending').")
        return None
    return active


def _resolve_items(item_type):
    items = get_filtered_items(item_type) or []
    # Ensure items carry lowercase keys
    normalized = []
    for item in items:
        if not isinstance(item, dict):
            continue
        lowered = {k.lower(): v for k, v in item.items()}
        if "name" not in lowered:
            continue
        if "type" not in lowered:
            if not item_type:
                continue
            lowered["type"] = item_type
        normalized.append(lowered)
    return normalized


def run(args, properties):
    if not args:
        print(get_help_message())
        return

    target_command = args[0].lower()
    sub_args = args[1:]

    if target_command not in ALLOWED:
        print(f"? '{target_command}' cannot be bulked. Allowed: {', '.join(sorted(ALLOWED))}")
        return

    active_filter = _require_active_filter()
    if not active_filter:
        return
    item_type = active_filter.get("item_type")

    items = _resolve_items(item_type)
    if not items:
        if item_type:
            print(f"No items found for active filter (type '{item_type}').")
        else:
            print("No items found for active filter (all types).")
        return

    dry = properties.get("dry", True)
    run_flag = properties.get("run", False)
    if run_flag:
        dry = False
    limit = properties.get("limit")
    try:
        limit = int(limit) if limit is not None else None
    except Exception:
        print(f"Invalid limit '{limit}', ignoring.")
        limit = None

    if target_command == "delete" and not properties.get("force"):
        print("Delete in bulk requires force:true.")
        return

    if limit is not None:
        items = items[:limit]

    print(f"Bulk '{target_command}' for {len(items)} item(s) (dry-run={dry}).")

    successes = 0
    failures = 0
    for item in items:
        name = item.get("name")
        itype = item.get("type", item_type)

        full_args = [itype, name] + sub_args
        full_props = dict(properties)  # shallow copy

        # clean control props so they don't leak into downstream commands
        for key in ["dry", "run", "limit"]:
            full_props.pop(key, None)

        if dry:
            print(f"  -> would run: {target_command} {full_args} {full_props}")
            continue

        try:
            run_command(target_command, full_args, full_props)
            successes += 1
        except Exception as e:
            failures += 1
            print(f"  !! {itype} '{name}': {e}")

    if dry:
        print("Preview complete. Re-run with dry:false to execute.")
    else:
        print(f"Done. Success: {successes}, Failures: {failures}")
