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
from tkinter import messagebox, ttk

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from modules import sound_fx as SoundFX
from modules.item_manager import dispatch_command
from modules.tile import main as TileModule
from commands import dashboard as dashboard_command
from utilities.webview_launcher import launch_webview_window, webview_script_exists


TOPOS_DATA_DIR = os.path.join(ROOT_DIR, "user", "data", "topos")
WALLPAPER_META_PATH = os.path.join(TOPOS_DATA_DIR, "wallpaper_meta.json")
WALLPAPER_IMAGE_PATH = os.path.join(TOPOS_DATA_DIR, "wallpaper_apod.jpg")
APOD_URL = "https://api.nasa.gov/planetary/apod"
APOD_API_KEY = "DEMO_KEY"
APOD_FALLBACK_DAYS = 7
LOGO_PATH = os.path.join(ROOT_DIR, "assets", "images", "logo_no_background.png")
ICON_PATH = os.path.join(ROOT_DIR, "assets", "chronos.ico")
CONSOLE_LAUNCHER_PATH = os.path.join(ROOT_DIR, "console_launcher.bat")
CUSTOM_TILE_SLOTS = {3, 4, 5}


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
        self._tile_photo_refs = []

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

    def _draw_folder_tile(self, cx, cy, radius):
        self._draw_hex_tile(cx, cy, radius)
        w = radius * 0.56
        h = radius * 0.30
        left = cx - w / 2
        top = cy - h / 3
        self.canvas.create_polygon(
            left,
            top,
            left + w * 0.28,
            top,
            left + w * 0.38,
            top - h * 0.30,
            left + w * 0.62,
            top - h * 0.30,
            left + w * 0.72,
            top,
            left + w,
            top,
            left + w,
            top + h,
            left,
            top + h,
            outline="#FFFFFF",
            fill="",
            width=2,
        )

    def _draw_file_tile(self, cx, cy, radius):
        self._draw_hex_tile(cx, cy, radius)
        w = radius * 0.40
        h = radius * 0.54
        left = cx - w / 2
        top = cy - h / 2
        right = cx + w / 2
        bottom = cy + h / 2
        fold = w * 0.24
        self.canvas.create_polygon(
            left,
            top,
            right - fold,
            top,
            right,
            top + fold,
            right,
            bottom,
            left,
            bottom,
            outline="#FFFFFF",
            fill="",
            width=2,
        )
        self.canvas.create_line(
            right - fold,
            top,
            right - fold,
            top + fold,
            right,
            top + fold,
            fill="#FFFFFF",
            width=1,
        )

    def _draw_group_tile(self, cx, cy, radius):
        self._draw_hex_tile(cx, cy, radius)
        box = radius * 0.18
        gap = box * 0.45
        for row in (-1, 1):
            for col in (-1, 1):
                x = cx + col * (box / 2 + gap / 2)
                y = cy + row * (box / 2 + gap / 2)
                self.canvas.create_rectangle(
                    x - box / 2,
                    y - box / 2,
                    x + box / 2,
                    y + box / 2,
                    outline="#FFFFFF",
                    width=2,
                )

    def _draw_star_tile(self, cx, cy, radius):
        self._draw_hex_tile(cx, cy, radius)
        points = []
        outer = radius * 0.30
        inner = outer * 0.45
        for idx in range(10):
            angle = math.radians(-90 + idx * 36)
            r = outer if idx % 2 == 0 else inner
            points.extend([cx + r * math.cos(angle), cy + r * math.sin(angle)])
        self.canvas.create_polygon(points, outline="#FFFFFF", fill="", width=2)

    def _draw_link_tile(self, cx, cy, radius):
        self._draw_hex_tile(cx, cy, radius)
        r = radius * 0.17
        offset = radius * 0.12
        self.canvas.create_oval(cx - r - offset, cy - r, cx + r - offset, cy + r, outline="#FFFFFF", width=2)
        self.canvas.create_oval(cx - r + offset, cy - r, cx + r + offset, cy + r, outline="#FFFFFF", width=2)
        self.canvas.create_line(cx - offset * 0.2, cy - r * 0.55, cx + offset * 0.2, cy + r * 0.55, fill="#FFFFFF", width=2)

    def _draw_custom_icon_tile(self, cx, cy, radius, icon_path):
        self._draw_hex_tile(cx, cy, radius)
        path = str(icon_path or "").strip()
        if not path or not os.path.exists(path):
            return
        try:
            image = Image.open(path).convert("RGBA")
            image.thumbnail((max(18, int(radius * 0.9)), max(18, int(radius * 0.9))), Image.LANCZOS)
            photo = ImageTk.PhotoImage(image)
            self._tile_photo_refs.append(photo)
            self.canvas.create_image(cx, cy, image=photo, anchor="center")
        except Exception:
            pass

    def _draw_dynamic_tile(self, cx, cy, radius, tile_data):
        row = TileModule.normalize_tile_data(tile_data)
        icon = str(row.get("icon") or "globe").strip().lower()
        if icon == "custom":
            self._draw_custom_icon_tile(cx, cy, radius, row.get("icon_path"))
        elif icon == "folder":
            self._draw_folder_tile(cx, cy, radius)
        elif icon == "file":
            self._draw_file_tile(cx, cy, radius)
        elif icon == "group":
            self._draw_group_tile(cx, cy, radius)
        elif icon == "star":
            self._draw_star_tile(cx, cy, radius)
        elif icon == "link":
            self._draw_link_tile(cx, cy, radius)
        else:
            self._draw_globe_tile(cx, cy, radius)
        label = str(row.get("name") or "").strip()
        if label:
            short = label[:14] + "..." if len(label) > 17 else label
            self.canvas.create_text(
                cx,
                cy + radius * 0.48,
                text=short,
                fill="#FFFFFF",
                font=("Segoe UI", max(7, int(radius * 0.10))),
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
        if not webview_script_exists():
            return
        launch_webview_window(url, title)

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

    def _open_group_tile(self, tile_data):
        row = TileModule.normalize_tile_data(tile_data)
        win = tk.Toplevel(self.root)
        win.title(str(row.get("name") or "Tile Group"))
        win.geometry("540x420")
        win.configure(bg="#050505")
        self._apply_window_icon(win)

        frame = tk.Frame(win, bg="#050505", padx=18, pady=18)
        frame.pack(fill="both", expand=True)
        tk.Label(
            frame,
            text=str(row.get("name") or "Group"),
            fg="#FFFFFF",
            bg="#050505",
            font=("Segoe UI", 16, "bold"),
        ).pack(anchor="w")

        linked_type = str(row.get("linked_item_type") or "").strip()
        linked_name = str(row.get("linked_item_name") or "").strip()
        if linked_type and linked_name:
            tk.Label(
                frame,
                text=f"Linked to: {linked_type} / {linked_name}",
                fg="#DADADA",
                bg="#050505",
                font=("Segoe UI", 10),
            ).pack(anchor="w", pady=(6, 10))

        body = tk.Frame(frame, bg="#111111")
        body.pack(fill="both", expand=True)
        targets = list(row.get("targets") or [])
        if row.get("target") and row.get("target") not in targets:
            targets.insert(0, str(row.get("target")))
        if not targets:
            tk.Label(
                body,
                text="No targets in this group yet.",
                fg="#BDBDBD",
                bg="#111111",
                font=("Segoe UI", 11),
            ).place(relx=0.5, rely=0.5, anchor="center")
            return

        for target in targets:
            btn = tk.Button(
                body,
                text=target,
                anchor="w",
                relief="flat",
                bg="#161616",
                fg="#FFFFFF",
                activebackground="#242424",
                activeforeground="#FFFFFF",
                command=lambda value=target: self._open_tile_target(TileModule.normalize_tile_data({"tile_type": "url" if value.startswith(("http://", "https://")) else "file", "target": value})),
            )
            btn.pack(fill="x", padx=12, pady=8)

    def _open_tile_target(self, tile_data):
        row = TileModule.normalize_tile_data(tile_data)
        tile_type = str(row.get("tile_type") or "").lower()
        if tile_type == "group":
            self._open_group_tile(row)
            return
        target = str(row.get("target") or "").strip()
        if not target:
            return
        if tile_type == "url" or target.startswith(("http://", "https://")):
            self._open_webview_window(url=target, title=str(row.get("name") or "Topos Webview"))
            return
        try:
            if os.name == "nt":
                os.startfile(target)  # type: ignore[attr-defined]
            else:
                subprocess.Popen(["xdg-open", target], cwd=ROOT_DIR)
        except Exception:
            pass

    def _create_tile_for_slot(self, slot_index, payload):
        name = str(payload.get("name") or "").strip()
        if not name:
            raise ValueError("Tile name is required.")
        if TileModule.get_tile(name):
            raise ValueError(f"Tile '{name}' already exists.")
        props = {
            "tile_type": str(payload.get("tile_type") or "url").strip().lower(),
            "icon": str(payload.get("icon") or "globe").strip().lower(),
            "icon_path": str(payload.get("icon_path") or "").strip(),
            "target": str(payload.get("target") or "").strip(),
            "targets": payload.get("targets") or [],
            "linked_item_type": str(payload.get("linked_item_type") or "").strip().lower(),
            "linked_item_name": str(payload.get("linked_item_name") or "").strip(),
            "ring": 1,
            "slot": int(slot_index),
            "enabled": True,
        }
        dispatch_command("new", "tile", name, None, props)

    def _show_create_tile_popup(self, slot_index):
        win = tk.Toplevel(self.root)
        win.title("Create Tile")
        win.geometry("470x540")
        win.configure(bg="#050505")
        win.transient(self.root)
        win.grab_set()
        self._apply_window_icon(win)

        frame = tk.Frame(win, bg="#050505", padx=18, pady=18)
        frame.pack(fill="both", expand=True)

        tk.Label(frame, text=f"Create Tile for Slot {slot_index + 1}", fg="#FFFFFF", bg="#050505", font=("Segoe UI", 14, "bold")).pack(anchor="w", pady=(0, 12))

        def add_field(label_text):
            tk.Label(frame, text=label_text, fg="#D6D6D6", bg="#050505", font=("Segoe UI", 9)).pack(anchor="w")

        name_var = tk.StringVar(value=f"Tile {slot_index + 1}")
        type_var = tk.StringVar(value="url")
        icon_var = tk.StringVar(value="globe")
        target_var = tk.StringVar(value="")
        icon_path_var = tk.StringVar(value="")
        linked_type_var = tk.StringVar(value="")
        linked_name_var = tk.StringVar(value="")

        add_field("Name")
        name_entry = ttk.Entry(frame, textvariable=name_var)
        name_entry.pack(fill="x", pady=(0, 10))

        add_field("Tile Type")
        ttk.OptionMenu(frame, type_var, type_var.get(), *TileModule.TILE_TYPES).pack(fill="x", pady=(0, 10))

        add_field("Target / URL / Path")
        ttk.Entry(frame, textvariable=target_var).pack(fill="x", pady=(0, 10))

        add_field("Icon")
        ttk.OptionMenu(frame, icon_var, icon_var.get(), *TileModule.ICON_CHOICES).pack(fill="x", pady=(0, 10))

        add_field("Custom Icon Path (optional)")
        ttk.Entry(frame, textvariable=icon_path_var).pack(fill="x", pady=(0, 10))

        add_field("Group Targets (optional, one per line)")
        targets_box = tk.Text(frame, height=7, bg="#111111", fg="#FFFFFF", insertbackground="#FFFFFF", relief="flat")
        targets_box.pack(fill="both", pady=(0, 10))

        add_field("Link to Chronos Item Type (optional)")
        ttk.Entry(frame, textvariable=linked_type_var).pack(fill="x", pady=(0, 10))

        add_field("Link to Chronos Item Name (optional)")
        ttk.Entry(frame, textvariable=linked_name_var).pack(fill="x", pady=(0, 14))

        btns = tk.Frame(frame, bg="#050505")
        btns.pack(fill="x")

        def on_save():
            payload = {
                "name": name_var.get().strip(),
                "tile_type": type_var.get().strip().lower(),
                "target": target_var.get().strip(),
                "icon": icon_var.get().strip().lower(),
                "icon_path": icon_path_var.get().strip(),
                "targets": [line.strip() for line in targets_box.get("1.0", "end").splitlines() if line.strip()],
                "linked_item_type": linked_type_var.get().strip().lower(),
                "linked_item_name": linked_name_var.get().strip(),
            }
            try:
                self._create_tile_for_slot(slot_index, payload)
            except Exception as exc:
                messagebox.showerror("Create Tile", str(exc), parent=win)
                return
            win.destroy()
            self._draw_scene()

        ttk.Button(btns, text="Save", command=on_save).pack(side="left")
        ttk.Button(btns, text="Cancel", command=win.destroy).pack(side="left", padx=(8, 0))
        name_entry.focus_force()

    def _draw_scene(self):
        self.canvas.delete("all")
        self._tile_regions = []
        self._tile_photo_refs = []
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
            slot_tiles = TileModule.get_tiles_by_slot(1)
            builtins = {
                0: ("globe", "webview"),
                1: ("dashboard", "dashboard"),
                2: ("console", "console"),
            }
            for slot_index, (tile_x, tile_y) in enumerate(self._ring_positions(center_x, center_y, scaled_radius)):
                points_flat = self._flat_top_hex_points(tile_x, tile_y, ring_radius)
                point_pairs = list(zip(points_flat[0::2], points_flat[1::2]))
                tile_row = slot_tiles.get(slot_index)
                action = None
                kind = None
                if tile_row:
                    action = "custom_tile"
                    kind = "custom"
                elif slot_index in builtins:
                    kind, action = builtins[slot_index]
                elif slot_index in CUSTOM_TILE_SLOTS:
                    kind = "empty_slot"
                self._tile_regions.append(
                    {
                        "points": point_pairs,
                        "action": action,
                        "slot": slot_index,
                        "tile": tile_row,
                    }
                )
                if tile_row:
                    self._draw_dynamic_tile(tile_x, tile_y, ring_radius, tile_row)
                elif kind == "globe":
                    self._draw_globe_tile(tile_x, tile_y, ring_radius)
                elif kind == "dashboard":
                    self._draw_dashboard_tile(tile_x, tile_y, ring_radius)
                elif kind == "console":
                    self._draw_console_tile(tile_x, tile_y, ring_radius)
                elif kind == "empty_slot":
                    self._draw_hex_tile(tile_x, tile_y, ring_radius)
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
                elif action == "custom_tile" and region.get("tile"):
                    self._open_tile_target(region.get("tile"))
                elif action is None and region.get("slot") in CUSTOM_TILE_SLOTS:
                    self._show_create_tile_popup(int(region.get("slot")))
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
