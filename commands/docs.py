import json
import os
from urllib import request as urlrequest, error as urlerror

from modules.console import ROOT_DIR
from commands import dashboard as dashboard_cmd

DOCS_DIR = os.path.join(ROOT_DIR, "docs")
EXCLUDED_PREFIXES = ("agents/skills/",)


def _normalized_rel(path_value):
    return str(path_value or "").strip().replace("\\", "/").lstrip("/")


def _iter_doc_files():
    for root_dir, _dirs, files in os.walk(DOCS_DIR):
        for fname in files:
            abs_path = os.path.join(root_dir, fname)
            rel = _normalized_rel(os.path.relpath(abs_path, DOCS_DIR))
            if not rel:
                continue
            rel_lower = rel.lower()
            if any(rel_lower.startswith(prefix) for prefix in EXCLUDED_PREFIXES):
                continue
            yield rel


def _resolve_doc_target(raw_target):
    target = _normalized_rel(raw_target)
    if not target:
        return None, []

    docs = list(_iter_doc_files())
    docs_by_lower = {doc.lower(): doc for doc in docs}

    exact_candidates = [target, f"{target}.md", f"{target}.txt"]
    for candidate in exact_candidates:
        match = docs_by_lower.get(candidate.lower())
        if match:
            return match, []

    basename_candidates = []
    lowered = target.lower()
    lowered_with_md = f"{lowered}.md"
    lowered_with_txt = f"{lowered}.txt"
    for rel in docs:
        base = os.path.basename(rel).lower()
        stem, _ext = os.path.splitext(base)
        if base in {lowered, lowered_with_md, lowered_with_txt} or stem == lowered:
            basename_candidates.append(rel)

    if len(basename_candidates) == 1:
        return basename_candidates[0], []
    if len(basename_candidates) > 1:
        return None, sorted(basename_candidates, key=str.lower)
    return None, []


def _ensure_dashboard(properties):
    host = properties.get("host", "127.0.0.1") if isinstance(properties, dict) else "127.0.0.1"
    port = str(properties.get("port", "7357")) if isinstance(properties, dict) else "7357"
    env = os.environ.copy()
    env["CHRONOS_DASH_HOST"] = host
    env["CHRONOS_DASH_PORT"] = port

    server_script = os.path.join(ROOT_DIR, "utilities", "dashboard", "server.py")
    visible_console = dashboard_cmd._as_bool(properties.get("server_console"), False) if isinstance(properties, dict) else False
    restart_server = dashboard_cmd._as_bool(properties.get("restart_server"), False) if isinstance(properties, dict) else False
    no_server = dashboard_cmd._as_bool(properties.get("browser_only"), False) if isinstance(properties, dict) else False
    server_ready = True
    if not no_server:
        server_ready = dashboard_cmd._ensure_dashboard_server(
            host,
            port,
            env,
            server_script,
            visible_console=visible_console,
            restart=restart_server,
        )
    return host, port, server_ready


def _post_docs_open_request(host, port, path_value="", line_value=None):
    payload = {}
    if path_value:
        payload["path"] = _normalized_rel(path_value)
    if line_value is not None:
        payload["line"] = int(line_value)
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urlrequest.Request(
        f"http://{host}:{port}/api/docs/open-request",
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urlrequest.urlopen(req, timeout=2.5) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    body = json.loads(raw) if raw.strip() else {}
    ok = getattr(resp, "status", 0) == 200 and bool(body.get("ok"))
    return ok


def _open_dashboard(host, port, properties):
    url = f"http://{host}:{port}/dashboard.html"
    browser_from_props = str(properties.get("browser") or "").strip() if isinstance(properties, dict) else ""
    browser_setting = browser_from_props or dashboard_cmd._read_dashboard_browser_setting()
    opened_with = dashboard_cmd._open_dashboard_url(url, browser_setting)
    if opened_with == "default":
        print(f"Opened dashboard: {url}")
    else:
        print(f"Opened dashboard in '{opened_with}': {url}")


def run(args, properties):
    """
    docs -> open Docs view in dashboard
    docs <topic> -> open a specific docs file in dashboard Docs view
    """
    target = args[0] if args else ""
    resolved_path, ambiguity = _resolve_doc_target(target) if target else (None, [])

    if target and ambiguity:
        print(f"Documentation topic '{target}' is ambiguous.")
        print("Use one of these paths:")
        for rel in ambiguity:
            print(f"  - {rel}")
        return

    if target and not resolved_path:
        print(f"Documentation for '{target}' not found.")
        print("Opening Docs view.")

    try:
        dashboard_cmd.bundle_settings_for_dashboard()
    except Exception as e:
        print(f"Warning: Could not bundle dashboard settings: {e}")

    host, port, server_ready = _ensure_dashboard(properties or {})
    if not server_ready:
        print(f"Warning: Dashboard server on {host}:{port} did not pass health checks.")

    try:
        _post_docs_open_request(host, port, resolved_path or "")
    except urlerror.URLError as e:
        print(f"Warning: Could not queue docs open request: {e}")
    except Exception as e:
        print(f"Warning: Could not queue docs open request: {e}")

    try:
        _open_dashboard(host, port, properties or {})
    except Exception as e:
        print(f"Could not open dashboard: {e}\nOpen manually: http://{host}:{port}/dashboard.html")

    if resolved_path:
        print(f"Requested doc: {resolved_path}")


def get_help_message():
    return """
Usage:
  docs [topic]

Description:
  Opens the Dashboard Docs view.
  If a topic is provided, opens that doc in the Docs view.
  Skill docs under docs/agents/skills are excluded from this command.

Examples:
  docs
  docs changelog
  docs features/dashboard/views/view_docs
"""
