from datetime import datetime, timedelta

from .v1 import USER_DIR, is_template_eligible_for_day, list_all_day_templates, read_template


SLEEP_POLICY_OPTIONS = [
    ("woke_early", "I woke up early"),
    ("stay_awake", "I'm staying awake and starting the day now"),
    ("go_back_to_sleep", "I should go back to sleep"),
    ("shift_later", "Shift today later"),
    ("ignore_today", "Ignore this sleep block for today"),
    ("edit_sleep", "Edit my sleep schedule"),
]

_ALLOWED_POLICIES = {name for name, _ in SLEEP_POLICY_OPTIONS}


def normalize_sleep_policy(value):
    text = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    return text if text in _ALLOWED_POLICIES else None


def command_requires_sleep_gate(command_name, args=None):
    cmd = str(command_name or "").strip().lower()
    argv = [str(a or "").strip().lower() for a in (args or [])]
    if cmd == "today":
        return "reschedule" in argv
    if cmd == "start":
        if not argv:
            return False
        target = argv[0]
        return target in {"day", "today"} or (target == "my" and len(argv) >= 2 and argv[1] in {"day", "today"})
    return False


def extract_sleep_policy(args=None, properties=None):
    props = properties or {}
    explicit = normalize_sleep_policy(props.get("sleep_policy") or props.get("sleep-policy"))
    if explicit:
        return explicit
    for raw in (args or []):
        token = str(raw or "").strip()
        low = token.lower()
        if low.startswith("sleep_policy:") or low.startswith("sleep-policy:"):
            return normalize_sleep_policy(token.split(":", 1)[1])
    return None


def _parse_hm(value):
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            parsed = datetime.strptime(text, fmt)
            return parsed.hour * 60 + parsed.minute
        except ValueError:
            continue
    return None


def _duration_minutes(node):
    raw = node.get("duration")
    if isinstance(raw, (int, float)):
        return max(0, int(round(raw)))
    text = str(raw or "").strip()
    if text.isdigit():
        return max(0, int(text))
    return None


def _is_sleep_anchor(node):
    if not isinstance(node, dict):
        return False
    tags = {str(tag or "").strip().lower() for tag in (node.get("tags") or []) if str(tag or "").strip()}
    category = str(node.get("category") or "").strip().lower()
    subtype = str(node.get("subtype") or "").strip().lower()
    name = str(node.get("name") or "").strip().lower()
    sleep_flag = bool(node.get("sleep"))
    anchored = subtype == "anchor" or str(node.get("reschedule") or "").strip().lower() == "never" or bool(node.get("essential"))
    if sleep_flag:
        return True
    if "sleep" in tags and anchored:
        return True
    if category == "sleep" and anchored:
        return True
    return anchored and any(hint in name for hint in ("sleep", "bedtime"))


def _walk_sleep_anchors(node):
    found = []
    if isinstance(node, dict):
        if _is_sleep_anchor(node):
            found.append(node)
        for child in (node.get("children") or []):
            found.extend(_walk_sleep_anchors(child))
    elif isinstance(node, list):
        for child in node:
            found.extend(_walk_sleep_anchors(child))
    return found


def _eligible_templates_for_date(target_dt):
    weekday = target_dt.strftime("%A").lower()
    out = []
    for path in list_all_day_templates():
        template = read_template(path)
        if not isinstance(template, dict):
            continue
        if not is_template_eligible_for_day(template, weekday):
            continue
        out.append((path, template))
    return out


def _build_interval(anchor, anchor_date, template_name, template_path):
    start_minutes = _parse_hm(anchor.get("start_time"))
    if start_minutes is None:
        return None
    duration = _duration_minutes(anchor)
    end_minutes = _parse_hm(anchor.get("end_time"))
    start_dt = datetime.combine(anchor_date.date(), datetime.min.time()) + timedelta(minutes=start_minutes)
    if duration is not None and duration > 0:
        end_dt = start_dt + timedelta(minutes=duration)
    elif end_minutes is not None:
        end_dt = datetime.combine(anchor_date.date(), datetime.min.time()) + timedelta(minutes=end_minutes)
        if end_dt <= start_dt:
            end_dt += timedelta(days=1)
    else:
        return None
    return {
        "name": str(anchor.get("name") or "Sleep Anchor"),
        "template_name": template_name,
        "template_path": template_path,
        "start": start_dt,
        "end": end_dt,
        "start_time": start_dt.strftime("%H:%M"),
        "end_time": end_dt.strftime("%H:%M"),
        "duration_minutes": max(0, int((end_dt - start_dt).total_seconds() / 60)),
    }


def get_active_sleep_block(now=None):
    current = now or datetime.now()
    candidates = []
    for offset in (-1, 0):
        target_dt = current + timedelta(days=offset)
        for path, template in _eligible_templates_for_date(target_dt):
            template_name = str(template.get("name") or os.path.splitext(os.path.basename(path))[0]).strip()
            for anchor in _walk_sleep_anchors(template.get("children") or []):
                interval = _build_interval(anchor, target_dt, template_name, path)
                if interval:
                    candidates.append(interval)
    covering = [
        item for item in candidates
        if item["start"] <= current < item["end"]
    ]
    if not covering:
        return None
    covering.sort(key=lambda item: (item["start"], item["end"]))
    chosen = covering[0]
    return {
        "name": chosen["name"],
        "template_name": chosen["template_name"],
        "template_path": chosen["template_path"],
        "start_iso": chosen["start"].isoformat(timespec="seconds"),
        "end_iso": chosen["end"].isoformat(timespec="seconds"),
        "start_time": chosen["start_time"],
        "end_time": chosen["end_time"],
        "duration_minutes": chosen["duration_minutes"],
    }


def build_sleep_interrupt(command_name, args=None, properties=None, now=None):
    if not command_requires_sleep_gate(command_name, args):
        return None
    if extract_sleep_policy(args, properties):
        return None
    block = get_active_sleep_block(now=now)
    if not block:
        return None
    return {
        "type": "sleep_conflict",
        "command": str(command_name or "").strip().lower(),
        "args": list(args or []),
        "sleep_block": block,
        "options": [name for name, _ in SLEEP_POLICY_OPTIONS],
        "message": "You're inside a scheduled sleep block. What is happening?",
    }


def get_effective_sleep_policy(command_name, args=None, properties=None, now=None):
    explicit = extract_sleep_policy(args, properties)
    if explicit:
        return explicit
    return None
