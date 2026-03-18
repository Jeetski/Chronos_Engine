import os
import subprocess
import sys


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEBVIEW_SCRIPT_PATH = os.path.join(ROOT_DIR, "utilities", "topos", "webview_window.py")


def webview_script_exists():
    return os.path.exists(WEBVIEW_SCRIPT_PATH)


def launch_webview_window(url, title="Chronos Webview"):
    if not webview_script_exists():
        return False
    kwargs = {
        "cwd": ROOT_DIR,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if os.name == "nt":
        flags = 0
        flags |= getattr(subprocess, "DETACHED_PROCESS", 0)
        flags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        if flags:
            kwargs["creationflags"] = flags
    else:
        kwargs["start_new_session"] = True
    try:
        subprocess.Popen([sys.executable, WEBVIEW_SCRIPT_PATH, str(url), str(title)], **kwargs)
        return True
    except Exception:
        return False
