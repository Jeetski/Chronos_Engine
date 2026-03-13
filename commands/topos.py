import os
import subprocess
import sys


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TOPOS_SCRIPT = os.path.join(ROOT_DIR, "utilities", "topos", "app.py")


def _pythonw_executable():
    current = sys.executable or "python"
    folder = os.path.dirname(current)
    candidate = os.path.join(folder, "pythonw.exe")
    if os.name == "nt" and os.path.exists(candidate):
        return candidate
    return current


def run(args, properties):
    if args and str(args[0]).lower() in {"help", "-h", "--help"}:
        print(get_help_message())
        return

    if not os.path.exists(TOPOS_SCRIPT):
        print("Topos app not found.")
        return

    py = _pythonw_executable()
    print(f"[topos] Interpreter: {py}")
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
        subprocess.Popen([py, TOPOS_SCRIPT], **kwargs)
        print("Topos launch requested.")
    except Exception as exc:
        print(f"Failed to launch Topos: {exc}")


def get_help_message():
    return """
Usage: topos
Description: Launches the Topos fullscreen shell prototype.
Controls: Press Esc inside Topos to exit.
"""
