from __future__ import annotations


def get_help_message() -> str:
    return """
Usage:
  achievements sync
  achievements award <achievement_id_or_name>
  achievements event <event_name> [key:value ...]
  achievements reset
  achievements reset-progress
"""


def _parse_kv(tokens):
    out = {}
    for tok in tokens or []:
        if ":" not in str(tok):
            continue
        k, _, v = str(tok).partition(":")
        k = k.strip()
        if not k:
            continue
        out[k] = v.strip()
    return out


def run(args, properties):
    sub = str(args[0]).strip().lower() if args else "help"
    if sub in ("help", "-h", "--help"):
        print(get_help_message())
        return

    try:
        from modules.achievement import evaluator as Evaluator
    except Exception as e:
        print(f"Error: could not load achievements evaluator: {e}")
        return

    if sub == "sync":
        rows = Evaluator.evaluate_sync()
        awarded = [r for r in rows if isinstance(r, dict) and r.get("awarded")]
        print(f"Achievement sync complete. Newly awarded: {len(awarded)}")
        for r in awarded:
            print(f"  - {r.get('name')}")
        return

    if sub == "award":
        if len(args) < 2:
            print("Missing achievement id/name.\n" + get_help_message())
            return
        target = str(args[1]).strip()
        res = Evaluator.award_by_id(target, source="command:achievements_award")
        if not res.get("ok"):
            res = Evaluator.award_by_name(target, source="command:achievements_award")
        if not res.get("ok"):
            print(f"Award failed: {res.get('error') or 'unknown error'}")
            return
        if res.get("already_awarded"):
            print(f"Already awarded: {res.get('name')}")
            return
        if res.get("awarded"):
            print(f"Awarded: {res.get('name')} (+{res.get('points', 0)} points, +{res.get('xp', 0)} XP)")
            return
        print("No award applied.")
        return

    if sub == "event":
        if len(args) < 2:
            print("Missing event name.\n" + get_help_message())
            return
        event_name = str(args[1]).strip()
        payload = {}
        payload.update(_parse_kv(args[2:]))
        if isinstance(properties, dict):
            payload.update(properties)
        rows = Evaluator.emit_event(event_name, payload)
        awarded = [r for r in rows if isinstance(r, dict) and r.get("awarded")]
        print(f"Event processed: {event_name}. Newly awarded: {len(awarded)}")
        for r in awarded:
            print(f"  - {r.get('name')}")
        return

    if sub == "reset":
        res = Evaluator.reset_all(clear_archive=True)
        if not isinstance(res, dict) or not res.get("ok"):
            print("Achievement reset failed.")
            return
        prof = res.get("profile") if isinstance(res.get("profile"), dict) else {}
        print(
            "Achievements reset complete. "
            f"Touched: {res.get('touched', 0)}, reset awarded: {res.get('reset_awarded', 0)}. "
            f"Profile level: {prof.get('level', 1)}, XP: {prof.get('xp_total', 0)}."
        )
        return

    if sub in ("reset-progress", "reset_progress", "resetxp", "reset-xp"):
        res = Evaluator.reset_progress()
        if not isinstance(res, dict) or not res.get("ok"):
            print("Achievement progress reset failed.")
            return
        prof = res.get("profile") if isinstance(res.get("profile"), dict) else {}
        print(
            "Achievement progress reset complete. "
            f"Profile level: {prof.get('level', 1)}, XP: {prof.get('xp_total', 0)}."
        )
        return

    print(get_help_message())
