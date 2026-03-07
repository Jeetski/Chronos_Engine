import os
import threading

try:
    import yaml  # type: ignore
except Exception:
    yaml = None

try:
    import pygame  # type: ignore
except Exception:
    pygame = None  # type: ignore


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SETTINGS_PATH = os.path.join(ROOT_DIR, "user", "Settings", "sound_settings.yml")
ASSETS_DIR = os.path.join(ROOT_DIR, "assets")

DEFAULT_SETTINGS = {
    "enabled": True,
    "sounds": {
        "startup": True,
        "done": True,
        "error": True,
        "exit": True,
    },
    "files": {
        "startup": "sounds/startup.mp3",
        "done": "sounds/done.mp3",
        "error": "sounds/error.mp3",
        "exit": "sounds/exit.mp3",
    },
}

def _base_settings():
    # Avoid stdlib `copy` dependency because command module loading can shadow it.
    return {
        "enabled": bool(DEFAULT_SETTINGS.get("enabled", True)),
        "sounds": {
            "startup": bool(DEFAULT_SETTINGS["sounds"].get("startup", True)),
            "done": bool(DEFAULT_SETTINGS["sounds"].get("done", True)),
            "error": bool(DEFAULT_SETTINGS["sounds"].get("error", True)),
            "exit": bool(DEFAULT_SETTINGS["sounds"].get("exit", True)),
        },
        "files": {
            "startup": str(DEFAULT_SETTINGS["files"].get("startup", "sounds/startup.mp3")),
            "done": str(DEFAULT_SETTINGS["files"].get("done", "sounds/done.mp3")),
            "error": str(DEFAULT_SETTINGS["files"].get("error", "sounds/error.mp3")),
            "exit": str(DEFAULT_SETTINGS["files"].get("exit", "sounds/exit.mp3")),
        },
    }

_mixer_lock = threading.Lock()
_mixer_ready = False
_mixer_failed = False


def _merged_settings(data):
    out = _base_settings()
    if not isinstance(data, dict):
        return out

    if isinstance(data.get("enabled"), bool):
        out["enabled"] = data["enabled"]

    sounds = data.get("sounds")
    if isinstance(sounds, dict):
        for key in out["sounds"]:
            if isinstance(sounds.get(key), bool):
                out["sounds"][key] = sounds[key]

    files = data.get("files")
    if isinstance(files, dict):
        for key in out["files"]:
            val = files.get(key)
            if isinstance(val, str) and val.strip():
                out["files"][key] = val.strip()

    return out


def load_settings(write_if_missing=True):
    data = {}
    if yaml and os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
                loaded = yaml.safe_load(f) or {}
                if isinstance(loaded, dict):
                    data = loaded
        except Exception:
            data = {}

    merged = _merged_settings(data)
    if write_if_missing and (not os.path.exists(SETTINGS_PATH)):
        save_settings(merged)
    return merged


def save_settings(settings):
    merged = _merged_settings(settings)
    try:
        os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
        if yaml:
            with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
                yaml.safe_dump(merged, f, sort_keys=False, default_flow_style=False)
        else:
            # Best-effort fallback if yaml module is unavailable.
            with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
                f.write(str(merged))
    except Exception:
        pass
    return merged


def list_sound_names():
    return list(DEFAULT_SETTINGS["sounds"].keys())


def set_all_enabled(enabled):
    st = load_settings()
    val = bool(enabled)
    st["enabled"] = val
    for name in st.get("sounds", {}):
        st["sounds"][name] = val
    save_settings(st)
    return st


def set_sound_enabled(sound_name, enabled):
    name = str(sound_name or "").strip().lower()
    st = load_settings()
    sounds = st.get("sounds", {})
    if name not in sounds:
        return False
    sounds[name] = bool(enabled)
    st["sounds"] = sounds
    save_settings(st)
    return True


def get_status():
    return load_settings()


def _is_enabled(sound_name):
    st = load_settings(write_if_missing=False)
    name = str(sound_name or "").strip().lower()
    if not st.get("enabled", True):
        return False
    return bool((st.get("sounds") or {}).get(name, False))


def _resolve_sound_path(sound_name):
    st = load_settings(write_if_missing=False)
    name = str(sound_name or "").strip().lower()
    fn = (st.get("files") or {}).get(name)
    if not fn:
        return None
    candidate = fn if os.path.isabs(fn) else os.path.join(ASSETS_DIR, fn)
    if os.path.exists(candidate):
        return candidate
    # Backward compatibility for legacy settings that used bare filenames.
    fallback = os.path.join(ASSETS_DIR, "sounds", os.path.basename(str(fn)))
    if os.path.exists(fallback):
        return fallback
    return None


def _ensure_mixer():
    global _mixer_ready, _mixer_failed
    if _mixer_ready:
        return True
    if _mixer_failed or pygame is None:
        return False

    with _mixer_lock:
        if _mixer_ready:
            return True
        if _mixer_failed or pygame is None:
            return False
        try:
            pygame.mixer.init()
            _mixer_ready = True
            return True
        except Exception:
            _mixer_failed = True
            return False


def _play_sync(path, wait=False, max_wait_seconds=2.0):
    if not _ensure_mixer():
        return False
    try:
        snd = pygame.mixer.Sound(path)
        ch = snd.play()
        if wait and ch is not None:
            try:
                import time
                deadline = time.time() + max(0.1, float(max_wait_seconds))
                while ch.get_busy() and time.time() < deadline:
                    time.sleep(0.03)
            except Exception:
                pass
        return True
    except Exception:
        return False


def play(sound_name, wait=False, max_wait_seconds=2.0):
    name = str(sound_name or "").strip().lower()
    if not name:
        return False
    if not _is_enabled(name):
        return False
    path = _resolve_sound_path(name)
    if not path:
        return False
    if wait:
        return _play_sync(path, wait=True, max_wait_seconds=max_wait_seconds)
    threading.Thread(target=_play_sync, args=(path, False, max_wait_seconds), daemon=True).start()
    return True

