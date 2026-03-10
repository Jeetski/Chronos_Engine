import io
import json
import math
import os
import subprocess
import sys
import threading
import tkinter as tk
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

from PIL import Image, ImageTk

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from modules import sound_fx as SoundFX
from commands import dashboard as dashboard_command


TOPOS_DATA_DIR = os.path.join(ROOT_DIR, "user", "data", "topos")
WALLPAPER_META_PATH = os.path.join(TOPOS_DATA_DIR, "wallpaper_meta.json")
WALLPAPER_IMAGE_PATH = os.path.join(TOPOS_DATA_DIR, "wallpaper_apod.jpg")
APOD_URL = "https://api.nasa.gov/planetary/apod"
APOD_API_KEY = "DEMO_KEY"
APOD_FALLBACK_DAYS = 7
LOGO_PATH = os.path.join(ROOT_DIR, "assets", "images", "logo_no_background.png")
ICON_PATH = os.path.join(ROOT_DIR, "assets", "chronos.ico")
WEBVIEW_SCRIPT_PATH = os.path.join(ROOT_DIR, "utilities", "topos", "webview_window.py")
CONSOLE_LAUNCHER_PATH = os.path.join(ROOT_DIR, "console_launcher.bat")


def _load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)


def _download_bytes(url, timeout=20):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Chronos-Topos/0.1",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def _fetch_apod_payload(target_date):
    params = urllib.parse.urlencode(
        {
            "api_key": APOD_API_KEY,
            "date": target_date.isoformat(),
            "thumbs": "false",
        }
    )
    raw = _download_bytes(f"{APOD_URL}?{params}")
    data = json.loads(raw.decode("utf-8"))
    return data if isinstance(data, dict) else {}


def _refresh_wallpaper_cache():
    today = date.today().isoformat()
    meta = _load_json(WALLPAPER_META_PATH)
    if (
        meta.get("fetched_for_day") == today
        and os.path.exists(WALLPAPER_IMAGE_PATH)
    ):
        return meta

    today_date = date.today()
    last_error = ""
    for days_back in range(APOD_FALLBACK_DAYS + 1):
        candidate_day = today_date - timedelta(days=days_back)
        try:
            payload = _fetch_apod_payload(candidate_day)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = str(exc)
            continue

        if str(payload.get("media_type") or "").lower() != "image":
            continue

        image_url = str(payload.get("hdurl") or payload.get("url") or "").strip()
        if not image_url:
            continue

        try:
            image_bytes = _download_bytes(image_url, timeout=30)
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            os.makedirs(TOPOS_DATA_DIR, exist_ok=True)
            image.save(WALLPAPER_IMAGE_PATH, format="JPEG", quality=92)
        except Exception as exc:
            last_error = str(exc)
            continue

        meta = {
            "fetched_for_day": today,
            "apod_date": str(payload.get("date") or candidate_day.isoformat()),
            "title": str(payload.get("title") or "").strip(),
            "image_url": image_url,
            "source": "nasa_apod_demo_key",
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
        }
        _write_json(WALLPAPER_META_PATH, meta)
        return meta

    if meta and os.path.exists(WALLPAPER_IMAGE_PATH):
        meta["last_refresh_error"] = last_error
        _write_json(WALLPAPER_META_PATH, meta)
        return meta
    return {}


class ToposApp:
    def __init__(self):
        self.wallpaper_meta = _refresh_wallpaper_cache()
        self._wallpaper_source = None
        self._wallpaper_photo = None
        self._logo_source = self._load_logo_source()
        self._logo_photo = None
        self._intro_started = False
        self._wallpaper_alpha = 0.0
        self._logo_alpha = 1.0
        self._hex_scale = 0.0
        self._tile_regions = []

        self._closing = False
        self.root = tk.Tk()
        self.root.title("Topos")
        self.root.configure(bg="#000000")
        self.root.attributes("-fullscreen", True)
        self.root.bind("<Escape>", self._handle_exit)
        self.root.bind("q", self._handle_exit)
        self.root.bind("<Configure>", self._on_resize)
        self._apply_window_icon(self.root)

        self.canvas = tk.Canvas(
            self.root,
            highlightthickness=0,
            bd=0,
            bg="#000000",
        )
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<Button-1>", self._handle_canvas_click)

        self._hex_ids = []
        self._draw_scene()
        self.root.after(120, self._start_intro)
        self.root.after(40, self._play_startup_sound)

    def _apply_window_icon(self, window):
        try:
            if os.path.exists(ICON_PATH):
                window.iconbitmap(ICON_PATH)
        except Exception:
            pass

    def _flat_top_hex_points(self, cx, cy, radius):
        points = []
        for angle_deg in (0, 60, 120, 180, 240, 300):
            angle = math.radians(angle_deg)
            points.extend(
                [
                    cx + (radius * math.cos(angle)),
                    cy + (radius * math.sin(angle)),
                ]
            )
        return points

    def _draw_background(self, width, height):
        self.canvas.create_rectangle(0, 0, width, height, fill="#000000", outline="")
        if not os.path.exists(WALLPAPER_IMAGE_PATH):
            return
        try:
            source = self._wallpaper_source
            if source is None:
                source = Image.open(WALLPAPER_IMAGE_PATH).convert("RGB")
                self._wallpaper_source = source
            fitted = self._fit_cover(source, width, height)
            if self._wallpaper_alpha < 1.0:
                black = Image.new("RGB", fitted.size, (0, 0, 0))
                fitted = Image.blend(black, fitted, max(0.0, min(1.0, self._wallpaper_alpha)))
            self._wallpaper_photo = ImageTk.PhotoImage(fitted)
            self.canvas.create_image(0, 0, image=self._wallpaper_photo, anchor="nw")
        except Exception:
            self._wallpaper_source = None
            self._wallpaper_photo = None

    def _draw_logo(self, width, height):
        if self._logo_alpha <= 0.0 or self._logo_source is None:
            return
        max_w = max(180, int(width * 0.22))
        max_h = max(100, int(height * 0.16))
        logo = self._logo_source.copy()
        logo.thumbnail((max_w, max_h), Image.LANCZOS)
        if logo.mode != "RGBA":
            logo = logo.convert("RGBA")
        alpha = logo.getchannel("A")
        alpha = alpha.point(lambda value: int(value * max(0.0, min(1.0, self._logo_alpha))))
        logo.putalpha(alpha)
        self._logo_photo = ImageTk.PhotoImage(logo)
        self.canvas.create_image(width / 2, height / 2, image=self._logo_photo, anchor="center")

    def _fit_cover(self, image, width, height):
        src_w, src_h = image.size
        scale = max(width / max(1, src_w), height / max(1, src_h))
        resized = image.resize(
            (max(1, int(src_w * scale)), max(1, int(src_h * scale))),
            Image.LANCZOS,
        )
        left = max(0, (resized.width - width) // 2)
        top = max(0, (resized.height - height) // 2)
        return resized.crop((left, top, left + width, top + height))

    def _load_logo_source(self):
        try:
            if os.path.exists(LOGO_PATH):
                return Image.open(LOGO_PATH).convert("RGBA")
        except Exception:
            return None
        return None

    def _draw_hex_tile(self, cx, cy, radius):
        self._hex_ids.append(
            self.canvas.create_polygon(
                self._flat_top_hex_points(cx, cy, radius),
                fill="#FFFFFF",
                outline="#FFFFFF",
                width=1,
                stipple="gray50",
            )
        )

    def _draw_labeled_tile(self, cx, cy, radius, label):
        self._draw_hex_tile(cx, cy, radius)
        self.canvas.create_text(
            cx,
            cy,
            text=label,
            fill="#FFFFFF",
            font=("Segoe UI", max(10, int(radius * 0.16)), "bold"),
        )

    def _draw_globe_tile(self, cx, cy, radius):
        self._draw_hex_tile(cx, cy, radius)
        globe_r = radius * 0.28
        self.canvas.create_oval(
            cx - globe_r,
            cy - globe_r,
            cx + globe_r,
            cy + globe_r,
            outline="#FFFFFF",
            width=2,
        )
        self.canvas.create_line(
            cx - globe_r * 0.95,
            cy,
            cx + globe_r * 0.95,
            cy,
            fill="#FFFFFF",
            width=1,
        )
        self.canvas.create_line(
            cx,
            cy - globe_r * 0.95,
            cx,
            cy + globe_r * 0.95,
            fill="#FFFFFF",
            width=1,
        )
        for scale in (0.45, 0.75):
            self.canvas.create_arc(
                cx - globe_r * scale,
                cy - globe_r,
                cx + globe_r * scale,
                cy + globe_r,
                start=90,
                extent=180,
                style="arc",
                outline="#FFFFFF",
                width=1,
            )
            self.canvas.create_arc(
                cx - globe_r * scale,
                cy - globe_r,
                cx + globe_r * scale,
                cy + globe_r,
                start=270,
                extent=180,
                style="arc",
                outline="#FFFFFF",
                width=1,
            )
        self.canvas.create_arc(
            cx - globe_r,
            cy - globe_r * 0.55,
            cx + globe_r,
            cy + globe_r * 0.55,
            start=0,
            extent=180,
            style="arc",
            outline="#FFFFFF",
            width=1,
        )
        self.canvas.create_arc(
            cx - globe_r,
            cy - globe_r * 0.55,
            cx + globe_r,
            cy + globe_r * 0.55,
            start=180,
            extent=180,
            style="arc",
            outline="#FFFFFF",
            width=1,
        )

    def _draw_dashboard_tile(self, cx, cy, radius):
        self._draw_hex_tile(cx, cy, radius)
        panel_w = radius * 0.56
        panel_h = radius * 0.42
        left = cx - panel_w / 2
        top = cy - panel_h / 2
        right = cx + panel_w / 2
        bottom = cy + panel_h / 2
        self.canvas.create_rectangle(
            left,
            top,
            right,
            bottom,
            outline="#FFFFFF",
            width=2,
        )
        self.canvas.create_line(
            left,
            top + panel_h * 0.22,
            right,
            top + panel_h * 0.22,
            fill="#FFFFFF",
            width=1,
        )
        for x in (left + panel_w * 0.22, left + panel_w * 0.5, left + panel_w * 0.78):
            self.canvas.create_oval(
                x - 1.5,
                top + panel_h * 0.11 - 1.5,
                x + 1.5,
                top + panel_h * 0.11 + 1.5,
                fill="#FFFFFF",
                outline="",
            )
        self.canvas.create_line(
            cx,
            top + panel_h * 0.22,
            cx,
            bottom,
            fill="#FFFFFF",
            width=1,
        )
        self.canvas.create_line(
            left,
            top + panel_h * 0.58,
            right,
            top + panel_h * 0.58,
            fill="#FFFFFF",
            width=1,
        )

    def _draw_console_tile(self, cx, cy, radius):
        self._draw_hex_tile(cx, cy, radius)
        screen_w = radius * 0.58
        screen_h = radius * 0.34
        left = cx - screen_w / 2
        top = cy - screen_h / 2
        right = cx + screen_w / 2
        bottom = cy + screen_h / 2
        self.canvas.create_rectangle(
            left,
            top,
            right,
            bottom,
            outline="#FFFFFF",
            width=2,
        )
        self.canvas.create_line(
            cx - screen_w * 0.16,
            bottom + radius * 0.10,
            cx + screen_w * 0.16,
            bottom + radius * 0.10,
            fill="#FFFFFF",
            width=2,
        )
        self.canvas.create_line(
            cx,
            bottom,
            cx,
            bottom + radius * 0.10,
            fill="#FFFFFF",
            width=1,
        )
        prompt_x = left + screen_w * 0.16
        prompt_y = top + screen_h * 0.36
        self.canvas.create_text(
            prompt_x,
            prompt_y,
            text=">",
            fill="#FFFFFF",
            font=("Consolas", max(9, int(radius * 0.18)), "bold"),
            anchor="w",
        )
        self.canvas.create_line(
            prompt_x + radius * 0.16,
            prompt_y + radius * 0.01,
            right - screen_w * 0.14,
            prompt_y + radius * 0.01,
            fill="#FFFFFF",
            width=1,
        )

    def _ring_positions(self, cx, cy, radius):
        half_x = 1.5 * radius
        half_y = (math.sqrt(3) / 2.0) * radius
        full_y = math.sqrt(3) * radius
        return [
            (cx + half_x, cy + half_y),
            (cx + half_x, cy - half_y),
            (cx, cy - full_y),
            (cx - half_x, cy - half_y),
            (cx - half_x, cy + half_y),
            (cx, cy + full_y),
        ]

    def _point_in_polygon(self, x, y, points):
        inside = False
        count = len(points)
        j = count - 1
        for i in range(count):
            xi, yi = points[i]
            xj, yj = points[j]
            intersects = ((yi > y) != (yj > y)) and (
                x < ((xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi)
            )
            if intersects:
                inside = not inside
            j = i
        return inside

    def _open_webview_window(self, url="https://www.google.com", title="Topos Webview"):
        if not os.path.exists(WEBVIEW_SCRIPT_PATH):
            return
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
            subprocess.Popen([sys.executable, WEBVIEW_SCRIPT_PATH, url, title], **kwargs)
        except Exception:
            pass

    def _open_console(self):
        if not os.path.exists(CONSOLE_LAUNCHER_PATH):
            return
        kwargs = {
            "cwd": ROOT_DIR,
        }
        if os.name == "nt":
            flags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
            if flags:
                kwargs["creationflags"] = flags
        else:
            kwargs["start_new_session"] = True
        try:
            subprocess.Popen(["cmd", "/c", CONSOLE_LAUNCHER_PATH], **kwargs)
        except Exception:
            pass

    def _is_dashboard_running(self, host="127.0.0.1", port="7357"):
        try:
            with urllib.request.urlopen(f"http://{host}:{port}/health", timeout=1.5) as response:
                return int(getattr(response, "status", 0) or 0) == 200
        except Exception:
            return False

    def _ensure_dashboard_server(self, host="127.0.0.1", port="7357"):
        if self._is_dashboard_running(host, port):
            return True
        try:
            dashboard_command.bundle_settings_for_dashboard()
        except Exception:
            pass
        try:
            from utilities import registry_builder
            registry_builder.write_trick_registry()
        except Exception:
            pass
        try:
            from utilities import registry_builder
            registry_builder.write_skills_registry()
        except Exception:
            pass

        env = os.environ.copy()
        env["CHRONOS_DASH_HOST"] = host
        env["CHRONOS_DASH_PORT"] = str(port)
        server_script = os.path.join(ROOT_DIR, "utilities", "dashboard", "server.py")
        kwargs = {
            "cwd": ROOT_DIR,
            "env": env,
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
            subprocess.Popen([sys.executable, server_script], **kwargs)
        except Exception:
            return False

        for _ in range(8):
            try:
                with urllib.request.urlopen(f"http://{host}:{port}/health", timeout=1.5) as response:
                    if int(getattr(response, "status", 0) or 0) == 200:
                        return True
            except Exception:
                pass
            try:
                import time
                time.sleep(0.3)
            except Exception:
                pass
        return self._is_dashboard_running(host, port)

    def _open_dashboard_in_webview(self):
        host = "127.0.0.1"
        port = "7357"
        if not self._ensure_dashboard_server(host, port):
            return
        self._open_webview_window(
            url=f"http://{host}:{port}/dashboard.html",
            title="Topos Dashboard",
        )

    def _draw_scene(self):
        self.canvas.delete("all")
        self._tile_regions = []
        width = max(self.root.winfo_width(), 1200)
        height = max(self.root.winfo_height(), 700)
        self._draw_background(width, height)
        self._draw_logo(width, height)
        radius = max(46, min(width, height) // 17)
        if self._hex_scale > 0.0:
            scaled_radius = max(1, radius * self._hex_scale)
            center_x = width / 2
            center_y = height / 2
            self._draw_hex_tile(center_x, center_y, scaled_radius)

            ring_radius = scaled_radius
            labels = ["globe", "dashboard", "console", "", "", ""]
            actions = ["webview", "dashboard", "console", None, None, None]
            for (tile_x, tile_y), label, action in zip(
                self._ring_positions(center_x, center_y, scaled_radius),
                labels,
                actions,
            ):
                points_flat = self._flat_top_hex_points(tile_x, tile_y, ring_radius)
                point_pairs = list(zip(points_flat[0::2], points_flat[1::2]))
                self._tile_regions.append(
                    {
                        "points": point_pairs,
                        "action": action,
                    }
                )
                if label == "globe":
                    self._draw_globe_tile(tile_x, tile_y, ring_radius)
                elif label == "dashboard":
                    self._draw_dashboard_tile(tile_x, tile_y, ring_radius)
                elif label == "console":
                    self._draw_console_tile(tile_x, tile_y, ring_radius)
                elif label:
                    self._draw_labeled_tile(tile_x, tile_y, ring_radius, label)
                else:
                    self._draw_hex_tile(tile_x, tile_y, ring_radius)

    def _on_resize(self, _event):
        self._draw_scene()

    def _handle_canvas_click(self, event):
        if self._closing or self._hex_scale <= 0.0:
            return
        for region in self._tile_regions:
            if self._point_in_polygon(event.x, event.y, region["points"]):
                action = region.get("action")
                if action == "webview":
                    self._open_webview_window()
                elif action == "dashboard":
                    self._open_dashboard_in_webview()
                elif action == "console":
                    self._open_console()
                return

    def _start_intro(self):
        if self._intro_started:
            return
        self._intro_started = True
        self._draw_scene()
        self.root.after(550, lambda: self._animate_wallpaper_fade(0))

    def _animate_wallpaper_fade(self, frame_index):
        frames = 20
        progress = min(1.0, frame_index / max(1, frames))
        self._wallpaper_alpha = progress
        self._draw_scene()
        if frame_index < frames:
            self.root.after(45, lambda: self._animate_wallpaper_fade(frame_index + 1))
            return
        self.root.after(120, lambda: self._animate_hex_pop(0))

    def _animate_hex_pop(self, frame_index):
        frames = 12
        progress = min(1.0, frame_index / max(1, frames))
        eased = 1.0 - ((1.0 - progress) ** 3)
        overshoot = 1.08 if progress > 0.72 else 1.0
        self._hex_scale = min(1.0, eased * overshoot)
        self._logo_alpha = max(0.0, 1.0 - progress * 1.15)
        self._draw_scene()
        if frame_index < frames:
            self.root.after(34, lambda: self._animate_hex_pop(frame_index + 1))
            return
        self._hex_scale = 1.0
        self._logo_alpha = 0.0
        self._draw_scene()

    def _play_startup_sound(self):
        try:
            SoundFX.play("startup", wait=False)
        except Exception:
            pass

    def _handle_exit(self, _event=None):
        if self._closing:
            return
        self._closing = True
        self.root.unbind("<Escape>")
        self.root.unbind("q")
        self._wallpaper_alpha = 0.0
        self._hex_scale = 0.0
        self._logo_alpha = 1.0
        self._draw_scene()
        self.root.update_idletasks()

        def _finish_exit():
            try:
                SoundFX.play("exit", wait=True, max_wait_seconds=3.0)
            except Exception:
                pass
            try:
                self.root.after(0, self.root.destroy)
            except Exception:
                pass

        threading.Thread(target=_finish_exit, daemon=False).start()

    def run(self):
        self.root.mainloop()


def main():
    if "--smoke-test" in sys.argv:
        print("topos-ok")
        return 0
    app = ToposApp()
    app.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
