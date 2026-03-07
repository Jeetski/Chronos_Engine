import io
import os
import sys
import yaml
import json
import re
import base64
import threading
import socket
import tempfile
import secrets
from datetime import datetime, timedelta
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote, quote, urlencode
from urllib import request as urlrequest, error as urlerror

import subprocess, shlex

# Paths
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# Ensure project root is importable so 'modules' can be imported
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
COMMANDS_DIR = os.path.abspath(os.path.join(ROOT_DIR, "commands"))
if COMMANDS_DIR not in sys.path:
    sys.path.insert(0, COMMANDS_DIR)
DASHBOARD_DIR = os.path.abspath(os.path.join(ROOT_DIR, "utilities", "dashboard"))

from modules.logger import Logger

from utilities.dashboard_matrix import (
    compute_matrix,
    get_metadata as matrix_metadata,
    parse_filters as parse_matrix_filters,
    parse_dimension_sequence as parse_matrix_dimensions,
    list_matrix_presets,
    load_matrix_preset,
    save_matrix_preset,
    delete_matrix_preset,
)
from modules.scheduler import schedule_path_for_date, status_current_path, build_block_key, get_flattened_schedule

# In-memory dashboard-scoped variables (exposed via /api/vars)
_DASH_VARS = {}
_LISTENER_PROC = None
_ADUC_PORT = 8080
_ADUC_LOG_PATH = os.path.join(tempfile.gettempdir(), "aduc_launch.log")
_ADUC_NO_BROWSER_FLAG = os.path.join(tempfile.gettempdir(), "ADUC", "no_browser.flag")
_ADUC_NO_BROWSER_FLAG_LOCAL = os.path.join(ROOT_DIR, "Agents Dress Up Committee", "temp", "no_browser.flag")
_LINK_SETTINGS_PATH = os.path.join(ROOT_DIR, "user", "Settings", "link_settings.yml")
_EDITOR_OPEN_REQUEST_PATH = os.path.join(ROOT_DIR, "Temp", "editor_open_request.json")


def _aduc_proxy_request(path: str, method: str = "GET", payload: dict | None = None, timeout: float = 8.0):
    """Proxy a request to the local ADUC server and return (status, body_dict)."""
    host = "127.0.0.1"
    url = f"http://{host}:{_ADUC_PORT}{path}"
    headers = {"Accept": "application/json"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urlrequest.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urlrequest.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                body = json.loads(raw) if raw.strip() else {}
            except Exception:
                body = {"ok": False, "error": raw}
            return int(getattr(resp, "status", 200) or 200), body
    except urlerror.HTTPError as e:
        raw = ""
        try:
            raw = e.read().decode("utf-8", errors="replace")
        except Exception:
            raw = str(e)
        try:
            body = json.loads(raw) if raw.strip() else {"ok": False, "error": str(e)}
        except Exception:
            body = {"ok": False, "error": raw or str(e)}
        return int(getattr(e, "code", 502) or 502), body
    except Exception as e:
        return 502, {"ok": False, "error": f"ADUC request failed: {e}"}

def _load_link_settings():
    data = {}
    try:
        if os.path.exists(_LINK_SETTINGS_PATH):
            with open(_LINK_SETTINGS_PATH, "r", encoding="utf-8") as f:
                loaded = yaml.safe_load(f) or {}
                if isinstance(loaded, dict):
                    data = loaded
    except Exception:
        data = {}
    changed = False
    if not data.get("link_id"):
        data["link_id"] = f"link-{secrets.token_hex(4)}"
        changed = True
    if not data.get("token"):
        data["token"] = secrets.token_urlsafe(24)
        changed = True
    if changed:
        try:
            os.makedirs(os.path.dirname(_LINK_SETTINGS_PATH), exist_ok=True)
            with open(_LINK_SETTINGS_PATH, "w", encoding="utf-8") as f:
                yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
        except Exception:
            pass
    return data

def _link_auth_ok(headers) -> bool:
    token = _load_link_settings().get("token")
    if not token:
        return False
    auth = (headers.get("Authorization") or "").strip()
    return auth == f"Bearer {token}"

def _editor_open_request_write(path_value: str, line_value=None) -> bool:
    try:
        rel = str(path_value or "").strip().replace("\\", "/")
        if not rel:
            return False
        abs_target = os.path.abspath(os.path.join(ROOT_DIR, rel))
        if not abs_target.startswith(ROOT_DIR):
            return False
        payload = {"path": os.path.relpath(abs_target, ROOT_DIR).replace("\\", "/")}
        if line_value is not None:
            try:
                payload["line"] = int(line_value)
            except Exception:
                pass
        os.makedirs(os.path.dirname(_EDITOR_OPEN_REQUEST_PATH), exist_ok=True)
        with open(_EDITOR_OPEN_REQUEST_PATH, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False)
        return True
    except Exception:
        return False

def _editor_open_request_pop():
    try:
        if not os.path.exists(_EDITOR_OPEN_REQUEST_PATH):
            return None
        with open(_EDITOR_OPEN_REQUEST_PATH, "r", encoding="utf-8") as fh:
            payload = json.load(fh) or {}
        try:
            os.remove(_EDITOR_OPEN_REQUEST_PATH)
        except Exception:
            pass
        if not isinstance(payload, dict):
            return None
        path_value = str(payload.get("path") or "").strip().replace("\\", "/")
        if not path_value:
            return None
        abs_target = os.path.abspath(os.path.join(ROOT_DIR, path_value))
        if not abs_target.startswith(ROOT_DIR):
            return None
        out = {"path": os.path.relpath(abs_target, ROOT_DIR).replace("\\", "/")}
        if payload.get("line") is not None:
            try:
                out["line"] = int(payload.get("line"))
            except Exception:
                pass
        return out
    except Exception:
        return None

def _vars_all():
    try:
        from modules import variables as _V
        try:
            m = _V.all_vars()
            if isinstance(m, dict):
                return m
        except Exception:
            pass
    except Exception:
        pass
    return dict(_DASH_VARS)

def _vars_set(k, v):
    try:
        from modules import variables as _V
        try:
            _V.set_var(str(k), v)
        except Exception:
            pass
    except Exception:
        pass
    _DASH_VARS[str(k)] = str(v)

def _vars_unset(k):
    try:
        from modules import variables as _V
        try:
            _V.unset_var(str(k))
        except Exception:
            pass
    except Exception:
        pass
    _DASH_VARS.pop(str(k), None)

def _expand_text(text):
    try:
        from modules import variables as _V
        try:
            return _V.expand_token(text)
        except Exception:
            return str(text)
    except Exception:
        # Simple fallback: replace @{var} and @var using _DASH_VARS
        import re
        m = _vars_all()
        def braced(mo):
            return str(m.get(mo.group(1), ''))
        def simple(mo):
            return str(m.get(mo.group(1), ''))
        s = str(text).replace('@@', '\x00AT\x00')
        s = re.sub(r"@\{([A-Za-z_][A-Za-z0-9_]*)\}", braced, s)
        s = re.sub(r"(?<![A-Za-z0-9_])@([A-Za-z_][A-Za-z0-9_]*)", simple, s)
        return s.replace('\x00AT\x00', '@')

def _vars_seed_defaults():
    try:
        # Seed nickname from profile.yml
        prof_path = os.path.join(ROOT_DIR, 'user', 'Profile', 'profile.yml')
        if os.path.exists(prof_path):
            try:
                with open(prof_path, 'r', encoding='utf-8') as f:
                    y = yaml.safe_load(f) or {}
                nick = None
                if isinstance(y, dict):
                    nick = y.get('nickname') or y.get('nick')
                    # console-nested nickname fallback if present
                    if not nick and isinstance(y.get('console'), dict):
                        nick = y.get('console', {}).get('nickname')
                if nick:
                    _vars_set('nickname', nick)
            except Exception:
                pass
        # Seed from optional user/Settings/vars.yml
        vpath = os.path.join(ROOT_DIR, 'user', 'Settings', 'vars.yml')
        if os.path.exists(vpath):
            try:
                with open(vpath, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f) or {}
                if isinstance(data, dict):
                    for k, v in data.items():
                        try:
                            if k is None: continue
                            _vars_set(str(k), v)
                        except Exception:
                            continue
            except Exception:
                pass
    except Exception:
        pass

# Seed vars at import time
try:
    _vars_seed_defaults()
except Exception:
    pass

def run_console_command(command_name, args_list, properties=None):
    """
    Invoke the Console command pipeline.
    Preferred: in-process import of modules.console.run_command.
    Fallback: subprocess execution of Console via Python.
    Returns (ok, stdout, stderr).
    """
    # Try in-process
    try:
        from modules import console as ConsoleModule# type: ignore
        old_out, old_err = sys.stdout, sys.stderr
        out_buf, err_buf = io.StringIO(), io.StringIO()
        sys.stdout, sys.stderr = out_buf, err_buf
        ok = True
        try:
            ConsoleModule.run_command(command_name, args_list, properties or {})
        except Exception as e:
            ok = False
            print(f"Error: {e}")
        finally:
            sys.stdout, sys.stderr = old_out, old_err
        return ok, out_buf.getvalue().strip(), err_buf.getvalue().strip()
    except Exception:
        # Fallback: subprocess
        import subprocess

        def quote(t: str) -> str:
            s = str(t)
            if any(c.isspace() for c in s) or any(c in s for c in ['"', "'", ':']):
                s = '"' + s.replace('"', '\\"') + '"'
            return s

        merged_args = list(args_list or [])
        props = properties or {}
        if isinstance(props, dict) and props:
            for k, v in props.items():
                if isinstance(v, list):
                    v_str = ", ".join(str(x) for x in v)
                elif isinstance(v, bool):
                    v_str = "true" if v else "false"
                else:
                    v_str = str(v)
                tok = f"{k}:{v_str}"
                if tok not in merged_args:
                    merged_args.append(tok)

        cmdline = ' '.join([command_name] + [quote(a) for a in merged_args])
        proc = subprocess.Popen([sys.executable, os.path.join(ROOT_DIR, 'modules', 'console.py'), cmdline],
                                cwd=ROOT_DIR, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        out, err = proc.communicate(timeout=30)
        ok = proc.returncode == 0
        return ok, (out or '').strip(), (err or '').strip()


def _list_system_databases():
    data_dir = os.path.join(ROOT_DIR, "user", "Data")
    registry_path = os.path.join(data_dir, "databases.yml")
    databases = []
    seen = set()

    def _safe_getsize(path):
        try:
            return os.path.getsize(path)
        except Exception:
            return None

    def _safe_getmtime(path):
        try:
            return datetime.fromtimestamp(os.path.getmtime(path)).isoformat()
        except Exception:
            return None

    if os.path.exists(registry_path):
        try:
            with open(registry_path, "r", encoding="utf-8") as fh:
                registry = yaml.safe_load(fh) or {}
            entries = registry.get("databases") if isinstance(registry, dict) else {}
            if isinstance(entries, dict):
                for key, entry in entries.items():
                    if not isinstance(entry, dict):
                        continue
                    db_type = str(entry.get("type") or "").strip().lower()
                    filename = str(entry.get("filename") or "").strip()
                    path = str(entry.get("path") or "").strip()
                    if db_type and db_type != "sqlite":
                        continue
                    if not db_type and filename and not filename.lower().endswith(".db"):
                        continue
                    if not db_type and not filename:
                        continue
                    if not path and filename:
                        path = os.path.join(data_dir, filename)
                    if db_type == "sqlite" and filename.lower().endswith(".db"):
                        name = os.path.splitext(filename)[0]
                    else:
                        name = str(entry.get("key") or key or filename).strip()
                    if not name:
                        continue
                    label = str(entry.get("name") or key or name).strip()
                    info = {
                        "name": name,
                        "label": label,
                        "key": str(entry.get("key") or key or "").strip() or None,
                        "type": db_type or None,
                        "filename": filename or None,
                    }
                    if path and os.path.exists(path):
                        info["size"] = _safe_getsize(path)
                        info["modified"] = _safe_getmtime(path)
                    else:
                        info["size"] = None
                        info["modified"] = None
                    databases.append(info)
                    if filename:
                        seen.add(filename)
                    seen.add(name)
        except Exception:
            pass

    if os.path.exists(data_dir):
        try:
            for filename in os.listdir(data_dir):
                if not filename.lower().endswith(".db"):
                    continue
                if filename in seen:
                    continue
                path = os.path.join(data_dir, filename)
                name = os.path.splitext(filename)[0]
                info = {
                    "name": name,
                    "label": name,
                    "key": None,
                    "type": "sqlite",
                    "filename": filename,
                    "size": _safe_getsize(path),
                    "modified": _safe_getmtime(path),
                }
                databases.append(info)
        except Exception:
            pass

    databases.sort(key=lambda item: (item.get("label") or item.get("name") or "").lower())
    return databases

STICKY_NOTE_COLORS = {
    "amber": "#f4d482",
    "citrus": "#ffd6a5",
    "mint": "#c7f9cc",
    "aqua": "#b4e9ff",
    "lilac": "#e3c6ff",
    "slate": "#dfe6f3",
}
DEFAULT_STICKY_NOTE_COLOR = "amber"

MEDIA_ROOT = os.path.join(ROOT_DIR, "user", "Media")
MP3_DIR = os.path.join(MEDIA_ROOT, "MP3")
PLAYLIST_DIR = os.path.join(MEDIA_ROOT, "Playlists")
DEFAULT_PLAYLIST_SLUG = "default"
CALENDAR_OVERLAY_PRESET_DIR = os.path.join(ROOT_DIR, "presets", "calendar_overlays")


def _normalize_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return False


def _ensure_calendar_overlay_dir():
    try:
        os.makedirs(CALENDAR_OVERLAY_PRESET_DIR, exist_ok=True)
    except Exception:
        pass


def _overlay_slug(name: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_", " ") else "_" for ch in str(name or ""))
    safe = "_".join(part for part in safe.strip().split())
    return safe.lower() or "overlay"


def _normalize_overlay_preset(raw):
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name") or raw.get("label") or "").strip()
    if not name:
        return None
    mode = str(raw.get("mode") or raw.get("key") or ("name" if raw.get("match") else "")).strip()
    value = str(raw.get("value") or raw.get("match") or "").strip()
    use_momentum = _normalize_bool(raw.get("use_momentum") or raw.get("momentum"))
    kind = str(raw.get("kind") or "").strip().lower() or "custom"
    if not mode or not value:
        return None
    return {
        "name": name,
        "mode": mode,
        "value": value,
        "use_momentum": use_momentum,
        "kind": kind,
    }


def _list_calendar_overlay_presets():
    _ensure_calendar_overlay_dir()
    presets = []
    try:
        for entry in os.listdir(CALENDAR_OVERLAY_PRESET_DIR):
            if not entry.lower().endswith((".yml", ".yaml")):
                continue
            path = os.path.join(CALENDAR_OVERLAY_PRESET_DIR, entry)
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    data = yaml.safe_load(fh) or {}
                normalized = _normalize_overlay_preset(data)
                if normalized:
                    presets.append(normalized)
            except Exception:
                continue
    except Exception:
        return []
    presets.sort(key=lambda item: (item.get("name") or "").lower())
    return presets


def _load_calendar_overlay_preset(name: str):
    if not name:
        return None
    _ensure_calendar_overlay_dir()
    slug = _overlay_slug(name)
    for ext in (".yml", ".yaml"):
        path = os.path.join(CALENDAR_OVERLAY_PRESET_DIR, f"{slug}{ext}")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or {}
            return _normalize_overlay_preset(data)
    return None


def _save_calendar_overlay_preset(preset: dict):
    if not isinstance(preset, dict):
        raise ValueError("Preset payload must be a map")
    normalized = _normalize_overlay_preset(preset)
    if not normalized:
        raise ValueError("Preset must include name, mode, and value")
    _ensure_calendar_overlay_dir()
    slug = _overlay_slug(normalized["name"])
    path = os.path.join(CALENDAR_OVERLAY_PRESET_DIR, f"{slug}.yml")
    payload = {
        "name": normalized["name"],
        "mode": normalized["mode"],
        "value": normalized["value"],
        "use_momentum": normalized.get("use_momentum", False),
        "kind": normalized.get("kind") or "custom",
    }
    with open(path, "w", encoding="utf-8") as fh:
        yaml.safe_dump(payload, fh, allow_unicode=True, sort_keys=False)
    return normalized


def _delete_calendar_overlay_preset(name: str) -> bool:
    if not name:
        return False
    slug = _overlay_slug(name)
    removed = False
    for ext in (".yml", ".yaml"):
        path = os.path.join(CALENDAR_OVERLAY_PRESET_DIR, f"{slug}{ext}")
        if os.path.exists(path):
            try:
                os.remove(path)
                removed = True
            except Exception:
                pass
    return removed


def _coerce_sticky_color(value):
    try:
        color = str(value or "").strip().lower()
    except Exception:
        color = ""
    if color in STICKY_NOTE_COLORS:
        return color
    return DEFAULT_STICKY_NOTE_COLOR


def _tags_from_value(value):
    if isinstance(value, list):
        tags = []
        for t in value:
            try:
                s = str(t or "").strip()
            except Exception:
                s = ""
            if s:
                tags.append(s)
        return tags
    return []


def _ensure_sticky_markers(data):
    tags = _tags_from_value(data.get("tags"))
    if not any(str(t).strip().lower() == "sticky" for t in tags):
        tags.append("sticky")
    data["tags"] = tags
    data["sticky"] = True
    return data


def _is_sticky_note(data):
    if not isinstance(data, dict):
        return False
    sticky_flag = data.get("sticky")
    if _normalize_bool(sticky_flag):
        return True
    tags = _tags_from_value(data.get("tags"))
    return any(str(t).strip().lower() == "sticky" for t in tags)


def _ensure_unique_item_name(item_type, base_name):
    try:
        from modules.item_manager import read_item_data
    except Exception:
        return base_name
    candidate = base_name
    counter = 2
    while read_item_data(item_type, candidate):
        candidate = f"{base_name} ({counter})"
        counter += 1
    return candidate


def _sticky_timestamp_for(name):
    try:
        from modules.item_manager import get_item_path
        fpath = get_item_path("note", name)
        if fpath and os.path.exists(fpath):
            return datetime.fromtimestamp(os.path.getmtime(fpath)).isoformat(timespec="seconds")
    except Exception:
        return None
    return None


def _build_sticky_payload(data):
    if not isinstance(data, dict):
        data = {}
    name = str(data.get("name") or "").strip()
    payload = {
        "name": name,
        "content": str(data.get("content") or ""),
        "color": data.get("color") or DEFAULT_STICKY_NOTE_COLOR,
        "pinned": _normalize_bool(data.get("pinned")),
        "category": data.get("category"),
        "priority": data.get("priority"),
        "tags": _tags_from_value(data.get("tags")),
    }
    payload["updated"] = _sticky_timestamp_for(name)
    return payload


def _list_sticky_notes():
    try:
        from modules.item_manager import list_all_items, read_item_data
    except Exception:
        return []
    rows = list_all_items("note") or []
    results = []
    seen = set()
    for row in rows:
        name = str((row or {}).get("name") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        try:
            data = read_item_data("note", name) or {}
        except Exception:
            data = {}
        if not _is_sticky_note(data):
            continue
        data.setdefault("name", name)
        results.append(_build_sticky_payload(data))
    results.sort(key=lambda item: (0 if item.get("pinned") else 1, (item.get("name") or "").lower()))
    return results


def _generate_sticky_name():
    return f"Sticky {datetime.now().strftime('%Y-%m-%d %H-%M-%S')}"


def _normalize_track_path(path):
    try:
        s = str(path or "").strip()
    except Exception:
        s = ""
    s = s.replace("\\", "/")
    if s.startswith("./"):
        s = s[2:]
    return s


def _read_track_metadata(mp3_path):
    base = os.path.splitext(mp3_path)[0]
    candidates = [
        base + ".yml",
        base + ".yaml",
        os.path.join(os.path.dirname(mp3_path), "metadata.yml"),
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            try:
                with open(candidate, "r", encoding="utf-8") as fh:
                    data = yaml.safe_load(fh) or {}
                if isinstance(data, dict):
                    return data
            except Exception:
                continue
    return {}


def _ensure_media_dirs():
    try:
        os.makedirs(MP3_DIR, exist_ok=True)
        os.makedirs(PLAYLIST_DIR, exist_ok=True)
    except Exception:
        pass


def _sanitize_media_filename(name):
    base = os.path.basename(str(name or "track"))
    safe = []
    for ch in base:
        if ch.isalnum() or ch in (" ", "-", "_", "."):
            safe.append(ch)
        else:
            safe.append("_")
    candidate = "".join(safe).strip() or "track.mp3"
    if not candidate.lower().endswith(".mp3"):
        candidate = candidate + ".mp3"
    return candidate


def _playlist_slug(name, existing=None):
    base = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(name or "playlist"))
    base = base.strip("-") or "playlist"
    base = base[:60]
    cand = base
    counter = 2
    existing = existing or set()
    while cand in existing:
        cand = f"{base}-{counter}"
        counter += 1
    return cand


def _playlist_path(slug):
    safe = "".join(ch for ch in str(slug or DEFAULT_PLAYLIST_SLUG) if ch.isalnum() or ch in ("-", "_"))
    if not safe:
        safe = DEFAULT_PLAYLIST_SLUG
    fname = f"{safe}.yml"
    return os.path.abspath(os.path.join(PLAYLIST_DIR, fname))


def _read_playlist(slug):
    _ensure_media_dirs()
    path = _playlist_path(slug)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        if not isinstance(data, dict):
            data = {}
        data.setdefault("name", slug)
        data.setdefault("tracks", [])
        return data
    except Exception:
        return None


def _write_playlist(slug, data):
    _ensure_media_dirs()
    path = _playlist_path(slug)
    safe_data = data or {}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        yaml.safe_dump(safe_data, fh, allow_unicode=True, sort_keys=False)


def _list_mp3_files():
    _ensure_media_dirs()
    files = []
    mp3_root = os.path.abspath(MP3_DIR)
    for root, _, filenames in os.walk(mp3_root):
        for filename in filenames:
            if not filename.lower().endswith(".mp3"):
                continue
            full = os.path.join(root, filename)
            if not os.path.isfile(full):
                continue
            rel_path = os.path.relpath(full, mp3_root).replace("\\", "/")
            safe_rel = _normalize_track_path(rel_path)
            info = {
                "id": safe_rel,
                "file": safe_rel,
                "title": os.path.splitext(filename)[0],
                "artist": None,
                "album": None,
                "length": None,
                "size": os.path.getsize(full),
                "mtime": datetime.fromtimestamp(os.path.getmtime(full)).isoformat(timespec="seconds"),
                "url": f"/media/mp3/{quote(safe_rel, safe='/')}",
            }
            meta = _read_id3_metadata(full)
            for key, value in meta.items():
                if value:
                    info[key] = value
            extra = _read_track_metadata(full)
            if isinstance(extra, dict):
                info.update(extra)
            files.append(info)
    files.sort(key=lambda row: (row.get("title") or row.get("file") or "").lower())
    return files


def _read_id3_metadata(path):
    meta = {}
    try:
        from mutagen import File as MutagenFile  # type: ignore

        audio = MutagenFile(path)
        if audio is None:
            return meta
        if hasattr(audio, "info") and getattr(audio.info, "length", None):
            meta["length"] = int(audio.info.length)
        tags = getattr(audio, "tags", {}) or {}
        title = _pick_tag(tags, ["TIT2", "title"])
        artist = _pick_tag(tags, ["TPE1", "artist"])
        album = _pick_tag(tags, ["TALB", "album"])
        if title:
            meta["title"] = title
        if artist:
            meta["artist"] = artist
        if album:
            meta["album"] = album
    except Exception:
        pass
    return meta


def _pick_tag(tags, keys):
    try:
        for key in keys:
            if key in tags:
                value = tags[key]
                if isinstance(value, (list, tuple)):
                    if value:
                        return str(value[0])
                else:
                    return str(value)
    except Exception:
        return None
    return None


def _ensure_default_playlist(library=None):
    _ensure_media_dirs()
    lib = library if library is not None else _list_mp3_files()
    if not lib:
        return
    default_path = _playlist_path(DEFAULT_PLAYLIST_SLUG)
    if os.path.exists(default_path):
        return
    tracks = [{"file": track["file"]} for track in lib]
    data = {
        "name": "All Tracks",
        "description": "Auto playlist of every MP3 in user/Media/MP3.",
        "tracks": tracks,
    }
    _write_playlist(DEFAULT_PLAYLIST_SLUG, data)


def _list_playlists():
    _ensure_media_dirs()
    results = []
    try:
        entries = sorted(os.listdir(PLAYLIST_DIR))
    except FileNotFoundError:
        entries = []
    seen = set()
    for entry in entries:
        if not entry.lower().endswith((".yml", ".yaml")):
            continue
        slug = os.path.splitext(entry)[0]
        seen.add(slug)
        data = _read_playlist(slug) or {}
        results.append({
            "slug": slug,
            "name": data.get("name") or slug,
            "track_count": len(data.get("tracks") or []),
            "description": data.get("description"),
        })
    if not results:
        _ensure_default_playlist()
        return _list_playlists()
    return results


def _serialize_playlist(slug, library=None):
    playlist = _read_playlist(slug)
    if not playlist:
        return None
    lib = library if library is not None else _list_mp3_files()
    lib_map = {track["file"]: track for track in lib}
    resolved = []
    for entry in playlist.get("tracks") or []:
        file_name = None
        if isinstance(entry, dict):
            file_name = entry.get("file")
        elif isinstance(entry, str):
            file_name = entry
            entry = {"file": file_name}
        file_name = _normalize_track_path(file_name)
        if not file_name:
            continue
        merged = {"file": file_name}
        lib_meta = lib_map.get(file_name)
        if lib_meta:
            merged.update(lib_meta)
        merged.update({k: v for k, v in entry.items() if k not in {"file", "id", "url"}})
        resolved.append(merged)
    return {
        "slug": slug,
        "name": playlist.get("name") or slug,
        "description": playlist.get("description"),
        "tracks": resolved,
        "raw": playlist,
    }


def _remove_track_from_playlists(file_name):
    updated = False
    target = _normalize_track_path(file_name)
    playlists = _list_playlists()
    for meta in playlists:
        slug = meta["slug"]
        data = _read_playlist(slug)
        if not data:
            continue
        tracks = data.get("tracks") or []
        new_tracks = []
        for entry in tracks:
            entry_file = _normalize_track_path(entry.get("file"))
            if entry_file and entry_file == target:
                continue
            new_tracks.append(entry)
        if len(new_tracks) != len(tracks):
            data["tracks"] = new_tracks
            _write_playlist(slug, data)
            updated = True
    return updated


class DashboardHandler(SimpleHTTPRequestHandler):
    server_version = "ChronosDashboardServer/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DASHBOARD_DIR, **kwargs)

    def _set_cors(self):
        # Allow same-origin and file:// usage; relax for localhost development
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        sys.stderr.write(f"DEBUG: GET request path: {parsed.path}\n") # DEBUG
        sys.stderr.flush()

        if parsed.path == "/api/registry":
            try:
                qs = parse_qs(parsed.query or "")
                name = (qs.get("name") or [""])[0].strip().lower()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing name"}); return
                
                if name in ("wizards", "themes", "widgets", "views", "panels", "popups", "gadgets"):
                    # Dynamic build
                    from utilities import registry_builder
                    data = {}
                    if name == "wizards":
                        data = registry_builder.build_wizards_registry()
                    elif name == "themes":
                        data = registry_builder.build_themes_registry()
                    elif name == "widgets":
                        data = registry_builder.build_widgets_registry()
                    elif name == "views":
                        data = registry_builder.build_views_registry()
                    elif name == "panels":
                        data = registry_builder.build_panels_registry()
                    elif name == "popups":
                        data = registry_builder.build_popups_registry()
                    elif name == "gadgets":
                        data = registry_builder.build_gadgets_registry()
                    self._write_json(200, {"ok": True, "registry": data})
                    return

                if name not in ("command", "item", "property"):
                    self._write_json(400, {"ok": False, "error": "Invalid registry name"}); return

                reg_dir = os.path.join(ROOT_DIR, 'registry')
                fpath = os.path.join(reg_dir, f"{name}_registry.json")
                
                if not os.path.exists(fpath):
                    self._write_json(200, {"ok": True, "registry": {}}); return

                with open(fpath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                self._write_json(200, {"ok": True, "registry": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Registry error: {e}"})
            return

        sys.stderr.write(f"DEBUG: Checking path for /api/profile: {parsed.path}\n") # TEMP DEBUG
        sys.stderr.flush()
        # Lazy import ItemManager helpers when API endpoints are hit
        def im():
            from modules.item_manager import list_all_items, read_item_data, write_item_data, delete_item, get_item_path
            return list_all_items, read_item_data, write_item_data, delete_item, get_item_path
        if parsed.path == "/health":
            payload = {"ok": True, "service": "chronos-dashboard"}
            data = yaml.safe_dump(payload, allow_unicode=True)
            self.send_response(200)
            self._set_cors()
            self.send_header("Content-Type", "text/yaml; charset=utf-8")
            self.send_header("Content-Length", str(len(data.encode("utf-8"))))
            self.end_headers()
            self.wfile.write(data.encode("utf-8"))
            return
        if parsed.path.startswith("/media/mp3/"):
            try:
                _ensure_media_dirs()
                rel = parsed.path[len("/media/mp3/"):]
                rel = unquote(rel)
                rel = rel.strip("/\\")
                target = os.path.abspath(os.path.join(MP3_DIR, rel))
                mp3_root = os.path.abspath(MP3_DIR)
                if not target.startswith(mp3_root):
                    self.send_response(403)
                    self._set_cors()
                    self.end_headers()
                    return
                if not os.path.exists(target):
                    self.send_response(404)
                    self._set_cors()
                    self.end_headers()
                    return
                with open(target, "rb") as fh:
                    data = fh.read()
                self.send_response(200)
                self._set_cors()
                self.send_header("Content-Type", "audio/mpeg")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                self.send_response(500)
                self._set_cors()
                self.end_headers()
            return
        if parsed.path == "/api/profile":
            # Return profile as JSON map (nickname/theme/etc.)
            try:
                prof_path = os.path.join(ROOT_DIR, 'user', 'Profile', 'profile.yml')
                data = {}
                if os.path.exists(prof_path):
                    with open(prof_path, 'r', encoding='utf-8') as f:
                        y = yaml.safe_load(f) or {}
                        if isinstance(y, dict):
                            data = y
                self._write_json(200, {"ok": True, "profile": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read profile: {e}"})
            return
        if parsed.path == "/api/nia/profile/avatar":
            try:
                p = os.path.join(ROOT_DIR, "Agents Dress Up Committee", "familiars", "nia", "profile", "profile.png")
                if os.path.exists(p):
                    with open(p, "rb") as f:
                        blob = f.read()
                    self.send_response(200)
                    self._set_cors()
                    self.send_header("Content-Type", "image/png")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("Content-Length", str(len(blob)))
                    self.end_headers()
                    self.wfile.write(blob)
                else:
                    self._write_json(404, {"ok": False, "error": "Nia profile image not found"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read Nia profile image: {e}"})
            return
        if parsed.path == "/api/media/mp3":
            try:
                tracks = _list_mp3_files()
                self._write_json(200, {"ok": True, "files": tracks})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to list MP3 files: {e}"})
            return
        if parsed.path == "/api/media/playlists":
            try:
                qs = parse_qs(parsed.query or "")
                slug = (qs.get("name") or qs.get("slug") or [""])[0].strip()
                library = _list_mp3_files()
                if slug:
                    playlist = _serialize_playlist(slug, library)
                    if not playlist:
                        self._write_json(404, {"ok": False, "error": "Playlist not found"})
                    else:
                        payload = {"ok": True, "playlist": playlist}
                        self._write_json(200, payload)
                else:
                    plist = _list_playlists()
                    self._write_json(200, {"ok": True, "playlists": plist})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read playlists: {e}"})
            return
        if parsed.path == "/api/preferences":
            try:
                pref_path = os.path.join(ROOT_DIR, 'user', 'Profile', 'preferences_settings.yml')
                data = {}
                if os.path.exists(pref_path):
                    with open(pref_path, 'r', encoding='utf-8') as f:
                        data = yaml.safe_load(f) or {}
                self._write_json(200, {"ok": True, "preferences": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read preferences: {e}"})
            return
        if parsed.path == "/api/link/settings":
            data = _load_link_settings()
            self._write_json(200, {"ok": True, "settings": data})
            return
        if parsed.path == "/api/link/invite":
            try:
                qs = parse_qs(parsed.query or "")
                board = (qs.get("board") or [""])[0].strip()
                if not board:
                    self._write_json(400, {"ok": False, "error": "Missing board"})
                    return
                settings = _load_link_settings()
                host = (self.headers.get("Host") or "127.0.0.1:7357").strip()
                base = f"http://{host}"
                url = f"{base}/link?board={quote(board)}&token={quote(settings.get('token',''))}"
                self._write_json(200, {
                    "ok": True,
                    "board": board,
                    "url": url,
                    "token": settings.get("token", ""),
                    "link_id": settings.get("link_id", ""),
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Invite error: {e}"})
            return
        if parsed.path == "/api/link/status":
            data = _load_link_settings()
            self._write_json(200, {"ok": True, "link_id": data.get("link_id"), "at": datetime.utcnow().isoformat() + "Z"})
            return
        if parsed.path == "/api/link/board":
            if not _link_auth_ok(self.headers):
                self._write_json(401, {"ok": False, "error": "Unauthorized"})
                return
            try:
                qs = parse_qs(parsed.query or "")
                name = (qs.get("name") or [""])[0]
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing name"})
                    return
                list_all_items, read_item_data, write_item_data, delete_item, get_item_path = im()
                data = read_item_data("canvas_board", name)
                if data is None:
                    self._write_json(404, {"ok": False, "error": "Board not found"})
                    return
                self._write_json(200, {"ok": True, "content": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read board: {e}"})
            return
        if parsed.path == "/api/aduc/status":
            try:
                host = "127.0.0.1"
                port = _ADUC_PORT
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.3)
                running = sock.connect_ex((host, port)) == 0
                try:
                    sock.close()
                except Exception:
                    pass
                url = f"http://{host}:{port}"
                self._write_json(200, {"ok": True, "running": running, "url": url})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to check ADUC status: {e}"})
            return
        if parsed.path == "/api/aduc/start":
            try:
                host = "127.0.0.1"
                port = _ADUC_PORT
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.3)
                running = sock.connect_ex((host, port)) == 0
                try:
                    sock.close()
                except Exception:
                    pass
                if running:
                    url = f"http://{host}:{port}"
                    self._write_json(200, {"ok": True, "running": True, "url": url})
                    return
                launcher = os.path.join(ROOT_DIR, "ADUC_launcher.bat")
                if not os.path.exists(launcher):
                    self._write_json(404, {"ok": False, "error": "ADUC_launcher.bat not found"})
                    return
                env = os.environ.copy()
                env["ADUC_NO_BROWSER"] = "1"
                env["ADUC_DASHBOARD"] = "1"
                try:
                    os.makedirs(os.path.dirname(_ADUC_NO_BROWSER_FLAG), exist_ok=True)
                    with open(_ADUC_NO_BROWSER_FLAG, "w", encoding="utf-8") as flagf:
                        flagf.write("1")
                    os.makedirs(os.path.dirname(_ADUC_NO_BROWSER_FLAG_LOCAL), exist_ok=True)
                    with open(_ADUC_NO_BROWSER_FLAG_LOCAL, "w", encoding="utf-8") as flagf_local:
                        flagf_local.write("1")
                except Exception:
                    pass
                cmd = f'"{launcher}"'
                try:
                    with open(_ADUC_LOG_PATH, "w", encoding="utf-8") as logf:
                        logf.write(f"[{datetime.now().isoformat()}] Launching ADUC via {launcher}\n")
                        logf.write(f"CMD: {cmd}\n")
                        logf.flush()
                        subprocess.Popen(
                            cmd,
                            cwd=ROOT_DIR,
                            env=env,
                            stdout=logf,
                            stderr=logf,
                            shell=True,
                        )
                except Exception as e:
                    self._write_json(500, {"ok": False, "error": f"Failed to start ADUC: {e}"})
                    return
                url = f"http://{host}:{port}"
                self._write_json(200, {"ok": True, "running": False, "url": url, "log_path": _ADUC_LOG_PATH})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to start ADUC: {e}"})
            return
        if parsed.path == "/api/aduc/log":
            try:
                if not os.path.exists(_ADUC_LOG_PATH):
                    self._write_json(404, {"ok": False, "error": "Log not found"})
                    return
                with open(_ADUC_LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                self._write_json(200, {"ok": True, "path": _ADUC_LOG_PATH, "content": content})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read log: {e}"})
            return
        if parsed.path == "/api/aduc/familiars":
            status, body = _aduc_proxy_request("/familiars", method="GET")
            self._write_json(status, body if isinstance(body, dict) else {"ok": False, "error": "Invalid ADUC response"})
            return
        if parsed.path == "/api/aduc/cli/status":
            try:
                qs = parse_qs(parsed.query or "")
                familiar = (qs.get("familiar") or [""])[0].strip()
                turn_id = (qs.get("turn_id") or [""])[0].strip()
                if not familiar or not turn_id:
                    self._write_json(400, {"ok": False, "error": "Missing familiar or turn_id"})
                    return
                path = "/cli/status?" + urlencode({"familiar": familiar, "turn_id": turn_id})
                status, body = _aduc_proxy_request(path, method="GET")
                self._write_json(status, body if isinstance(body, dict) else {"ok": False, "error": "Invalid ADUC response"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to query ADUC status: {e}"})
            return
        if parsed.path == "/api/aduc/settings":
            status, body = _aduc_proxy_request("/settings", method="GET")
            self._write_json(status, body if isinstance(body, dict) else {"ok": False, "error": "Invalid ADUC response"})
            return
        if parsed.path == "/api/docs/tree":
            try:
                docs_root = os.path.abspath(os.path.join(ROOT_DIR, 'docs'))
                if not os.path.exists(docs_root):
                    self._write_json(404, {"ok": False, "error": "Docs folder not found"})
                    return
                paths = []
                for root_dir, _dirs, files in os.walk(docs_root):
                    for fname in files:
                        rel = os.path.relpath(os.path.join(root_dir, fname), docs_root)
                        rel = rel.replace("\\", "/")
                        paths.append(rel)
                paths.sort(key=lambda p: p.lower())
                self._write_json(200, {"ok": True, "paths": paths})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to list docs: {e}"})
            return
        if parsed.path == "/api/docs/read":
            try:
                qs = parse_qs(parsed.query or "")
                rel = (qs.get("path") or [""])[0].strip()
                if not rel:
                    self._write_json(400, {"ok": False, "error": "Missing path"})
                    return
                docs_root = os.path.abspath(os.path.join(ROOT_DIR, 'docs'))
                target = os.path.abspath(os.path.join(docs_root, rel))
                if not target.startswith(docs_root):
                    self._write_json(403, {"ok": False, "error": "Invalid path"})
                    return
                if not os.path.exists(target) or not os.path.isfile(target):
                    self._write_json(404, {"ok": False, "error": "File not found"})
                    return
                with open(target, 'r', encoding='utf-8') as f:
                    content = f.read()
                self._write_json(200, {"ok": True, "path": rel.replace("\\", "/"), "content": content})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read doc: {e}"})
            return
        if parsed.path == "/api/docs/search":
            try:
                qs = parse_qs(parsed.query or "")
                query = (qs.get("q") or [""])[0]
                if not query:
                    self._write_json(400, {"ok": False, "error": "Missing query"})
                    return
                limit = int((qs.get("limit") or ["200"])[0])
                limit = max(1, min(2000, limit))
                docs_root = os.path.abspath(os.path.join(ROOT_DIR, 'docs'))
                if not os.path.exists(docs_root):
                    self._write_json(404, {"ok": False, "error": "Docs folder not found"})
                    return
                needle = query.lower()
                results = []
                for root_dir, _dirs, files in os.walk(docs_root):
                    for fname in files:
                        path = os.path.join(root_dir, fname)
                        try:
                            with open(path, 'r', encoding='utf-8') as f:
                                for idx, line in enumerate(f, start=1):
                                    if needle in line.lower():
                                        rel = os.path.relpath(path, docs_root).replace("\\", "/")
                                        results.append({
                                            "path": rel,
                                            "line": idx,
                                            "text": line.strip()[:240],
                                        })
                                        if len(results) >= limit:
                                            raise StopIteration
                        except StopIteration:
                            raise
                        except Exception:
                            continue
                self._write_json(200, {"ok": True, "results": results})
            except StopIteration:
                self._write_json(200, {"ok": True, "results": results})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to search docs: {e}"})
            return
        if parsed.path == "/api/theme":
            # Lookup a theme by name in user/Settings/theme_settings.yml
            try:
                qs = parse_qs(parsed.query or '')
                name = (qs.get('name') or [''])[0].strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing name"}); return
                settings_path = os.path.join(ROOT_DIR, 'user', 'Settings', 'theme_settings.yml')
                if not os.path.exists(settings_path):
                    self._write_json(404, {"ok": False, "error": "theme_settings.yml not found"}); return
                with open(settings_path, 'r', encoding='utf-8') as f:
                    y = yaml.safe_load(f) or {}
                themes = (y.get('themes') if isinstance(y, dict) else None) or {}
                found = None
                for key, val in (themes.items() if isinstance(themes, dict) else []):
                    if str(key).strip().lower() == name.lower():
                        found = val; break
                if not isinstance(found, dict):
                    self._write_json(404, {"ok": False, "error": "Theme not found"}); return
                # Normalize colors
                bg = found.get('background_hex') or found.get('background') or found.get('bg')
                fg = found.get('text_hex') or found.get('text') or found.get('fg')
                self._write_json(200, {"ok": True, "name": name, "background_hex": bg, "text_hex": fg, "theme": found})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read theme: {e}"})
            return
        if parsed.path == "/api/console/theme":
            try:
                from modules import console_style
                if hasattr(console_style, "reset_theme_cache"):
                    try:
                        console_style.reset_theme_cache()
                    except Exception:
                        pass
                palette = console_style.load_palette() if hasattr(console_style, "load_palette") else {}
                color_mode = console_style.load_color_mode() if hasattr(console_style, "load_color_mode") else "16"
                self._write_json(200, {
                    "ok": True,
                    "palette": palette if isinstance(palette, dict) else {},
                    "color_mode": str(color_mode or "16"),
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read console theme: {e}"})
            return
        if parsed.path == "/api/cockpit/matrix":
            try:
                qs = parse_qs(parsed.query or "")
                row_raw = (qs.get("row") or [None])[0]
                col_raw = (qs.get("col") or [None])[0]
                row = parse_matrix_dimensions(row_raw, ["item_type"])
                col = parse_matrix_dimensions(col_raw, ["item_status"])
                metric = (qs.get("metric") or ["count"])[0] or "count"
                row_sort = (qs.get("row_sort") or ['label-asc'])[0] or 'label-asc'
                col_sort = (qs.get("col_sort") or ['label-asc'])[0] or 'label-asc'
                filters_raw = (qs.get("filters") or [None])[0]
                filters = parse_matrix_filters(filters_raw) if filters_raw else {}
                meta_only = ((qs.get("meta") or ["false"])[0] or "").lower() == "true"
                if meta_only:
                    payload = matrix_metadata()
                else:
                    payload = compute_matrix(row, col, metric, filters, row_sort=row_sort, col_sort=col_sort)
                self._write_json(200, {"ok": True, **payload})
            except ValueError as e:
                self._write_json(400, {"ok": False, "error": str(e)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Matrix error: {e}"})
            return
        if parsed.path == "/api/cockpit/matrix/presets":
            try:
                qs = parse_qs(parsed.query or "")
                name = (qs.get("name") or [""])[0].strip()
                if name:
                    preset = load_matrix_preset(name)
                    self._write_json(200, {"ok": True, "preset": preset})
                else:
                    self._write_json(200, {"ok": True, "presets": list_matrix_presets()})
            except FileNotFoundError:
                self._write_json(404, {"ok": False, "error": "Preset not found"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Preset error: {e}"})
            return
        if parsed.path == "/api/trends/metrics":
            try:
                import sqlite3
                data_dir = os.path.join(ROOT_DIR, 'user', 'Data')
                trends_db = os.path.join(data_dir, 'chronos_trends.db')
                
                if not os.path.exists(trends_db):
                    self._write_json(200, {"ok": True, "metrics": {}})
                    return
                
                conn = sqlite3.connect(trends_db)
                cursor = conn.cursor()
                
                # Get all latest metrics
                rows = cursor.execute("""
                    SELECT metric, value, unit, extra_json
                    FROM metrics
                    ORDER BY generated_at DESC
                    LIMIT 100
                """).fetchall()
                
                metrics = {
                    "blocks_total": 0,
                    "blocks_completed": 0,
                    "quality_counts": {},
                    "habit_stats": {},
                    "goal_stats": {},
                    "timer_stats": {},
                    "adherence_stats": {}
                }
                
                for metric, value, unit, extra_json in rows:
                    if metric.startswith("habits_"):
                        key = metric.replace("habits_", "")
                        metrics["habit_stats"][key] = value
                    elif metric.startswith("goals_"):
                        key = metric.replace("goals_", "")
                        metrics["goal_stats"][key] = value
                    elif metric.startswith("timer_"):
                        key = metric.replace("timer_", "")
                        metrics["timer_stats"][key] = value
                    elif metric.startswith("adherence_"):
                        key = metric.replace("adherence_", "")
                        metrics["adherence_stats"][key] = value
                    elif metric == "blocks_total":
                        metrics["blocks_total"] = int(value)
                    elif metric == "blocks_completed":
                        metrics["blocks_completed"] = int(value)
                    elif metric == "completion_quality_counts" and extra_json:
                        try:
                            metrics["quality_counts"] = json.loads(extra_json)
                        except:
                            pass
                
                # Fix habit_stats keys
                if "total" in metrics["habit_stats"]:
                    metrics["habit_stats"]["total_habits"] = metrics["habit_stats"].pop("total")
                if "with_streak" in metrics["habit_stats"]:
                    metrics["habit_stats"]["habits_with_current_streak"] = metrics["habit_stats"].pop("with_streak")
                if "avg_streak" in metrics["habit_stats"]:
                    pass  # Keep as is
                if "longest_streak" in metrics["habit_stats"]:
                    metrics["habit_stats"]["longest_streak_overall"] = metrics["habit_stats"].pop("longest_streak")
                if "completion_today" in metrics["habit_stats"]:
                    metrics["habit_stats"]["completion_rate_today"] = metrics["habit_stats"].pop("completion_today")
                
                # Fix goal_stats keys
                if "total" in metrics["goal_stats"]:
                    metrics["goal_stats"]["total_goals"] = metrics["goal_stats"].pop("total")
                if "in_progress" in metrics["goal_stats"]:
                    metrics["goal_stats"]["goals_in_progress"] = metrics["goal_stats"].pop("in_progress")
                if "avg_progress" in metrics["goal_stats"]:
                    metrics["goal_stats"]["total_progress"] = metrics["goal_stats"].pop("avg_progress") * metrics["goal_stats"].get("total_goals", 1)
                if "completed_week" in metrics["goal_stats"]:
                    metrics["goal_stats"]["milestones_completed_this_week"] = metrics["goal_stats"].pop("completed_week")
                
                # Fix timer_stats keys
                if "sessions_total" in metrics["timer_stats"]:
                    metrics["timer_stats"]["sessions_total"] = metrics["timer_stats"]["sessions_total"]
                if "focus_minutes" in metrics["timer_stats"]:
                    metrics["timer_stats"]["focus_minutes"] = metrics["timer_stats"]["focus_minutes"]
                
                # Fix adherence_stats keys
                if "on_time" in metrics["adherence_stats"]:
                    metrics["adherence_stats"]["on_time_count"] = metrics["adherence_stats"].pop("on_time")
                if "late" in metrics["adherence_stats"]:
                    metrics["adherence_stats"]["late_count"] = metrics["adherence_stats"].pop("late")
                if "percentage" in metrics["adherence_stats"]:
                    metrics["adherence_stats"]["adherence_percentage"] = metrics["adherence_stats"].pop("percentage")
                
                conn.close()
                self._write_json(200, {"ok": True, "metrics": metrics})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Trends error: {e}"})
            return
        if parsed.path == "/api/status/current":
            try:
                status_path = status_current_path()
                data = {}
                if os.path.exists(status_path):
                    with open(status_path, 'r', encoding='utf-8') as f:
                        data = yaml.safe_load(f) or {}
                self._write_json(200, {"ok": True, "status": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read current_status: {e}"})
            return
        if parsed.path == "/api/habits":
            # Enumerate habits with basic fields and today status
            try:
                user_dir = os.path.join(ROOT_DIR, 'user')
                habits_dir = os.path.join(user_dir, 'Habits')
                items = []
                today = None
                try:
                    today = datetime.now().strftime('%Y-%m-%d')
                except Exception:
                    pass
                if os.path.isdir(habits_dir):
                    for fn in os.listdir(habits_dir):
                        if not fn.lower().endswith('.yml'):
                            continue
                        fpath = os.path.join(habits_dir, fn)
                        try:
                            with open(fpath, 'r', encoding='utf-8') as f:
                                d = yaml.safe_load(f) or {}
                            def g(key, alt=None):
                                return d.get(key) if key in d else d.get(alt) if alt else None
                            name = g('name') or os.path.splitext(fn)[0]
                            category = g('category')
                            priority = g('priority')
                            polarity = str(g('polarity', 'polarity') or 'good').lower()
                            curr = int(g('current_streak', 'current_streak') or 0)
                            longest = int(g('longest_streak', 'longest_streak') or 0)
                            clean_curr = int(g('clean_current_streak', 'clean_current_streak') or 0)
                            clean_long = int(g('clean_longest_streak', 'clean_longest_streak') or 0)
                            comp = g('completion_dates', 'completion_dates') or []
                            inc = g('incident_dates', 'incident_dates') or []
                            today_status = None
                            if today:
                                if polarity == 'bad' and isinstance(inc, list) and today in inc:
                                    today_status = 'incident'
                                elif polarity != 'bad' and isinstance(comp, list) and today in comp:
                                    today_status = 'done'
                            items.append({
                                'name': str(name),
                                'polarity': polarity,
                                'category': category,
                                'priority': priority,
                                'streak_current': curr,
                                'streak_longest': longest,
                                'clean_current': clean_curr,
                                'clean_longest': clean_long,
                                'today_status': today_status,
                            })
                        except Exception:
                            continue
                self._write_yaml(200, { 'ok': True, 'habits': items })
            except Exception as e:
                self._write_yaml(500, { 'ok': False, 'error': f'Habits error: {e}' })
            return
        if parsed.path == "/api/goals":
            # Return goals with computed overall progress and counts
            try:
                from modules.milestone import main as MilestoneModule  # type: ignore
                MilestoneModule.evaluate_and_update_milestones()
            except Exception:
                pass
            try:
                from modules.item_manager import list_all_items
                goals = list_all_items('goal') or []
                milestones = list_all_items('milestone') or []
                # Group milestones by goal
                by_goal = {}
                for m in milestones:
                    if not isinstance(m, dict):
                        continue
                    gname = (m.get('goal') or '').strip()
                    if not gname:
                        continue
                    by_goal.setdefault(gname, []).append(m)
                out = []
                for g in goals:
                    if not isinstance(g, dict):
                        continue
                    name = g.get('name') or ''
                    ms = by_goal.get(name, [])
                    total_w = 0
                    acc = 0.0
                    comp = 0
                    pend = 0
                    inprog = 0
                    for m in ms:
                        w = int(m.get('weight') or 1)
                        p = ((m.get('progress') or {}) if isinstance(m.get('progress'), dict) else {})
                        pct = float(p.get('percent') or 0)
                        acc += pct * w
                        total_w += w
                        st = str(m.get('status','pending')).lower()
                        if st == 'completed': comp += 1
                        elif st == 'in-progress': inprog += 1
                        else: pend += 1
                    overall = (acc/total_w) if total_w>0 else 0.0
                    due = g.get('due_date') or g.get('due') or None
                    out.append({
                        'name': name,
                        'overall': round(overall, 1),
                        'milestones_total': len(ms),
                        'milestones_completed': comp,
                        'milestones_in_progress': inprog,
                        'milestones_pending': pend,
                        'due_date': due,
                        'priority': g.get('priority'),
                        'status': g.get('status'),
                        'category': g.get('category'),
                    })
                self._write_json(200, {"ok": True, "goals": out})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Goals error: {e}"})
            return
        if parsed.path == "/api/points":
            try:
                from utilities import points as Points
                qs = parse_qs(parsed.query or '')
                limit_raw = (qs.get('limit') or [''])[0].strip()
                last = None
                if limit_raw:
                    try:
                        last_val = int(limit_raw)
                        if last_val > 0:
                            last = last_val
                    except Exception:
                        last = None
                history = Points.get_history(last) or []
                balance = Points.get_balance()
                self._write_json(200, {"ok": True, "balance": balance, "history": history})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Points error: {e}"})
            return
        if parsed.path == "/api/rewards":
            try:
                from modules.item_manager import list_all_items
                rewards = list_all_items('reward') or []
                now = datetime.now()
                def parse_int(val, default=None):
                    try:
                        if val is None or (isinstance(val, str) and not val.strip()):
                            return default
                        return int(val)
                    except Exception:
                        return default
                def parse_dt(val):
                    if not val:
                        return None
                    text = str(val).strip()
                    if not text:
                        return None
                    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                        try:
                            return datetime.strptime(text, fmt)
                        except Exception:
                            continue
                    try:
                        return datetime.fromisoformat(text)
                    except Exception:
                        return None
                items = []
                for raw in rewards:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get('name') or raw.get('title') or '').strip()
                    if not name:
                        continue
                    cost_map = raw.get('cost') if isinstance(raw.get('cost'), dict) else {}
                    points_cost = parse_int(cost_map.get('points'), 0) or 0
                    cooldown_min = parse_int(raw.get('cooldown_minutes'), 0) or 0
                    last_dt = parse_dt(raw.get('last_redeemed'))
                    ready_at = None
                    cooldown_ready = True
                    cooldown_remaining = 0
                    if cooldown_min and last_dt:
                        ready_at = last_dt + timedelta(minutes=cooldown_min)
                        if ready_at > now:
                            cooldown_ready = False
                            cooldown_remaining = max(0, int((ready_at - now).total_seconds() // 60))
                    redemptions = parse_int(raw.get('redemptions'), 0) or 0
                    max_red = parse_int(raw.get('max_redemptions'))
                    limit_ready = True
                    if isinstance(max_red, int) and max_red > 0 and redemptions >= max_red:
                        limit_ready = False
                    available = cooldown_ready and limit_ready
                    items.append({
                        "name": name,
                        "description": raw.get('description') or raw.get('notes') or raw.get('summary'),
                        "category": raw.get('category'),
                        "priority": raw.get('priority'),
                        "cost_points": points_cost,
                        "cooldown_minutes": cooldown_min,
                        "cooldown_ready": cooldown_ready,
                        "cooldown_remaining_minutes": cooldown_remaining,
                        "cooldown_ready_at": ready_at.strftime('%Y-%m-%d %H:%M:%S') if ready_at else None,
                        "redemptions": redemptions,
                        "max_redemptions": max_red,
                        "last_redeemed": raw.get('last_redeemed'),
                        "target": raw.get('target'),
                        "tags": raw.get('tags'),
                        "available": available,
                        "limit_ready": limit_ready,
                    })
                items.sort(key=lambda r: (not r.get('available', False), str(r.get('name','')).lower()))
                self._write_json(200, {"ok": True, "rewards": items})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Rewards error: {e}"})
            return
        if parsed.path == "/api/achievements":
            try:
                from modules.item_manager import list_all_items
                rows = list_all_items('achievement') or []
                def parse_int(val):
                    try:
                        if val is None or val == '':
                            return None
                        return int(val)
                    except Exception:
                        return None
                items = []
                for raw in rows:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get('name') or '').strip()
                    if not name:
                        continue
                    status = str(raw.get('status') or '').strip().lower()
                    awarded_at = raw.get('awarded_at') or raw.get('awarded_on') or raw.get('completed')
                    awarded_flag = bool(raw.get('awarded')) or bool(awarded_at) or status in ('awarded','completed','done','celebrated')
                    archived_flag = bool(raw.get('archived')) or status == 'archived'
                    state = 'archived' if archived_flag else ('awarded' if awarded_flag else (status or 'pending'))
                    tags = raw.get('tags')
                    if isinstance(tags, str):
                        tags = [t.strip() for t in tags.split(',') if t.strip()]
                    elif not isinstance(tags, list):
                        tags = []
                    items.append({
                        "id": raw.get('id'),
                        "name": name,
                        "description": raw.get('description') or raw.get('notes'),
                        "title": raw.get('title'),
                        "category": raw.get('category'),
                        "priority": raw.get('priority'),
                        "status": status or state,
                        "state": state,
                        "awarded": awarded_flag,
                        "awarded_at": awarded_at,
                        "points": parse_int(raw.get('points') or raw.get('value')) or 0,
                        "xp": parse_int(raw.get('xp')) or 0,
                        "tags": tags,
                        "created": raw.get('created') or raw.get('date_created'),
                        "updated": raw.get('updated') or raw.get('last_updated'),
                    })
                total = len(items)
                awarded = sum(1 for r in items if r.get('state') == 'awarded')
                archived = sum(1 for r in items if r.get('state') == 'archived')
                pending = total - awarded - archived
                counts = {
                    "total": total,
                    "awarded": awarded,
                    "archived": archived,
                    "pending": pending,
                }
                self._write_json(200, {"ok": True, "achievements": items, "counts": counts})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Achievements error: {e}"})
            return
        if parsed.path == "/api/commitments":
            try:
                from modules.item_manager import list_all_items
                from modules.commitment import main as CommitmentModule  # type: ignore
                commitments = list_all_items('commitment') or []
                today_key = datetime.now().strftime('%Y-%m-%d')
                out = []
                met_count = 0
                violation_count = 0
                for raw in commitments:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get('name') or 'Commitment')
                    status = CommitmentModule.get_commitment_status(raw)
                    met = bool(status.get('met'))
                    violation = bool(status.get('violation'))
                    state = status.get('state') or ('violation' if violation else ('met' if met else 'pending'))
                    if state == 'met':
                        met_count += 1
                    elif state == 'violation':
                        violation_count += 1
                    manual_map = raw.get('manual_status_by_date') if isinstance(raw.get('manual_status_by_date'), dict) else {}
                    manual_today = str(manual_map.get(today_key) or '').strip().lower()
                    out.append({
                        "name": name,
                        "description": raw.get('description') or raw.get('notes'),
                        "rule_kind": status.get('kind'),
                        "period": status.get('period') or 'week',
                        "times_required": status.get('times') or 0,
                        "required_total": status.get('required_total') or status.get('times') or 0,
                        "progress": status.get('progress') or 0,
                        "remaining": status.get('remaining') or 0,
                        "target_progress": status.get('target_progress') or [],
                        "targets": status.get('targets') or [],
                        "triggers": status.get('triggers'),
                        "status": state,
                        "met": met,
                        "violation": violation,
                        "manual_today": manual_today,
                        "needs_checkin": (state == 'pending' and manual_today not in ('met', 'violation')),
                        "last_met": raw.get('last_met'),
                        "last_violation": raw.get('last_violation'),
                    })
                counts = {
                    "total": len(out),
                    "met": met_count,
                    "violations": violation_count,
                    "pending": len(out) - met_count - violation_count,
                }
                self._write_json(200, {"ok": True, "commitments": out, "counts": counts})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Commitments error: {e}"})
            return
        if parsed.path == "/api/tracker/sources":
            try:
                from modules.item_manager import list_all_items
                habits = list_all_items('habit') or []
                commitments = list_all_items('commitment') or []

                def _is_true(value):
                    if isinstance(value, bool):
                        return value
                    text = str(value or '').strip().lower()
                    return text in ('1', 'true', 'yes', 'y', 'on')

                def _num(value):
                    try:
                        n = float(value)
                        if n > 0:
                            return n
                    except Exception:
                        return None
                    return None

                def _sleep_target_hours(raw):
                    if not isinstance(raw, dict):
                        return None
                    keys = (
                        'sleep_target_hours',
                        'target_sleep_hours',
                        'target_hours',
                        'sleep_hours',
                    )
                    for key in keys:
                        n = _num(raw.get(key))
                        if n is not None:
                            return n
                    target = raw.get('target') if isinstance(raw.get('target'), dict) else {}
                    for key in keys:
                        n = _num(target.get(key))
                        if n is not None:
                            return n
                    return None

                sources = []

                for raw in habits:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get('name') or '').strip()
                    if not name:
                        continue
                    polarity = str(raw.get('polarity') or 'good').strip().lower()
                    if polarity not in ('good', 'bad'):
                        polarity = 'good'
                    sleep = _is_true(raw.get('sleep'))
                    sleep_target_hours = _sleep_target_hours(raw)
                    sources.append({
                        "id": f"habit::{name.lower()}",
                        "type": "habit",
                        "name": name,
                        "label": name,
                        "polarity": polarity,
                        "sleep": sleep,
                        "sleep_target_hours": sleep_target_hours,
                    })

                for raw in commitments:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get('name') or '').strip()
                    if not name:
                        continue
                    rule = raw.get('rule') if isinstance(raw.get('rule'), dict) else {}
                    kind = str(rule.get('kind') or raw.get('kind') or '').strip().lower()
                    mode = 'negative' if kind in ('never', 'avoid', 'abstain', 'forbidden') else 'positive'
                    sleep = _is_true(raw.get('sleep'))
                    sleep_target_hours = _sleep_target_hours(raw)
                    sources.append({
                        "id": f"commitment::{name.lower()}",
                        "type": "commitment",
                        "name": name,
                        "label": name,
                        "rule_kind": kind or None,
                        "mode": mode,
                        "sleep": sleep,
                        "sleep_target_hours": sleep_target_hours,
                    })

                sources.sort(key=lambda item: (str(item.get("type") or ""), str(item.get("name") or "").lower()))
                self._write_json(200, {"ok": True, "sources": sources})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Tracker sources error: {e}"})
            return
        if parsed.path == "/api/tracker/year":
            try:
                from modules.item_manager import list_all_items

                qs = parse_qs(parsed.query or '')
                year_raw = str((qs.get('year') or [''])[0] or '').strip()
                source_type = str((qs.get('type') or [''])[0] or '').strip().lower()
                source_name = str((qs.get('name') or [''])[0] or '').strip()
                if not source_type or not source_name:
                    self._write_json(400, {"ok": False, "error": "Missing required query params: type, name"})
                    return
                if source_type not in ('habit', 'commitment'):
                    self._write_json(400, {"ok": False, "error": "type must be habit or commitment"})
                    return
                try:
                    year = int(year_raw) if year_raw else datetime.now().year
                except Exception:
                    year = datetime.now().year
                year = max(1970, min(2200, year))
                today_key = datetime.now().strftime('%Y-%m-%d')
                start_dt = datetime(year, 1, 1)
                end_dt = datetime(year, 12, 31)
                sleep_target_qs = str((qs.get('sleep_target_hours') or [''])[0] or '').strip()

                def _is_true(value):
                    if isinstance(value, bool):
                        return value
                    text = str(value or '').strip().lower()
                    return text in ('1', 'true', 'yes', 'y', 'on')

                def _num(value):
                    try:
                        n = float(value)
                        if n > 0:
                            return n
                    except Exception:
                        return None
                    return None

                def _sleep_target_hours(raw):
                    if not isinstance(raw, dict):
                        return None
                    keys = (
                        'sleep_target_hours',
                        'target_sleep_hours',
                        'target_hours',
                        'sleep_hours',
                    )
                    for key in keys:
                        n = _num(raw.get(key))
                        if n is not None:
                            return n
                    target = raw.get('target') if isinstance(raw.get('target'), dict) else {}
                    for key in keys:
                        n = _num(target.get(key))
                        if n is not None:
                            return n
                    return None

                def _hm_to_minutes(value):
                    text = str(value or '').strip()
                    if not text:
                        return None
                    if ':' not in text:
                        return None
                    parts = text.split(':')
                    if len(parts) < 2:
                        return None
                    try:
                        hh = int(str(parts[0]).strip())
                        mm = int(str(parts[1]).strip()[:2])
                    except Exception:
                        return None
                    hh = max(0, min(23, hh))
                    mm = max(0, min(59, mm))
                    return (hh * 60) + mm

                def normalize_status(value):
                    return str(value or '').strip().lower()

                def map_outcome(raw_status, item_type, item_mode):
                    status = normalize_status(raw_status)
                    if not status:
                        return None
                    if item_type == 'habit':
                        if item_mode == 'bad':
                            if status in ('incident', 'completed', 'done', 'violation', 'broken', 'failed'):
                                return 'done'
                            if status in ('not_done', 'clean', 'abstained', 'kept', 'missed', 'skipped', 'cancelled'):
                                return 'not_done'
                            return None
                        if status in ('completed', 'done', 'met', 'success'):
                            return 'done'
                        if status in ('incident', 'violation', 'broken', 'failed', 'missed', 'skipped', 'not_done', 'cancelled'):
                            return 'not_done'
                        return None
                    if status in ('completed', 'done', 'met', 'kept', 'success'):
                        return 'done'
                    if status in ('violation', 'broken', 'failed', 'missed', 'skipped', 'not_done', 'cancelled'):
                        return 'not_done'
                    return None

                tracked_meta = {
                    "type": source_type,
                    "name": source_name,
                    "polarity": "good",
                    "mode": "positive",
                    "rule_kind": None,
                    "sleep": False,
                    "sleep_target_hours": None,
                }
                days = {}
                sleep_minutes_by_date = {}

                if source_type == 'habit':
                    habits = list_all_items('habit') or []
                    target = None
                    for raw in habits:
                        if not isinstance(raw, dict):
                            continue
                        if str(raw.get('name') or '').strip().lower() == source_name.lower():
                            target = raw
                            break
                    if not target:
                        self._write_json(404, {"ok": False, "error": "Habit not found"})
                        return
                    polarity = str(target.get('polarity') or 'good').strip().lower()
                    if polarity not in ('good', 'bad'):
                        polarity = 'good'
                    tracked_meta['polarity'] = polarity
                    tracked_meta['sleep'] = _is_true(target.get('sleep'))
                    tracked_meta['sleep_target_hours'] = _sleep_target_hours(target)

                    completion_dates = target.get('completion_dates') if isinstance(target.get('completion_dates'), list) else []
                    incident_dates = target.get('incident_dates') if isinstance(target.get('incident_dates'), list) else []

                    for raw_date in completion_dates:
                        date_key = str(raw_date or '').strip()
                        if not date_key.startswith(f"{year}-"):
                            continue
                        if polarity == 'bad':
                            days[date_key] = {"state": "not_done", "status": "clean", "source": "habit_file"}
                        else:
                            days[date_key] = {"state": "done", "status": "completed", "source": "habit_file"}

                    for raw_date in incident_dates:
                        date_key = str(raw_date or '').strip()
                        if not date_key.startswith(f"{year}-"):
                            continue
                        if polarity == 'bad':
                            days[date_key] = {"state": "done", "status": "incident", "source": "habit_file"}
                        else:
                            days[date_key] = {"state": "not_done", "status": "incident", "source": "habit_file"}
                else:
                    commitments = list_all_items('commitment') or []
                    target = None
                    for raw in commitments:
                        if not isinstance(raw, dict):
                            continue
                        if str(raw.get('name') or '').strip().lower() == source_name.lower():
                            target = raw
                            break
                    if not target:
                        self._write_json(404, {"ok": False, "error": "Commitment not found"})
                        return
                    rule = target.get('rule') if isinstance(target.get('rule'), dict) else {}
                    kind = str(rule.get('kind') or target.get('kind') or '').strip().lower()
                    mode = 'negative' if kind in ('never', 'avoid', 'abstain', 'forbidden') else 'positive'
                    tracked_meta['mode'] = mode
                    tracked_meta['rule_kind'] = kind or None
                    tracked_meta['sleep'] = _is_true(target.get('sleep'))
                    tracked_meta['sleep_target_hours'] = _sleep_target_hours(target)

                    manual_map = target.get('manual_status_by_date') if isinstance(target.get('manual_status_by_date'), dict) else {}
                    for raw_date, raw_status in manual_map.items():
                        date_key = str(raw_date or '').strip()
                        if not date_key.startswith(f"{year}-"):
                            continue
                        mapped = map_outcome(raw_status, 'commitment', mode)
                        if mapped:
                            days[date_key] = {"state": mapped, "status": normalize_status(raw_status), "source": "manual_status_by_date"}

                # Overlay/augment from completion entries for the full year.
                # This lets tracker reflect explicit check-ins saved by popups and schedule logs.
                comp_dir = os.path.join(ROOT_DIR, 'user', 'Schedules', 'completions')
                span_days = (end_dt - start_dt).days + 1
                for offset in range(span_days):
                    dt = start_dt + timedelta(days=offset)
                    date_key = dt.strftime('%Y-%m-%d')
                    comp_path = os.path.join(comp_dir, f"{date_key}.yml")
                    if not os.path.exists(comp_path):
                        continue
                    try:
                        with open(comp_path, 'r', encoding='utf-8') as f:
                            payload = yaml.safe_load(f) or {}
                    except Exception:
                        continue
                    entries = payload.get('entries') if isinstance(payload, dict) else {}
                    if not isinstance(entries, dict):
                        continue
                    for key, raw_entry in entries.items():
                        entry = raw_entry if isinstance(raw_entry, dict) else {"status": raw_entry}
                        entry_name = str(entry.get('name') or '').strip()
                        if not entry_name and isinstance(key, str) and '@' in key:
                            entry_name = str(key.split('@', 1)[0]).strip()
                        if entry_name.lower() != source_name.lower():
                            continue
                        entry_type = str(entry.get('type') or source_type).strip().lower()
                        allow_mixed_sleep = bool(tracked_meta.get('sleep'))
                        if entry_type != source_type and not allow_mixed_sleep:
                            continue
                        mapped = map_outcome(entry.get('status'), source_type, tracked_meta.get('polarity') if source_type == 'habit' else tracked_meta.get('mode'))
                        if not mapped:
                            continue
                        days[date_key] = {
                            "state": mapped,
                            "status": normalize_status(entry.get('status')),
                            "source": "completion_entries",
                        }
                        if tracked_meta.get('sleep') and mapped == 'done':
                            start_m = _hm_to_minutes(entry.get('actual_start') or entry.get('scheduled_start'))
                            end_m = _hm_to_minutes(entry.get('actual_end') or entry.get('scheduled_end'))
                            if start_m is not None and end_m is not None:
                                duration = end_m - start_m
                                if duration <= 0:
                                    duration += 24 * 60
                                if 0 < duration <= 24 * 60:
                                    prev = int(sleep_minutes_by_date.get(date_key) or 0)
                                    sleep_minutes_by_date[date_key] = min(24 * 60, prev + int(duration))

                day_count = (end_dt - start_dt).days + 1
                if year < datetime.now().year:
                    elapsed_days = day_count
                elif year > datetime.now().year:
                    elapsed_days = 0
                else:
                    elapsed_days = max(0, min(day_count, (datetime.now().date() - start_dt.date()).days + 1))
                year_progress = int(round((elapsed_days / day_count) * 100)) if day_count else 0

                sleep_analysis = None
                if tracked_meta.get('sleep'):
                    target_hours = _num(sleep_target_qs)
                    if target_hours is None:
                        target_hours = _num(tracked_meta.get('sleep_target_hours'))
                    if target_hours is None:
                        target_hours = 8.0
                    target_minutes = int(round(target_hours * 60))

                    if year < datetime.now().year:
                        window_end = end_dt.strftime('%Y-%m-%d')
                    elif year > datetime.now().year:
                        window_end = f"{year}-01-01"
                    else:
                        window_end = datetime.now().strftime('%Y-%m-%d')

                    window_start = f"{year}-01-01"
                    logged_values = []
                    for k, v in sleep_minutes_by_date.items():
                        if k < window_start or k > window_end:
                            continue
                        try:
                            iv = int(v)
                        except Exception:
                            continue
                        if iv > 0:
                            logged_values.append((k, iv))
                    logged_values.sort(key=lambda row: row[0])
                    logged_minutes = [row[1] for row in logged_values]
                    logged_days = len(logged_minutes)
                    total_logged = sum(logged_minutes)
                    average_logged = int(round(total_logged / logged_days)) if logged_days else 0
                    short_nights_7h = len([v for v in logged_minutes if v < (7 * 60)])
                    below_target_nights = len([v for v in logged_minutes if v < target_minutes])

                    debt_logged = max(0, (target_minutes * logged_days) - total_logged)
                    surplus_logged = max(0, total_logged - (target_minutes * logged_days))

                    def _rolling_avg(days_back):
                        if days_back <= 0:
                            return 0
                        if year > datetime.now().year:
                            return 0
                        end_date = end_dt.date() if year < datetime.now().year else datetime.now().date()
                        start_date = max(start_dt.date(), end_date - timedelta(days=days_back - 1))
                        vals = []
                        cursor = start_date
                        while cursor <= end_date:
                            k = cursor.strftime('%Y-%m-%d')
                            if k in sleep_minutes_by_date:
                                try:
                                    iv = int(sleep_minutes_by_date[k])
                                except Exception:
                                    iv = 0
                                if iv > 0:
                                    vals.append(iv)
                            cursor += timedelta(days=1)
                        return int(round(sum(vals) / len(vals))) if vals else 0

                    rolling_7d = _rolling_avg(7)
                    rolling_30d = _rolling_avg(30)

                    sleep_analysis = {
                        "target_hours": float(target_hours),
                        "target_minutes": int(target_minutes),
                        "logged_day_count": int(logged_days),
                        "total_logged_minutes": int(total_logged),
                        "average_logged_minutes": int(average_logged),
                        "debt_minutes": int(debt_logged),
                        "surplus_minutes": int(surplus_logged),
                        "short_nights_under_7h": int(short_nights_7h),
                        "below_target_nights": int(below_target_nights),
                        "rolling_7d_average_minutes": int(rolling_7d),
                        "rolling_30d_average_minutes": int(rolling_30d),
                    }

                self._write_json(200, {
                    "ok": True,
                    "year": year,
                    "today": today_key,
                    "tracked": tracked_meta,
                    "days": days,
                    "sleep_minutes_by_date": sleep_minutes_by_date,
                    "sleep_analysis": sleep_analysis,
                    "year_progress_percent": year_progress,
                    "elapsed_days": elapsed_days,
                    "day_count": day_count,
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Tracker year error: {e}"})
            return
        if parsed.path == "/api/milestones":
            try:
                from modules.milestone import main as MilestoneModule  # type: ignore
                from modules.item_manager import list_all_items
                try:
                    MilestoneModule.evaluate_and_update_milestones()
                except Exception:
                    pass
                rows = list_all_items('milestone') or []
                items = []
                status_counts = {'total':0,'completed':0,'in_progress':0,'pending':0}
                for raw in rows:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get('name') or '').strip()
                    if not name:
                        continue
                    prog = raw.get('progress') if isinstance(raw.get('progress'), dict) else {}
                    percent = float(prog.get('percent') or 0)
                    current = prog.get('current')
                    target = prog.get('target')
                    status = (raw.get('status') or 'pending').lower()
                    if status not in status_counts:
                        status_counts[status] = 0
                    status_counts['total'] += 1
                    if status == 'completed':
                        status_counts['completed'] += 1
                    elif status == 'in-progress':
                        status_counts['in_progress'] += 1
                    else:
                        status_counts['pending'] += 1
                    items.append({
                        "name": name,
                        "goal": raw.get('goal'),
                        "project": raw.get('project'),
                        "status": status,
                        "priority": raw.get('priority'),
                        "category": raw.get('category'),
                        "due_date": raw.get('due_date') or raw.get('due'),
                        "progress_percent": percent,
                        "progress_current": current,
                        "progress_target": target,
                        "weight": raw.get('weight'),
                        "completed_at": raw.get('completed'),
                        "criteria": raw.get('criteria'),
                        "triggers": raw.get('triggers'),
                    })
                self._write_json(200, {"ok": True, "milestones": items, "counts": status_counts})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Milestones error: {e}"})
            return
        if parsed.path == "/api/items":
            # Return all items across all types (opt filterable by type query param)
            sys.stderr.write(f"DEBUG: /api/items handler (line 1170) hit\n")
            sys.stderr.flush()
            try:
                from modules.item_manager import list_all_items
                qs = parse_qs(parsed.query or '')
                filter_type = (qs.get('type') or [''])[0].strip().lower()
                sys.stderr.write(f"DEBUG: filter_type={filter_type}\n")
                sys.stderr.flush()
                
                # List of all known item types
                item_types = ['goal', 'habit', 'commitment', 'task', 'project', 'routine', 'subroutine', 'microroutine', 'note', 'milestone', 'achievement', 'reward', 'canvas_board']
                
                all_items = []
                for itype in item_types:
                    if filter_type and itype != filter_type:
                        continue
                    try:
                        rows = list_all_items(itype) or []
                        sys.stderr.write(f"DEBUG: list_all_items({itype}) returned {len(rows)} items\n")
                        sys.stderr.flush()
                        for row in rows:
                            if isinstance(row, dict):
                                # Add type field if not present
                                if 'type' not in row:
                                    row['type'] = itype
                                all_items.append(row)
                    except Exception as ex:
                        sys.stderr.write(f"DEBUG: list_all_items({itype}) exception: {ex}\n")
                        sys.stderr.flush()
                        continue
                
                sys.stderr.write(f"DEBUG: /api/items returning {len(all_items)} items total\n")
                sys.stderr.flush()
                self._write_json(200, {"ok": True, "items": all_items, "count": len(all_items)})
            except Exception as e:
                sys.stderr.write(f"DEBUG: /api/items exception: {e}\n")
                sys.stderr.flush()
                self._write_json(500, {"ok": False, "error": f"Items error: {e}"})
            return
        if parsed.path == "/api/goal":
            try:
                from modules.milestone import main as MilestoneModule  # type: ignore
                MilestoneModule.evaluate_and_update_milestones()
            except Exception:
                pass
            try:
                qs = parse_qs(parsed.query)
                name = (qs.get('name') or [''])[0].strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing goal name"}); return
                from modules.item_manager import read_item_data, list_all_items
                goal = read_item_data('goal', name)
                if not goal:
                    self._write_json(404, {"ok": False, "error": "Goal not found"}); return
                milestones = [m for m in (list_all_items('milestone') or []) if isinstance(m, dict) and (m.get('goal') or '').strip()==name]
                # Compute overall
                total_w = 0; acc = 0.0
                det_ms = []
                for m in milestones:
                    w = int(m.get('weight') or 1)
                    pr = ((m.get('progress') or {}) if isinstance(m.get('progress'), dict) else {})
                    pct = float(pr.get('percent') or 0)
                    acc += pct * w
                    total_w += w
                    # criteria summary
                    crit = m.get('criteria') or {}
                    summary = ''
                    try:
                        if 'count' in crit:
                            c = crit['count'] or {}
                            of = c.get('of') or {}
                            summary = f"{of.get('type','')}:{of.get('name','')} x {c.get('times','?')} ({c.get('period','all')})"
                        elif 'checklist' in crit:
                            cl = crit['checklist'] or {}
                            items = cl.get('items') or []
                            summary = f"checklist {len(items)} (require {cl.get('require','all')})"
                    except Exception:
                        pass
                    det_ms.append({
                        'name': m.get('name'),
                        'status': m.get('status'),
                        'progress': pr,
                        'weight': w,
                        'criteria': summary,
                        'links': m.get('links') or [],
                        'completed': m.get('completed') or None,
                    })
                overall = (acc/total_w) if total_w>0 else 0.0
                self._write_json(200, {"ok": True, "goal": {
                    'name': name,
                    'overall': round(overall,1),
                    'due_date': goal.get('due_date') or goal.get('due') or None,
                    'status': goal.get('status'),
                    'priority': goal.get('priority'),
                    'category': goal.get('category'),
                    'milestones': det_ms,
                }})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Goal detail error: {e}"})
            return
        if parsed.path == "/api/timer/status":
            try:
                from modules.timer import main as Timer
                st = Timer.status()
                self._write_json(200, {"ok": True, "status": st})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer status error: {e}"})
            return
        if parsed.path == "/api/timer/profiles":
            try:
                from modules.timer import main as Timer
                Timer.ensure_default_profiles()
                profiles = {}
                for name in (Timer.profiles_list() or []):
                    profiles[name] = Timer.profiles_view(name)
                self._write_json(200, {"ok": True, "profiles": profiles})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer profiles error: {e}"})
            return
        if parsed.path == "/api/timer/settings":
            try:
                # Load Timer_Settings.yml if present
                path = os.path.join(ROOT_DIR, 'user', 'Settings', 'Timer_Settings.yml')
                data = {}
                if os.path.exists(path):
                    with open(path, 'r') as f:
                        data = yaml.safe_load(f) or {}
                self._write_json(200, {"ok": True, "settings": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer settings error: {e}"})
            return
        if parsed.path == "/api/profile":
            try:
                profile_path = os.path.join(ROOT_DIR, 'user', 'Profile', 'profile.yml')
                profile_data = {}
                nickname = None
                title = None
                avatar_rel = None
                avatar_data_url = None
                welcome_block = { 'line1': None, 'line2': None, 'line3': None }
                exit_block = { 'line1': None, 'line2': None }
                preferences_map = None

                if os.path.exists(profile_path):
                    with open(profile_path, 'r', encoding='utf-8') as f:
                        profile_data = yaml.safe_load(f) or {}
                    nickname = profile_data.get('nickname')
                    title = profile_data.get('title')
                    avatar_rel = profile_data.get('avatar')
                    # welcome: prefer 'welcome', fallback 'welcome_message'
                    try:
                        wb = profile_data.get('welcome') or profile_data.get('welcome_message') or {}
                        if isinstance(wb, dict):
                            welcome_block['line1'] = wb.get('line1')
                            welcome_block['line2'] = wb.get('line2')
                            welcome_block['line3'] = wb.get('line3')
                    except Exception:
                        pass
                    # exit/goodbye: prefer 'exit_message', fallback 'goodbye_message'
                    try:
                        eb = profile_data.get('exit_message') or profile_data.get('goodbye_message') or {}
                        if isinstance(eb, dict):
                            exit_block['line1'] = eb.get('line1')
                            exit_block['line2'] = eb.get('line2')
                    except Exception:
                        pass
                    # preferences: support preferences.yml/.yaml and preferences_settings.yml
                    try:
                        pref_candidates = [
                            os.path.join(ROOT_DIR, 'user', 'Profile', 'preferences.yml'),
                            os.path.join(ROOT_DIR, 'user', 'Profile', 'preferences.yaml'),
                            os.path.join(ROOT_DIR, 'user', 'Profile', 'preferences_settings.yml'),
                        ]
                        for pp in pref_candidates:
                            if os.path.exists(pp) and os.path.isfile(pp):
                                with open(pp, 'r', encoding='utf-8') as pf:
                                    loaded = yaml.safe_load(pf) or {}
                                if isinstance(loaded, dict):
                                    preferences_map = loaded
                                    break
                    except Exception:
                        preferences_map = None

                # Normalize avatar path and embed as data URL if available
                if isinstance(avatar_rel, str) and avatar_rel.strip():
                    # Allow either forward or back slashes in YAML
                    norm_rel = avatar_rel.replace('\\', '/').lstrip('/')
                    # If path is already under user/, respect as project-relative
                    avatar_abs = os.path.join(ROOT_DIR, norm_rel) if not os.path.isabs(norm_rel) else norm_rel
                    try:
                        if os.path.exists(avatar_abs) and os.path.isfile(avatar_abs):
                            ext = os.path.splitext(avatar_abs)[1].lower()
                            mime = 'image/jpeg'
                            if ext in ['.png']: mime = 'image/png'
                            elif ext in ['.gif']: mime = 'image/gif'
                            elif ext in ['.webp']: mime = 'image/webp'
                            with open(avatar_abs, 'rb') as af:
                                b64 = base64.b64encode(af.read()).decode('ascii')
                            avatar_data_url = f"data:{mime};base64,{b64}"
                    except Exception:
                        avatar_data_url = None

                response_data = {"ok": True, "profile": {"nickname": nickname, "title": title, "avatar_path": avatar_rel, "avatar_data_url": avatar_data_url, "welcome": welcome_block, "exit": exit_block, "preferences": preferences_map}}
                self._write_json(200, response_data)
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to load profile: {e}"})
            return
        if parsed.path == "/api/profile/avatar":
            try:
                profile_path = os.path.join(ROOT_DIR, 'user', 'Profile', 'profile.yml')
                avatar_rel = None
                if os.path.exists(profile_path):
                    with open(profile_path, 'r', encoding='utf-8') as f:
                        prof = yaml.safe_load(f) or {}
                        avatar_rel = prof.get('avatar')
                if not avatar_rel:
                    self.send_response(404)
                    self._set_cors()
                    self.end_headers();
                    return
                norm_rel = str(avatar_rel).replace('\\', '/').lstrip('/')
                avatar_abs = os.path.join(ROOT_DIR, norm_rel) if not os.path.isabs(norm_rel) else norm_rel
                if not (os.path.exists(avatar_abs) and os.path.isfile(avatar_abs)):
                    self.send_response(404); self._set_cors(); self.end_headers(); return
                ext = os.path.splitext(avatar_abs)[1].lower()
                mime = 'image/jpeg'
                if ext in ['.png']: mime = 'image/png'
                elif ext in ['.gif']: mime = 'image/gif'
                elif ext in ['.webp']: mime = 'image/webp'
                with open(avatar_abs, 'rb') as af:
                    data = af.read()
                self.send_response(200)
                self._set_cors()
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_response(500)
                self._set_cors()
                self.end_headers()
            return
        if parsed.path == "/api/settings":
            # List or fetch user settings files under user/Settings
            try:
                qs = parse_qs(parsed.query or '')
                settings_root = os.path.join(ROOT_DIR, 'user', 'Settings')
                if not os.path.isdir(settings_root):
                    self._write_json(200, {"ok": True, "files": []}); return
                fname = (qs.get('file') or [''])[0].strip()
                if fname:
                    # Sanitize
                    if ('..' in fname) or (fname.startswith('/') or fname.startswith('\\')):
                        self._write_yaml(400, {"ok": False, "error": "Invalid file"}); return
                    fpath = os.path.abspath(os.path.join(settings_root, fname))
                    if not fpath.startswith(os.path.abspath(settings_root)):
                        self._write_yaml(403, {"ok": False, "error": "Forbidden"}); return
                    if not os.path.exists(fpath) or not os.path.isfile(fpath):
                        self._write_yaml(404, {"ok": False, "error": "Not found"}); return
                    try:
                        with open(fpath, 'r', encoding='utf-8') as fh:
                            text = fh.read()
                        parsed_yaml = {}
                        try:
                            loaded = yaml.safe_load(text) or {}
                            if isinstance(loaded, dict):
                                parsed_yaml = loaded
                        except Exception:
                            parsed_yaml = {}
                        self._write_json(200, {"ok": True, "file": fname, "content": text, "data": parsed_yaml})
                    except Exception as e:
                        self._write_json(500, {"ok": False, "error": f"Read failed: {e}"})
                    return
                # List files
                files = [fn for fn in os.listdir(settings_root) if fn.lower().endswith(('.yml', '.yaml'))]
                files.sort(key=lambda s: s.lower())
                self._write_json(200, {"ok": True, "files": files})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Settings error: {e}"})
            return
        if parsed.path == "/api/registry":
            try:
                qs = parse_qs(parsed.query or "")
                name = (qs.get("name") or [""])[0].strip().lower()
                if name not in {"command", "item", "property"}:
                    self._write_json(400, {"ok": False, "error": "Invalid registry name"}); return
                reg_path = os.path.join(ROOT_DIR, "registry", f"{name}_registry.json")
                if not os.path.exists(reg_path):
                    self._write_json(404, {"ok": False, "error": "Registry not found"}); return
                with open(reg_path, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                self._write_json(200, {"ok": True, "registry": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Registry error: {e}"})
            return
        if parsed.path == "/api/items":
            # Query params: type, q, props (csv key:value)
            try:
                qs = parse_qs(parsed.query)
                item_type = (qs.get('type') or [''])[0].strip().lower()
                q = (qs.get('q') or [''])[0].strip().lower()
                props_csv = (qs.get('props') or [''])[0]
                props = {}
                if props_csv:
                    for part in str(props_csv).split(','):
                        if ':' in part:
                            k, v = part.split(':', 1)
                            props[k.strip().lower()] = v.strip().lower()
                list_all_items, _, _, _, get_item_path = im()
                items = list_all_items(item_type) if item_type else []
                out = []
                for d in items:
                    if not isinstance(d, dict):
                        continue
                    # Normalize keys
                    dn = {str(k).lower(): v for k, v in d.items()}
                    name = dn.get('name') or ''
                    if q and q not in str(name).lower() and q not in str(dn.get('content','')).lower():
                        continue
                    ok = True
                    for pk, pv in props.items():
                        dv = dn.get(pk)
                        if dv is None or str(dv).lower() != pv:
                            ok = False; break
                    if not ok:
                        continue
                    # Determine updated timestamp from file mtime
                    upd = None
                    try:
                        fpath = get_item_path(item_type, name)
                        if fpath and os.path.exists(fpath):
                            from datetime import datetime as _dt
                            upd = _dt.fromtimestamp(os.path.getmtime(fpath)).strftime('%Y-%m-%d %H:%M')
                    except Exception:
                        upd = None
                    entry = {
                        'name': name,
                        'type': item_type,
                        'category': dn.get('category'),
                        'priority': dn.get('priority'),
                        'status': dn.get('status'),
                        'description': dn.get('description'),
                        'summary': dn.get('summary'),
                        'notes': dn.get('notes'),
                        'tags': dn.get('tags'),
                        'due_date': dn.get('due_date') or dn.get('due') or dn.get('deadline'),
                        'deadline': dn.get('deadline'),
                        'due': dn.get('due'),
                        'date': dn.get('date'),
                        'template': dn.get('template'),
                        'template_name': dn.get('template_name'),
                        'template_type': dn.get('template_type'),
                        'template_id': dn.get('template_id'),
                        'template_membership': dn.get('template_membership'),
                        'is_template': bool(dn.get('is_template')),
                        'updated': upd,
                    }
                    if item_type == 'project':
                        entry['state'] = dn.get('state') or dn.get('status')
                        entry['stage'] = dn.get('stage')
                        entry['owner'] = dn.get('owner')
                    elif item_type == 'inventory':
                        # Surface placement metadata and linked entries so dashboards can show counts
                        entry['places'] = dn.get('places') or dn.get('location')
                        entry['tags'] = dn.get('tags')
                        inv_items = dn.get('inventory_items')
                        if not isinstance(inv_items, list):
                            inv_items = dn.get('items') if isinstance(dn.get('items'), list) else []
                        entry['inventory_items'] = inv_items if isinstance(inv_items, list) else []
                        tools = dn.get('tools')
                        entry['tools'] = tools if isinstance(tools, list) else []
                    out.append(entry)
                self._write_json(200, {"ok": True, "items": out})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to list items: {e}"})
            return
        if parsed.path == "/api/sticky-notes":
            try:
                notes = _list_sticky_notes()
                self._write_json(200, {"ok": True, "notes": notes})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Sticky notes error: {e}"})
            return
        if parsed.path == "/api/project/detail":
            try:
                qs = parse_qs(parsed.query or '')
                proj_name = (qs.get('name') or [''])[0].strip()
                if not proj_name:
                    self._write_json(400, {"ok": False, "error": "Missing project name"}); return
                from modules.item_manager import read_item_data, list_all_items
                project = read_item_data('project', proj_name)
                if not project:
                    self._write_json(404, {"ok": False, "error": "Project not found"}); return
                key = proj_name.strip().lower()
                def _belongs(item):
                    return str(item.get('project') or '').strip().lower() == key
                milestones = [m for m in (list_all_items('milestone') or []) if _belongs(m)]
                linked = {}
                link_types = ['task','habit','routine','subroutine','microroutine','note','plan','appointment','ritual']
                for t in link_types:
                    arr = [it for it in (list_all_items(t) or []) if _belongs(it)]
                    if arr:
                        linked[t] = arr
                self._write_json(200, {"ok": True, "project": project, "milestones": milestones, "linked": linked})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Project detail error: {e}"})
            return
        if parsed.path == "/api/vars":
            try:
                self._write_json(200, {"ok": True, "vars": _vars_all()})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to get vars: {e}"})
            return
        if parsed.path == "/api/template/list":
            # List templates by type (routine|subroutine|microroutine|day|week)
            try:
                qs = parse_qs(parsed.query or '')
                t = (qs.get('type') or [''])[0].strip().lower()
                if not t:
                    self._write_json(400, {"ok": False, "error": "Missing type"}); return
                # Use ItemManager to locate dir
                from modules.item_manager import get_item_dir
                d = get_item_dir(t)
                out = []
                if os.path.isdir(d):
                    for fn in os.listdir(d):
                        if not fn.lower().endswith('.yml'): continue
                        name = os.path.splitext(fn)[0]
                        try:
                            # Try reading YAML for explicit name
                            with open(os.path.join(d, fn), 'r', encoding='utf-8') as f:
                                y = yaml.safe_load(f) or {}
                                n = y.get('name') or y.get('Name') or None
                                if isinstance(n, str) and n.strip():
                                    name = n.strip()
                        except Exception:
                            pass
                        out.append(name)
                out = sorted({str(x) for x in out}, key=lambda s: s.lower())
                self._write_json(200, {"ok": True, "type": t, "templates": out})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Template list error: {e}"})
            return
        if parsed.path == "/api/template":
            # GET: return template YAML (as JSON) with normalized children
            try:
                qs = parse_qs(parsed.query or '')
                t = (qs.get('type') or [''])[0].strip().lower()
                n = (qs.get('name') or [''])[0].strip()
                if not t or not n:
                    self._write_json(400, {"ok": False, "error": "Missing type or name"}); return
                from modules.item_manager import read_item_data
                data = read_item_data(t, n) or {}
                # Normalize children
                children = []
                try:
                    if t == "inventory":
                        for key in ("inventory_items", "tools"):
                            seq = data.get(key)
                            if isinstance(seq, list):
                                children.extend(seq)
                    elif isinstance(data.get('children'), list):
                        children = data['children']
                    elif isinstance(data.get('items'), list):
                        children = data['items']
                except Exception:
                    children = []
                self._write_json(200, {"ok": True, "type": t, "name": n, "template": data, "children": children})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Template read error: {e}"})
            return
        if parsed.path == "/api/review":
            # Return review YAML as text for a given type and period
            try:
                qs = parse_qs(parsed.query or '')
                t = (qs.get('type') or [''])[0].strip().lower()
                period = (qs.get('period') or [''])[0].strip()
                if t not in ("daily", "weekly", "monthly"):
                    self._write_yaml(400, {"ok": False, "error": "Invalid type (daily|weekly|monthly)"}); return
                base = os.path.join(ROOT_DIR, 'user', 'Reviews', t)
                os.makedirs(base, exist_ok=True)
                fname = None
                if t == 'daily':
                    import re
                    if not re.match(r"^\d{4}-\d{2}-\d{2}$", period):
                        self._write_yaml(400, {"ok": False, "error": "Invalid period for daily (YYYY-MM-DD)"}); return
                    fname = f"{period}.yml"
                elif t == 'monthly':
                    import re
                    if not re.match(r"^\d{4}-\d{2}$", period):
                        self._write_yaml(400, {"ok": False, "error": "Invalid period for monthly (YYYY-MM)"}); return
                    fname = f"{period}.yml"
                else:
                    import re
                    m = re.match(r"^(\d{4})-(\d{2})$", period)
                    if not m:
                        self._write_yaml(400, {"ok": False, "error": "Invalid period for weekly (YYYY-WW)"}); return
                    year = int(m.group(1)); week = int(m.group(2))
                    fname = f"{year}-{week:02d}.yml"
                fpath = os.path.join(base, fname)
                if not fpath.startswith(os.path.abspath(base)):
                    self._write_yaml(403, {"ok": False, "error": "Forbidden"}); return
                if not os.path.exists(fpath):
                    self._write_yaml(404, {"ok": False, "error": "Review not found. Generate it first."}); return
                with open(fpath, 'r', encoding='utf-8') as fh:
                    data = fh.read()
                self.send_response(200)
                self._set_cors()
                self.send_header("Content-Type", "text/yaml; charset=utf-8")
                self.send_header("Content-Length", str(len(data.encode('utf-8'))))
                self.end_headers()
                self.wfile.write(data.encode('utf-8'))
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Failed to read review: {e}"})
            return
        if parsed.path == "/api/item":
            # Return full YAML for an item
            try:
                qs = parse_qs(parsed.query)
                item_type = (qs.get('type') or [''])[0].strip().lower()
                name = (qs.get('name') or [''])[0].strip()
                if not item_type or not name:
                    self._write_yaml(400, {"ok": False, "error": "Missing type or name"}); return
                _, read_item_data, _, _, _ = im()
                data = read_item_data(item_type, name)
                if not data:
                    self._write_yaml(404, {"ok": False, "error": "Not found"}); return
                self._write_json(200, {"ok": True, "item": data})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Failed to load item: {e}"})
            return
        if parsed.path == "/api/calendar/overlays":
            try:
                qs = parse_qs(parsed.query or "")
                name = None
                if qs:
                    arr = qs.get("name") or []
                    if arr:
                        name = str(arr[0]).strip()
                if name:
                    preset = _load_calendar_overlay_preset(name)
                    if not preset:
                        self._write_json(404, {"ok": False, "error": "Preset not found"}); return
                    self._write_json(200, {"ok": True, "preset": preset}); return
                presets = _list_calendar_overlay_presets()
                self._write_json(200, {"ok": True, "presets": presets})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Overlay presets error: {e}"})
            return
        if parsed.path == "/api/calendar/happiness":
            try:
                qs = parse_qs(parsed.query or "")
                mode = (qs.get("mode") or ["completed"])[0].strip().lower()
                if mode not in {"completed", "scheduled"}:
                    self._write_json(400, {"ok": False, "error": "Invalid mode"}); return
                now = datetime.now()
                try:
                    year = int((qs.get("year") or [now.year])[0])
                except Exception:
                    year = now.year
                try:
                    month = int((qs.get("month") or [now.month])[0])
                except Exception:
                    month = now.month
                if month < 1 or month > 12:
                    self._write_json(400, {"ok": False, "error": "Invalid month"}); return

                import calendar
                from modules.scheduler import get_flattened_schedule, build_block_key as scheduler_build_block_key
                from modules.item_manager import read_item_data
                from utilities.happiness_assoc import infer_happiness_values

                def to_hm(val):
                    if not val:
                        return None
                    if isinstance(val, datetime):
                        return val.strftime("%H:%M")
                    try:
                        s = str(val).strip()
                    except Exception:
                        return None
                    if not s:
                        return None
                    # accept HH:MM anywhere
                    try:
                        parts = s.split(":")
                        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                            return f"{int(parts[0]):02d}:{int(parts[1]):02d}"
                    except Exception:
                        return None
                    return None

                def extract_happiness_from_data(data):
                    raw = None
                    if isinstance(data, dict):
                        raw = data.get("happiness")
                    if isinstance(raw, list):
                        return [str(v) for v in raw if v is not None and str(v).strip() != ""]
                    if isinstance(raw, str) and raw.strip():
                        return [raw.strip()]
                    return []

                def happiness_for_block(block):
                    if not isinstance(block, dict):
                        return []
                    raw_vals = extract_happiness_from_data(block)
                    if not raw_vals:
                        raw_vals = extract_happiness_from_data(block.get("original_item_data") or {})
                    item_type = block.get("type") or (block.get("original_item_data") or {}).get("type")
                    name = block.get("name") or (block.get("original_item_data") or {}).get("name")
                    if (not raw_vals) and item_type and name:
                        data = read_item_data(str(item_type).lower(), str(name))
                        if isinstance(data, dict):
                            raw_vals = extract_happiness_from_data(data)
                            inferred = infer_happiness_values(str(item_type).lower(), data)
                            for v in inferred:
                                if str(v).strip().lower() not in {str(x).strip().lower() for x in raw_vals}:
                                    raw_vals.append(v)
                    return raw_vals

                def load_schedule_blocks(date_obj):
                    date_str = date_obj.strftime("%Y-%m-%d")
                    sched_path = schedule_path_for_date(date_str)
                    if not os.path.exists(sched_path):
                        return []
                    try:
                        with open(sched_path, "r", encoding="utf-8") as fh:
                            schedule_data = yaml.safe_load(fh) or []
                    except Exception:
                        return []
                    return [b for b in get_flattened_schedule(schedule_data) if isinstance(b, dict) and not b.get("is_buffer")]

                def count_scheduled(date_obj):
                    blocks = load_schedule_blocks(date_obj)
                    total = 0
                    for block in blocks:
                        vals = happiness_for_block(block)
                        if vals:
                            total += max(1, len(vals))
                    return total

                def count_completed(date_obj):
                    date_str = date_obj.strftime("%Y-%m-%d")
                    comp_path = os.path.join(ROOT_DIR, "user", "Schedules", "completions", f"{date_str}.yml")
                    if not os.path.exists(comp_path):
                        return 0
                    try:
                        with open(comp_path, "r", encoding="utf-8") as fh:
                            comp = yaml.safe_load(fh) or {}
                    except Exception:
                        return 0
                    entries = comp.get("entries") if isinstance(comp, dict) else None
                    if not isinstance(entries, dict):
                        return 0
                    blocks = load_schedule_blocks(date_obj)
                    block_map = {}
                    for block in blocks:
                        name = block.get("name") or (block.get("original_item_data") or {}).get("name")
                        start = to_hm(block.get("start_time") or (block.get("original_item_data") or {}).get("start_time"))
                        if not name or not start:
                            continue
                        block_map[scheduler_build_block_key(str(name), start)] = block
                    total = 0
                    for _, entry in entries.items():
                        if not isinstance(entry, dict):
                            continue
                        status = str(entry.get("status", "")).strip().lower()
                        if status != "completed":
                            continue
                        name = entry.get("name")
                        start = to_hm(entry.get("scheduled_start"))
                        if not name or not start:
                            continue
                        block = block_map.get(scheduler_build_block_key(str(name), start))
                        if not block:
                            continue
                        vals = happiness_for_block(block)
                        if vals:
                            total += max(1, len(vals))
                    return total

                days_in_month = calendar.monthrange(year, month)[1]
                heatmap = {}
                max_score = 1
                for day in range(1, days_in_month + 1):
                    date_obj = datetime(year, month, day)
                    score = count_scheduled(date_obj) if mode == "scheduled" else count_completed(date_obj)
                    key = date_obj.strftime("%Y-%m-%d")
                    heatmap[key] = score
                    if score > max_score:
                        max_score = score
                norm = {k: (v / max_score if max_score else 0) for k, v in heatmap.items()}
                self._write_json(200, {"ok": True, "mode": mode, "year": year, "month": month, "heatmap": norm, "max": max_score})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Happiness overlay error: {e}"})
            return
        if parsed.path == "/api/logs":
            try:
                log_path = os.path.join(ROOT_DIR, "logs", "engine.log")
                if not os.path.exists(log_path):
                    self._write_json(200, {"ok": True, "logs": []})
                    return
                qs = parse_qs(parsed.query or "")
                limit = 50
                try:
                    limit = int((qs.get("limit") or [50])[0])
                except Exception:
                    pass
                lines = []
                with open(log_path, "r", encoding="utf-8") as f:
                    all_lines = f.readlines()
                    lines = [ln.strip() for ln in all_lines[-limit:]]
                self._write_json(200, {"ok": True, "logs": lines})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read logs: {e}"})
            return
        if parsed.path == "/api/yesterday/checkin":
            try:
                from modules.item_manager import list_all_items
                qs = parse_qs(parsed.query or "")
                date_raw = str((qs.get("date") or [""])[0] or "").strip()
                auto_miss_raw = str((qs.get("auto_miss") or ["true"])[0] or "true").strip().lower()
                auto_miss = auto_miss_raw not in ("0", "false", "no", "off")
                if date_raw:
                    try:
                        target_dt = datetime.strptime(date_raw, "%Y-%m-%d")
                    except Exception:
                        self._write_json(400, {"ok": False, "error": "Invalid date format; use YYYY-MM-DD"})
                        return
                else:
                    target_dt = datetime.now() - timedelta(days=1)
                target_date = target_dt.strftime("%Y-%m-%d")

                sched_path = schedule_path_for_date(target_date)
                schedule_data = []
                if os.path.exists(sched_path):
                    try:
                        with open(sched_path, "r", encoding="utf-8") as fh:
                            schedule_data = yaml.safe_load(fh) or []
                    except Exception:
                        schedule_data = []

                def _hm(value):
                    if value is None:
                        return None
                    if isinstance(value, datetime):
                        return value.strftime("%H:%M")
                    text = str(value)
                    m = re.search(r"(\d{1,2}):(\d{2})", text)
                    if not m:
                        return None
                    hh = max(0, min(23, int(m.group(1))))
                    mm = max(0, min(59, int(m.group(2))))
                    return f"{hh:02d}:{mm:02d}"

                def _is_window_or_meta(block):
                    try:
                        if bool(block.get("is_buffer")):
                            return True
                        block_id = str(block.get("block_id") or "").lower()
                        window_name = str(block.get("window_name") or "").strip().upper()
                        if block_id.startswith("window::"):
                            return True
                        # Keep true meta-only rows filtered, but do not blanket-drop TIMEBLOCK
                        # because user-authored timeblock entries are legitimate schedulables.
                        if window_name and window_name in ("GAP", "HIERARCHY"):
                            return True
                        if bool(block.get("window")):
                            return True
                    except Exception:
                        return False
                    return False

                flat = []
                # Local cycle-safe walker (avoids relying on upstream flatteners).
                def _walk(items, out, seen):
                    if not isinstance(items, list):
                        return
                    for it in items:
                        if not isinstance(it, dict):
                            continue
                        obj_id = id(it)
                        if obj_id in seen:
                            continue
                        seen.add(obj_id)
                        out.append(it)
                        children = it.get("children") or it.get("items") or []
                        if isinstance(children, list) and children:
                            _walk(children, out, seen)

                try:
                    if isinstance(schedule_data, list):
                        _walk(schedule_data, flat, set())
                    elif isinstance(schedule_data, dict):
                        root_items = (schedule_data.get("items") or schedule_data.get("children") or [])
                        if isinstance(root_items, list):
                            _walk(root_items, flat, set())
                except Exception:
                    flat = []

                scheduled_blocks = []
                for block in flat:
                    if not isinstance(block, dict):
                        continue
                    if _is_window_or_meta(block):
                        continue
                    children = block.get("children") or []
                    if isinstance(children, list) and children:
                        continue
                    name = str(block.get("name") or (block.get("original_item_data") or {}).get("name") or "").strip()
                    start = _hm(block.get("start_time") or (block.get("original_item_data") or {}).get("start_time") or block.get("ideal_start_time"))
                    end = _hm(block.get("end_time") or block.get("ideal_end_time"))
                    item_type = str(block.get("type") or (block.get("original_item_data") or {}).get("type") or "").strip().lower() or "task"
                    if not name or not start:
                        continue
                    key = build_block_key(name, start)
                    scheduled_blocks.append({
                        "key": key,
                        "name": name,
                        "type": item_type,
                        "scheduled_start": start,
                        "scheduled_end": end,
                    })

                completions_dir = os.path.join(ROOT_DIR, "user", "Schedules", "completions")
                os.makedirs(completions_dir, exist_ok=True)
                completion_path = os.path.join(completions_dir, f"{target_date}.yml")
                completion_payload = {"entries": {}}
                if os.path.exists(completion_path):
                    try:
                        with open(completion_path, "r", encoding="utf-8") as fh:
                            completion_payload = yaml.safe_load(fh) or {"entries": {}}
                    except Exception:
                        completion_payload = {"entries": {}}
                if not isinstance(completion_payload, dict):
                    completion_payload = {"entries": {}}
                entries = completion_payload.get("entries")
                if not isinstance(entries, dict):
                    entries = {}
                    completion_payload["entries"] = entries

                auto_added = 0
                if auto_miss:
                    now_iso = datetime.now().isoformat(timespec="seconds")
                    for block in scheduled_blocks:
                        key = str(block.get("key") or "")
                        if not key or key in entries:
                            continue
                        entries[key] = {
                            "name": block.get("name"),
                            "status": "missed",
                            "scheduled_start": block.get("scheduled_start"),
                            "scheduled_end": block.get("scheduled_end"),
                            "logged_at": now_iso,
                            "source": "auto_miss_yesterday",
                            "auto_missed": True,
                        }
                        auto_added += 1
                    if auto_added > 0:
                        with open(completion_path, "w", encoding="utf-8") as fh:
                            yaml.safe_dump(completion_payload, fh, default_flow_style=False, sort_keys=False, allow_unicode=True)

                rows = []
                for block in scheduled_blocks:
                    key = str(block.get("key") or "")
                    entry = entries.get(key) if isinstance(entries.get(key), dict) else {}
                    status = str(entry.get("status") or "missed").strip().lower()
                    rows.append({
                        "key": key,
                        "name": block.get("name"),
                        "type": block.get("type"),
                        "scheduled_start": block.get("scheduled_start"),
                        "scheduled_end": block.get("scheduled_end"),
                        "status": status,
                        "auto_missed": bool(entry.get("auto_missed") or entry.get("source") == "auto_miss_yesterday"),
                        "entry": entry,
                    })

                # Fallback: if we still have no scheduled rows but completion entries exist for the day,
                # surface those rows so the popup can still reconcile and not silently disappear.
                if not rows and isinstance(entries, dict) and entries:
                    for key, raw in entries.items():
                        entry = raw if isinstance(raw, dict) else {}
                        name = str(entry.get("name") or (str(key).split("@", 1)[0] if isinstance(key, str) else "Untitled")).strip()
                        start = _hm(entry.get("scheduled_start")) or (_hm(str(key).split("@", 1)[1]) if isinstance(key, str) and "@" in str(key) else None)
                        end = _hm(entry.get("scheduled_end"))
                        status = str(entry.get("status") or "missed").strip().lower()
                        rows.append({
                            "key": str(key),
                            "name": name or "Untitled",
                            "type": str(entry.get("type") or "task").strip().lower() or "task",
                            "scheduled_start": start,
                            "scheduled_end": end,
                            "status": status,
                            "auto_missed": bool(entry.get("auto_missed") or entry.get("source") == "auto_miss_yesterday"),
                            "entry": entry,
                        })

                allowed_schedulables = ["habit", "task", "routine", "subroutine", "microroutine", "timeblock"]
                schedulables = []
                def _add_sched(name, itype):
                    nm = str(name or "").strip()
                    tp = str(itype or "").strip().lower()
                    if not nm or not tp:
                        return
                    schedulables.append({"name": nm, "type": tp})

                for itype in allowed_schedulables:
                    try:
                        items = list_all_items(itype) or []
                    except Exception:
                        items = []
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        nm = str(item.get("name") or "").strip()
                        if not nm:
                            continue
                        _add_sched(nm, itype)
                # Window-like entries currently live on microroutines with `window:true`.
                try:
                    micros = list_all_items("microroutine") or []
                except Exception:
                    micros = []
                for item in micros:
                    if not isinstance(item, dict):
                        continue
                    nm = str(item.get("name") or "").strip()
                    if not nm:
                        continue
                    win = str(item.get("window") or "").strip().lower()
                    if win in ("true", "1", "yes", "on"):
                        _add_sched(nm, "window")

                # Include commitment-related target items so check-in can quickly log
                # things tied to active commitments.
                try:
                    commitments = list_all_items("commitment") or []
                except Exception:
                    commitments = []
                for c in commitments:
                    if not isinstance(c, dict):
                        continue
                    status = str(c.get("status") or "active").strip().lower()
                    if status not in ("", "active", "pending"):
                        continue
                    targets = c.get("targets") if isinstance(c.get("targets"), list) else []
                    if not targets:
                        assoc = c.get("associated_items") if isinstance(c.get("associated_items"), list) else []
                        forb = c.get("forbidden_items") if isinstance(c.get("forbidden_items"), list) else []
                        targets = assoc or forb
                    for t in targets:
                        if not isinstance(t, dict):
                            continue
                        _add_sched(t.get("name"), t.get("type"))

                    # Legacy singleton target patterns
                    freq = c.get("frequency") if isinstance(c.get("frequency"), dict) else {}
                    never = c.get("never") if isinstance(c.get("never"), dict) else {}
                    one = None
                    if isinstance(freq.get("of"), dict):
                        one = freq.get("of")
                    elif isinstance(never.get("of"), dict):
                        one = never.get("of")
                    if isinstance(one, dict):
                        _add_sched(one.get("name"), one.get("type"))
                    linked = c.get("linked_habit")
                    if isinstance(linked, str) and linked.strip():
                        _add_sched(linked.strip(), "habit")

                dedupe = {}
                for row in schedulables:
                    k = f"{str(row.get('type') or '').lower()}::{str(row.get('name') or '').lower()}"
                    dedupe[k] = row
                schedulables = sorted(
                    list(dedupe.values()),
                    key=lambda r: (str(r.get("type") or "").lower(), str(r.get("name") or "").lower())
                )

                self._write_json(200, {
                    "ok": True,
                    "date": target_date,
                    "schedule_path": sched_path,
                    "completion_path": completion_path,
                    "auto_miss_applied": bool(auto_miss),
                    "auto_missed_added": int(auto_added),
                    "scheduled_count": len(scheduled_blocks),
                    "rows": rows,
                    "schedulables": schedulables,
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Yesterday check-in error: {e}"})
            return
        if parsed.path == "/api/completions":
            try:
                qs = parse_qs(parsed.query or '')
                date_str = None
                start_str = None
                end_str = None
                days_raw = None
                if qs:
                    arr = qs.get('date') or []
                    if arr:
                        date_str = str(arr[0])
                    arr = qs.get('start') or []
                    if arr:
                        start_str = str(arr[0])
                    arr = qs.get('end') or []
                    if arr:
                        end_str = str(arr[0])
                    arr = qs.get('days') or []
                    if arr:
                        days_raw = str(arr[0])

                comp_dir = os.path.join(ROOT_DIR, 'user', 'Schedules', 'completions')

                def _read_completed_for_date(target_date: str):
                    comp_path = os.path.join(comp_dir, f"{target_date}.yml")
                    completed = []
                    if os.path.exists(comp_path):
                        try:
                            with open(comp_path, 'r', encoding='utf-8') as f:
                                d = yaml.safe_load(f) or {}
                            entries = d.get("entries") if isinstance(d, dict) else None
                            if isinstance(entries, dict):
                                for k, v in entries.items():
                                    entry = v if isinstance(v, dict) else {"status": v}
                                    status = str(entry.get("status", "")).strip().lower()
                                    if status == 'completed':
                                        name = entry.get("name")
                                        if not name and isinstance(k, str) and "@" in k:
                                            name = k.split("@", 1)[0]
                                        completed.append(str(name or k))
                        except Exception:
                            pass
                    return completed

                if start_str or end_str or days_raw:
                    # Range mode
                    if not start_str:
                        start_str = datetime.now().strftime('%Y-%m-%d')
                    try:
                        start_dt = datetime.strptime(start_str, '%Y-%m-%d')
                    except Exception:
                        start_dt = datetime.now()
                        start_str = start_dt.strftime('%Y-%m-%d')
                    if days_raw and not end_str:
                        try:
                            days = max(1, min(400, int(days_raw)))
                        except Exception:
                            days = 1
                        end_dt = start_dt + timedelta(days=days - 1)
                        end_str = end_dt.strftime('%Y-%m-%d')
                    if not end_str:
                        end_str = start_str
                    try:
                        end_dt = datetime.strptime(end_str, '%Y-%m-%d')
                    except Exception:
                        end_dt = start_dt
                        end_str = start_dt.strftime('%Y-%m-%d')
                    if end_dt < start_dt:
                        start_dt, end_dt = end_dt, start_dt
                        start_str = start_dt.strftime('%Y-%m-%d')
                        end_str = end_dt.strftime('%Y-%m-%d')
                    span_days = (end_dt - start_dt).days + 1
                    span_days = max(1, min(400, span_days))
                    completed_by_date = {}
                    for offset in range(span_days):
                        day = start_dt + timedelta(days=offset)
                        key = day.strftime('%Y-%m-%d')
                        completed_by_date[key] = _read_completed_for_date(key)
                    self._write_yaml(200, { 'ok': True, 'start': start_str, 'end': end_str, 'completed_by_date': completed_by_date })
                else:
                    # Default to today
                    if not date_str:
                        date_str = datetime.now().strftime('%Y-%m-%d')
                    completed = _read_completed_for_date(date_str)
                    self._write_yaml(200, { 'ok': True, 'date': date_str, 'completed': completed })
            except Exception as e:
                self._write_yaml(500, { 'ok': False, 'error': f'Completions error: {e}' })
            return
        if parsed.path == "/api/today":
            # Return simplified blocks for today's schedule as YAML { ok, blocks }
            date_str = datetime.now().strftime('%Y-%m-%d')
            sched_path = schedule_path_for_date(date_str)
            if not os.path.exists(sched_path):
                self._write_yaml(404, {"ok": False, "error": "schedule file not found"})
                return
            try:
                with open(sched_path, 'r', encoding='utf-8') as f:
                    schedule_data = yaml.safe_load(f) or []

                # Flatten into simple blocks with HH:MM strings
                import re

                def parse_hm(val):
                    if not val:
                        return None
                    s = str(val)
                    m = re.search(r"(\d{1,2}):(\d{2})", s)
                    if not m:
                        return None
                    h = int(m.group(1))
                    mnt = int(m.group(2))
                    h = max(0, min(23, h))
                    mnt = max(0, min(59, mnt))
                    return f"{h:02d}:{mnt:02d}"

                blocks = []

                def is_parallel(it: dict) -> bool:
                    try:
                        if it.get('is_parallel_item'):
                            return True
                        orig = it.get('original_item_data') or {}
                        return str(orig.get('duration','')).strip().lower() == 'parallel'
                    except Exception:
                        return False
                
                def is_anchored(it: dict) -> bool:
                    try:
                        if it.get('anchored'):
                            return True
                        reschedule = it.get('reschedule')
                        if isinstance(reschedule, str) and reschedule.strip().lower() == 'never':
                            return True
                        orig = it.get('original_item_data') or {}
                        res_orig = orig.get('reschedule')
                        if isinstance(res_orig, str) and res_orig.strip().lower() == 'never':
                            return True
                    except Exception:
                        return False
                    return False

                def walk(items, depth=0):
                    if not items:
                        return
                    for order_idx, it in enumerate(items):
                        if not isinstance(it, dict):
                            continue
                        name = it.get('name') or (it.get('original_item_data') or {}).get('name') or ''
                        item_type = it.get('type') or (it.get('original_item_data') or {}).get('type') or ''
                        st = it.get('start_time') or (it.get('original_item_data') or {}).get('start_time') or it.get('ideal_start_time')
                        et = it.get('end_time') or it.get('ideal_end_time')
                        start_s = parse_hm(st)
                        end_s = parse_hm(et)
                        if start_s and end_s:
                            block_id = str(it.get('block_id') or '')
                            window_name = str(it.get('window_name') or '')
                            is_window = bool(it.get('window')) or block_id.lower().startswith('window::') or window_name.strip().upper() not in ('', 'GAP', 'ANCHOR', 'HIERARCHY', 'TIMEBLOCK')
                            blocks.append({
                                'start': start_s,
                                'end': end_s,
                                'text': str(name),
                                'type': str(item_type).lower(),
                                'depth': int(depth),
                                'is_parallel': bool(is_parallel(it)),
                                'anchored': bool(is_anchored(it)),
                                'reschedule': str(it.get('reschedule') or (it.get('original_item_data') or {}).get('reschedule') or ''),
                                'order': int(order_idx),
                                'block_id': block_id,
                                'window_name': window_name,
                                'window': is_window,
                            })
                        # Recurse children if present
                        child_list = it.get('children') or it.get('items') or []
                        if isinstance(child_list, list):
                            walk(child_list, depth+1)

                if isinstance(schedule_data, list):
                    walk(schedule_data, depth=0)
                elif isinstance(schedule_data, dict):
                    walk((schedule_data.get('items') or schedule_data.get('children') or []), depth=0)

                self._write_yaml(200, {"ok": True, "blocks": blocks})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Failed to read schedule: {e}"})
            return
        if parsed.path == "/api/week":
            try:
                qs = parse_qs(parsed.query or "")
                days = int(qs.get('days', ['7'])[0])
                days = max(1, min(14, days))
                start_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

                import re
                def parse_hm(val):
                    if not val:
                        return None
                    s = str(val)
                    m = re.search(r"(\d{1,2}):(\d{2})", s)
                    if not m:
                        return None
                    h = int(m.group(1))
                    mnt = int(m.group(2))
                    h = max(0, min(23, h))
                    mnt = max(0, min(59, mnt))
                    return f"{h:02d}:{mnt:02d}"

                def is_parallel(it: dict) -> bool:
                    try:
                        if it.get('is_parallel_item'):
                            return True
                        orig = it.get('original_item_data') or {}
                        return str(orig.get('duration', '')).strip().lower() == 'parallel'
                    except Exception:
                        return False
                
                def is_anchored(it: dict) -> bool:
                    try:
                        if it.get('anchored'):
                            return True
                        reschedule = it.get('reschedule')
                        if isinstance(reschedule, str) and reschedule.strip().lower() == 'never':
                            return True
                        orig = it.get('original_item_data') or {}
                        res_orig = orig.get('reschedule')
                        if isinstance(res_orig, str) and res_orig.strip().lower() == 'never':
                            return True
                    except Exception:
                        return False
                    return False

                def flatten(schedule_data):
                    blocks = []
                    def walk(items, depth=0):
                        if not items:
                            return
                        for order_idx, it in enumerate(items):
                            if not isinstance(it, dict):
                                continue
                            name = it.get('name') or (it.get('original_item_data') or {}).get('name') or ''
                            item_type = it.get('type') or (it.get('original_item_data') or {}).get('type') or ''
                            st = it.get('start_time') or (it.get('original_item_data') or {}).get('start_time') or it.get('ideal_start_time')
                            et = it.get('end_time') or it.get('ideal_end_time')
                            start_s = parse_hm(st)
                            end_s = parse_hm(et)
                            if start_s and end_s:
                                block_id = str(it.get('block_id') or '')
                                window_name = str(it.get('window_name') or '')
                                is_window = bool(it.get('window')) or block_id.lower().startswith('window::') or window_name.strip().upper() not in ('', 'GAP', 'ANCHOR', 'HIERARCHY', 'TIMEBLOCK')
                                blocks.append({
                                    'start': start_s,
                                    'end': end_s,
                                    'text': str(name),
                                    'type': str(item_type).lower(),
                                    'depth': int(depth),
                                    'is_parallel': bool(is_parallel(it)),
                                    'anchored': bool(is_anchored(it)),
                                    'reschedule': str(it.get('reschedule') or (it.get('original_item_data') or {}).get('reschedule') or ''),
                                    'order': int(order_idx),
                                    'block_id': block_id,
                                    'window_name': window_name,
                                    'window': is_window,
                                })
                            child_list = it.get('children') or it.get('items') or []
                            if isinstance(child_list, list):
                                walk(child_list, depth + 1)
                    if isinstance(schedule_data, list):
                        walk(schedule_data, depth=0)
                    elif isinstance(schedule_data, dict):
                        walk((schedule_data.get('items') or schedule_data.get('children') or []), depth=0)
                    return blocks

                from modules.planner import build_preview_for_date

                days_payload = []
                for offset in range(days):
                    date_obj = start_date + timedelta(days=offset)
                    label = date_obj.strftime('%A')
                    if offset == 0:
                        sched_path = schedule_path_for_date(date_obj)
                        sched_data = []
                        if os.path.exists(sched_path):
                            try:
                                with open(sched_path, 'r', encoding='utf-8') as f:
                                    sched_data = yaml.safe_load(f) or []
                            except Exception:
                                sched_data = []
                        blocks = flatten(sched_data)
                        # Keep today's column populated even when today's schedule file
                        # has not been generated yet (or is temporarily empty).
                        if not blocks:
                            preview, _conflicts = build_preview_for_date(date_obj, show_warnings=False)
                            blocks = flatten(preview or [])
                    else:
                        preview, _conflicts = build_preview_for_date(date_obj, show_warnings=False)
                        blocks = flatten(preview or [])
                    days_payload.append({
                        "date": date_obj.strftime('%Y-%m-%d'),
                        "label": label,
                        "blocks": blocks,
                    })

                self._write_json(200, {"ok": True, "days": days_payload})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to build week view: {e}"})
            return
        # Serve project Assets under /assets/ (case-insensitive URL segment)
        path_l = parsed.path.lower()
        # Serve project Temp files under /temp/ (case-insensitive URL segment)
        if path_l.startswith("/temp/"):
            try:
                _first, _second, rel = parsed.path.split('/', 2)
            except ValueError:
                rel = ''
            temp_root = os.path.join(ROOT_DIR, 'Temp')
            fpath = os.path.abspath(os.path.join(temp_root, rel))
            if not fpath.startswith(os.path.abspath(temp_root)):
                self.send_response(403)
                self.end_headers()
                return
            if not os.path.exists(fpath) or not os.path.isfile(fpath):
                self.send_response(404)
                self.end_headers()
                return
            ctype = 'application/octet-stream'
            fl = fpath.lower()
            if fl.endswith('.js'): ctype = 'application/javascript; charset=utf-8'
            elif fl.endswith('.json'): ctype = 'application/json; charset=utf-8'
            elif fl.endswith('.txt') or fl.endswith('.log'): ctype = 'text/plain; charset=utf-8'
            try:
                with open(fpath, 'rb') as fh:
                    data = fh.read()
                self.send_response(200)
                self._set_cors()
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                self.send_response(500)
                self.end_headers()
            return
        
        if path_l.startswith("/assets/"):
            # Extract relative path after the first '/assets/' segment preserving original case
            try:
                first, second, rel = parsed.path.split('/', 2)
                # first is '' (leading slash), second is 'assets' (any case), rel is the remainder
            except ValueError:
                rel = ''
            assets_root = os.path.join(ROOT_DIR, 'assets')
            fpath = os.path.abspath(os.path.join(assets_root, rel))
            # Prevent path traversal
            if not fpath.startswith(os.path.abspath(assets_root)):
                self.send_response(403)
                self.end_headers()
                return
            if not os.path.exists(fpath) or not os.path.isfile(fpath):
                self.send_response(404)
                self.end_headers()
                return
            # Minimal content-type detection
            ctype = 'application/octet-stream'
            if fpath.lower().endswith('.png'): ctype = 'image/png'
            elif fpath.lower().endswith('.jpg') or fpath.lower().endswith('.jpeg'): ctype = 'image/jpeg'
            elif fpath.lower().endswith('.svg'): ctype = 'image/svg+xml'
            elif fpath.lower().endswith('.ico'): ctype = 'image/x-icon'
            try:
                with open(fpath, 'rb') as fh:
                    data = fh.read()
                self.send_response(200)
                self._set_cors()
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                self.send_response(500)
                self.end_headers()
            return
        
        # /api/items - List items by type (for Item Manager widget)
        if parsed.path == "/api/items":
            sys.stderr.write(f"DEBUG: /api/items handler hit, query={parsed.query}\n")
            sys.stderr.flush()
            try:
                qs = parse_qs(parsed.query or "")
                item_type = (qs.get("type") or ["task"])[0]
                search_q = (qs.get("q") or [""])[0].lower()
                sys.stderr.write(f"DEBUG: /api/items type={item_type}, search={search_q}\n")
                sys.stderr.flush()
                
                list_all_items, read_item_data, write_item_data, delete_item, get_item_path = im()
                all_items = list_all_items(item_type) or []
                sys.stderr.write(f"DEBUG: /api/items list_all_items returned {len(all_items)} items\n")
                sys.stderr.flush()
                results = []
                for raw in all_items:
                    if not isinstance(raw, dict):
                        continue
                    name = raw.get("name") or ""
                    # Search filter
                    if search_q:
                        name_match = search_q in name.lower()
                        content_match = False
                        for v in raw.values():
                            if isinstance(v, str) and search_q in v.lower():
                                content_match = True
                                break
                        if not name_match and not content_match:
                            continue
                    # Format item
                    updated = raw.get("updated") or raw.get("last_updated") or raw.get("created") or ""
                    results.append({
                        "name": name,
                        "type": raw.get("type") or item_type,
                        "priority": raw.get("priority") or "",
                        "status": raw.get("status") or "",
                        "category": raw.get("category") or "",
                        "updated": str(updated)[:10] if updated else "",
                    })
                self._write_json(200, {"ok": True, "items": results})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to list items: {e}"})
            return
        
        # /api/item - Get single item content (for Item Manager widget)
        if parsed.path == "/api/item":
            try:
                qs = parse_qs(parsed.query or "")
                item_type = (qs.get("type") or ["task"])[0]
                name = (qs.get("name") or [""])[0]
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing name"})
                    return
                list_all_items, read_item_data, write_item_data, delete_item, get_item_path = im()
                data = read_item_data(item_type, name)
                if data is None:
                    self._write_json(404, {"ok": False, "error": "Item not found"})
                    return
                # Serialize to YAML
                content = yaml.safe_dump(data, allow_unicode=True, sort_keys=False) if isinstance(data, dict) else str(data)
                self._write_json(200, {"ok": True, "content": content, "item": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to get item: {e}"})
            return
        
        if parsed.path == "/api/editor":
            try:
                qs = parse_qs(parsed.query or "")
                path_arg = (qs.get("path") or [""])[0].strip()
                # Security: allow access only to user/, scripts/
                # Logic: resolve path absolute, check if starts with ROOT_DIR
                target_path = os.path.abspath(os.path.join(ROOT_DIR, path_arg))
                if not target_path.startswith(ROOT_DIR):
                    self._write_json(403, {"ok": False, "error": "Forbidden path"})
                    return
                
                if os.path.isdir(target_path):
                    # List contents (simple top-level for now, client can traverse)
                    entries = []
                    for fn in os.listdir(target_path):
                        full = os.path.join(target_path, fn)
                        is_dir = os.path.isdir(full)
                        entries.append({
                            "name": fn,
                            "is_dir": is_dir
                        })
                    entries.sort(key=lambda x: (not x['is_dir'], x['name'].lower()))
                    # Provide relative path for client
                    rel = os.path.relpath(target_path, ROOT_DIR)
                    if rel == ".": rel = ""
                    self._write_json(200, {"ok": True, "type": "directory", "path": rel, "entries": entries})
                elif os.path.isfile(target_path):
                    enc = (qs.get("encoding") or ["utf-8"])[0].strip()
                    try:
                        with open(target_path, 'r', encoding=enc, errors='replace') as f:
                            content = f.read()
                    except LookupError:
                        # Fallback if invalid encoding
                        with open(target_path, 'r', encoding='utf-8', errors='replace') as f:
                            content = f.read()
                    
                    rel = os.path.relpath(target_path, ROOT_DIR)
                    self._write_json(200, {"ok": True, "type": "file", "path": rel, "content": content, "encoding": enc})
                else:
                    self._write_json(404, {"ok": False, "error": "Path not found"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Editor error: {e}"})
            return
        if parsed.path == "/api/editor/open-request":
            try:
                req = _editor_open_request_pop()
                self._write_json(200, {"ok": True, "request": req})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Editor open request error: {e}"})
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(length) if length > 0 else b''
        text = raw.decode('utf-8', errors='replace')

        # Parse YAML payload
        try:
            payload = yaml.safe_load(text) or {}
        except Exception as e:
            self._write_yaml(400, {"ok": False, "error": f"Invalid YAML: {e}"})
            return

        if parsed.path == "/api/aduc/chat":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"})
                    return
                familiar = str(payload.get("familiar") or "nia").strip() or "nia"
                message = str(payload.get("message") or "").strip()
                if not message:
                    self._write_json(400, {"ok": False, "error": "Missing message"})
                    return
                aduc_payload = {"familiar": familiar, "message": message}
                status, body = _aduc_proxy_request("/chat", method="POST", payload=aduc_payload)
                self._write_json(status, body if isinstance(body, dict) else {"ok": False, "error": "Invalid ADUC response"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to send ADUC chat: {e}"})
            return
        if parsed.path == "/api/aduc/settings":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"})
                    return
                status, body = _aduc_proxy_request("/settings", method="POST", payload=payload)
                self._write_json(status, body if isinstance(body, dict) else {"ok": False, "error": "Invalid ADUC response"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to update ADUC settings: {e}"})
            return
        if parsed.path == "/api/aduc/cli/memory/clear":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"})
                    return
                status, body = _aduc_proxy_request("/cli/memory/clear", method="POST", payload=payload)
                self._write_json(status, body if isinstance(body, dict) else {"ok": False, "error": "Invalid ADUC response"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to clear ADUC memory: {e}"})
            return

        if parsed.path == "/api/shell/exec":
            # Execute arbitrary shell command
            # Security Warning: This allows full shell access
            cmd = str(payload.get('cmd') or '').strip()
            if not cmd:
                self._write_json(400, {"ok": False, "error": "Missing 'cmd'"})
                return
            
            import subprocess
            try:
                # Use subprocess to run command
                # Capture output
                # Use shell=True for convenience in this local env, though risky in prod
                # Combined stdout/stderr? Or separate?
                
                # Check for 'python' and redirect to sys.executable if needed?
                # Actually, let's just run it.
                
                proc = subprocess.run(
                    cmd, 
                    shell=True, 
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE,
                    text=True
                )
                
                self._write_json(200, {
                    "ok": proc.returncode == 0, 
                    "stdout": proc.stdout, 
                    "stderr": proc.stderr,
                    "code": proc.returncode
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Exec failed: {e}"})
            return

        if parsed.path == "/api/system/command":
            # Simple wrapper to run a full command string
            cmd_str = str(payload.get('command') or '').strip()
            if not cmd_str:
                self._write_json(400, {"ok": False, "error": "Missing command"})
                return
            import shlex
            try:
                parts = shlex.split(cmd_str)
            except Exception as e:
                self._write_json(400, {"ok": False, "error": f"Invalid command format: {e}"}); return
            
            if not parts:
                self._write_json(400, {"ok": False, "error": "Empty command"}); return
            
            ok, out, err = run_console_command(parts[0], parts[1:])
            self._write_json(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err, "message": out})
            return

        if parsed.path == "/api/system/databases":
            # List configured databases (registry + any orphan .db files)
            try:
                databases = _list_system_databases()
                self._write_json(200, {"ok": True, "databases": databases})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": str(e)})
            return

        if parsed.path == "/api/system/registries":
            # List available registry types
            registries = [
                {"name": "wizards", "description": "Wizard Registry"},
                {"name": "themes", "description": "Theme Registry"},
                {"name": "commands", "description": "Command Registry"},
                {"name": "item_types", "description": "Item Types Registry"}
            ]
            self._write_json(200, {"ok": True, "registries": registries})
            return

        if parsed.path == "/api/cli":
            # Expected payload: {command: str, args: [..], properties: {k:v}}
            cmd = str(payload.get('command', '')).strip()
            if not cmd:
                self._write_yaml(400, {"ok": False, "error": "Missing 'command'"})
                return
            args = payload.get('args') or []
            if not isinstance(args, list):
                self._write_yaml(400, {"ok": False, "error": "'args' must be a list"})
                return
            props = payload.get('properties') or {}
            if not isinstance(props, dict):
                self._write_yaml(400, {"ok": False, "error": "'properties' must be a map"})
                return

            # Pass args and properties separately. Appending property tokens into args
            # breaks commands that parse colon syntax from positional arguments (e.g. mark).
            ok, out, err = run_console_command(cmd, args, props)
            status = 200 if ok else 500
            self._write_json(status, {"ok": ok, "stdout": out, "stderr": err})
            return

        if parsed.path == "/api/yesterday/checkin":
            try:
                date_raw = str(payload.get("date") or "").strip()
                if date_raw:
                    try:
                        target_dt = datetime.strptime(date_raw, "%Y-%m-%d")
                    except Exception:
                        self._write_json(400, {"ok": False, "error": "Invalid date format; use YYYY-MM-DD"})
                        return
                else:
                    target_dt = datetime.now() - timedelta(days=1)
                target_date = target_dt.strftime("%Y-%m-%d")

                completions_dir = os.path.join(ROOT_DIR, "user", "Schedules", "completions")
                os.makedirs(completions_dir, exist_ok=True)
                completion_path = os.path.join(completions_dir, f"{target_date}.yml")
                completion_payload = {"entries": {}}
                if os.path.exists(completion_path):
                    try:
                        with open(completion_path, "r", encoding="utf-8") as fh:
                            completion_payload = yaml.safe_load(fh) or {"entries": {}}
                    except Exception:
                        completion_payload = {"entries": {}}
                if not isinstance(completion_payload, dict):
                    completion_payload = {"entries": {}}
                entries = completion_payload.get("entries")
                if not isinstance(entries, dict):
                    entries = {}
                    completion_payload["entries"] = entries

                updates = payload.get("updates") if isinstance(payload.get("updates"), list) else []
                additional = payload.get("additional") if isinstance(payload.get("additional"), list) else []
                allowed_statuses = {"completed", "partial", "skipped", "missed", "cancelled"}

                def _hm(value):
                    if value is None:
                        return None
                    if isinstance(value, datetime):
                        return value.strftime("%H:%M")
                    text = str(value)
                    m = re.search(r"(\d{1,2}):(\d{2})", text)
                    if not m:
                        return None
                    hh = max(0, min(23, int(m.group(1))))
                    mm = max(0, min(59, int(m.group(2))))
                    return f"{hh:02d}:{mm:02d}"

                updated_count = 0
                added_count = 0
                errors = []

                for row in updates:
                    if not isinstance(row, dict):
                        continue
                    name = str(row.get("name") or "").strip()
                    key = str(row.get("key") or "").strip()
                    start = _hm(row.get("scheduled_start"))
                    end = _hm(row.get("scheduled_end"))
                    status = str(row.get("status") or "").strip().lower()
                    if status not in allowed_statuses:
                        continue
                    if not key and (not name or not start):
                        continue
                    existing = entries.get(key) if isinstance(entries.get(key), dict) else {}
                    if not name:
                        name = str(existing.get("name") or key.split("@", 1)[0] or "").strip()
                    if not start:
                        start = _hm(existing.get("scheduled_start")) or _hm(key.split("@", 1)[1] if "@" in key else None)
                    if not end:
                        end = _hm(existing.get("scheduled_end"))
                    if not name or not start or not end:
                        continue
                    did_props = {
                        "date": target_date,
                        "start_time": start,
                        "end_time": end,
                        "status": status,
                        "source": "yesterday_checkin",
                    }
                    actual_start = _hm(row.get("actual_start")) if row.get("actual_start") is not None else None
                    actual_end = _hm(row.get("actual_end")) if row.get("actual_end") is not None else None
                    if actual_start:
                        did_props["actual_start"] = actual_start
                    if actual_end:
                        did_props["actual_end"] = actual_end
                    note = row.get("note")
                    if isinstance(note, str) and note.strip():
                        did_props["note"] = note.strip()
                    quality = row.get("quality")
                    if isinstance(quality, str) and quality.strip():
                        did_props["quality"] = quality.strip()
                    ok, out, err = run_console_command("did", [name], did_props)
                    if ok:
                        updated_count += 1
                    else:
                        errors.append({"name": name, "kind": "update", "stdout": out, "stderr": err})

                for row in additional:
                    if not isinstance(row, dict):
                        continue
                    name = str(row.get("name") or "").strip()
                    item_type = str(row.get("type") or "task").strip().lower()
                    status = str(row.get("status") or "completed").strip().lower()
                    if not name or status not in allowed_statuses:
                        continue
                    start = _hm(row.get("scheduled_start")) or _hm(row.get("actual_start")) or "00:00"
                    end = _hm(row.get("scheduled_end")) or _hm(row.get("actual_end")) or start
                    did_props = {
                        "date": target_date,
                        "start_time": start,
                        "end_time": end,
                        "status": status,
                        "type": item_type,
                        "source": "yesterday_checkin_additional",
                        "additional": True,
                    }
                    did_props["actual_start"] = _hm(row.get("actual_start")) or start
                    did_props["actual_end"] = _hm(row.get("actual_end")) or end
                    note = row.get("note")
                    if isinstance(note, str) and note.strip():
                        did_props["note"] = note.strip()
                    quality = row.get("quality")
                    if isinstance(quality, str) and quality.strip():
                        did_props["quality"] = quality.strip()
                    ok, out, err = run_console_command("did", [name], did_props)
                    if ok:
                        added_count += 1
                    else:
                        errors.append({"name": name, "kind": "additional", "stdout": out, "stderr": err})

                # Read back current total after CLI writes.
                total_entries = 0
                try:
                    if os.path.exists(completion_path):
                        with open(completion_path, "r", encoding="utf-8") as fh:
                            refreshed = yaml.safe_load(fh) or {}
                        refreshed_entries = refreshed.get("entries") if isinstance(refreshed, dict) else {}
                        if isinstance(refreshed_entries, dict):
                            total_entries = len(refreshed_entries)
                except Exception:
                    total_entries = 0

                overall_ok = len(errors) == 0
                self._write_json(200 if overall_ok else 207, {
                    "ok": overall_ok,
                    "date": target_date,
                    "completion_path": completion_path,
                    "updated": int(updated_count),
                    "added_additional": int(added_count),
                    "total_entries": int(total_entries),
                    "errors": errors,
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Yesterday check-in save failed: {e}"})
            return

        if parsed.path == "/api/commitments/override":
            try:
                from modules.item_manager import read_item_data, write_item_data
                name = str(payload.get('name') or '').strip()
                state = str(payload.get('state') or '').strip().lower()
                date_key = str(payload.get('date') or datetime.now().strftime('%Y-%m-%d')).strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing commitment name"})
                    return
                if state not in ('met', 'violation', 'clear'):
                    self._write_json(400, {"ok": False, "error": "State must be met, violation, or clear"})
                    return
                data = read_item_data('commitment', name)
                if not isinstance(data, dict):
                    self._write_json(404, {"ok": False, "error": "Commitment not found"})
                    return
                manual_map = data.get('manual_status_by_date') if isinstance(data.get('manual_status_by_date'), dict) else {}
                if state == 'clear':
                    manual_map.pop(date_key, None)
                else:
                    manual_map[date_key] = state
                data['manual_status_by_date'] = manual_map
                write_item_data('commitment', name, data)
                self._write_json(200, {"ok": True, "name": name, "date": date_key, "state": state})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Commitment override failed: {e}"})
            return

        if parsed.path == "/api/link/board":
            if not _link_auth_ok(self.headers):
                self._write_json(401, {"ok": False, "error": "Unauthorized"})
                return
            try:
                name = str(payload.get("name") or "").strip()
                content = payload.get("content") or {}
                if not name and isinstance(content, dict):
                    name = str(content.get("name") or "").strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing name"})
                    return
                if not isinstance(content, dict):
                    self._write_json(400, {"ok": False, "error": "Invalid content"})
                    return
                content["type"] = "canvas_board"
                content["name"] = name
                from modules.item_manager import write_item_data
                write_item_data("canvas_board", name, content)
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Save failed: {e}"})
            return

        if parsed.path.startswith("/api/datacards/"):
            # /api/datacards/...
            try:
                from modules import data_card_manager as DataCardManager
                subpath = parsed.path[len("/api/datacards/"):]
                
                # GET /api/datacards/series
                if subpath == "series":
                    series = DataCardManager.get_series_list()
                    self._write_json(200, {"ok": True, "series": series})
                    return

                # POST /api/datacards/import
                if subpath == "import" and self.command == "POST":
                    length = int(self.headers.get('Content-Length', 0))
                    body = self.rfile.read(length).decode('utf-8')
                    try:
                        payload = json.loads(body)
                        itype = payload.get("item_type")
                        iname = payload.get("item_name")
                        target_series = payload.get("series")
                        mapping = payload.get("mapping")
                        
                        ok, msg = DataCardManager.import_from_item(itype, iname, target_series, mapping)
                        self._write_json(200 if ok else 400, {"ok": ok, "message": msg})
                    except Exception as e:
                        self._write_json(500, {"ok": False, "error": str(e)})
                    return

                # /api/datacards/:series/cards
                # /api/datacards/:series/rules
                parts = subpath.split('/')
                if len(parts) >= 2:
                    series_name = parts[0]
                    action = parts[1]
                    
                    if action == "cards":
                        if self.command == "POST":
                            # Save card
                            length = int(self.headers.get('Content-Length', 0))
                            body = self.rfile.read(length).decode('utf-8')
                            payload = json.loads(body)
                            cid = payload.get("id") or "new_card"
                            DataCardManager.save_card(series_name, cid, payload)
                            self._write_json(200, {"ok": True})
                            return
                        else:
                            # List cards
                            cards = DataCardManager.get_cards(series_name)
                            self._write_json(200, {"ok": True, "cards": cards})
                            return

                    if action == "rules":
                        if self.command == "POST":
                             # Save rules
                            length = int(self.headers.get('Content-Length', 0))
                            body = self.rfile.read(length).decode('utf-8')
                            payload = json.loads(body)
                            DataCardManager.save_series_rules(series_name, payload)
                            self._write_json(200, {"ok": True})
                            return
                        else:
                            rules = DataCardManager.get_series_rules(series_name)
                            self._write_json(200, {"ok": True, "rules": rules})
                            return
                            
                    if action == "visualize":
                        # GET /api/datacards/:series/visualize
                        # Return matrix-compatible data
                        cards = DataCardManager.get_cards(series_name)
                        rules = DataCardManager.get_series_rules(series_name)
                        limit = 200 # Safety limit
                        
                        # Flatten for Matrix
                        self._write_json(200, {"ok": True, "dataset": cards[:limit], "config": rules.get("visualization", {})})
                        return

            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"DataCard error: {e}"})
            return

        if parsed.path == "/api/media/mp3/upload":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                filename = _sanitize_media_filename(payload.get("filename") or payload.get("name") or "track.mp3")
                data_field = payload.get("data")
                if not data_field:
                    self._write_json(400, {"ok": False, "error": "Missing base64 data"}); return
                if "," in data_field:
                    data_field = data_field.split(",", 1)[1]
                try:
                    file_bytes = base64.b64decode(data_field)
                except Exception as e:
                    self._write_json(400, {"ok": False, "error": f"Invalid base64 payload: {e}"}); return
                overwrite = bool(payload.get("overwrite"))
                _ensure_media_dirs()
                path = os.path.join(MP3_DIR, filename)
                if os.path.exists(path) and not overwrite:
                    self._write_json(409, {"ok": False, "error": "File already exists"}); return
                with open(path, "wb") as fh:
                    fh.write(file_bytes)
                tracks = _list_mp3_files()
                track = next((t for t in tracks if t.get("file") == filename), {"file": filename})
                self._write_json(200, {"ok": True, "track": track})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Upload failed: {e}"})
            return

        if parsed.path == "/api/media/mp3/delete":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                file_name = (payload.get("file") or payload.get("filename") or "").strip()
                if not file_name:
                    self._write_json(400, {"ok": False, "error": "Missing file name"}); return
                target = os.path.abspath(os.path.join(MP3_DIR, file_name))
                if not target.startswith(os.path.abspath(MP3_DIR)):
                    self._write_json(403, {"ok": False, "error": "Forbidden"}); return
                if not os.path.exists(target):
                    self._write_json(404, {"ok": False, "error": "File not found"}); return
                os.remove(target)
                try:
                    _remove_track_from_playlists(file_name)
                except Exception:
                    pass
                self._write_json(200, {"ok": True})

            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Delete failed: {e}"})
            return

        if parsed.path == "/api/editor":
            try:
                path_arg = str(payload.get("path") or "").strip()
                content = payload.get("content")
                if not path_arg:
                    self._write_json(400, {"ok": False, "error": "Missing path"}); return
                
                target_path = os.path.abspath(os.path.join(ROOT_DIR, path_arg))
                if not target_path.startswith(ROOT_DIR):
                    self._write_json(403, {"ok": False, "error": "Forbidden path"}); return
                
                # Check for directory traversal or critical files if needed
                # For now just save
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                enc = str(payload.get("encoding") or "utf-8").strip()
                try:
                    with open(target_path, 'w', encoding=enc) as f:
                        f.write(content if content is not None else "")
                except LookupError:
                    # Fallback
                    with open(target_path, 'w', encoding='utf-8') as f:
                        f.write(content if content is not None else "")

                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Save failed: {e}"})
            return
        if parsed.path == "/api/editor/open-request":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                path_value = str(payload.get("path") or "").strip()
                if not path_value:
                    self._write_json(400, {"ok": False, "error": "Missing path"}); return
                line_value = payload.get("line")
                ok = _editor_open_request_write(path_value, line_value)
                self._write_json(200 if ok else 400, {"ok": bool(ok)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Editor open request write failed: {e}"})
            return

        if parsed.path == "/api/media/playlists/save":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                name = (payload.get("name") or "").strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing playlist name"}); return
                existing = {p["slug"] for p in _list_playlists()}
                slug = (payload.get("slug") or payload.get("name") or "").strip()
                slug = slug if slug in existing else _playlist_slug(slug or name, existing if slug not in existing else None)
                tracks_payload = payload.get("tracks") or []
                tracks = []
                for entry in tracks_payload:
                    if isinstance(entry, str):
                        tracks.append({"file": entry})
                        continue
                    if isinstance(entry, dict):
                        file_name = entry.get("file") or entry.get("name")
                        if not file_name:
                            continue
                        row = {"file": file_name}
                        for key in ("title", "artist", "album", "length", "cover"):
                            if entry.get(key) is not None:
                                row[key] = entry.get(key)
                        tracks.append(row)
                payload_map = {
                    "name": name,
                    "description": payload.get("description"),
                    "tracks": tracks,
                }
                if "shuffle" in payload:
                    payload_map["shuffle"] = bool(payload.get("shuffle"))
                if "repeat" in payload:
                    payload_map["repeat"] = payload.get("repeat")
                _write_playlist(slug, payload_map)
                self._write_json(200, {"ok": True, "slug": slug})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Playlist save failed: {e}"})
            return

        if parsed.path == "/api/media/playlists/delete":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                slug = (payload.get("slug") or payload.get("name") or "").strip()
                if not slug:
                    self._write_json(400, {"ok": False, "error": "Missing playlist slug"}); return
                if slug == DEFAULT_PLAYLIST_SLUG:
                    self._write_json(400, {"ok": False, "error": "Cannot delete default playlist"}); return
                path = _playlist_path(slug)
                if not os.path.exists(path):
                    self._write_json(404, {"ok": False, "error": "Playlist not found"}); return
                os.remove(path)
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Playlist delete failed: {e}"})
            return
        if parsed.path == "/api/sticky-notes":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                content = str(payload.get('content') or payload.get('text') or '').rstrip()
                if not content:
                    self._write_json(400, {"ok": False, "error": "Content is required"}); return
                desired_name = str(payload.get('name') or payload.get('title') or '').strip()
                if not desired_name:
                    desired_name = _generate_sticky_name()
                desired_name = desired_name[:160] or _generate_sticky_name()
                name = _ensure_unique_item_name('note', desired_name)
                color = _coerce_sticky_color(payload.get('color'))
                pinned = _normalize_bool(payload.get('pinned'))
                category = str(payload.get('category') or '').strip()
                priority = str(payload.get('priority') or '').strip()
                from modules.item_manager import write_item_data
                note_data = {
                    'name': name,
                    'type': 'note',
                    'content': content,
                    'color': color,
                    'pinned': pinned,
                    'sticky': True,
                }
                if category:
                    note_data['category'] = category
                if priority:
                    note_data['priority'] = priority
                tags = payload.get('tags') if isinstance(payload.get('tags'), list) else None
                if tags:
                    note_data['tags'] = _tags_from_value(tags)
                _ensure_sticky_markers(note_data)
                write_item_data('note', name, note_data)
                self._write_json(200, {"ok": True, "note": _build_sticky_payload(note_data)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to create sticky note: {e}"})
            return

        if parsed.path == "/api/sticky-notes/update":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                name = str(payload.get('name') or '').strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing note name"}); return
                from modules.item_manager import read_item_data, write_item_data, delete_item
                data = read_item_data('note', name)
                if not data:
                    self._write_json(404, {"ok": False, "error": "Note not found"}); return
                target_name = name
                new_name = str(payload.get('new_name') or '').strip()
                if new_name and new_name != name:
                    target_name = _ensure_unique_item_name('note', new_name[:160] or name)
                if 'content' in payload:
                    data['content'] = str(payload.get('content') or '')
                if 'color' in payload:
                    data['color'] = _coerce_sticky_color(payload.get('color'))
                if 'pinned' in payload:
                    data['pinned'] = _normalize_bool(payload.get('pinned'))
                if 'category' in payload:
                    val = str(payload.get('category') or '').strip()
                    if val:
                        data['category'] = val
                    elif 'category' in data:
                        data.pop('category', None)
                if 'priority' in payload:
                    val = str(payload.get('priority') or '').strip()
                    if val:
                        data['priority'] = val
                    elif 'priority' in data:
                        data.pop('priority', None)
                if 'tags' in payload and isinstance(payload.get('tags'), list):
                    data['tags'] = _tags_from_value(payload.get('tags'))
                _ensure_sticky_markers(data)
                if target_name != name:
                    data['name'] = target_name
                    write_item_data('note', target_name, data)
                    delete_item('note', name)
                else:
                    write_item_data('note', name, data)
                self._write_json(200, {"ok": True, "note": _build_sticky_payload(data)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to update sticky note: {e}"})
            return

        if parsed.path == "/api/sticky-notes/delete":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                name = str(payload.get('name') or '').strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing note name"}); return
                force = bool(payload.get('force'))
                ok, out, err = run_console_command("delete", ["note", name], {"force": force} if force else {})
                self._write_json(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to delete sticky note: {e}"})
            return

        if parsed.path == "/api/sticky-notes/reminder":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                note_name = str(payload.get('name') or payload.get('note') or '').strip()
                if not note_name:
                    self._write_json(400, {"ok": False, "error": "Missing note name"}); return
                time_field = str(payload.get('time') or '').strip()
                if not time_field:
                    self._write_json(400, {"ok": False, "error": "Missing reminder time"}); return
                message = str(payload.get('message') or f"Review note: {note_name}")
                date_field = str(payload.get('date') or '').strip()
                reminder_name = str(payload.get('reminder_name') or f"{note_name} reminder").strip() or f"{note_name} reminder"
                reminder_name = _ensure_unique_item_name('reminder', reminder_name[:160])
                from modules.item_manager import read_item_data, write_item_data
                note = read_item_data('note', note_name)
                if not note:
                    self._write_json(404, {"ok": False, "error": "Note not found"}); return
                reminder = {
                    'name': reminder_name,
                    'type': 'reminder',
                    'time': time_field,
                    'enabled': True,
                    'message': message,
                    'target': {
                        'type': 'note',
                        'name': note_name,
                        'action': 'open',
                    },
                    'tags': ['sticky'],
                }
                if date_field:
                    reminder['date'] = date_field
                if payload.get('recurrence'):
                    reminder['recurrence'] = payload['recurrence']
                write_item_data('reminder', reminder_name, reminder)
                self._write_json(200, {"ok": True, "reminder": reminder_name})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to create reminder: {e}"})
            return
        if parsed.path == "/api/cockpit/matrix/presets":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Preset payload must be a map"}); return
                save_matrix_preset(payload)
                self._write_json(200, {"ok": True})
            except ValueError as e:
                self._write_json(400, {"ok": False, "error": str(e)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Preset save failed: {e}"})
            return

        if parsed.path == "/api/cockpit/matrix/presets/delete":
            try:
                name = (payload.get('name') or '').strip() if isinstance(payload, dict) else ''
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing preset name"}); return
                removed = delete_matrix_preset(name)
                if not removed:
                    self._write_json(404, {"ok": False, "error": "Preset not found"})
                else:
                    self._write_json(200, {"ok": True})
            except ValueError as e:
                self._write_json(400, {"ok": False, "error": str(e)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Preset delete failed: {e}"})
            return

        if parsed.path == "/api/calendar/overlays":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Preset payload must be a map"}); return
                preset = _save_calendar_overlay_preset(payload)
                self._write_json(200, {"ok": True, "preset": preset})
            except ValueError as e:
                self._write_json(400, {"ok": False, "error": str(e)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Overlay preset save failed: {e}"})
            return

        if parsed.path == "/api/calendar/overlays/delete":
            try:
                name = (payload.get('name') or '').strip() if isinstance(payload, dict) else ''
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing preset name"}); return
                removed = _delete_calendar_overlay_preset(name)
                if not removed:
                    self._write_json(404, {"ok": False, "error": "Preset not found"})
                else:
                    self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Overlay preset delete failed: {e}"})
            return

        if parsed.path == "/api/vars":
            # Payload YAML: { set: {k:v}, unset: [k1,k2] }
            try:
                to_set = payload.get('set') if isinstance(payload.get('set'), dict) else {}
                to_unset = payload.get('unset') if isinstance(payload.get('unset'), (list, tuple)) else []
                for k, v in to_set.items():
                    _vars_set(k, v)
                for k in to_unset:
                    _vars_unset(k)
                self._write_json(200, {"ok": True, "vars": _vars_all()})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Vars update failed: {e}"})
            return

        if parsed.path == "/api/vars/expand":
            # Expand text or list using current vars
            try:
                if isinstance(payload.get('text'), str):
                    out = _expand_text(payload.get('text'))
                    self._write_json(200, {"ok": True, "text": out}); return
                if isinstance(payload.get('list'), list):
                    arr = [ _expand_text(x) for x in payload.get('list') ]
                    self._write_json(200, {"ok": True, "list": arr}); return
                self._write_json(400, {"ok": False, "error": "Provide 'text' or 'list'"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Expand failed: {e}"})
            return

        if parsed.path == "/api/new/note":
            # Expected payload: {name, category?, priority?, tags? (list or csv), content?}
            name = (payload.get('name') or '').strip()
            if not name:
                self._write_yaml(400, {"ok": False, "error": "Missing 'name'"})
                return
            props = {}
            for key in ("category", "priority", "content"):
                if key in payload and payload[key] is not None:
                    props[key] = payload[key]
            # tags: accept list or csv string
            tags = payload.get('tags')
            if isinstance(tags, list):
                props['tags'] = ", ".join(str(x) for x in tags)
            elif isinstance(tags, str) and tags.strip():
                props['tags'] = tags

            # Build args for 'new'
            prop_tokens = []
            for k, v in props.items():
                if isinstance(v, bool):
                    v_str = "true" if v else "false"
                else:
                    v_str = str(v)
                prop_tokens.append(f"{k}:{v_str}")

            ok, out, err = run_console_command("new", ["note", name, *prop_tokens])
            status = 200 if ok else 500
            self._write_yaml(status, {"ok": ok, "stdout": out, "stderr": err})
            return
        if parsed.path == "/api/reward/redeem":
            name = (payload.get('name') or '').strip() if isinstance(payload, dict) else ''
            if not name:
                self._write_json(400, {"ok": False, "error": "Missing reward name"})
                return
            props = payload.get('properties') if isinstance(payload, dict) else None
            args = ["reward", name]
            if isinstance(props, dict):
                for k, v in props.items():
                    if v is None:
                        continue
                    if isinstance(v, bool):
                        v_str = "true" if v else "false"
                    elif isinstance(v, (list, tuple)):
                        v_str = ", ".join(str(x) for x in v)
                    else:
                        v_str = str(v)
                    args.append(f"{k}:{v_str}")
            ok, out, err = run_console_command("redeem", args)
            status = 200 if ok else 500
            body = {"ok": ok, "stdout": out, "stderr": err}
            try:
                from utilities import points as Points
                body["balance"] = Points.get_balance()
            except Exception:
                pass
            self._write_json(status, body)
            return
        if parsed.path == "/api/achievement/update":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                name = (payload.get('name') or '').strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing achievement name"}); return
                fields = payload.get('fields') if isinstance(payload.get('fields'), dict) else {}
                award_now = bool(payload.get('award_now'))
                archive_now = bool(payload.get('archive') or payload.get('archive_now'))
                if not fields and not award_now and not archive_now:
                    self._write_json(400, {"ok": False, "error": "Nothing to update"}); return
                # 1) Apply generic field updates through CLI set.
                if fields:
                    safe_fields = {str(k): v for k, v in fields.items() if k is not None}
                    ok, out, err = run_console_command("set", ["achievement", name], safe_fields)
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to update achievement fields", "stdout": out, "stderr": err}); return
                # 2) Award through dedicated achievements command so evaluator side-effects stay centralized.
                if award_now:
                    ok, out, err = run_console_command("achievements", ["award", name])
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to award achievement", "stdout": out, "stderr": err}); return
                # 3) Archive state uses set to avoid direct file mutation.
                if archive_now:
                    ok, out, err = run_console_command("set", ["achievement", name], {"status": "archived", "archived": True})
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to archive achievement", "stdout": out, "stderr": err}); return
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Achievement update failed: {e}"})
            return
        if parsed.path == "/api/milestone/update":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                name = (payload.get('name') or '').strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing milestone name"}); return
                action = (payload.get('action') or '').strip().lower()
                fields = payload.get('fields') if isinstance(payload.get('fields'), dict) else {}
                if fields:
                    safe_fields = {str(k): v for k, v in fields.items() if k is not None}
                    ok, out, err = run_console_command("set", ["milestone", name], safe_fields)
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to update milestone fields", "stdout": out, "stderr": err}); return
                if action == 'complete':
                    ok, out, err = run_console_command("set", ["milestone", name], {
                        "status": "completed",
                        "completed": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    })
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to complete milestone", "stdout": out, "stderr": err}); return
                elif action == 'reset':
                    ok, out, err = run_console_command("set", ["milestone", name], {"status": "pending"})
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to reset milestone status", "stdout": out, "stderr": err}); return
                    # Remove completed timestamp through CLI, keeping behavior in command layer.
                    run_console_command("remove", ["milestone", name, "completed"])
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Milestone update failed: {e}"})
            return
        if parsed.path == "/api/file/read":
            try:
                path = (payload.get('path') or '').strip() if isinstance(payload, dict) else ''
                if not path and parsed.query:
                    qs = parse_qs(parsed.query)
                    path = (qs.get('path') or [''])[0].strip()
                if not path:
                    self._write_json(400, {"ok": False, "error": "Missing path"}); return
                target = os.path.abspath(os.path.join(ROOT_DIR, path))
                if not target.startswith(ROOT_DIR):
                    self._write_json(403, {"ok": False, "error": "Forbidden"}); return
                if not os.path.isfile(target):
                    self._write_json(404, {"ok": False, "error": "File not found"}); return
                with open(target, 'r', encoding='utf-8') as fh:
                    data = fh.read()
                self._write_json(200, {"ok": True, "path": path, "content": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Read failed: {e}"})
            return
        if parsed.path == "/api/file/write":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map with path/content"}); return
                path = (payload.get('path') or '').strip()
                content = payload.get('content') or ''
                if not path:
                    self._write_json(400, {"ok": False, "error": "Missing path"}); return
                target = os.path.abspath(os.path.join(ROOT_DIR, path))
                if not target.startswith(ROOT_DIR):
                    self._write_json(403, {"ok": False, "error": "Forbidden"}); return
                allowed_ext = ('.md', '.markdown', '.yml', '.yaml', '.txt')
                if not target.lower().endswith(allowed_ext):
                    self._write_json(400, {"ok": False, "error": "Extension not allowed"}); return
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, 'w', encoding='utf-8') as fh:
                    fh.write(str(content))
                self._write_json(200, {"ok": True, "path": path})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Write failed: {e}"})
            return

        if parsed.path == "/api/file/rename":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                old_path = (payload.get('old_path') or '').strip()
                new_path = (payload.get('new_path') or '').strip()
                if not old_path or not new_path:
                    self._write_json(400, {"ok": False, "error": "Missing old_path or new_path"}); return
                old_target = os.path.abspath(os.path.join(ROOT_DIR, old_path))
                new_target = os.path.abspath(os.path.join(ROOT_DIR, new_path))
                if not old_target.startswith(ROOT_DIR) or not new_target.startswith(ROOT_DIR):
                    self._write_json(403, {"ok": False, "error": "Forbidden path"}); return
                if not os.path.exists(old_target):
                    self._write_json(404, {"ok": False, "error": "File not found"}); return
                if os.path.exists(new_target):
                    self._write_json(409, {"ok": False, "error": "Destination file already exists"}); return
                os.rename(old_target, new_target)
                self._write_json(200, {"ok": True, "old_path": old_path, "new_path": new_path})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Rename failed: {e}"})
            return

        if parsed.path == "/api/file/delete":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                path = (payload.get('path') or '').strip()
                if not path:
                    self._write_json(400, {"ok": False, "error": "Missing path"}); return
                target = os.path.abspath(os.path.join(ROOT_DIR, path))
                if not target.startswith(ROOT_DIR):
                    self._write_json(403, {"ok": False, "error": "Forbidden path"}); return
                if not os.path.exists(target):
                    self._write_json(404, {"ok": False, "error": "File not found"}); return
                if os.path.isdir(target):
                    import shutil
                    shutil.rmtree(target)
                else:
                    os.remove(target)
                self._write_json(200, {"ok": True, "path": path})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Delete failed: {e}"})
            return

        if parsed.path == "/api/status/update":
            # Payload: map of indicator:value, e.g., { energy: high, focus: good }
            if not isinstance(payload, dict):
                self._write_json(400, {"ok": False, "error": "Payload must be a map of indicator:value"})
                return
            results = {}
            overall_ok = True
            for k, v in payload.items():
                if v is None:
                    continue
                # Call 'status' with properties so command handlers receive indicator:value correctly.
                ok, out, err = run_console_command("status", [], {str(k): v})
                if not ok:
                    overall_ok = False
                results[str(k)] = {"ok": ok, "stdout": out, "stderr": err}
            self._write_json(200 if overall_ok else 500, {"ok": overall_ok, "details": results})
            return

        if parsed.path == "/api/logs":
            try:
                # Basic log reader: returns last N lines
                log_path = os.path.join(ROOT_DIR, "logs", "engine.log")
                if not os.path.exists(log_path):
                    self._write_json(200, {"ok": True, "logs": []})
                    return
                qs = parse_qs(parsed.query or "")
                limit = 50
                try:
                    limit = int((qs.get("limit") or [50])[0])
                except Exception:
                    pass
                lines = []
                with open(log_path, "r", encoding="utf-8") as f:
                    # Simple tail implementation
                    # For very large files, this should be optimized
                    all_lines = f.readlines()
                    lines = [ln.strip() for ln in all_lines[-limit:]]
                self._write_json(200, {"ok": True, "logs": lines})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read logs: {e}"})
            return


        if parsed.path == "/api/today/reschedule":
            ok, out, err = run_console_command("today", ["reschedule"])
            self._write_yaml(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err})
            return

        if parsed.path == "/api/day/start":
            target = "day"
            try:
                if isinstance(payload, dict):
                    tgt = str(payload.get('target') or '').strip().lower()
                    if tgt in {'today', 'day'}:
                        target = tgt
                ok, out, err = run_console_command("start", [target])
                status_snapshot = None
                try:
                    from modules.timer import main as Timer
                    status_snapshot = Timer.status()
                except Exception:
                    status_snapshot = None
                self._write_json(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err, "status": status_snapshot})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Start day failed: {e}"})
            return

        if parsed.path == "/api/profile":
            # Save nickname and welcome/exit message lines into user/Profile/profile.yml
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                prof_path = os.path.join(ROOT_DIR, 'user', 'Profile', 'profile.yml')
                # Load existing to preserve other fields (e.g., avatar)
                data = {}
                if os.path.exists(prof_path):
                    try:
                        with open(prof_path, 'r', encoding='utf-8') as f:
                            data = yaml.safe_load(f) or {}
                    except Exception:
                        data = {}
                if not isinstance(data, dict):
                    data = {}

                nickname = payload.get('nickname')
                if isinstance(nickname, str):
                    data['nickname'] = nickname

                title = payload.get('title')
                if isinstance(title, str):
                    data['title'] = title

                # welcome lines
                w = payload.get('welcome') or {}
                if isinstance(w, dict):
                    wb = data.get('welcome') if isinstance(data.get('welcome'), dict) else {}
                    wb['line1'] = w.get('line1') if w.get('line1') is not None else wb.get('line1')
                    wb['line2'] = w.get('line2') if w.get('line2') is not None else wb.get('line2')
                    wb['line3'] = w.get('line3') if w.get('line3') is not None else wb.get('line3')
                    data['welcome'] = wb

                # exit/goodbye lines (write as exit_message)
                e = payload.get('exit') or {}
                if isinstance(e, dict):
                    eb = data.get('exit_message') if isinstance(data.get('exit_message'), dict) else {}
                    eb['line1'] = e.get('line1') if e.get('line1') is not None else eb.get('line1')
                    eb['line2'] = e.get('line2') if e.get('line2') is not None else eb.get('line2')
                    data['exit_message'] = eb

                # Ensure directory exists
                os.makedirs(os.path.dirname(prof_path), exist_ok=True)
                with open(prof_path, 'w', encoding='utf-8') as f:
                    yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Profile save failed: {e}"})
            return

        if parsed.path == "/api/profile/avatar":
            # Save avatar image and set profile avatar path to user/Profile/avatar.png
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                avatar_data_url = str(payload.get('avatar_data_url') or '').strip()
                if not avatar_data_url.startswith('data:image/'):
                    self._write_json(400, {"ok": False, "error": "Invalid avatar data"}); return
                if ',' not in avatar_data_url:
                    self._write_json(400, {"ok": False, "error": "Malformed avatar data URL"}); return

                _, b64 = avatar_data_url.split(',', 1)
                try:
                    raw = base64.b64decode(b64, validate=True)
                except Exception:
                    self._write_json(400, {"ok": False, "error": "Invalid avatar base64 data"}); return
                if not raw:
                    self._write_json(400, {"ok": False, "error": "Empty avatar payload"}); return

                prof_dir = os.path.join(ROOT_DIR, 'user', 'Profile')
                prof_path = os.path.join(prof_dir, 'profile.yml')
                avatar_path = os.path.join(prof_dir, 'avatar.png')
                os.makedirs(prof_dir, exist_ok=True)
                with open(avatar_path, 'wb') as af:
                    af.write(raw)

                data = {}
                if os.path.exists(prof_path):
                    try:
                        with open(prof_path, 'r', encoding='utf-8') as f:
                            data = yaml.safe_load(f) or {}
                    except Exception:
                        data = {}
                if not isinstance(data, dict):
                    data = {}
                data['avatar'] = 'user/Profile/avatar.png'
                with open(prof_path, 'w', encoding='utf-8') as f:
                    yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)

                self._write_json(200, {"ok": True, "avatar_path": data['avatar']})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Avatar save failed: {e}"})
            return

        if parsed.path == "/api/preferences":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                pref_path = os.path.join(ROOT_DIR, 'user', 'Profile', 'preferences_settings.yml')
                existing = {}
                if os.path.exists(pref_path):
                    with open(pref_path, 'r', encoding='utf-8') as f:
                        existing = yaml.safe_load(f) or {}
                if not isinstance(existing, dict):
                    existing = {}
                for k, v in payload.items():
                    existing[k] = v
                os.makedirs(os.path.dirname(pref_path), exist_ok=True)
                with open(pref_path, 'w', encoding='utf-8') as f:
                    yaml.safe_dump(existing, f, allow_unicode=True, sort_keys=False)
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Preferences save failed: {e}"})
            return

        if parsed.path == "/api/item":
            # Create/update an item. Payload YAML: { type, name, properties: {...} } or raw item map
            try:
                if not isinstance(payload, dict):
                    self._write_yaml(400, {"ok": False, "error": "Payload must be a map"}); return
                item_type = (payload.get('type') or '').strip().lower()
                name = (payload.get('name') or '').strip()
                if not item_type or not name:
                    self._write_yaml(400, {"ok": False, "error": "Missing type or name"}); return
                props = payload.get('properties') if isinstance(payload.get('properties'), dict) else None
                content_yaml = payload.get('content') if isinstance(payload.get('content'), str) else None
                if props is not None:
                    data = {k: v for k, v in props.items()}
                elif content_yaml is not None:
                    try:
                        parsed_yaml = yaml.safe_load(content_yaml) or {}
                        data = parsed_yaml if isinstance(parsed_yaml, dict) else {"content": content_yaml}
                    except Exception:
                        data = {"content": content_yaml}
                else:
                    # Treat payload itself as the item map
                    data = payload
                props_map = data if isinstance(data, dict) else {}
                props_map = {str(k): v for k, v in props_map.items() if k is not None}
                props_map.pop('name', None)
                props_map.pop('type', None)
                exists = False
                try:
                    from modules.item_manager import read_item_data
                    exists = bool(read_item_data(item_type, name))
                except Exception:
                    exists = False
                if exists:
                    ok, out, err = run_console_command("set", [item_type, name], props_map)
                else:
                    ok, out, err = run_console_command("new", [item_type, name], props_map)
                self._write_yaml(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Failed to write item: {e}"})
            return

        if parsed.path == "/api/item/copy":
            # Payload: { type, source, new_name, properties? }
            try:
                item_type = (payload.get('type') or '').strip().lower()
                source = (payload.get('source') or '').strip()
                new_name = (payload.get('new_name') or '').strip()
                if not item_type or not source or not new_name:
                    self._write_yaml(400, {"ok": False, "error": "Missing type, source, or new_name"}); return
                props = payload.get('properties') if isinstance(payload.get('properties'), dict) else {}
                ok, out, err = run_console_command("copy", [item_type, source, new_name], props)
                self._write_yaml(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Copy failed: {e}"})
            return

        if parsed.path == "/api/item/rename":
            # Payload: { type, old_name, new_name }
            try:
                item_type = (payload.get('type') or '').strip().lower()
                old_name = (payload.get('old_name') or '').strip()
                new_name = (payload.get('new_name') or '').strip()
                if not item_type or not old_name or not new_name:
                    self._write_yaml(400, {"ok": False, "error": "Missing type, old_name, or new_name"}); return
                ok, out, err = run_console_command("rename", [item_type, old_name, new_name])
                try:
                    from modules.item_manager import read_item_data
                    old_exists = bool(read_item_data(item_type, old_name))
                    new_exists = bool(read_item_data(item_type, new_name))
                    if old_exists or not new_exists:
                        ok = False
                        if not (err or "").strip():
                            err = "Rename validation failed: old item still exists or new item missing."
                except Exception:
                    pass
                self._write_yaml(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Rename failed: {e}"})
            return

        if parsed.path == "/api/project/rename":
            # Payload: { old_name, new_name }
            try:
                old_name = (payload.get('old_name') or '').strip()
                new_name = (payload.get('new_name') or '').strip()
                if not old_name or not new_name:
                    self._write_json(400, {"ok": False, "error": "Missing old_name or new_name"}); return
                if old_name.lower() == new_name.lower():
                    self._write_json(200, {"ok": True, "renamed": False, "updated_refs": 0, "updated_by_type": {}}); return

                ok, out, err = run_console_command("rename", ["project", old_name, new_name])
                from modules.item_manager import read_item_data
                old_exists = bool(read_item_data("project", old_name))
                new_exists = bool(read_item_data("project", new_name))
                if (not ok) or old_exists or (not new_exists):
                    self._write_json(500, {"ok": False, "error": err or out or "Project rename failed"}); return

                from modules.item_manager import list_all_items_any, read_item_data, write_item_data
                old_key = old_name.strip().lower()
                updated_refs = 0
                updated_by_type = {}

                for item in (list_all_items_any() or []):
                    if not isinstance(item, dict):
                        continue
                    item_type = str(item.get("type") or "").strip().lower()
                    item_name = str(item.get("name") or "").strip()
                    if not item_type or not item_name:
                        continue
                    if item_type == "project" and item_name.strip().lower() == new_name.strip().lower():
                        continue

                    data = read_item_data(item_type, item_name) or {}
                    if not isinstance(data, dict):
                        continue
                    changed = False
                    if str(data.get("project") or "").strip().lower() == old_key:
                        data["project"] = new_name
                        changed = True
                    if str(data.get("resolution_ref") or "").strip().lower() == old_key:
                        data["resolution_ref"] = new_name
                        changed = True
                    if changed:
                        write_item_data(item_type, item_name, data)
                        updated_refs += 1
                        updated_by_type[item_type] = int(updated_by_type.get(item_type, 0)) + 1

                self._write_json(200, {
                    "ok": True,
                    "renamed": True,
                    "stdout": out,
                    "updated_refs": updated_refs,
                    "updated_by_type": updated_by_type,
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Project rename failed: {e}"})
            return

        if parsed.path == "/api/goal/rename":
            # Payload: { old_name, new_name }
            try:
                old_name = (payload.get('old_name') or '').strip()
                new_name = (payload.get('new_name') or '').strip()
                if not old_name or not new_name:
                    self._write_json(400, {"ok": False, "error": "Missing old_name or new_name"}); return
                if old_name.lower() == new_name.lower():
                    self._write_json(200, {"ok": True, "renamed": False, "updated_refs": 0, "updated_by_type": {}}); return

                ok, out, err = run_console_command("rename", ["goal", old_name, new_name])
                from modules.item_manager import read_item_data
                old_exists = bool(read_item_data("goal", old_name))
                new_exists = bool(read_item_data("goal", new_name))
                if (not ok) or old_exists or (not new_exists):
                    self._write_json(500, {"ok": False, "error": err or out or "Goal rename failed"}); return

                from modules.item_manager import list_all_items_any, read_item_data, write_item_data
                old_key = old_name.strip().lower()
                updated_refs = 0
                updated_by_type = {}

                def _replace_goal_refs(data):
                    changed_local = False
                    if str(data.get("goal") or "").strip().lower() == old_key:
                        data["goal"] = new_name
                        changed_local = True
                    if str(data.get("goal_name") or "").strip().lower() == old_key:
                        data["goal_name"] = new_name
                        changed_local = True
                    for key in ("goals", "linked_goals", "goal_links"):
                        raw = data.get(key)
                        if isinstance(raw, list):
                            nxt = []
                            replaced = False
                            for v in raw:
                                if str(v or "").strip().lower() == old_key:
                                    nxt.append(new_name)
                                    replaced = True
                                else:
                                    nxt.append(v)
                            if replaced:
                                data[key] = nxt
                                changed_local = True
                        elif isinstance(raw, str):
                            parts = [p.strip() for p in raw.split(",")]
                            repl = False
                            for i, p in enumerate(parts):
                                if p.lower() == old_key:
                                    parts[i] = new_name
                                    repl = True
                            if repl:
                                data[key] = ", ".join(parts)
                                changed_local = True
                    return changed_local

                for item in (list_all_items_any() or []):
                    if not isinstance(item, dict):
                        continue
                    item_type = str(item.get("type") or "").strip().lower()
                    item_name = str(item.get("name") or "").strip()
                    if not item_type or not item_name:
                        continue
                    if item_type == "goal" and item_name.strip().lower() == new_name.strip().lower():
                        continue
                    data = read_item_data(item_type, item_name) or {}
                    if not isinstance(data, dict):
                        continue
                    if _replace_goal_refs(data):
                        write_item_data(item_type, item_name, data)
                        updated_refs += 1
                        updated_by_type[item_type] = int(updated_by_type.get(item_type, 0)) + 1

                self._write_json(200, {
                    "ok": True,
                    "renamed": True,
                    "stdout": out,
                    "updated_refs": updated_refs,
                    "updated_by_type": updated_by_type,
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Goal rename failed: {e}"})
            return

        if parsed.path.startswith("/api/profile"):
            try:
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to save profile: {e}"})
            return

        if parsed.path == "/api/open-in-editor":
            try:
                file_to_open = payload.get('file_path')
                if not file_to_open:
                    self._write_json(400, {"ok": False, "error": "Missing file_path"}); return

                # Basic sanitization
                if '..' in file_to_open or not file_to_open.startswith('user/Profile/'):
                    self._write_json(400, {"ok": False, "error": "Invalid file path"}); return
                
                full_path = os.path.join(ROOT_DIR, file_to_open)

                from modules.item_manager import get_editor_command
                
                editor_command = get_editor_command({}) # empty properties
                if str(editor_command).strip().lower() == 'chronos_editor':
                    rel = os.path.relpath(full_path, ROOT_DIR).replace("\\", "/")
                    ok = _editor_open_request_write(rel, payload.get("line"))
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to queue file for Chronos Editor"}); return
                    self._write_json(200, {"ok": True, "mode": "chronos_editor", "path": rel})
                    return
                
                import subprocess
                subprocess.run([editor_command, full_path], check=True)

                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to open file in editor: {e}"})
            return

        if parsed.path == "/api/settings":
            # Write a settings file. Options:
            # - POST /api/settings?file=Name.yml with raw YAML body
            # - Payload: { file: Name.yml, data: {...} } (server dumps YAML)
            # - Payload: { file: Name.yml, raw: "yaml..." } (server writes raw)
            try:
                qs = parse_qs(parsed.query or '')
                settings_root = os.path.join(ROOT_DIR, 'user', 'Settings')
                os.makedirs(settings_root, exist_ok=True)

                fname = (qs.get('file') or [''])[0].strip()
                if not fname and isinstance(payload, dict):
                    fname = str(payload.get('file') or '').strip()
                if not fname:
                    self._write_yaml(400, {"ok": False, "error": "Missing 'file'"}); return
                if ('..' in fname) or fname.startswith('/') or fname.startswith('\\'):
                    self._write_yaml(400, {"ok": False, "error": "Invalid file"}); return
                fpath = os.path.abspath(os.path.join(settings_root, fname))
                if not fpath.startswith(os.path.abspath(settings_root)):
                    self._write_yaml(403, {"ok": False, "error": "Forbidden"}); return

                # Prefer raw body if query param 'file' is used
                raw_text = None
                if (qs.get('file') and isinstance(text, str) and text.strip()):
                    raw_text = text
                elif isinstance(payload, dict) and isinstance(payload.get('raw'), str):
                    raw_text = payload.get('raw')

                if raw_text is not None:
                    # Validate YAML, but write original to preserve comments/formatting
                    try:
                        yaml.safe_load(raw_text)
                    except Exception as e:
                        self._write_yaml(400, {"ok": False, "error": f"Invalid YAML: {e}"}); return
                    with open(fpath, 'w', encoding='utf-8') as fh:
                        fh.write(raw_text)
                    self._write_yaml(200, {"ok": True}); return

                # Else, check for 'data' map to dump
                if isinstance(payload, dict) and isinstance(payload.get('data'), (dict, list)):
                    with open(fpath, 'w', encoding='utf-8') as fh:
                        fh.write(yaml.safe_dump(payload.get('data'), allow_unicode=True))
                    self._write_yaml(200, {"ok": True}); return

                self._write_yaml(400, {"ok": False, "error": "Missing content (raw or data)"})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Settings write error: {e}"})
            return

        if parsed.path == "/api/template":
            # Save a template's children to its YAML
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                t = (payload.get('type') or '').strip().lower()
                n = (payload.get('name') or '').strip()
                children = payload.get('children') if isinstance(payload.get('children'), list) else None
                if not t or not n or children is None:
                    self._write_json(400, {"ok": False, "error": "Missing type, name, or children[]"}); return
                props = {}
                if t == "inventory":
                    inv_items = []
                    tools = []
                    for child in children:
                        if not isinstance(child, dict):
                            continue
                        entry = dict(child)
                        entry.pop("children", None)
                        entry.pop("depends_on", None)
                        entry.pop("ideal_start_time", None)
                        entry.pop("ideal_end_time", None)
                        entry.pop("duration", None)
                        dtype = str(entry.get("type") or "").lower()
                        if dtype == "tool":
                            tools.append(entry)
                        else:
                            inv_items.append(entry)
                    props['inventory_items'] = inv_items
                    props['tools'] = tools
                    props['children'] = None
                else:
                    props['children'] = children
                exists = False
                try:
                    from modules.item_manager import read_item_data
                    exists = bool(read_item_data(t, n))
                except Exception:
                    exists = False
                if exists:
                    ok, out, err = run_console_command("set", [t, n], props)
                else:
                    ok, out, err = run_console_command("new", [t, n], props)
                if not ok:
                    self._write_json(500, {"ok": False, "error": "Template save failed", "stdout": out, "stderr": err}); return
                try:
                    def _has_habit_stack(nodes):
                        stack = list(nodes or [])
                        while stack:
                            node = stack.pop()
                            if not isinstance(node, dict):
                                continue
                            node_type = str(node.get("type") or "").strip().lower()
                            if node.get("habit_stack") or node.get("habit_stack") is True or node_type == "habit_stack":
                                return True
                            child = node.get("children")
                            if isinstance(child, list) and child:
                                stack.extend(child)
                        return False

                    run_console_command("achievements", ["event", "template_saved"], {
                        "template_type": t,
                        "name": n,
                        "source": "dashboard:/api/template",
                    })
                    if _has_habit_stack(children):
                        run_console_command("achievements", ["event", "habit_stack_created"], {
                            "template_type": t,
                            "name": n,
                            "source": "dashboard:/api/template",
                        })
                except Exception:
                    pass
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Template save error: {e}"})
            return

        if parsed.path == "/api/item/delete":
            # Payload: { type, name }
            try:
                item_type = (payload.get('type') or '').strip().lower()
                name = (payload.get('name') or '').strip()
                if not item_type or not name:
                    self._write_yaml(400, {"ok": False, "error": "Missing type or name"}); return
                force = bool(payload.get('force'))
                ok, out, err = run_console_command("delete", [item_type, name], {"force": force} if force else {})
                self._write_yaml(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Delete failed: {e}"})
            return

        if parsed.path == "/api/items/delete":
            # Payload: { type, names: [] }
            try:
                item_type = (payload.get('type') or '').strip().lower()
                names = payload.get('names') or []
                if not item_type or not isinstance(names, list) or not names:
                    self._write_yaml(400, {"ok": False, "error": "Missing type or names[]"}); return
                results = {}
                overall_ok = True
                for n in names:
                    ok, out, err = run_console_command("delete", [item_type, str(n)])
                    results[str(n)] = {"ok": ok, "stdout": out, "stderr": err}
                    if not ok:
                        overall_ok = False
                self._write_yaml(200 if overall_ok else 207, {"ok": overall_ok, "results": results})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Bulk delete failed: {e}"})
            return

        if parsed.path == "/api/items/setprop":
            # Payload: { type, names: [], property: key, value }
            try:
                item_type = (payload.get('type') or '').strip().lower()
                names = payload.get('names') or []
                prop = (payload.get('property') or '').strip()
                val = payload.get('value')
                if not item_type or not isinstance(names, list) or not names or not prop:
                    self._write_yaml(400, {"ok": False, "error": "Missing type, names[] or property"}); return
                results = {}
                for n in names:
                    ok, out, err = run_console_command("set", [item_type, str(n)], {prop: val})
                    results[str(n)] = {"ok": ok, "stdout": out, "stderr": err}
                overall_ok = all(bool(v.get("ok")) for v in results.values())
                self._write_yaml(200 if overall_ok else 207, {"ok": overall_ok, "results": results})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Bulk set failed: {e}"})
            return

        if parsed.path == "/api/items/copy":
            # Payload: { type, sources: [], prefix?, suffix? }
            try:
                item_type = (payload.get('type') or '').strip().lower()
                sources = payload.get('sources') or []
                prefix = payload.get('prefix') or ''
                suffix = payload.get('suffix') or ' Copy'
                if not item_type or not isinstance(sources, list) or not sources:
                    self._write_yaml(400, {"ok": False, "error": "Missing type or sources[]"}); return
                results = {}
                for s in sources:
                    new_name = f"{prefix}{s}{suffix}".strip()
                    ok, out, err = run_console_command("copy", [item_type, str(s), new_name])
                    results[str(s)] = {"ok": ok, "new_name": new_name, "stdout": out, "stderr": err}
                overall_ok = all(bool(v.get("ok")) for v in results.values())
                self._write_yaml(200 if overall_ok else 207, {"ok": overall_ok, "results": results})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Bulk copy failed: {e}"})
            return

        if parsed.path == "/api/items/export":
            # Payload: { type, names: [] } → creates zip under Temp/ and returns temp URL
            try:
                item_type = (payload.get('type') or '').strip().lower()
                names = payload.get('names') or []
                if not item_type or not isinstance(names, list) or not names:
                    self._write_yaml(400, {"ok": False, "error": "Missing type or names[]"}); return
                import zipfile, time
                temp_root = os.path.join(ROOT_DIR, 'Temp')
                os.makedirs(temp_root, exist_ok=True)
                ts = time.strftime('%Y%m%d_%H%M%S')
                zip_rel = f"exports_items_{ts}.zip"
                zip_path = os.path.join(temp_root, zip_rel)
                from modules.item_manager import get_item_path
                with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
                    for n in names:
                        p = get_item_path(item_type, n)
                        if os.path.exists(p):
                            zf.write(p, arcname=os.path.join(item_type, os.path.basename(p)))
                self._write_yaml(200, {"ok": True, "zip": f"/temp/{zip_rel}"})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Export failed: {e}"})
            return

        if parsed.path == "/api/timer/start":
            try:
                prof = (payload.get('profile') or '').strip()
                if not prof:
                    self._write_json(400, {"ok": False, "error": "Missing 'profile'"}); return
                props = {}
                if payload.get('bind_type') not in (None, ''):
                    props['type'] = payload.get('bind_type')
                if payload.get('bind_name') not in (None, ''):
                    props['name'] = payload.get('bind_name')
                if payload.get('cycles') is not None:
                    try:
                        props['cycles'] = int(payload.get('cycles'))
                    except Exception:
                        pass
                if payload.get('auto_advance') is not None:
                    props['auto_advance'] = bool(payload.get('auto_advance'))
                ok, out, err = run_console_command("timer", ["start", prof], props)
                if not ok:
                    self._write_json(500, {"ok": False, "stdout": out, "stderr": err}); return
                try:
                    from modules.timer import main as Timer
                    st = Timer.status()
                except Exception:
                    st = {}
                self._write_json(200, {"ok": True, "status": st, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer start error: {e}"})
            return
        if parsed.path == "/api/timer/pause":
            try:
                ok, out, err = run_console_command("timer", ["pause"])
                if not ok:
                    self._write_json(500, {"ok": False, "stdout": out, "stderr": err}); return
                try:
                    from modules.timer import main as Timer
                    st = Timer.status()
                except Exception:
                    st = {}
                self._write_json(200, {"ok": True, "status": st, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer pause error: {e}"})
            return
        if parsed.path == "/api/timer/resume":
            try:
                ok, out, err = run_console_command("timer", ["resume"])
                if not ok:
                    self._write_json(500, {"ok": False, "stdout": out, "stderr": err}); return
                try:
                    from modules.timer import main as Timer
                    st = Timer.status()
                except Exception:
                    st = {}
                self._write_json(200, {"ok": True, "status": st, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer resume error: {e}"})
            return
        if parsed.path == "/api/timer/stop":
            try:
                ok, out, err = run_console_command("timer", ["stop"])
                if not ok:
                    self._write_json(500, {"ok": False, "stdout": out, "stderr": err}); return
                try:
                    from modules.timer import main as Timer
                    st = Timer.status()
                except Exception:
                    st = {}
                self._write_json(200, {"ok": True, "status": st, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer stop error: {e}"})
            return
        if parsed.path == "/api/timer/cancel":
            try:
                ok, out, err = run_console_command("timer", ["cancel"])
                if not ok:
                    self._write_json(500, {"ok": False, "stdout": out, "stderr": err}); return
                try:
                    from modules.timer import main as Timer
                    st = Timer.status()
                except Exception:
                    st = {}
                self._write_json(200, {"ok": True, "status": st, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer cancel error: {e}"})
            return
        if parsed.path == "/api/timer/confirm":
            try:
                completed = None
                action = None
                stretch_minutes = None
                if isinstance(payload, dict):
                    action = payload.get('action')
                    if 'stretch_minutes' in payload:
                        try:
                            stretch_minutes = int(payload.get('stretch_minutes'))
                        except Exception:
                            stretch_minutes = None
                    if 'completed' in payload:
                        val = payload.get('completed')
                        if isinstance(val, str):
                            completed = val.strip().lower() in {'1', 'true', 'yes', 'y', 'done'}
                        else:
                            completed = bool(val)
                act = str(action or '').strip().lower()
                if not act:
                    if completed is True:
                        act = "yes"
                    elif completed is False:
                        act = "start_over"
                    else:
                        act = "yes"
                args = ["confirm", act]
                if stretch_minutes is not None and act in {"stretch", "extend"}:
                    args.append(str(int(stretch_minutes)))
                ok, out, err = run_console_command("timer", args)
                if not ok:
                    self._write_json(500, {"ok": False, "stdout": out, "stderr": err}); return
                try:
                    from modules.timer import main as Timer
                    st = Timer.status()
                except Exception:
                    st = {}
                self._write_json(200, {"ok": True, "status": st, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer confirm error: {e}"})
            return
        if parsed.path == "/api/listener/start":
            try:
                ok, out, err = run_console_command("listener", ["start"])
                status_text = (out or "").lower()
                if "already running" in status_text:
                    state = "already running"
                elif "started" in status_text:
                    state = "started"
                else:
                    state = "unknown"
                self._write_json(200 if ok else 500, {"ok": ok, "status": state, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Listener start error: {e}"})
            return

        self._write_yaml(404, {"ok": False, "error": "Unknown endpoint"})

    def _write_yaml(self, code, obj):
        data = yaml.safe_dump(obj, allow_unicode=True)
        self.send_response(code)
        self._set_cors()
        self.send_header("Content-Type", "text/yaml; charset=utf-8")
        self.send_header("Content-Length", str(len(data.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(data.encode("utf-8"))

    def _write_json(self, code, obj):
        try:
            import json
            data = json.dumps(obj, ensure_ascii=False, default=str)  # default=str handles non-serializable types
        except Exception as e:
            sys.stderr.write(f"DEBUG: _write_json json.dumps failed: {e}\n")
            sys.stderr.flush()
            data = '{}'
        self.send_response(code)
        self._set_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(data.encode("utf-8"))


def serve(host="127.0.0.1", port=7357):
    httpd = ThreadingHTTPServer((host, port), DashboardHandler)
    print(f"Chronos Dashboard server listening on http://{host}:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    # Optional env overrides
    host = os.environ.get("CHRONOS_DASH_HOST", "127.0.0.1")
    try:
        port = int(os.environ.get("CHRONOS_DASH_PORT", "7357"))
    except Exception:
        port = 7357
    serve(host=host, port=port)
        





