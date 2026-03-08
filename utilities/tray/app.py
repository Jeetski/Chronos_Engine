import os
import sys
import threading
import subprocess
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import ttk

try:
    import yaml
except Exception as exc:
    raise RuntimeError("PyYAML is required for Chronos tray.") from exc

try:
    import pystray
    from pystray import MenuItem as Item
except Exception as exc:
    raise RuntimeError("pystray is required for Chronos tray.") from exc

try:
    from PIL import Image, ImageDraw
except Exception as exc:
    raise RuntimeError("Pillow is required for Chronos tray.") from exc


ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

PID_DIR = ROOT_DIR / "user" / "Temp"
PID_PATH = PID_DIR / "tray.pid"

from modules.timer import main as Timer
from modules.scheduler import get_flattened_schedule, schedule_path_for_date
from modules.console import invoke_command


class ChronosTrayApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title("Chronos Mini")
        self.root.protocol("WM_DELETE_WINDOW", self.hide_window)
        self.window = None
        self._theme_ready = False

        self.status_var = tk.StringVar(value="Timer: idle")
        self.phase_var = tk.StringVar(value="Phase: -")
        self.block_var = tk.StringVar(value="Block: -")
        self.queue_var = tk.StringVar(value="Schedule: -")

        self.schedule_box = None
        self._latest_timer_state = {}
        self._last_icon_key = None
        self._tick_job = None
        self._quitting = False
        self._last_pending_prompt_key = None
        self._base_icon = self._load_base_icon()
        self.icon = pystray.Icon("chronos_tray", self._base_icon, "Chronos", self._build_menu())

    def _apply_theme(self):
        if self._theme_ready:
            return
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except Exception:
            pass

        bg = "#0b1220"
        panel = "#111a2b"
        border = "#22314f"
        text = "#e6edf7"
        dim = "#9fb0ca"
        accent = "#5aa9ff"
        accent_active = "#7bc2ff"

        self.root.configure(bg=bg)
        style.configure("Chronos.TFrame", background=panel)
        style.configure("Chronos.Header.TLabel", background=panel, foreground=text, font=("Segoe UI", 10, "bold"))
        style.configure("Chronos.TLabel", background=panel, foreground=dim, font=("Segoe UI", 9))
        style.configure(
            "Chronos.TButton",
            background="#18243a",
            foreground=text,
            bordercolor=border,
            lightcolor=border,
            darkcolor=border,
            relief="flat",
            padding=(10, 6),
            font=("Segoe UI", 9, "bold"),
        )
        style.map(
            "Chronos.TButton",
            background=[("active", "#213454"), ("pressed", "#18243a")],
            foreground=[("disabled", "#6f809b"), ("active", text)],
            bordercolor=[("active", accent), ("pressed", accent_active)],
        )
        style.configure(
            "ChronosAccent.TButton",
            background=accent,
            foreground="#07101f",
            bordercolor=accent,
            lightcolor=accent,
            darkcolor=accent,
            relief="flat",
            padding=(10, 6),
            font=("Segoe UI", 9, "bold"),
        )
        style.map(
            "ChronosAccent.TButton",
            background=[("active", accent_active), ("pressed", accent)],
            foreground=[("active", "#07101f"), ("pressed", "#07101f")],
        )
        self._theme_ready = True

    def _load_base_icon(self):
        candidates = [
            ROOT_DIR / "assets" / "chronos.ico",
            ROOT_DIR / "assets" / "images" / "icon.ico",
            ROOT_DIR / "assets" / "images" / "hivemind_studio_icon.ico",
        ]
        for path in candidates:
            if path.exists():
                try:
                    return Image.open(path).convert("RGBA").resize((64, 64))
                except Exception:
                    continue
        return Image.new("RGBA", (64, 64), (20, 26, 37, 255))

    def _render_ring_icon(self, percent):
        img = self._base_icon.copy().resize((64, 64))
        draw = ImageDraw.Draw(img, "RGBA")
        outer = (4, 4, 60, 60)
        draw.ellipse(outer, outline=(80, 95, 120, 180), width=6)
        sweep = max(0, min(360, int(round((percent / 100.0) * 360))))
        if sweep > 0:
            draw.arc(outer, start=-90, end=(-90 + sweep), fill=(96, 180, 255, 255), width=6)
        return img

    def _timer_progress_percent(self, st):
        if not isinstance(st, dict):
            return 0
        rem = int(st.get("remaining_seconds") or 0)
        block = st.get("current_block") if isinstance(st.get("current_block"), dict) else {}
        mode = str(st.get("mode") or "").lower()
        prof = st.get("profile") if isinstance(st.get("profile"), dict) else {}
        total = 1
        if mode == "schedule" and block:
            try:
                total = max(1, int(float(block.get("minutes") or 1) * 60))
            except Exception:
                total = 1
        else:
            phase = str(st.get("current_phase") or "")
            if phase == "focus":
                total = max(1, int(prof.get("focus_minutes") or 25) * 60)
            elif phase == "short_break":
                total = max(1, int(prof.get("short_break_minutes") or 5) * 60)
            elif phase == "long_break":
                total = max(1, int(prof.get("long_break_minutes") or 15) * 60)
        return max(0, min(100, int(round(((total - rem) / total) * 100))))

    def _hhmmss(self, seconds):
        s = max(0, int(seconds or 0))
        mm, ss = divmod(s, 60)
        return f"{mm:02d}:{ss:02d}"

    def _nice_label(self, value):
        txt = str(value or "").strip()
        if not txt:
            return "-"
        return txt.replace("_", " ").title()

    def _status_phase_time_line(self, status, phase, rem):
        status_txt = self._nice_label(status or "idle")
        phase_txt = self._nice_label(phase or "-")
        rem_txt = self._hhmmss(rem or 0)
        if status_txt.lower() == "running":
            return f"{phase_txt} | {rem_txt}"
        return f"{status_txt} | {phase_txt} | {rem_txt}"

    def _minutes_from_label(self, value):
        if value is None:
            return None
        txt = str(value).strip()
        if not txt:
            return None
        for fmt in ("%H:%M", "%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
            try:
                dt = datetime.strptime(txt, fmt)
                return (int(dt.hour) * 60) + int(dt.minute)
            except Exception:
                continue
        return None

    def _display_time_label(self, value):
        mins = self._minutes_from_label(value)
        if mins is None:
            return "--:--"
        hh = mins // 60
        mm = mins % 60
        return f"{hh:02d}:{mm:02d}"

    def _current_schedule_blocks(self):
        path = schedule_path_for_date(datetime.now())
        if not os.path.exists(path):
            return []
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or []
        except Exception:
            return []
        if not isinstance(data, list):
            return []
        flat = get_flattened_schedule(data)
        blocks = []
        for blk in flat:
            if not isinstance(blk, dict):
                continue
            name = str(blk.get("name") or "Unnamed")
            start = blk.get("start_time") or blk.get("ideal_start_time") or ""
            end = blk.get("end_time") or blk.get("ideal_end_time") or ""
            is_buffer = bool(blk.get("is_buffer") or blk.get("is_break"))
            if not is_buffer:
                block_id = str(blk.get("block_id") or "").strip().lower()
                subtype = str(blk.get("subtype") or blk.get("timeblock_subtype") or "").lower()
                typ = str(blk.get("type") or "").lower()
                if (
                    subtype in {"buffer", "break"}
                    or typ in {"buffer", "break"}
                    or "::buffer::" in block_id
                    or "::break::" in block_id
                ):
                    is_buffer = True
            blocks.append(
                {
                    "name": name,
                    "start": str(start),
                    "end": str(end),
                    "is_buffer": is_buffer,
                }
            )
        return blocks

    def _build_menu(self):
        return pystray.Menu(
            Item(lambda _: self._menu_status_line(), None, enabled=False),
            pystray.Menu.SEPARATOR,
            Item("Show Mini Panel", lambda: self.show_window()),
            Item("Start Day", lambda: self.start_day()),
            Item("Start Timer", lambda: self.timer_start_default()),
            Item("Pause/Resume Timer", lambda: self.timer_pause_resume()),
            Item("Stop Timer", lambda: self.timer_stop()),
            pystray.Menu.SEPARATOR,
            Item("Done", lambda: self.timer_done()),
            Item("Skip Today", lambda: self.timer_skip_today()),
            Item("Later", lambda: self.timer_later()),
            Item("Start Over", lambda: self.timer_start_over()),
            Item("Stretch", lambda: self.timer_stretch()),
            pystray.Menu.SEPARATOR,
            Item("Open Console", lambda: self.open_cli()),
            Item("Open Dashboard", lambda: self.open_dashboard()),
            pystray.Menu.SEPARATOR,
            Item("Quit", self.request_quit),
        )

    def _menu_status_line(self):
        st = self._latest_timer_state or {}
        return f"Timer: {self._status_phase_time_line(st.get('status'), st.get('current_phase'), st.get('remaining_seconds'))}"

    def open_cli(self):
        subprocess.Popen(["cmd", "/c", "console_launcher.bat"], cwd=str(ROOT_DIR))

    def open_dashboard(self):
        subprocess.Popen(["cmd", "/c", "dashboard_launcher.bat"], cwd=str(ROOT_DIR))

    def start_day(self):
        try:
            invoke_command("start", ["day"], {})
        except Exception:
            pass
        self.refresh_state()

    def _default_profile(self):
        settings_path = ROOT_DIR / "user" / "settings" / "Timer_Settings.yml"
        if not settings_path.exists():
            return "classic_pomodoro"
        try:
            data = yaml.safe_load(settings_path.read_text(encoding="utf-8")) or {}
            return str(data.get("default_profile") or "classic_pomodoro")
        except Exception:
            return "classic_pomodoro"

    def timer_start_default(self):
        profile = self._default_profile()
        try:
            Timer.start_timer(profile)
        except Exception:
            pass
        self.refresh_state()

    def timer_pause_resume(self):
        st = Timer.status()
        status = str(st.get("status") or "idle").lower()
        try:
            if status == "paused":
                Timer.resume_timer()
            elif status == "running":
                Timer.pause_timer()
        except Exception:
            pass
        self.refresh_state()

    def timer_stop(self):
        try:
            Timer.stop_timer()
        except Exception:
            pass
        self.refresh_state()

    def _timer_confirm_action(self, action):
        try:
            # Uses the same schedule confirmation actions as the dashboard timer widget.
            Timer.confirm_schedule_block(None, action)
        except Exception:
            pass
        self.refresh_state()

    def timer_done(self):
        self._timer_confirm_action("yes")

    def timer_skip_today(self):
        self._timer_confirm_action("skip")

    def timer_later(self):
        # Keep behavior aligned with the dashboard timer widget's "Later" action.
        self._timer_confirm_action("skip")

    def timer_start_over(self):
        self._timer_confirm_action("start_over")

    def timer_stretch(self):
        self._timer_confirm_action("stretch")

    def _build_window(self):
        self._apply_theme()
        win = tk.Toplevel(self.root)
        win.title("Chronos Mini")
        win.geometry("520x420")
        win.protocol("WM_DELETE_WINDOW", self.hide_window)
        win.attributes("-topmost", True)
        win.configure(bg="#0b1220")

        frame = ttk.Frame(win, padding=12, style="Chronos.TFrame")
        frame.pack(fill=tk.BOTH, expand=True)

        ttk.Label(frame, textvariable=self.status_var, style="Chronos.Header.TLabel").pack(anchor=tk.W)
        ttk.Label(frame, textvariable=self.phase_var, style="Chronos.TLabel").pack(anchor=tk.W)
        ttk.Label(frame, textvariable=self.block_var, style="Chronos.TLabel").pack(anchor=tk.W)
        ttk.Label(frame, textvariable=self.queue_var, style="Chronos.TLabel").pack(anchor=tk.W, pady=(0, 8))

        btn_row = ttk.Frame(frame, style="Chronos.TFrame")
        btn_row.pack(fill=tk.X, pady=(0, 8))
        ttk.Button(btn_row, text="Start Day", command=self.start_day, style="ChronosAccent.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(btn_row, text="Start Timer", command=self.timer_start_default, style="Chronos.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(btn_row, text="Pause/Resume", command=self.timer_pause_resume, style="Chronos.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(btn_row, text="Stop", command=self.timer_stop, style="Chronos.TButton").pack(side=tk.LEFT)

        launch_row = ttk.Frame(frame, style="Chronos.TFrame")
        launch_row.pack(fill=tk.X, pady=(0, 8))
        ttk.Button(launch_row, text="Open Console", command=self.open_cli, style="Chronos.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(launch_row, text="Open Dashboard", command=self.open_dashboard, style="Chronos.TButton").pack(side=tk.LEFT)

        ttk.Label(frame, text="Today's Schedule", style="Chronos.Header.TLabel").pack(anchor=tk.W)
        self.schedule_box = tk.Listbox(
            frame,
            height=14,
            bg="#0e1728",
            fg="#d5e2f7",
            selectbackground="#1e3a5f",
            selectforeground="#ecf3ff",
            highlightthickness=1,
            highlightbackground="#22314f",
            highlightcolor="#5aa9ff",
            borderwidth=0,
            relief="flat",
            activestyle="none",
            font=("Consolas", 10),
        )
        self.schedule_box.pack(fill=tk.BOTH, expand=True)
        return win

    def show_window(self):
        if self.window is None or not self.window.winfo_exists():
            self.window = self._build_window()
        self.window.deiconify()
        self.window.lift()
        self.window.focus_force()
        self.refresh_state()

    def hide_window(self):
        if self.window and self.window.winfo_exists():
            self.window.withdraw()

    def _refresh_schedule_list(self, current_block_name):
        if not self.schedule_box:
            return
        blocks = self._current_schedule_blocks()
        self.schedule_box.delete(0, tk.END)
        now = datetime.now()
        now_min = (int(now.hour) * 60) + int(now.minute)
        for blk in blocks:
            marker = ">" if current_block_name and blk["name"] == current_block_name else " "
            kind = "break" if blk["is_buffer"] else "focus"
            start_label = self._display_time_label(blk.get("start"))
            end_label = self._display_time_label(blk.get("end"))
            line = f"{marker} [{kind}] {start_label} - {end_label}  {blk['name']}"
            self.schedule_box.insert(tk.END, line.strip())

            start_min = self._minutes_from_label(blk.get("start"))
            end_min = self._minutes_from_label(blk.get("end"))
            tone = "future"
            if end_min is not None and end_min <= now_min:
                tone = "past"
            elif start_min is not None and end_min is not None and start_min <= now_min < end_min:
                tone = "now"
            elif start_min is not None and start_min <= now_min:
                tone = "past"

            idx = self.schedule_box.size() - 1
            if tone == "past":
                self.schedule_box.itemconfig(idx, fg="#ff6b6b")
            elif tone == "now":
                self.schedule_box.itemconfig(idx, fg="#66b3ff")
            else:
                self.schedule_box.itemconfig(idx, fg="#4fd89b")

    def refresh_state(self):
        st = Timer.status()
        self._latest_timer_state = st if isinstance(st, dict) else {}
        status = st.get("status") or "idle"
        phase = st.get("current_phase") or "-"
        rem = self._hhmmss(st.get("remaining_seconds") or 0)
        block = st.get("current_block") if isinstance(st.get("current_block"), dict) else {}
        block_name = str(block.get("name") or "-")

        sched = st.get("schedule_state") if isinstance(st.get("schedule_state"), dict) else {}
        total = int(sched.get("total_blocks") or 0)
        idx = int(sched.get("current_index") or 0)
        queue_line = f"Schedule: block {min(total, idx + 1)} of {total}" if total > 0 else "Schedule: -"

        self.status_var.set(f"Timer: {status} ({rem})")
        self.phase_var.set(f"Phase: {phase}")
        self.block_var.set(f"Block: {block_name}")
        self.queue_var.set(queue_line)
        self._refresh_schedule_list(block_name if block_name != "-" else "")

        self._update_tray_icon(st)
        self._maybe_notify_pending_confirmation(st)
        state_line = self._status_phase_time_line(status, phase, st.get("remaining_seconds"))
        if block_name and block_name != "-":
            short_block = (block_name[:48] + "...") if len(block_name) > 51 else block_name
            self.icon.title = f"Chronos\n{short_block}\n{state_line}"
        else:
            self.icon.title = f"Chronos\nNo active block\n{state_line}"
        self.icon.update_menu()

    def _update_tray_icon(self, st):
        status = str(st.get("status") or "idle").lower()
        if status in {"running", "paused"}:
            pct = self._timer_progress_percent(st)
            key = f"ring:{pct}"
            if key != self._last_icon_key:
                self.icon.icon = self._render_ring_icon(pct)
                self._last_icon_key = key
            return
        if self._last_icon_key != "base":
            self.icon.icon = self._base_icon
            self._last_icon_key = "base"

    def _maybe_notify_pending_confirmation(self, st):
        pending = st.get("pending_confirmation") if isinstance(st, dict) else None
        if not isinstance(pending, dict):
            self._last_pending_prompt_key = None
            return
        block = pending.get("block") if isinstance(pending.get("block"), dict) else {}
        block_name = str(block.get("name") or "this block").strip() or "this block"
        prompted_at = str(pending.get("prompted_at") or "").strip()
        key = f"{block_name}|{prompted_at}"
        if key == self._last_pending_prompt_key:
            return
        self._last_pending_prompt_key = key
        try:
            self.icon.notify(
                f'Finished "{block_name}"?\nOpen Chronos Mini to confirm.',
                "Chronos Timer Check-in",
            )
        except Exception:
            pass

    def _tick(self):
        if self._quitting:
            return
        try:
            self.refresh_state()
        finally:
            self._tick_job = self.root.after(1000, self._tick)

    def run(self):
        self.icon.run_detached()
        self._tick_job = self.root.after(400, self._tick)
        self.root.mainloop()

    def request_quit(self, *args):
        # pystray callback thread -> marshal all Tk work onto UI thread.
        if self._quitting:
            return
        try:
            self.root.after(0, self.quit)
        except Exception:
            self.quit()

    def quit(self):
        if self._quitting:
            return
        self._quitting = True
        try:
            if self._tick_job:
                self.root.after_cancel(self._tick_job)
        except Exception:
            pass
        try:
            self.icon.visible = False
        except Exception:
            pass
        try:
            self.icon.stop()
        except Exception:
            pass
        _clear_pid_file()
        try:
            self.root.quit()
            self.root.destroy()
        except Exception:
            pass


def _read_pid_file():
    try:
        raw = PID_PATH.read_text(encoding="utf-8").strip()
        return int(raw) if raw else None
    except Exception:
        return None


def _write_pid_file(pid):
    try:
        PID_DIR.mkdir(parents=True, exist_ok=True)
        PID_PATH.write_text(str(int(pid)), encoding="utf-8")
    except Exception:
        pass


def _clear_pid_file():
    try:
        if PID_PATH.exists():
            PID_PATH.unlink()
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


def main():
    existing = _read_pid_file()
    if existing and _pid_alive(existing):
        return
    _write_pid_file(os.getpid())
    app = ChronosTrayApp()
    app.run()


if __name__ == "__main__":
    main()
