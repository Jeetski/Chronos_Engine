import os
import sys
import signal
import subprocess


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PID_DIR = os.path.join(ROOT_DIR, "User", "Temp")
PID_PATH = os.path.join(PID_DIR, "listener.pid")
LISTENER_PATH = os.path.join(ROOT_DIR, "modules", "listener", "listener.py")


def _read_pid():
    try:
        with open(PID_PATH, "r", encoding="utf-8") as fh:
            raw = fh.read().strip()
        return int(raw) if raw else None
    except Exception:
        return None


def _write_pid(pid: int):
    os.makedirs(PID_DIR, exist_ok=True)
    with open(PID_PATH, "w", encoding="utf-8") as fh:
        fh.write(str(int(pid)))


def _clear_pid():
    try:
        if os.path.exists(PID_PATH):
            os.remove(PID_PATH)
    except Exception:
        pass


def _pid_alive(pid: int) -> bool:
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
            out = (proc.stdout or "").strip()
            if not out:
                return False
            if out.lower().startswith("info: no tasks"):
                return False
            return str(pid) in out
        except Exception:
            return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _start_listener():
    if not os.path.exists(LISTENER_PATH):
        print("Listener entrypoint not found.")
        return

    existing = _read_pid()
    if existing and _pid_alive(existing):
        print("Listener already running.")
        return

    py = sys.executable or "python"
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

    proc = subprocess.Popen([py, LISTENER_PATH], **kwargs)
    _write_pid(proc.pid)
    print(f"Listener started (pid {proc.pid}).")


def _stop_listener():
    pid = _read_pid()
    if not pid:
        print("Listener is not running.")
        return
    if not _pid_alive(pid):
        _clear_pid()
        print("Listener is not running.")
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
            os.kill(pid, signal.SIGTERM)
    except Exception as e:
        print(f"Failed to stop listener: {e}")
        return

    _clear_pid()
    print("Listener stopped.")


def _status_listener():
    pid = _read_pid()
    if pid and _pid_alive(pid):
        print(f"Listener running (pid {pid}).")
    else:
        if pid and not _pid_alive(pid):
            _clear_pid()
        print("Listener not running.")


def run(args, properties):
    sub = str(args[0]).strip().lower() if args else "status"
    if sub in {"help", "-h", "--help"}:
        print(get_help_message())
        return
    if sub == "start":
        _start_listener()
        return
    if sub == "stop":
        _stop_listener()
        return
    if sub == "status":
        _status_listener()
        return
    print(get_help_message())


def get_help_message():
    return """
Usage:
  listener start
  listener stop
  listener status
"""

