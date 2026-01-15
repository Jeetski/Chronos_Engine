"""
Minimal ADUC server
-------------------
This is a deliberately small, heavily commented Flask app that:
 - Serves a simple UI (ADUC.html + static assets)
 - Lists familiars from the local folder
 - Bridges chat via a shared temp JSON file (conversation.json)

No local LLM or fallback replies. If the CLI watcher is not running,
the UI will show pending until your external agent writes a reply.
"""

import os
import json
import re
import uuid
import random
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory, send_file


# Paths
BASE_DIR = Path(__file__).resolve().parent
FAMILIARS_DIR = BASE_DIR / "familiars"
STATIC_DIR = BASE_DIR / "static"
PRESETS_DIR = BASE_DIR / "presets" / "layouts"

# Conversation JSON lives in the OS temp directory: <temp>/ADUC/conversation.json
TEMP_DIR = Path(tempfile.gettempdir()) / "ADUC"
CONV_PATH = TEMP_DIR / "conversation.json"
HEARTBEAT_PATH = TEMP_DIR / "cli_heartbeat.json"
SETTINGS_PATH = TEMP_DIR / "settings.json"
USAGE_PATH = TEMP_DIR / "usage.json"
JOURNEYS_PATH = TEMP_DIR / "journeys.json"
FOCUS_PATH = TEMP_DIR / "focus_cycle.json"


# Flask will serve files under /static automatically from STATIC_DIR
app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")


# ---- Small utility functions -------------------------------------------------

def read_text(path: Path) -> str:
    """Return UTF-8 file text or empty string if missing."""
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def read_json(path: Path, default):
    """Return parsed JSON or a provided default on error/missing."""
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def atomic_write_json(path: Path, data) -> None:
    """Write JSON atomically: temp file then replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f".{uuid.uuid4().hex}.tmp")
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)
    finally:
        try:
            if tmp.exists():
                tmp.unlink()
        except Exception:
            pass


def sanitize_preset_name(name: str) -> str:
    if not isinstance(name, str):
        return ""
    cleaned = name.strip()
    if not cleaned:
        return ""
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", cleaned):
        return ""
    return cleaned


def settings_path() -> Path:
    return SETTINGS_PATH


def settings_load() -> dict:
    # Defaults
    default = {
        "nsfw_enabled": True,
        "quiet_hours": {"start": "23:00", "end": "07:00"},
        "daily_nsfw_cap": 0,  # 0 = no cap (placeholder for future)
        "dev_nsfw_override": False,  # developer testing override
        "dev_instant_journey_return": False,
        # Prompt composition toggles
        "include_memory": False,
        "immersive": False,
    }
    try:
        return read_json(settings_path(), default)
    except Exception:
        return default


def settings_save(data: dict) -> None:
    atomic_write_json(settings_path(), data)


def list_familiars():
    """Return a minimal list of familiars discovered in the folder."""
    out = []
    if not FAMILIARS_DIR.exists():
        return out
    for entry in sorted(FAMILIARS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        meta = read_json(entry / "meta.json", {})
        out.append({
            "id": entry.name,
            "name": meta.get("name", entry.name),
            "full_name": meta.get("full_name", meta.get("name", entry.name)),
            "emotions": meta.get("emotions", []),
            "default_avatar": meta.get("default_avatar", "avatar/default.png"),
            "default_background": meta.get("default_background", ""),
        })
    return out


# State tag parser: accepts either "<emotion: X>" or "<state: X>" on the last line
STATE_TAG_RE = re.compile(r"<(?:emotion|state):\s*([a-zA-Z0-9_\-]+)\s*>", re.IGNORECASE)

# Location/Background tag parser: accepts "<location: filename.png>" or "<background: filename.png>"
# Supports subfolder paths like "christmas/bedroom.png"
BACKGROUND_TAG_RE = re.compile(r"<(?:location|background):\s*([a-zA-Z0-9_\-\./]+)\s*>", re.IGNORECASE)

# Pose tag parser: accepts "<pose: filename.png>" or "<avatar: filename.png>"
POSE_TAG_RE = re.compile(r"<(?:pose|avatar):\s*([^>]+)>", re.IGNORECASE)

# Prompt suggestion tag parser: "<prompt: your suggestion>"
PROMPT_TAG_RE = re.compile(r"<prompt:\s*([^>]+)>", re.IGNORECASE)


# ---- Conversation JSON helpers ---------------------------------------------

def conv_load():
    """Load the shared conversation document (create a new one if missing)."""
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    return read_json(CONV_PATH, {"version": 1, "updated_at": None, "turns": []})


def conv_save(doc):
    """Save the conversation JSON atomically."""
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    atomic_write_json(CONV_PATH, doc)


# ---- Familiar state helpers -------------------------------------------------

# Map of locations that have Christmas versions (used in December)
CHRISTMAS_VERSIONS = {
    "bedroom.png": "christmas/bedroom.png",
    "cabin_winter.png": "christmas/cabin_winter.png",
    "moonlit_study.png": "christmas/moonlit_study.png",
    "study.png": "christmas/study.png",
}

def get_christmas_location(fam_id: str, location: str) -> str:
    """Return Christmas version of location if December and it exists, else original."""
    from datetime import datetime
    if datetime.now().month != 12:
        return location
    if location not in CHRISTMAS_VERSIONS:
        return location
    christmas_loc = CHRISTMAS_VERSIONS[location]
    christmas_path = FAMILIARS_DIR / fam_id / "locations" / christmas_loc
    if christmas_path.exists():
        return christmas_loc
    return location

def fam_state_path(fam_id: str) -> Path:
    return FAMILIARS_DIR / fam_id / "state.json"


def fam_state_load(fam_id: str) -> dict:
    """Load familiar state with backward compatibility for emotion -> avatar migration."""
    default = {"avatar": "default.png", "location": "", "hearts": 0, "activity": ""}
    state = read_json(fam_state_path(fam_id), default)
    # Migrate old emotion field to avatar if needed
    if "emotion" in state and "avatar" not in state:
        emotion = state.pop("emotion", "default")
        state["avatar"] = f"{emotion}.png" if emotion else "default.png"
    if "avatar" not in state:
        state["avatar"] = "default.png"
    if "location" not in state:
        # Get default location from meta.json (with December Christmas override)
        meta = read_json(FAMILIARS_DIR / fam_id / "meta.json", {})
        default_loc = meta.get("default_background", "")
        state["location"] = get_christmas_location(fam_id, default_loc)
    if "hearts" not in state:
        state["hearts"] = 0
    if "activity" not in state:
        state["activity"] = ""
    # Developer override: force hearts to max (5)
    try:
        if bool(settings_load().get("dev_nsfw_override", False)):
            state["hearts"] = 5
    except Exception:
        pass
    return state


def fam_state_save(fam_id: str, state: dict) -> None:
    """Save familiar state, removing deprecated emotion field."""
    state.pop("emotion", None)  # Remove old field if present
    atomic_write_json(fam_state_path(fam_id), state)


# ---- Usage helpers (daily counters) -----------------------------------------

def usage_load() -> dict:
    return read_json(USAGE_PATH, {"days": {}})

def usage_save(data: dict) -> None:
    atomic_write_json(USAGE_PATH, data)

def usage_today_key() -> str:
    # Local date for user-facing day boundaries
    return datetime.now().date().isoformat()

def usage_bucket(day: str | None, fam_id: str) -> dict:
    data = usage_load()
    if day is None:
        day = usage_today_key()
    days = data.setdefault("days", {})
    fams = days.setdefault(day, {})
    buck = fams.setdefault(fam_id, {})
    usage_save(data)
    return buck

def usage_mark_achieved5_today(fam_id: str) -> None:
    data = usage_load()
    b = usage_bucket(None, fam_id)
    b["achieved_5_today"] = True
    usage_save(data)

def usage_get_pomo_blocks(fam_id: str) -> int:
    b = usage_bucket(None, fam_id)
    try:
        return int(b.get("pomo_blocks", 0) or 0)
    except Exception:
        return 0

def usage_inc_pomo_blocks(fam_id: str, n: int = 1) -> None:
    data = usage_load()
    b = usage_bucket(None, fam_id)
    b["pomo_blocks"] = int(b.get("pomo_blocks", 0) or 0) + int(n)
    usage_save(data)
    
def usage_get_cameo_count(fam_id: str) -> int:
    b = usage_bucket(None, fam_id)
    try:
        return int(b.get("cameo_count_today", 0) or 0)
    except Exception:
        return 0

def usage_inc_cameo_count(fam_id: str, n: int = 1) -> None:
    data = usage_load()
    b = usage_bucket(None, fam_id)
    b["cameo_count_today"] = int(b.get("cameo_count_today", 0) or 0) + int(n)
    b["last_nsfw_moment_at"] = datetime.now().isoformat()
    usage_save(data)

def usage_get_moment_count(fam_id: str) -> int:
    b = usage_bucket(None, fam_id)
    try:
        return int(b.get("moment_count_today", 0) or 0)
    except Exception:
        return 0

def usage_inc_moment_count(fam_id: str, n: int = 1) -> None:
    data = usage_load()
    b = usage_bucket(None, fam_id)
    b["moment_count_today"] = int(b.get("moment_count_today", 0) or 0) + int(n)
    b["last_nsfw_moment_at"] = datetime.now().isoformat()
    usage_save(data)

def usage_get_last_nsfw_moment(fam_id: str) -> datetime | None:
    b = usage_bucket(None, fam_id)
    ts = b.get("last_nsfw_moment_at")
    if not ts:
        return None
    try:
        # Stored as local ISO without tz
        return datetime.fromisoformat(str(ts))
    except Exception:
        return None

def usage_get_pomo_index_at_last_cameo(fam_id: str) -> int:
    b = usage_bucket(None, fam_id)
    try:
        return int(b.get("pomo_index_at_last_cameo", 0) or 0)
    except Exception:
        return 0

def usage_set_pomo_index_at_last_cameo(fam_id: str, idx: int) -> None:
    data = usage_load()
    b = usage_bucket(None, fam_id)
    b["pomo_index_at_last_cameo"] = int(idx)
    usage_save(data)

def usage_mark_pose_used(fam_id: str, pose_id: str) -> None:
    data = usage_load()
    b = usage_bucket(None, fam_id)
    poses = b.setdefault("poses_used_48h", {})
    poses[str(pose_id)] = datetime.now().isoformat()
    usage_save(data)

def usage_recent_poses(fam_id: str, within_hours: int = 48) -> set:
    b = usage_bucket(None, fam_id)
    poses = b.get("poses_used_48h", {}) or {}
    out = set()
    cutoff = datetime.now() - timedelta(hours=within_hours)
    for pid, ts in poses.items():
        try:
            dt = datetime.fromisoformat(str(ts))
            if dt >= cutoff:
                out.add(pid)
        except Exception:
            continue
    return out

# ---- Journey helpers ---------------------------------------------------------

def journeys_load() -> dict:
    return read_json(JOURNEYS_PATH, {"active": None, "familiars": {}})

def journey_is_away(fam_id: str) -> tuple[bool, str | None]:
    j = journeys_load()
    act = j.get("active") or {}
    if act and act.get("fam_id") == fam_id:
        return True, act.get("ends_at")
    return False, None

# ---- Catalog loaders ---------------------------------------------------------

def fam_dir(fam_id: str) -> Path:
    return FAMILIARS_DIR / fam_id

def load_avatar_catalog(fam_id: str) -> dict:
    p = fam_dir(fam_id) / "avatar_list.json"
    if p.exists():
        return read_json(p, {"version": 1, "poses": []})
    # Fallback: scan avatar folder
    base = fam_dir(fam_id) / "avatar"
    poses = []
    if base.exists():
        for path in base.rglob("*.png"):
            rel = path.relative_to(base).as_posix()
            cat = "base"
            if "/nsfw/" in ("/" + rel):
                cat = "nsfw"
            elif "/activities/" in ("/" + rel):
                cat = "activity"
            name = path.stem.lower()
            tags = re.split(r"[^a-z0-9]+", name)
            tags = [t for t in tags if t]
            poses.append({"id": rel, "category": cat, "tags": tags})
    return {"version": 1, "poses": poses}

def load_background_catalog(fam_id: str) -> dict:
    # Try backgrounds.md
    p = fam_dir(fam_id) / "docs" / "backgrounds.md"
    if p.exists():
        text = read_text(p)
        bgs = []
        for line in text.splitlines():
            line = line.strip()
            # Match: - `filename`: description
            m = re.match(r"-\s*`([^`]+)`\s*:\s*(.*)", line)
            if m:
                bgs.append({"id": m.group(1), "tags": [t.strip().lower() for t in re.split(r"[^a-zA-Z0-9]+", m.group(2)) if t]})
        if bgs:
            return {"version": 1, "backgrounds": bgs}

    # Fallback: scan locations folder
    bdir = fam_dir(fam_id) / "locations"
    bgs = []
    if bdir.exists():
        for path in bdir.glob("*.png"):
            name = path.stem.lower()
            tags = re.split(r"[^a-z0-9]+", name)
            tags = [t for t in tags if t]
            bgs.append({"id": path.name, "tags": tags})
    return {"version": 1, "backgrounds": bgs}

def choose_pose(fam_id: str, categories: list[str], prefer_tags: list[str] | None, avoid_recent_hours: int = 48) -> str | None:
    cat = load_avatar_catalog(fam_id)
    poses = [p for p in cat.get("poses", []) if str(p.get("category")) in categories]
    if not poses:
        return None
    recent = usage_recent_poses(fam_id, within_hours=avoid_recent_hours)
    def is_recent(p):
        return p.get("id") in recent
    # Filter by tags if provided
    if prefer_tags:
        pts = set(t.lower() for t in prefer_tags)
        tagged = [p for p in poses if any(t.lower() in pts for t in (p.get("tags") or [])) and not is_recent(p)]
        if tagged:
            return random.choice(tagged).get("id")
    # Fallback: any non-recent
    fresh = [p for p in poses if not is_recent(p)]
    if fresh:
        return random.choice(fresh).get("id")
    # Last resort: allow recent
    return random.choice(poses).get("id")

# ---- Layout Config Helper ---------------------------------------------------

def fam_layout_load(fam_id: str) -> dict:
    """Recursively scan avatar folder for layout.json files and build a mapping."""
    base = fam_dir(fam_id) / "avatar"
    if not base.exists():
        return {}
    
    layouts = {}
    # Walk top-down
    for root, dirs, files in os.walk(base):
        if "layout.json" in files:
            try:
                path = Path(root) / "layout.json"
                data = read_json(path, {})
                # Key is relative path from avatar/ to the folder containing layout.json
                # e.g. "" for root, "nsfw" for avatar/nsfw
                rel = Path(root).relative_to(base).as_posix()
                if rel == ".":
                    rel = ""
                layouts[rel] = data
            except Exception:
                pass
    return layouts

# ---- Focus/Break cycle helpers ----------------------------------------------

def focus_cycle_load() -> dict:
    return read_json(FOCUS_PATH, {
        "mode": "idle",  # 'focus' | 'break' | 'idle'
        "started_at": None,
        "ends_at": None,
        "length_ms": 0,
        "familiar": None,
    })


def focus_cycle_save(data: dict) -> None:
    atomic_write_json(FOCUS_PATH, data)


def focus_cycle_status() -> dict:
    """Return computed status with remaining_ms derived from ends_at."""
    data = focus_cycle_load()
    mode = str(data.get("mode") or "idle").lower()
    started = data.get("started_at")
    ends = data.get("ends_at")
    length_ms = int(data.get("length_ms") or 0)
    remaining_ms = 0
    try:
        if ends:
            ends_dt = datetime.fromisoformat(str(ends).replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            delta = (ends_dt - now).total_seconds() * 1000.0
            remaining_ms = int(max(0, round(delta)))
        if (not length_ms) and started and ends:
            s_dt = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
            e_dt = datetime.fromisoformat(str(ends).replace("Z", "+00:00"))
            length_ms = int(max(0, round((e_dt - s_dt).total_seconds() * 1000.0)))
    except Exception:
        remaining_ms = 0
    out = {
        "mode": mode,
        "started_at": started,
        "ends_at": ends,
        "length_ms": length_ms,
        "remaining_ms": remaining_ms,
        "familiar": data.get("familiar"),
    }
    return out

# ---- NSFW boundary helper ----------------------------------------------------

def quiet_hours_active(s: dict) -> bool:
    try:
        q = (s.get("quiet_hours") or {})
        start = str(q.get("start", "23:00"))
        end = str(q.get("end", "07:00"))
        from datetime import time as dtime
        sh, sm = [int(x) for x in start.split(":")] if ":" in start else (int(start), 0)
        eh, em = [int(x) for x in end.split(":")] if ":" in end else (int(end), 0)
        now = datetime.now().time()
        t_start = dtime(sh, sm)
        t_end = dtime(eh, em)
        if t_start < t_end:
            return t_start <= now < t_end
        return now >= t_start or now < t_end
    except Exception:
        return False

def nsfw_allowed_now() -> bool:
    s = settings_load()
    dev = bool(s.get("dev_nsfw_override", False))
    if dev:
        return True
    return bool(s.get("nsfw_enabled", True)) and (not quiet_hours_active(s))

def trace_log(msg: str) -> None:
    try:
        TEMP_DIR.mkdir(parents=True, exist_ok=True)
        with open(TRACE_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().isoformat()}] {msg}\n")
    except Exception:
        pass
    


# ---- Familiar profile helpers ----------------------------------------------

def fam_profile_path(fam_id: str) -> Path:
    return FAMILIARS_DIR / fam_id / "profile.json"


def fam_profile_load(fam_id: str) -> dict:
    return read_json(fam_profile_path(fam_id), {})


def fam_profile_save(fam_id: str, profile: dict) -> None:
    atomic_write_json(fam_profile_path(fam_id), profile)


# ---- Familiar activities helpers -------------------------------------------

def fam_activities_path(fam_id: str) -> Path:
    return FAMILIARS_DIR / fam_id / "activities.json"


def fam_activities_load(fam_id: str) -> list:
    data = read_json(fam_activities_path(fam_id), {})
    acts = data.get("activities", []) if isinstance(data, dict) else []
    # Normalize minimal fields
    out = []
    for a in acts:
        if not isinstance(a, dict):
            continue
        aid = str(a.get("id") or "").strip()
        avatar = str(a.get("avatar") or "").strip()
        bg = str(a.get("background") or "").strip()
        if aid and avatar and bg:
            lab = str(a.get("label") or "").strip() or aid
            out.append({"id": aid, "label": lab, "avatar": avatar, "background": bg})
    return out


def conv_append_user(familiar: str, text: str) -> str:
    """Append a user turn and return its id."""
    doc = conv_load()
    turn_id = str(uuid.uuid4())
    cyc = focus_cycle_status()
    doc.setdefault("turns", []).append({
        "id": turn_id,
        "familiar": familiar,
        "role": "user",
        "text": text,
        "at": datetime.now(timezone.utc).isoformat(),
        "status": "pending",
        # Snapshot cycle context at message time
        "cycle_mode": cyc.get("mode"),
        "cycle_length_ms": cyc.get("length_ms"),
        "cycle_remaining_ms": cyc.get("remaining_ms"),
        "cycle_started_at": cyc.get("started_at"),
        "cycle_ends_at": cyc.get("ends_at"),
    })
    conv_save(doc)
    return turn_id


def conv_append_user_with(familiar: str, text: str, extras: dict | None = None) -> str:
    """Append a user turn with extra fields (e.g., kind, flags) and return its id."""
    doc = conv_load()
    turn_id = str(uuid.uuid4())
    turn = {
        "id": turn_id,
        "familiar": familiar,
        "role": "user",
        "text": text,
        "at": datetime.now(timezone.utc).isoformat(),
        "status": "pending",
    }
    # Snapshot cycle at enqueue time
    try:
        cyc = focus_cycle_status()
        turn.update({
            "cycle_mode": cyc.get("mode"),
            "cycle_length_ms": cyc.get("length_ms"),
            "cycle_remaining_ms": cyc.get("remaining_ms"),
            "cycle_started_at": cyc.get("started_at"),
            "cycle_ends_at": cyc.get("ends_at"),
        })
    except Exception:
        pass
    if extras:
        try:
            # Only merge simple JSON-serializable fields
            turn.update({k: v for k, v in extras.items() if k not in ("id", "role")})
        except Exception:
            pass
    doc.setdefault("turns", []).append(turn)
    conv_save(doc)
    return turn_id


def conv_find_reply(familiar: str, turn_id: str):
    """Return the latest CLI reply turn matching a user turn id."""
    doc = conv_load()
    turns = [
        t for t in doc.get("turns", [])
        if t.get("role") == "cli" and t.get("familiar") == familiar and t.get("in_reply_to") == turn_id
    ]
    return turns[-1] if turns else None


def cli_active(threshold_seconds: int = 20):
    """Return (active: bool, last_seen: str|None) based on heartbeat file."""
    try:
        data = read_json(HEARTBEAT_PATH, {})
        last_seen = data.get("last_seen")
        if not last_seen:
            return False, None
        # Normalize Z suffix for fromisoformat
        ts_str = str(last_seen).replace("Z", "+00:00")
        ts = datetime.fromisoformat(ts_str)
        now = datetime.now(timezone.utc)
        active = (now - ts).total_seconds() <= threshold_seconds
        return active, data.get("last_seen")
    except Exception:
        return False, None


# ---- Routes -----------------------------------------------------------------

@app.route("/")
def root():
    """Serve the single-page UI from the repo root."""
    index = BASE_DIR / "ADUC.html"
    if index.exists():
        return send_file(str(index))
    return "ADUC minimal server: add ADUC.html to use the UI.", 200


@app.route("/familiars", methods=["GET"])
def get_familiars():
    return jsonify(list_familiars())

@app.route("/familiars/<fam_id>/activities", methods=["GET"])
def get_familiar_activities(fam_id):
    """Return a familiar's activities list from activities.json (if present)."""
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"activities": []})
    return jsonify({"activities": fam_activities_load(fam_id)})


@app.route("/user-profile", methods=["GET"])
def get_user_profile():
    """Return user's nickname and avatar from Chronos profile.yml if in Chronos mode.
    
    In Chronos mode (ADUC_PROJECT_PATH set), reads User/Profile/profile.yml.
    Falls back to familiar's profile.json nickname.
    """
    result = {"nickname": "You", "avatar": "/static/avatar-default.svg", "source": "default"}
    
    # Check for Chronos mode - ADUC_PROJECT_PATH points to Chronos Engine root
    project_path = os.environ.get("ADUC_PROJECT_PATH", "")
    if project_path:
        # Try to read User/Profile/profile.yml
        profile_yml = Path(project_path) / "User" / "Profile" / "profile.yml"
        if profile_yml.exists():
            try:
                import yaml
                content = profile_yml.read_text(encoding="utf-8")
                data = yaml.safe_load(content)
                if data:
                    if data.get("nickname"):
                        result["nickname"] = data["nickname"]
                        result["source"] = "chronos"
                    # Avatar path is relative to project root, e.g. "User\Profile\avatar.jpg"
                    if data.get("avatar"):
                        # Normalize path and serve via /user-avatar endpoint
                        result["avatar"] = "/user-avatar"
                    return jsonify(result)
            except Exception as e:
                # YAML parse error, continue to fallback
                pass
    
    # Fallback: try familiar's profile.json if fam_id provided as query param
    fam_id = request.args.get("familiar", "")
    if fam_id and (FAMILIARS_DIR / fam_id).exists():
        profile = fam_profile_load(fam_id)
        if profile.get("nickname"):
            result["nickname"] = profile["nickname"]
            result["source"] = "familiar"
    
    return jsonify(result)


@app.route("/user-avatar")
def serve_user_avatar():
    """Serve user's avatar from Chronos User/Profile/avatar.* if in Chronos mode."""
    project_path = os.environ.get("ADUC_PROJECT_PATH", "")
    if project_path:
        profile_dir = Path(project_path) / "User" / "Profile"
        # Try common image extensions
        for ext in ["jpg", "jpeg", "png", "gif", "webp"]:
            avatar_path = profile_dir / f"avatar.{ext}"
            if avatar_path.exists():
                return send_from_directory(profile_dir, f"avatar.{ext}")
    # Fallback to default
    return send_from_directory(STATIC_DIR, "avatar-default.svg")


@app.route("/familiars/<fam_id>/avatar/<path:filename>")
def get_avatar(fam_id, filename):
    """Serve a familiar avatar file or fall back to a placeholder.

    NSFW images are only served when explicitly requested via a subpath
    (e.g., 'nsfw/pose.png') AND current settings allow NSFW. We no longer
    auto-upgrade base emotion names to NSFW equivalents.
    """
    fdir = FAMILIARS_DIR / fam_id / "avatar"
    if fdir.exists():
        settings = settings_load()
        dev_override = bool(settings.get("dev_nsfw_override", False))
        # Allow bypass via query param for the Dev Selector tool
        is_preview = request.args.get("preview") == "true"

        def _quiet_hours_active(s: dict) -> bool:
            try:
                q = (s.get("quiet_hours") or {})
                start = str(q.get("start", "23:00"))
                end = str(q.get("end", "07:00"))
                from datetime import time as dtime
                sh, sm = [int(x) for x in start.split(":")] if ":" in start else (int(start), 0)
                eh, em = [int(x) for x in end.split(":")] if ":" in end else (int(end), 0)
                now = datetime.now(timezone.utc).astimezone().time()
                t_start = dtime(sh, sm)
                t_end = dtime(eh, em)
                if t_start < t_end:
                    return t_start <= now < t_end
                return now >= t_start or now < t_end
            except Exception:
                return False

        nsfw_enabled = bool(settings.get("nsfw_enabled", True))
        boundaries_on = (not nsfw_enabled) or _quiet_hours_active(settings)
        allow_nsfw = is_preview or dev_override or (nsfw_enabled and not boundaries_on)

        # If client explicitly requests a subpath under nsfw/, honor only if allowed
        norm = str(filename).replace("\\", "/")
        explicit_nsfw = norm.startswith("nsfw/") or "/nsfw/" in ("/" + norm)
        if explicit_nsfw:
            if allow_nsfw:
                # serve exact subpath under avatar/
                target = fdir / norm
                if target.exists():
                    # Separate directory and relative file for send_from_directory
                    base_dir = target.parent
                    rel_name = target.name
                    return send_from_directory(str(base_dir), rel_name)
            # not allowed or missing -> fall through to safe fallback

        # Non-NSFW or blocked: serve base path only, no NSFW fallback
        target = fdir / norm
        if target.exists():
            base_dir = target.parent
            rel_name = target.name
            # Ensure it is not under nsfw when blocked
            if not explicit_nsfw:
                return send_from_directory(str(base_dir), rel_name)

        # Base default fallback (never auto-swap to nsfw default)
        default_png = fdir / "default.png"
        if default_png.exists():
            return send_from_directory(str(fdir), "default.png")
    return send_from_directory(str(STATIC_DIR), "avatar-default.svg")


@app.route("/familiars/<fam_id>/background/<path:filename>")
def get_background(fam_id, filename):
    """Serve a familiar background image from familiars/<id>/locations.

    Supports subfolder paths like 'christmas/bedroom.png'.
    Falls back to a generic static background if missing.
    """
    locations_dir = FAMILIARS_DIR / fam_id / "locations"
    target = locations_dir / filename
    if target.exists():
        # send_from_directory needs the directory and just the filename
        # For nested paths, we need to use the target's parent as directory
        return send_from_directory(str(target.parent), target.name)
    # Fallback: a generic background if available
    fallback = STATIC_DIR / "backgrounds" / "void_space.svg"
    if fallback.exists():
        return send_from_directory(str(STATIC_DIR / "backgrounds"), "void_space.svg")
    # As last resort, return 404
    return ("Background not found", 404)

@app.route("/familiars/<fam_id>/meta", methods=["GET"]) 
def get_familiar_meta(fam_id):
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    meta = read_json(FAMILIARS_DIR / fam_id / "meta.json", {})
    return jsonify(meta)


@app.route("/familiars/<fam_id>/state", methods=["GET"]) 
def get_familiar_state(fam_id):
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    state = fam_state_load(fam_id)
    # Annotate journey status for UI convenience
    away, until = journey_is_away(fam_id)
    if away:
        state = {**state, "journey": {"away": True, "until": until}}
    else:
        state = {**state, "journey": {"away": False}}
    return jsonify(state)


@app.route("/familiars/<fam_id>/state", methods=["POST"]) 
def update_familiar_state(fam_id):
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    data = request.get_json(force=True, silent=True) or {}
    cur = fam_state_load(fam_id)
    # If dev override is enabled, lock hearts to 5 and allow emotion updates
    try:
        if bool(settings_load().get("dev_nsfw_override", False)):
            cur["hearts"] = 5
            if "emotion" in data:
                emo = str(data["emotion"]).strip()
                if emo:
                    cur["emotion"] = emo
            fam_state_save(fam_id, cur)
            return jsonify(cur)
    except Exception:
        pass
    if "hearts" in data:
        # Enforce Pomodoro diminishing returns and daily positive lock after Reset
        try:
            new_req = float(data["hearts"])  # requested absolute hearts value
            cur_val = float(cur.get("hearts", 0) or 0)
            delta = new_req - cur_val
            if delta > 0:
                # Treat positive client-side updates as Pomodoro completions
                flags = usage_bucket(None, fam_id)
                reset_used = bool(flags.get("reset_used", False))
                if reset_used:
                    # Block positive gains for the rest of the day
                    delta = 0.0
                else:
                    blocks = usage_get_pomo_blocks(fam_id)
                    # Diminishing returns per day: 0->+0.5, 1->+0.25, 2+->0
                    allowed = 0.0
                    if blocks == 0:
                        allowed = 0.5
                    elif blocks == 1:
                        allowed = 0.25
                    else:
                        allowed = 0.0
                    delta = min(delta, allowed)
                    if delta > 0:
                        usage_inc_pomo_blocks(fam_id, 1)
                new_abs = cur_val + delta
            else:
                # Allow negatives or no change
                new_abs = new_req
            # Clamp and round to nearest 0.25 (UI renders half-heart when >=0.25)
            new_abs = max(0.0, min(5.0, round(new_abs * 4) / 4.0))
            cur["hearts"] = new_abs
            if new_abs >= 4.5:
                usage_mark_achieved5_today(fam_id)
        except Exception:
            pass
    if "emotion" in data:
        emo = str(data["emotion"]).strip()
        if emo:
            cur["emotion"] = emo
    if "state" in data and str(data["state"]).strip():
        # Support alias key 'state' to set emotion/state string
        cur["emotion"] = str(data["state"]).strip()
    if "activity" in data:
        cur["activity"] = str(data["activity"] or "").strip()
    # Support avatar and location updates
    if "avatar" in data:
        avatar = str(data["avatar"] or "").strip()
        if avatar:
            cur["avatar"] = avatar
    if "location" in data:
        location = str(data["location"] or "").strip()
        cur["location"] = location
    fam_state_save(fam_id, cur)
    return jsonify(cur)


@app.route("/clear-cache", methods=["POST"])
def clear_docs_cache():
    """Delete docs cache files to force fresh injection on next prompt."""
    import os
    cache_files = [
        Path(os.environ.get("TEMP", "/tmp")) / "aduc" / "familiar_docs_mtimes.json",
        Path(os.environ.get("TEMP", "/tmp")) / "aduc" / "chronos_docs_mtimes.json",
        Path(os.environ.get("TEMP", "/tmp")) / "aduc" / "external_context_mtime.json",
    ]
    deleted = []
    for f in cache_files:
        if f.exists():
            try:
                f.unlink()
                deleted.append(str(f.name))
            except Exception:
                pass
    return jsonify({"deleted": deleted, "message": "Docs cache cleared. Next prompt will inject fresh docs."})


@app.route("/clear-conversation", methods=["POST"])
def clear_conversation():
    """Clear conversation history for a fresh start."""
    try:
        if CONV_PATH.exists():
            CONV_PATH.unlink()
        return jsonify({"message": "Conversation history cleared."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/familiars/<fam_id>/profile", methods=["GET"]) 
def get_familiar_profile(fam_id):
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    return jsonify(fam_profile_load(fam_id))


@app.route("/familiars/<fam_id>/profile", methods=["POST"]) 
def update_familiar_profile(fam_id):
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    data = request.get_json(force=True, silent=True) or {}
    cur = fam_profile_load(fam_id)
    # Shallow merge with one level deep for nested dicts
    for k, v in (data or {}).items():
        if isinstance(v, dict) and isinstance(cur.get(k), dict):
            cur[k].update(v)
        else:
            cur[k] = v
    fam_profile_save(fam_id, cur)
    return jsonify(cur)


@app.route("/familiars/<fam_id>/profile/profile.png")
def get_familiar_profile_image(fam_id):
    """Serve the familiar's profile picture."""
    if not fam_id:
        return ("Unknown familiar", 400)
    
    pdir = FAMILIARS_DIR / fam_id / "profile"
    if pdir.exists():
        target = pdir / "profile.png"
        if target.exists():
            return send_from_directory(str(pdir), "profile.png")
    
    # Fallback to default avatar if no profile pic
    return send_from_directory(str(STATIC_DIR), "avatar-default.svg")


@app.route("/familiars/<fam_id>/journey", methods=["GET"]) 
def get_familiar_journey(fam_id):
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    away, until = journey_is_away(fam_id)
    return jsonify({"away": away, "until": until})


@app.route("/familiars/<fam_id>/layout", methods=["GET"])
def get_familiar_layout(fam_id):
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({})
    return jsonify(fam_layout_load(fam_id))


@app.route("/familiars/<fam_id>/catalog", methods=["GET"])
def get_avatar_catalog_route(fam_id):
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    # Reload from disk to ensure fresh list for dev tools
    return jsonify(load_avatar_catalog(fam_id))


@app.route("/familiars/<fam_id>/avatars", methods=["GET"])
def get_all_avatars(fam_id):
    """Return a flat list of all avatar image paths relative to avatar/ folder."""
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    
    avatar_dir = FAMILIARS_DIR / fam_id / "avatar"
    if not avatar_dir.exists():
        return jsonify({"avatars": []})
    
    avatars = []
    for img in avatar_dir.rglob("*.png"):
        # Get relative path from avatar/ folder
        rel = img.relative_to(avatar_dir).as_posix()
        # Skip activity images
        if rel.startswith("activities/"):
            continue
        avatars.append(rel)
    
    avatars.sort()
    return jsonify({"avatars": avatars})


@app.route("/familiars/<fam_id>/avatar-layout/<path:avatar_path>", methods=["GET"])
def get_avatar_layout_for_path(fam_id, avatar_path):
    """Get resolved layout for a specific avatar path.
    
    Checks outfit-specific layout.json, then global, and includes location override if bg param provided.
    When committee=1 or mode=committee is set, committee layouts override normal layouts.
    Returns { scale, x, y, mirror, transform_origin } with resolved values.
    """
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    
    fam_dir = FAMILIARS_DIR / fam_id
    parts = avatar_path.split("/")
    avatar_filename = parts[-1]
    
    # Default layout
    layout = {
        "scale": 1.0,
        "x": "0px",
        "y": "0px",
        "mirror": False,
        "transform_origin": "bottom center"
    }
    
    committee_mode = request.args.get("committee", "").lower() in ("1", "true", "yes") or request.args.get("mode", "") == "committee"

    def apply_layout_file(layout_data: dict):
        # Apply root defaults
        for key in ["scale", "x", "y", "mirror", "transform_origin"]:
            if key in layout_data:
                layout[key] = layout_data[key]
        # Apply overrides
        if "overrides" in layout_data:
            if avatar_path in layout_data["overrides"]:
                for key, val in layout_data["overrides"][avatar_path].items():
                    layout[key] = val
            elif avatar_filename in layout_data["overrides"]:
                for key, val in layout_data["overrides"][avatar_filename].items():
                    layout[key] = val

    def apply_location_layout(layout_data: dict, background_key: str):
        if background_key in layout_data:
            bg_overrides = layout_data[background_key]
            if avatar_filename in bg_overrides:
                for key, val in bg_overrides[avatar_filename].items():
                    layout[key] = val
            elif "default" in bg_overrides:
                for key, val in bg_overrides["default"].items():
                    layout[key] = val

    # 1. Load global avatar/layout.json
    global_layout_path = fam_dir / "avatar" / "layout.json"
    apply_layout_file(read_json(global_layout_path, {}))
    
    # 2. Load outfit-specific layout.json if exists
    if len(parts) > 1:
        # Build path properly using Path joining (works on Windows and Unix)
        outfit_dir = fam_dir / "avatar"
        for p in parts[:-1]:
            outfit_dir = outfit_dir / p
        outfit_layout_path = outfit_dir / "layout.json"
        apply_layout_file(read_json(outfit_layout_path, {}))
    
    # 3. Check location-specific overrides if background provided
    background = request.args.get("bg", "")
    if background:
        loc_layout_path = fam_dir / "locations" / "layout.json"
        loc_layout = read_json(loc_layout_path, {})
        apply_location_layout(loc_layout, background)

    # 4. Committee overrides (if requested)
    if committee_mode:
        committee_global_path = fam_dir / "avatar" / "committee_layout.json"
        apply_layout_file(read_json(committee_global_path, {}))

        if len(parts) > 1:
            outfit_dir = fam_dir / "avatar"
            for p in parts[:-1]:
                outfit_dir = outfit_dir / p
            committee_outfit_path = outfit_dir / "committee_layout.json"
            apply_layout_file(read_json(committee_outfit_path, {}))

        if background:
            committee_loc_path = fam_dir / "locations" / "committee_layout.json"
            committee_loc = read_json(committee_loc_path, {})
            apply_location_layout(committee_loc, background)
    
    return jsonify(layout)


@app.route("/familiars/<fam_id>/locations", methods=["GET"])
def get_all_locations(fam_id):
    """Return a flat list of all location image paths relative to locations/ folder."""
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    
    loc_dir = FAMILIARS_DIR / fam_id / "locations"
    if not loc_dir.exists():
        return jsonify({"locations": []})
    
    locations = []
    for img in loc_dir.rglob("*.png"):
        # Get relative path from locations/ folder
        rel = img.relative_to(loc_dir).as_posix()
        # Skip layout.json and other non-image files (already filtered by *.png)
        locations.append(rel)
    
    locations.sort()
    return jsonify({"locations": locations})


@app.route("/familiars/<fam_id>/avatar-layout", methods=["POST"])
def save_avatar_layout(fam_id):
    """Save avatar layout configuration based on paired scopes.
    
    Outfit Scope:
    - current: Save to current outfit's layout.json
    - all: Save to global avatar/layout.json
    
    Location Scope:
    - current: Save to locations/layout.json for specific background
    - all: Save to avatar layouts (depends on outfit scope)
    """
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    
    data = request.get_json(force=True)
    avatar_path = data.get("avatar_path", "")  # e.g. "nsfw/bikini/warm.png"
    layout = data.get("layout", {})
    outfit_scope = data.get("outfit_scope", "current")  # 'current' or 'all'
    location_scope = data.get("location_scope", "all")  # 'current' or 'all'
    layout_mode = data.get("layout_mode", "solo")  # 'solo' or 'committee'
    background = data.get("background", "")  # e.g. "beach.png"
    
    if not avatar_path:
        return jsonify({"error": "No avatar_path provided"}), 400
    
    fam_dir = FAMILIARS_DIR / fam_id
    parts = avatar_path.split("/")
    avatar_filename = parts[-1]  # "warm.png"
    
    try:
        saved_to = []
        layout_filename = "committee_layout.json" if layout_mode == "committee" else "layout.json"
        
        # Location scope: current location
        if location_scope == "current":
            if not background:
                return jsonify({"error": "No background specified for 'This location only'"}), 400
            
            # Save to locations/layout.json (or committee_layout.json)
            loc_layout_path = fam_dir / "locations" / layout_filename
            loc_layout = read_json(loc_layout_path, {})
            
            if background not in loc_layout:
                loc_layout[background] = {}
            
            # Use just filename for avatar key
            loc_layout[background][avatar_filename] = layout
            atomic_write_json(loc_layout_path, loc_layout)
            saved_to.append(f"locations/{layout_filename}[{background}]")
        
        # Location scope: all locations - save to avatar layouts
        else:
            # Outfit scope: current outfit only
            if outfit_scope == "current":
                if len(parts) > 1:
                    # Build path properly using Path joining (works on Windows and Unix)
                    outfit_dir = fam_dir / "avatar"
                    for p in parts[:-1]:
                        outfit_dir = outfit_dir / p
                else:
                    outfit_dir = fam_dir / "avatar"
                
                outfit_layout_path = outfit_dir / layout_filename
                outfit_layout = read_json(outfit_layout_path, {"overrides": {}})
                
                if "overrides" not in outfit_layout:
                    outfit_layout["overrides"] = {}
                
                outfit_layout["overrides"][avatar_filename] = layout
                atomic_write_json(outfit_layout_path, outfit_layout)
                saved_to.append(f"avatar/{'/'.join(parts[:-1])}/{layout_filename}" if len(parts) > 1 else f"avatar/{layout_filename}")
            
            # Outfit scope: all outfits - save to every outfit folder with same filename
            else:
                avatar_dir = fam_dir / "avatar"
                
                # Find all outfit folders that contain a file with the same name
                # and save the layout to each folder's layout.json
                for img_path in avatar_dir.rglob(avatar_filename):
                    outfit_folder = img_path.parent
                    outfit_layout_path = outfit_folder / layout_filename
                    outfit_layout = read_json(outfit_layout_path, {"overrides": {}})
                    
                    if "overrides" not in outfit_layout:
                        outfit_layout["overrides"] = {}
                    
                    outfit_layout["overrides"][avatar_filename] = layout
                    atomic_write_json(outfit_layout_path, outfit_layout)
                    
                    # Get relative path for logging
                    try:
                        rel_path = outfit_folder.relative_to(avatar_dir).as_posix()
                        saved_to.append(f"avatar/{rel_path}/{layout_filename}" if rel_path != "." else f"avatar/{layout_filename}")
                    except ValueError:
                        saved_to.append(str(outfit_layout_path))
        
        return jsonify({"status": "saved", "saved_to": saved_to})
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/presets/layouts", methods=["GET", "POST"])
def presets_layouts():
    if request.method == "GET":
        PRESETS_DIR.mkdir(parents=True, exist_ok=True)
        presets = []
        for path in sorted(PRESETS_DIR.glob("*.json")):
            presets.append(path.stem)
        return jsonify({"presets": presets})

    data = request.get_json(force=True, silent=True) or {}
    name = sanitize_preset_name(data.get("name", ""))
    layout = data.get("layout", {})
    if not name:
        return jsonify({"error": "Invalid preset name"}), 400
    if not isinstance(layout, dict):
        return jsonify({"error": "Invalid layout"}), 400

    PRESETS_DIR.mkdir(parents=True, exist_ok=True)
    path = PRESETS_DIR / f"{name}.json"
    payload = {
        "name": name,
        "layout": layout,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }
    atomic_write_json(path, payload)
    return jsonify({"status": "saved", "name": name})


@app.route("/presets/layouts/<preset_name>", methods=["GET"])
def presets_layouts_get(preset_name):
    name = sanitize_preset_name(preset_name)
    if not name:
        return jsonify({"error": "Invalid preset name"}), 400
    path = PRESETS_DIR / f"{name}.json"
    if not path.exists():
        return jsonify({"error": "Preset not found"}), 404
    return jsonify(read_json(path, {}))


@app.route("/chat", methods=["POST"])
def chat():
    """Append the user's message to conversation.json and return a turn id.

    The external CLI agent is expected to watch the JSON and append a
    matching `role: cli` reply with `in_reply_to` set to this turn id.
    """
    data = request.get_json(force=True, silent=True) or {}
    fam_id = data.get("familiar")
    message = (data.get("message") or "").strip()

    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    if not message:
        return jsonify({"error": "Missing message"}), 400

    # Pull defaults from settings for prompt merge behavior
    try:
        s = settings_load()
        include_memory = bool(s.get("include_memory", False))
        immersive = bool(s.get("immersive", False))
    except Exception:
        include_memory = False
        immersive = False

    extras = {
        "include_memory": include_memory,
        "immersive": immersive,
    }
    committee = data.get("committee")
    if isinstance(committee, dict):
        guests = committee.get("guests")
        if isinstance(guests, list):
            clean = [str(g).strip() for g in guests if str(g).strip()]
            # Host should not be in guests
            clean = [g for g in clean if g != fam_id]
            if clean:
                extras["committee"] = {"guests": clean}
    kind = data.get("kind")
    if isinstance(kind, str) and kind.strip():
        extras["kind"] = kind.strip()
    invite_fam = data.get("invite_familiar")
    if isinstance(invite_fam, str) and invite_fam.strip():
        extras["invite_familiar"] = invite_fam.strip()
    turn_id = conv_append_user_with(fam_id, text=message, extras=extras)
    return jsonify({"turn_id": turn_id})


@app.route("/greet", methods=["POST"])
def greet():
    """Start a greeting turn for the selected familiar.

    Returns a { turn_id } so the UI can poll /cli/status for the reply.
    """
    data = request.get_json(force=True, silent=True) or {}
    fam_id = data.get("familiar")
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    include_memory = bool(data.get("include_memory", False))
    immersive = bool(data.get("immersive", False))
    activity = (data.get("activity") or "").strip()
    extras = {
        "kind": "greet",
        "include_memory": include_memory,
        "immersive": immersive,
        **({"activity": activity} if activity else {}),
    }
    turn_id = conv_append_user_with(fam_id, text="", extras=extras)
    return jsonify({"turn_id": turn_id})


@app.route("/cli/status", methods=["GET"])
def cli_status():
    """Poll for a CLI reply to a specific turn.

    Returns { status: pending } if no reply yet, otherwise
    { status: responded, reply, emotion } where `emotion` is parsed
    from the last-line tag "<emotion: X>" when present.
    """
    fam_id = request.args.get("familiar")
    turn_id = request.args.get("turn_id")
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    if not turn_id:
        return jsonify({"error": "Missing turn_id"}), 400

    # Check if turn was cancelled
    doc = conv_load()
    for t in doc.get("turns", []):
        if t.get("id") == turn_id and t.get("status") == "cancelled":
            return jsonify({"status": "cancelled"})

    reply = conv_find_reply(fam_id, turn_id)
    if not reply:
        return jsonify({"status": "pending"})

    text = str(reply.get("text", "")).strip()
    # Determine if this turn is committee mode (based on user turn extras)
    committee_mode = False
    try:
        for t in doc.get("turns", []):
            if t.get("id") == turn_id:
                committee_mode = isinstance(t.get("committee"), dict)
                break
    except Exception:
        committee_mode = False

    m = STATE_TAG_RE.search(text)
    state_val = (m.group(1).strip().lower() if m else "calm")
    # Parse background tag
    bg_m = BACKGROUND_TAG_RE.search(text)
    bg_val = (bg_m.group(1).strip() if bg_m else None)
    # Extract prompt suggestions
    prompt_suggestions = [p.strip() for p in PROMPT_TAG_RE.findall(text) if p.strip()]

    # Strip tags from display text
    display = STATE_TAG_RE.sub("", text)
    display = BACKGROUND_TAG_RE.sub("", display)
    display = POSE_TAG_RE.sub("", display)
    display = PROMPT_TAG_RE.sub("", display).strip()

    # Return keys
    result = {
        "status": "responded",
        "reply": display,
        "emotion": state_val,
        "state": state_val,
    }
    if prompt_suggestions:
        result["prompts"] = prompt_suggestions
    if committee_mode:
        result["committee"] = True
        result["raw_reply"] = text

    # Parse pose tag (skip in committee mode to avoid mismatched avatar tags)
    if not committee_mode:
        pose_m = POSE_TAG_RE.search(text)
        if pose_m:
            p_val = pose_m.group(1).strip()
            # Guard: "kiss" requires max hearts (5.0)
            if "kiss" in p_val.lower():
                try:
                    st_path = FAMILIARS_DIR / fam_id / "state.json"
                    st = json.loads(st_path.read_text(encoding="utf-8")) if st_path.exists() else {}
                    if float(st.get("hearts", 0) or 0) < 5.0:
                        p_val = "blush"  # Downgrade
                except Exception:
                    pass
            result["pose"] = p_val

    # Determine if this message follows a greet (reset to default location)
    turns = doc.get("turns", [])
    # Find current turn index
    idx = next((i for i, t in enumerate(turns) if t.get("id") == turn_id), -1)
    
    is_first_reply = False
    if idx > 0:
         # Backward scan for the last CLI turn to check its context
         last_cli = None
         for i in range(idx - 1, -1, -1):
             if turns[i].get("role") == "cli":
                 last_cli = turns[i]
                 break
         
         if last_cli:
             # Check what the CLI was replying to
             parent_id = last_cli.get("in_reply_to")
             # Find that parent turn
             parent = next((t for t in turns if t.get("id") == parent_id), None)
             if parent and parent.get("kind") == "greet":
                 is_first_reply = True

    # Also check if THIS turn is a greet (so we don't overwrite the greet's own background)
    is_greet = (turns[idx].get("kind") == "greet") if idx >= 0 else False

    # Logic:
    # 1. If this IS a greet, do nothing (keep activity bg)
    # 2. If this is the FIRST reply after a greet, and no tag -> Default BG
    # 3. Otherwise (mid-convo), do nothing (persist current bg via UI state)
    
    if not is_greet and is_first_reply and not bg_val:
        try:
            meta_path = FAMILIARS_DIR / fam_id / "meta.json"
            if meta_path.exists():
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                default_loc = meta.get("default_background")
                # Use Christmas version in December if it exists
                if default_loc:
                    bg_val = get_christmas_location(fam_id, default_loc)
        except Exception:
            pass

    if bg_val:
        result["background"] = bg_val
    return jsonify(result)


@app.route("/cli/cancel", methods=["POST"])
def cli_cancel():
    """Cancel a pending CLI request.

    Marks the turn as cancelled and writes a cancel signal file
    that the watcher can detect to terminate the running process.
    """
    data = request.get_json(force=True, silent=True) or {}
    fam_id = data.get("familiar")
    turn_id = data.get("turn_id")
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 400
    if not turn_id:
        return jsonify({"error": "Missing turn_id"}), 400

    # Write cancel signal file for watcher to detect
    cancel_file = TEMP_DIR / f"cancel_{turn_id}.signal"
    try:
        cancel_file.parent.mkdir(parents=True, exist_ok=True)
        cancel_file.write_text(turn_id, encoding="utf-8")
    except Exception as e:
        return jsonify({"error": f"Failed to write cancel signal: {e}"}), 500

    # Mark the turn as cancelled in conversation.json
    try:
        doc = conv_load()
        for t in doc.get("turns", []):
            if t.get("id") == turn_id:
                t["status"] = "cancelled"
                break
        conv_save(doc)
    except Exception:
        pass

    return jsonify({"status": "cancelled", "turn_id": turn_id})


@app.route("/cli/memory/clear", methods=["POST"])
def cli_memory_clear():
    """Clear conversation history for a specific familiar.
    
    This is irreversible. It removes all turns associated with the given familiar
    from conversation.json.
    """
    data = request.get_json(force=True, silent=True) or {}
    fam_id = data.get("familiar")
    if not fam_id:
        return jsonify({"error": "Missing familiar id"}), 400
        
    try:
        doc = conv_load()
        original_count = len(doc.get("turns", []))
        # Keep turns that do NOT match this familiar
        doc["turns"] = [t for t in doc.get("turns", []) if t.get("familiar") != fam_id]
        conv_save(doc)
        
        # Write a signal file just in case watcher needs to know (optional)
        signal_file = TEMP_DIR / f"memory_clear_{fam_id}.signal"
        try:
            signal_file.write_text(now_iso(), encoding="utf-8")
        except Exception:
            pass
            
        return jsonify({
            "status": "cleared",
            "familiar": fam_id,
            "removed_turns": original_count - len(doc["turns"])
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---- Focus/Break cycle endpoints --------------------------------------------

@app.route("/cycle/status", methods=["GET"])
def get_cycle_status():
    """Return current focus/break cycle status."""
    return jsonify(focus_cycle_status())


@app.route("/cycle/start_focus", methods=["POST"])
def start_focus_cycle():
    data = request.get_json(force=True, silent=True) or {}
    length_ms = int(data.get("length_ms") or 0)
    minutes = data.get("minutes")
    if (not length_ms) and minutes is not None:
        try:
            length_ms = int(float(minutes) * 60_000)
        except Exception:
            length_ms = 0
    now = datetime.now(timezone.utc)
    ends = now + timedelta(milliseconds=max(0, length_ms))
    rec = {
        "mode": "focus",
        "started_at": now.isoformat(),
        "ends_at": ends.isoformat(),
        "length_ms": int(max(0, length_ms)),
        "familiar": (data.get("familiar") or None),
    }
    focus_cycle_save(rec)
    return jsonify(focus_cycle_status())


@app.route("/cycle/start_break", methods=["POST"])
def start_break_cycle():
    data = request.get_json(force=True, silent=True) or {}
    length_ms = int(data.get("length_ms") or 0)
    minutes = data.get("minutes")
    if (not length_ms) and minutes is not None:
        try:
            length_ms = int(float(minutes) * 60_000)
        except Exception:
            length_ms = 0
    now = datetime.now(timezone.utc)
    ends = now + timedelta(milliseconds=max(0, length_ms))
    rec = {
        "mode": "break",
        "started_at": now.isoformat(),
        "ends_at": ends.isoformat(),
        "length_ms": int(max(0, length_ms)),
        "familiar": (data.get("familiar") or None),
    }
    focus_cycle_save(rec)
    return jsonify(focus_cycle_status())


@app.route("/cycle/stop", methods=["POST"])
def stop_cycle():
    rec = {"mode": "idle", "started_at": None, "ends_at": None, "length_ms": 0, "familiar": None}
    focus_cycle_save(rec)
    return jsonify(focus_cycle_status())


@app.route("/cycle/start_long_break", methods=["POST"])
def start_long_break_cycle():
    data = request.get_json(force=True, silent=True) or {}
    length_ms = int(data.get("length_ms") or 0)
    minutes = data.get("minutes")
    if (not length_ms) and minutes is not None:
        try:
            length_ms = int(float(minutes) * 60_000)
        except Exception:
            length_ms = 0
    now = datetime.now(timezone.utc)
    ends = now + timedelta(milliseconds=max(0, length_ms))
    rec = {
        "mode": "long_break",
        "started_at": now.isoformat(),
        "ends_at": ends.isoformat(),
        "length_ms": int(max(0, length_ms)),
        "familiar": (data.get("familiar") or None),
    }
    focus_cycle_save(rec)
    return jsonify(focus_cycle_status())


@app.route("/cli/heartbeat", methods=["GET"])
def cli_heartbeat():
    active, last_seen = cli_active()
    return jsonify({"active": active, "last_seen": last_seen})


# ---- Settings endpoints ------------------------------------------------------

@app.route("/settings", methods=["GET"])
def get_settings():
    return jsonify(settings_load())


@app.route("/settings", methods=["POST"])
def post_settings():
    data = request.get_json(force=True, silent=True) or {}
    cur = settings_load()
    out = {
        "nsfw_enabled": bool(data.get("nsfw_enabled", cur.get("nsfw_enabled", True))),
        "dev_nsfw_override": bool(data.get("dev_nsfw_override", cur.get("dev_nsfw_override", False))),
        "dev_instant_journey_return": bool(data.get("dev_instant_journey_return", cur.get("dev_instant_journey_return", False))),
        "daily_nsfw_cap": int(data.get("daily_nsfw_cap", cur.get("daily_nsfw_cap", 0)) or 0),
        "quiet_hours": {
            "start": str(((data.get("quiet_hours") or {}).get("start") or (cur.get("quiet_hours") or {}).get("start") or "23:00")),
            "end": str(((data.get("quiet_hours") or {}).get("end") or (cur.get("quiet_hours") or {}).get("end") or "07:00")),
        },
        # New toggles for prompt behavior
        "include_memory": bool(data.get("include_memory", cur.get("include_memory", False))),
        "immersive": bool(data.get("immersive", cur.get("immersive", False))),
    }
    try:
        settings_save(out)
    except Exception:
        return jsonify({"error": "Failed to save settings"}), 500
    return jsonify(out)


# ---- Moments endpoints -------------------------------------------------------

@app.route("/moments/check", methods=["POST"])
def moments_check():
    """Disabled: NSFW cameos are breaks-only."""
    data = request.get_json(force=True, silent=True) or {}
    fam_id = str(data.get("familiar") or "").strip()
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"allow": False, "reason": "unknown_familiar"}), 400
    return jsonify({"allow": False, "reason": "breaks_only"})


@app.route("/moments/commit", methods=["POST"])
def moments_commit():
    """Log a moment or cameo usage and update diversity/cooldown counters.

    Expects: { familiar, pose, kind: 'focus'|'break' }
    """
    data = request.get_json(force=True, silent=True) or {}
    fam_id = str(data.get("familiar") or "").strip()
    kind = str(data.get("kind") or "").strip().lower()
    pose = str(data.get("pose") or "").strip()
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "unknown_familiar"}), 400
    if not pose:
        return jsonify({"error": "missing_pose"}), 400

    usage_mark_pose_used(fam_id, pose)
    if kind in ("focus", "thinking"):
        usage_inc_cameo_count(fam_id, 1)
        usage_set_pomo_index_at_last_cameo(fam_id, usage_get_pomo_blocks(fam_id))
    else:
        usage_inc_moment_count(fam_id, 1)
    return jsonify({"ok": True})


@app.route("/moments/start_break", methods=["POST"])
def moments_start_break():
    """Decide up to 2 short break NSFW 'moments' with caps and cooldowns.

    Expects: { familiar }
    Returns: { moments: [ { pose, duration_ms, suggested_offset_ms } ] }
    """
    data = request.get_json(force=True, silent=True) or {}
    fam_id = str(data.get("familiar") or "").strip()
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "unknown_familiar"}), 400
    
    # Check dev override first - bypasses all restrictions
    settings = settings_load()
    dev_override = bool(settings.get("dev_nsfw_override", False))
    
    if not dev_override:
        if not nsfw_allowed_now():
            return jsonify({"moments": []})
        away, _ = journey_is_away(fam_id)
        if away:
            return jsonify({"moments": []})

        # Daily cap & cooldown (skip in dev mode)
        if usage_get_moment_count(fam_id) >= 4:
            return jsonify({"moments": []})
        last_any = usage_get_last_nsfw_moment(fam_id)
        if last_any and (datetime.now() - last_any).total_seconds() < 45 * 60:
            return jsonify({"moments": []})

        state = fam_state_load(fam_id)
        hearts = float(state.get("hearts", 0) or 0)
        # Decide how many based on hearts
        num = 0
        if hearts >= 4.5:
            num = 1
            if random.random() < 0.40:
                num = 2
        elif hearts >= 4.0:
            if random.random() < 0.40:
                num = 1
                if random.random() < 0.25:
                    num = 2
        if num == 0:
            return jsonify({"moments": []})
    else:
        # Dev mode: always show 2 poses
        num = 2

    # Select poses with diversity guard
    moments = []
    # Prefer yoga/stretch tags for Yoruha; otherwise warm/supportive focus
    prefer = ["yoga","stretch","balance","calm","warm","supportive"]
    for i in range(num):
        pose = choose_pose(fam_id, categories=["nsfw"], prefer_tags=prefer)
        if not pose:
            break
        # Space them inside the break; simple stagger
        off = 30_000 * i  # 30s between if two
        moments.append({"pose": pose, "duration_ms": 2000, "suggested_offset_ms": off})
        usage_mark_pose_used(fam_id, pose)
    return jsonify({"moments": moments})


@app.route("/moments/react", methods=["POST"])
def moments_react():
    """Enqueue a model-generated shy aside for an NSFW batch.

    Expects: { familiar, break: 'short'|'long', batch: 'early'|'late', tags?: [str] }
    Returns: { turn_id }
    """
    data = request.get_json(force=True, silent=True) or {}
    fam_id = str(data.get("familiar") or "").strip()
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "unknown_familiar"}), 400
    bkind = str(data.get("break") or "short").strip().lower()
    batch = str(data.get("batch") or "early").strip().lower()
    tags = data.get("tags") if isinstance(data.get("tags"), list) else []
    extras = {
        "kind": "moment_reaction",
        "break_kind": bkind,
        "batch": batch,
        "pose_tags": tags,
    }
    turn_id = conv_append_user_with(fam_id, text="", extras=extras)
    return jsonify({"turn_id": turn_id})

@app.route("/moments/check_thinking", methods=["POST"])
def moments_check_thinking():
    """Disabled: NSFW cameos are breaks-only."""
    data = request.get_json(force=True, silent=True) or {}
    fam_id = str(data.get("familiar") or "").strip()
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"allow": False, "reason": "unknown_familiar"}), 400
    return jsonify({"allow": False, "reason": "breaks_only"})


# ---- Preferences endpoints ---------------------------------------------------

@app.route("/familiars/<string:fam_id>/preferences", methods=["GET"])
def get_familiar_preferences(fam_id: str):
    """Get the raw markdown content of the familiar's preferences.md file."""
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 404
        
    pref_path = FAMILIARS_DIR / fam_id / "docs" / "preferences.md"
    content = ""
    if pref_path.exists():
        content = pref_path.read_text(encoding="utf-8", errors="replace")
    
    return jsonify({"content": content})

@app.route("/familiars/<string:fam_id>/preferences", methods=["POST"])
def post_familiar_preferences(fam_id: str):
    """Update the familiar's preferences.md file."""
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 404
        
    data = request.get_json(force=True, silent=True) or {}
    content = str(data.get("content") or "")
    
    pref_path = FAMILIARS_DIR / fam_id / "docs" / "preferences.md"
    try:
        pref_path.write_text(content, encoding="utf-8")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/familiars/<string:fam_id>/memories", methods=["GET"])
def get_familiar_memories(fam_id: str):
    """Get the raw markdown content of the familiar's memories.md file."""
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 404
        
    mem_path = FAMILIARS_DIR / fam_id / "docs" / "memories.md"
    content = ""
    if mem_path.exists():
        content = mem_path.read_text(encoding="utf-8", errors="replace")
    
    return jsonify({"content": content})


@app.route("/familiars/<string:fam_id>/memories", methods=["POST"])
def post_familiar_memories(fam_id: str):
    """Update the familiar's memories.md file."""
    if not fam_id or not (FAMILIARS_DIR / fam_id).exists():
        return jsonify({"error": "Unknown familiar"}), 404
        
    data = request.get_json(force=True, silent=True) or {}
    content = str(data.get("content") or "")
    
    mem_path = FAMILIARS_DIR / fam_id / "docs" / "memories.md"
    try:
        mem_path.write_text(content, encoding="utf-8")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def reset_all_familiar_states():
    """Reset state.json for all familiars on boot (set to defaults from meta.json)."""
    from datetime import datetime
    is_december = datetime.now().month == 12
    
    # Map of locations that have Christmas versions
    christmas_versions = {
        "bedroom.png": "christmas/bedroom.png",
        "cabin_winter.png": "christmas/cabin_winter.png",
        "moonlit_study.png": "christmas/moonlit_study.png",
        "study.png": "christmas/study.png",
    }
    
    for fam_id in [d.name for d in FAMILIARS_DIR.iterdir() if d.is_dir()]:
        state_path = FAMILIARS_DIR / fam_id / "state.json"
        meta_path = FAMILIARS_DIR / fam_id / "meta.json"
        try:
            # Get default background from meta.json
            meta = read_json(meta_path, {})
            default_bg = meta.get("default_background", "")
            default_avatar = meta.get("default_avatar", "default.png")
            # Clean up default_avatar path if it has "avatar/" prefix
            if default_avatar.startswith("avatar/"):
                default_avatar = default_avatar.replace("avatar/", "", 1)
            
            # Use Christmas version if December and a Christmas version exists
            if is_december and default_bg in christmas_versions:
                christmas_bg = christmas_versions[default_bg]
                # Check if the Christmas version actually exists for this familiar
                christmas_path = FAMILIARS_DIR / fam_id / "locations" / christmas_bg
                if christmas_path.exists():
                    default_bg = christmas_bg
                    print(f"[ADUC] 🎄 Using Christmas location for {fam_id}: {default_bg}")
            
            default_state = {
                "avatar": default_avatar,
                "location": default_bg,
                "hearts": 5,
                "activity": ""
            }
            atomic_write_json(state_path, default_state)
            print(f"[ADUC] Reset state for: {fam_id} (bg: {default_bg})")
        except Exception as e:
            print(f"[ADUC] Failed to reset state for {fam_id}: {e}")


if __name__ == "__main__":
    # Reset all familiar states on boot
    reset_all_familiar_states()
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=True)
