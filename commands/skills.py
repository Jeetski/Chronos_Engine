from utilities import registry_builder


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


def _skills_list(registry):
    rows = registry.get("skills") if isinstance(registry, dict) else []
    return rows if isinstance(rows, list) else []


def _print_skill(row):
    sid = str(row.get("id") or "")
    label = str(row.get("label") or sid)
    summary = str(row.get("summary") or "").strip()
    path = str(row.get("path") or "").strip()
    print(f"- {sid}  {label}")
    if summary:
        print(f"    {summary}")
    if path:
        print(f"    path: {path}")


def run(args, properties):
    """
    skills list|show|where|refresh
    """
    sub = str(args[0]).strip().lower() if args else "help"
    if sub in {"help", "-h", "--help"}:
        print(get_help_message())
        return

    force = bool(str((properties or {}).get("refresh", "")).lower() in {"1", "true", "yes", "on"})
    if sub == "refresh":
        data = registry_builder.build_skills_registry()
        print(f"Skills registry rebuilt. skills={len(_skills_list(data))}")
        return

    registry = registry_builder.build_skills_registry()
    rows = _skills_list(registry)

    if sub == "list":
        kv, rest = _parse_kv(args[1:])
        q = str(kv.get("q") or (" ".join(rest) if rest else "")).strip().lower()
        out = []
        for row in rows:
            sid = str(row.get("id") or "")
            label = str(row.get("label") or "")
            summary = str(row.get("summary") or "")
            hay = f"{sid} {label} {summary}".lower()
            if q and q not in hay:
                continue
            out.append(row)
        if not out:
            print("No skills matched.")
            return
        for row in out:
            _print_skill(row)
        print(f"Matched skills: {len(out)}")
        return

    if sub == "show":
        target = str(args[1]).strip().lower() if len(args) > 1 else ""
        if not target:
            print("Usage: skills show <skill_id>")
            return
        row = next((r for r in rows if str(r.get("id") or "").lower() == target), None)
        if not row:
            print(f"Skill not found: {target}")
            return
        _print_skill(row)
        return

    if sub == "where":
        kv, rest = _parse_kv(args[1:])
        q = str(kv.get("q") or (" ".join(rest) if rest else "")).strip().lower()
        if not q:
            print("Usage: skills where q:<text>")
            return
        out = []
        for row in rows:
            sid = str(row.get("id") or "")
            label = str(row.get("label") or "")
            summary = str(row.get("summary") or "")
            path = str(row.get("path") or "")
            hay = f"{sid} {label} {summary} {path}".lower()
            if q in hay:
                out.append(row)
        if not out:
            print("No skills matched.")
            return
        for row in out:
            _print_skill(row)
        print(f"Matched skills: {len(out)}")
        return

    print(get_help_message())


def get_help_message():
    return """
Usage:
  skills list [q:<text>]
  skills show <skill_id>
  skills where q:<text>
  skills refresh

Description:
  Query the agent skills registry built from docs/agents/skills/*/skill.md.
  Use this to discover and select real available skills without loading
  large docs into prompt context.
"""

