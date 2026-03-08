from utilities import registry_builder


SURFACE_TYPES = {"widget", "view", "panel", "popup", "gadget", "wizard"}


def _parse_kv(tokens):
    props = {}
    rest = []
    for tok in tokens:
        s = str(tok or "").strip()
        if not s:
            continue
        if ":" in s:
            k, v = s.split(":", 1)
            k = k.strip().lower()
            v = v.strip()
            if k:
                props[k] = v
                continue
        rest.append(s)
    return props, rest


def _as_list(registry):
    return registry.get("surfaces") if isinstance(registry, dict) else []


def _as_elements(registry):
    return registry.get("elements") if isinstance(registry, dict) else {}


def _print_surface(surface):
    sid = str(surface.get("id") or "")
    stype = str(surface.get("type") or "")
    label = str(surface.get("label") or "")
    count = len(surface.get("elements") or []) if isinstance(surface.get("elements"), list) else 0
    print(f"- {sid}  [{stype}]  {label}  elements:{count}")


def _print_element(row):
    eid = str(row.get("id") or "")
    kind = str(row.get("kind") or "unknown")
    actions = ", ".join(str(a) for a in (row.get("actions") or []))
    print(f"- {eid}  kind:{kind}  actions:[{actions}]")


def _resolve_surface(registry, surface_id):
    sid = str(surface_id or "").strip().lower()
    for row in _as_list(registry) or []:
        if str(row.get("id") or "").lower() == sid:
            return row
    return None


def _resolve_element(registry, element_id):
    eid = str(element_id or "").strip().lower()
    elements = _as_elements(registry)
    if isinstance(elements, dict):
        row = elements.get(eid)
        if isinstance(row, dict):
            return row
    # Fallback scan in case index is missing
    for surf in _as_list(registry) or []:
        for row in surf.get("elements") or []:
            if str(row.get("id") or "").lower() == eid:
                return row
    return None


def run(args, properties):
    """
    trick list|show|actions|where|refresh
    """
    sub = str(args[0]).strip().lower() if args else "help"
    if sub in {"help", "-h", "--help"}:
        print(get_help_message())
        return

    force = bool(str((properties or {}).get("refresh", "")).lower() in {"1", "true", "yes", "on"})
    if sub == "refresh":
        data = registry_builder.build_trick_registry(force=True)
        print(f"TRICK registry rebuilt. surfaces={len(_as_list(data) or [])} elements={len(_as_elements(data) or {})}")
        return

    registry = registry_builder.build_trick_registry(force=force)

    if sub == "list":
        kv, rest = _parse_kv(args[1:])
        q = str(kv.get("q") or (" ".join(rest) if rest else "")).strip().lower()
        type_filter = str(kv.get("type") or "").strip().lower()
        rows = []
        for row in _as_list(registry) or []:
            sid = str(row.get("id") or "")
            stype = str(row.get("type") or "").lower()
            label = str(row.get("label") or "")
            if type_filter and stype != type_filter:
                continue
            hay = f"{sid} {stype} {label}".lower()
            if q and q not in hay:
                continue
            rows.append(row)
        if not rows:
            print("No TRICK surfaces matched.")
            return
        for row in rows:
            _print_surface(row)
        print(f"Matched surfaces: {len(rows)}")
        return

    if sub == "show":
        target = str(args[1]).strip().lower() if len(args) > 1 else ""
        if not target:
            print("Usage: trick show <type.name>")
            return
        surface = _resolve_surface(registry, target)
        if not surface:
            print(f"Surface not found: {target}")
            return
        _print_surface(surface)
        elems = surface.get("elements") or []
        if not elems:
            print("No elements.")
            return
        for row in elems:
            _print_element(row)
        print(f"Elements: {len(elems)}")
        return

    if sub == "actions":
        target = str(args[1]).strip().lower() if len(args) > 1 else ""
        if not target:
            print("Usage: trick actions <type.name.element>")
            return
        row = _resolve_element(registry, target)
        if not row:
            print(f"Element not found: {target}")
            return
        actions = row.get("actions") if isinstance(row.get("actions"), list) else []
        print(f"{target}: {', '.join(actions) if actions else '(none)'}")
        return

    if sub == "where":
        kv, rest = _parse_kv(args[1:])
        action = str(kv.get("action") or (rest[0] if rest else "")).strip().lower()
        q = str(kv.get("q") or (" ".join(rest[1:]) if len(rest) > 1 else "")).strip().lower()
        if not action:
            print("Usage: trick where action:<get|set|click|wait>")
            return
        matches = []
        for row in (_as_elements(registry) or {}).values():
            if not isinstance(row, dict):
                continue
            actions = {str(a).lower() for a in (row.get("actions") or [])}
            if action not in actions:
                continue
            if q and q not in str(row.get("id") or "").lower():
                continue
            matches.append(row)
        if not matches:
            print("No TRICK elements matched.")
            return
        matches.sort(key=lambda r: str(r.get("id") or ""))
        for row in matches:
            _print_element(row)
        print(f"Matched elements: {len(matches)}")
        return

    print(get_help_message())


def get_help_message():
    return """
Usage:
  trick list [q:<text>] [type:<widget|view|panel|popup|gadget|wizard>]
  trick show <type.name>
  trick actions <type.name.element_name>
  trick where action:<get|set|click|wait> [q:<text>]
  trick refresh

Description:
  Query the TRICK capability registry built from dashboard trick.yml manifests.
  Use this to see what UI surfaces/elements familiars can interact with.
"""

