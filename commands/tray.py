import os
import sys
import subprocess


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TRAY_SCRIPT = os.path.join(ROOT_DIR, "utilities", "tray", "app.py")
PID_DIR = os.path.join(ROOT_DIR, "user", "Temp")
PID_PATH = os.path.join(PID_DIR, "tray.pid")


def _read_pid():
    try:
        with open(PID_PATH, "r", encoding="utf-8") as fh:
            raw = fh.read().strip()
        return int(raw) if raw else None
    except Exception:
        return None


def _clear_pid():
    try:
        if os.path.exists(PID_PATH):
            os.remove(PID_PATH)
    except Exception:
        pass


def _pid_alive(pid):
    if not isinstance(pid, int) or pid <= 0:
        return False
    if os.name == "nt":
        try:
            proc = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
            )
            out = (proc.stdout or "").strip().lower()
            return bool(out) and (not out.startswith("info: no tasks")) and (str(pid) in out)
        except Exception:
            return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _pythonw_executable():
    current = sys.executable or "python"
    folder = os.path.dirname(current)
    candidate = os.path.join(folder, "pythonw.exe")
    if os.name == "nt" and os.path.exists(candidate):
        return candidate
    return current


def _start_tray():
    if not os.path.exists(TRAY_SCRIPT):
        print("Tray app not found.")
        return
    pid = _read_pid()
    if pid and _pid_alive(pid):
        print(f"Tray already running (pid {pid}).")
        return
    py = _pythonw_executable()
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
    proc = subprocess.Popen([py, TRAY_SCRIPT], **kwargs)
    print(f"Tray start requested (pid {proc.pid}).")


def _stop_tray():
    pid = _read_pid()
    if not pid:
        print("Tray not running.")
        return
    if not _pid_alive(pid):
        _clear_pid()
        print("Tray not running.")
        return
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        else:
            os.kill(pid, 15)
    except Exception as e:
        print(f"Failed to stop tray: {e}")
        return
    _clear_pid()
    print("Tray stopped.")


def _status_tray():
    pid = _read_pid()
    if pid and _pid_alive(pid):
        print(f"Tray running (pid {pid}).")
        return
    if pid and not _pid_alive(pid):
        _clear_pid()
    print("Tray not running.")


def run(args, properties):
    sub = str(args[0]).strip().lower() if args else "status"
    if sub in {"help", "-h", "--help"}:
        print(get_help_message())
        return
    if sub == "start":
        _start_tray()
        return
    if sub == "stop":
        _stop_tray()
        return
    if sub == "restart":
        _stop_tray()
        _start_tray()
        return
    if sub == "status":
        _status_tray()
        return
    print(get_help_message())


def get_help_message():
    return """
Usage:
  tray start
  tray stop
  tray restart
  tray status
"""
