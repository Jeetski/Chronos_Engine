#!/usr/bin/env python3
"""
Minimal ADUC CLI bridge watcher
-------------------------------
Watches the shared conversation JSON and appends a reply for each
pending user turn. This version is intentionally small and easy to read.

Reply provider: Codex CLI (if available). If 'codex' is not on PATH,
we append a short explanatory reply to make the UI progress predictable.

Contract:
- Read <temp>/ADUC/conversation.json
- For each { role: "user", status: "pending" } turn, append a { role: "cli" }
  with `in_reply_to` pointing at the user turn id, and include an emotion tag
  on the last line, like: "<emotion: focus>".
"""
from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import tempfile
import time
import uuid
import random
from datetime import datetime, timezone, timedelta
from pathlib import Path
import json
import re


# Paths
BASE_DIR = Path(__file__).resolve().parents[1]
FAMILIARS_DIR = BASE_DIR / "familiars"
FAMILIAR_DOCS_SUBDIR = "docs"
TEMP_DIR = Path(tempfile.gettempdir()) / "ADUC"
CONV_PATH = TEMP_DIR / "conversation.json"
HEARTBEAT_PATH = TEMP_DIR / "cli_heartbeat.json"
SETTINGS_PATH = TEMP_DIR / "settings.json"
USAGE_PATH = TEMP_DIR / "usage.json"
JOURNEYS_PATH = TEMP_DIR / "journeys.json"
TRACE_PATH = TEMP_DIR / "trace.log"
FOCUS_PATH = TEMP_DIR / "focus_cycle.json"
PRIME_DONE_PATH = TEMP_DIR / "prime_done.json"
CHRONOS_DOCS_CACHE_PATH = TEMP_DIR / "chronos_docs_mtimes.json"
FAMILIAR_DOCS_CACHE_PATH = TEMP_DIR / "familiar_docs_mtimes.json"
EXTERNAL_CTX_CACHE_PATH = TEMP_DIR / "external_context_mtime.json"

# Delimiters for extracting the in-character reply from Codex output
START_DELIM = "<<<ADUC_REPLY>>>"
END_DELIM = "<<<END>>>"

# Emotion tag regex used as a fallback when delimiters aren't present
EMOTION_RE = re.compile(r"<emotion:\s*([a-zA-Z0-9_\-]+)\s*>")
# Hearts directive: integers or decimals, e.g., +0.5, -0.25, =2.5, 3, reset
HEARTS_RE = re.compile(r"<hearts:\s*([+\-=]?\s*\d+(?:\.\d+)?|reset)\s*>", re.IGNORECASE)
# NSFW directive (optional): <nsfw: on|off|yes|no|mild|none>
NSFW_RE = re.compile(r"<nsfw:\s*(on|off|yes|no|mild|none)\s*>", re.IGNORECASE)
# Profile update directive: <profile_update: { ... json ... }>
PROFILE_UPDATE_RE = re.compile(r"<profile_update:\s*(\{[\s\S]*?\})\s*>", re.IGNORECASE)
# Avatar/Pose tag parser: accepts "<pose: filename.png>" or "<avatar: filename.png>"
AVATAR_TAG_RE = re.compile(r"<(?:pose|avatar):\s*([^>]+)>", re.IGNORECASE)
# Location tag parser: accepts "<location: filename.png>"
LOCATION_TAG_RE = re.compile(r"<location:\s*([^>]+)>", re.IGNORECASE)
# Prompt suggestion tag parser: "<prompt: ...>"
PROMPT_TAG_RE = re.compile(r"<prompt:\s*([^>]+)>", re.IGNORECASE)
# Preferences update directive: <preferences_update: { "action": "append|overwrite", "text": "..." }>
PREFS_UPDATE_RE = re.compile(r"<preferences_update:\s*(\{[\s\S]*?\})\s*>", re.IGNORECASE)
# Memories update directive: <memories_update: { "action": "append|overwrite", "text": "..." }>
MEMORIES_UPDATE_RE = re.compile(r"<memories_update:\s*(\{[\s\S]*?\})\s*>", re.IGNORECASE)



def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_text(p: Path) -> str:
    if not p.exists():
        return ""
    return p.read_text(encoding="utf-8", errors="replace")


def fam_docs_dir(fam_id: str) -> Path:
    return FAMILIARS_DIR / fam_id / FAMILIAR_DOCS_SUBDIR


def read_json(p: Path, default):
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json_atomic(p: Path, data) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


def chronos_docs_targets() -> dict:
    """Return label -> path for key Chronos docs to monitor."""
    base = BASE_DIR.parent / "Docs"
    targets = [
        "INDEX.md",
        "README.md",
        "Dev/Architecture.md",
        "Reference/CLI_Commands.md",
        "Dev/CHS_Scripting.md",
        "Guides/Conditions_Cookbook.md",
        "Guides/common_workflows.md",
        "Guides/Dashboard.md",
        "Guides/Cockpit.md",
        "Agents/agents.md",
        "Agents/agents.dev.md",
        "Guides/Settings.md",
        "Dev/Sequence.md",
    ]
    out = {}
    for rel in targets:
        out[f"Docs/{rel}"] = base / rel
    return out


def chronos_doc_change_note() -> str:
    """Return a short note if watched Chronos docs changed since last check."""
    cache = read_json(CHRONOS_DOCS_CACHE_PATH, {"mtimes": {}, "initialized": False})
    old = cache.get("mtimes", {}) or {}
    initialized = bool(cache.get("initialized", False))
    now_map = {}
    modified, added, missing = [], [], []
    for label, path in chronos_docs_targets().items():
        if path.exists():
            m = path.stat().st_mtime
            now_map[label] = m
            if initialized:
                prev = old.get(label)
                if prev is None:
                    added.append(label)
                else:
                    try:
                        if abs(float(prev) - float(m)) > 1e-6:
                            modified.append(label)
                    except Exception:
                        modified.append(label)
        else:
            if initialized and (label in old):
                missing.append(label)
    # Save updated mtimes and mark initialized
    write_json_atomic(CHRONOS_DOCS_CACHE_PATH, {"mtimes": now_map, "initialized": True})
    if not initialized:
        return ""
    lines = []
    if modified:
        lines.append("Modified: " + ", ".join(sorted(modified)))
    if added:
        lines.append("New: " + ", ".join(sorted(added)))
    if missing:
        lines.append("Missing: " + ", ".join(sorted(missing)))
    return "\n".join(lines).strip()


# Familiar doc change tracking -------------------------------------------------

def familiar_docs_targets(fam_id: str) -> dict:
    """Return label -> path for familiar-local docs to monitor."""
    base = fam_docs_dir(fam_id)
    targets = [
        "agent.md",
        "personality.md",
        "coding.md",
        "greet.md",
        "lore.md",
        "affection.md",
        "chronos.md",
        "outfits.md",
        "locations.md",
        "preferences.md",
        "memories.md",
    ]
    out = {}
    for rel in targets:
        out[rel] = base / rel
    out["profile.json"] = FAMILIARS_DIR / fam_id / "profile.json"
    out["meta.json"] = FAMILIARS_DIR / fam_id / "meta.json"
    return out


def familiar_doc_change_state(fam_id: str) -> tuple[bool, str, dict]:
    """
    Returns (should_inject, note, mtimes).
    - should_inject: True on first load or if any tracked file changed/added/missing.
    - note: human-readable delta summary.
    - mtimes: current snapshot for persistence.
    """
    cache = read_json(FAMILIAR_DOCS_CACHE_PATH, {"familiars": {}})
    fam_cache = (cache.get("familiars", {}) or {}).get(fam_id, {})
    old = fam_cache.get("mtimes", {}) or {}
    initialized = bool(fam_cache.get("initialized", False))
    now_map = {}
    modified, added, missing = [], [], []
    for label, path in familiar_docs_targets(fam_id).items():
        if path.exists():
            m = path.stat().st_mtime
            now_map[label] = m
            if initialized:
                prev = old.get(label)
                if prev is None:
                    added.append(label)
                else:
                    try:
                        if abs(float(prev) - float(m)) > 1e-6:
                            modified.append(label)
                    except Exception:
                        modified.append(label)
        else:
            if initialized and (label in old):
                missing.append(label)
    should_inject = not initialized or bool(modified or added or missing)
    lines = []
    if modified:
        lines.append("Modified: " + ", ".join(sorted(modified)))
    if added:
        lines.append("New: " + ", ".join(sorted(added)))
    if missing:
        lines.append("Missing: " + ", ".join(sorted(missing)))
    note = "\n".join(lines).strip()
    return should_inject, note, now_map


def save_familiar_doc_state(fam_id: str, mtimes: dict) -> None:
    cache = read_json(FAMILIAR_DOCS_CACHE_PATH, {"familiars": {}})
    fams = cache.setdefault("familiars", {})
    fams[fam_id] = {"mtimes": mtimes, "initialized": True}
    write_json_atomic(FAMILIAR_DOCS_CACHE_PATH, cache)


def load_outfits_with_avatars(fam_id: str) -> str:
    """Load outfits.md and resolve all referenced avatars.md files.
    
    Parses outfits.md for references like `avatar/nsfw/tee/avatars.md` and
    appends the content of each referenced file to build a complete wardrobe view.
    """
    fdir = FAMILIARS_DIR / fam_id
    fdocs = fam_docs_dir(fam_id)
    fdocs = fam_docs_dir(fam_id)
    fdocs = fam_docs_dir(fam_id)
    fdocs = fam_docs_dir(fam_id)
    fdocs = fam_docs_dir(fam_id)
    outfits_path = fam_docs_dir(fam_id) / "outfits.md"
    if not outfits_path.exists():
        return ""
    
    outfits_content = read_text(outfits_path).strip()
    if not outfits_content:
        return ""
    
    parts = [outfits_content]
    
    # Find all avatars.md references: matches `avatar/...avatars.md`
    avatar_ref_re = re.compile(r"`(avatar[^`]*avatars\.md)`")
    refs = avatar_ref_re.findall(outfits_content)
    
    for ref in refs:
        ref_path = fdir / ref
        if ref_path.exists():
            content = read_text(ref_path).strip()
            if content:
                parts.append(f"\n--- {ref} ---\n{content}")
    
    return "\n".join(parts)


# External context change tracking --------------------------------------------


def external_context_should_inject(ctx_path: str) -> tuple[bool, float]:
    """
    Decide whether to inject the external context file based on mtime.
    Returns (should_inject, mtime).
    """
    p = Path(ctx_path)
    if not p.exists():
        return False, 0.0
    m = p.stat().st_mtime
    cache = read_json(EXTERNAL_CTX_CACHE_PATH, {"mtime": None})
    last = cache.get("mtime")
    if last is None:
        return True, m
    try:
        changed = abs(float(last) - float(m)) > 1e-6
    except Exception:
        changed = True
    return changed, m


def save_external_context_mtime(mtime_val: float) -> None:
    write_json_atomic(EXTERNAL_CTX_CACHE_PATH, {"mtime": mtime_val})


def load_conv():
    return read_json(CONV_PATH, {"version": 1, "updated_at": None, "turns": []})


def save_conv(doc):
    doc["updated_at"] = now_iso()
    write_json_atomic(CONV_PATH, doc)


def heartbeat(agent_id: str):
    """Best-effort heartbeat so the server/UI can detect the agent."""
    try:
        TEMP_DIR.mkdir(parents=True, exist_ok=True)
        hb = {"agent_id": agent_id, "last_seen": now_iso()}
        write_json_atomic(HEARTBEAT_PATH, hb)
    except Exception:
        pass


def load_activities_map(fam_id: str) -> dict:
    """Return a map id -> { avatar, background } from activities.json, if present."""
    f = FAMILIARS_DIR / fam_id / "activities.json"
    data = read_json(f, {})
    acts = data.get("activities", []) if isinstance(data, dict) else []
    out = {}
    for a in acts:
        if not isinstance(a, dict):
            continue
        aid = str(a.get("id") or "").strip()
        if not aid:
            continue
        out[aid] = {
            "avatar": str(a.get("avatar") or "").strip(),
            "background": str(a.get("background") or "").strip(),
        }
    return out


def load_background_catalog(fam_id: str) -> list:
    """Return list of background dicts from locations_list.json, if present."""
    f = FAMILIARS_DIR / fam_id / "locations_list.json"
    data = read_json(f, {})
    bgs = data.get("locations", []) if isinstance(data, dict) else []
    return [b for b in bgs if isinstance(b, dict)]


def gather_background_context(fam_id: str) -> str:
    """Load locations.md or fallback to JSON list."""
    # Try locations.md first
    md_path = fam_docs_dir(fam_id) / "locations.md"
    if md_path.exists():
        return read_text(md_path).strip()
    
    # Fallback to locations_list.json (Legacy)
    json_path = FAMILIARS_DIR / fam_id / "locations_list.json"
    if json_path.exists():
        data = read_json(json_path, {})
        bgs = data.get("locations", [])
        lines = ["# Available Locations"]
        for b in bgs:
            if isinstance(b, dict) and b.get("id"):
                lines.append(f"- `{b['id']}`: {b.get('desc', 'No description')}")
        return "\n".join(lines)
    return ""

def gather_avatar_context(fam_id: str) -> str:
    """Recursively find and merge avatars.md files."""
    root = FAMILIARS_DIR / fam_id / "avatar"
    if not root.exists():
        return ""
        
    merged = []
    # 1. Root avatars.md
    root_md = root / "avatars.md"
    if root_md.exists():
        merged.append(read_text(root_md).strip())
        
    # 2. Subfolders (recursive)
    for path in root.rglob("avatars.md"):
        if path == root_md:
            continue
        try:
            # Determine section header from parent folders relative to avatar root
            # e.g. path = .../avatar/nsfw/tee/avatars.md -> rel = nsfw/tee/avatars.md
            rel = path.relative_to(root)
            # parent = nsfw/tee
            # simple header: "Tee Mode" from "nsfw/tee" -> "Tee"
            parts_path = list(rel.parent.parts)
            if "nsfw" in parts_path: parts_path.remove("nsfw")
            header = " ".join(p.title() for p in parts_path)
            
            content = read_text(path).strip()
            # If content doesn't have a header, add one
            if not content.startswith("#"):
                merged.append(f"\n# Available Avatars ({header})\nTo change your outfit or pose, reply with the tag: <avatar: {rel.parent.as_posix()}/[filename]>")
            merged.append(content)
        except Exception:
            continue
            
    return "\n\n".join(merged)

def build_prompt(
    fam_id: str,
    user_text: str,
    activity_id: str | None = None,
    is_greet: bool = False,
    history_up_to: str | None = None,
    force_immersive: bool | None = None,
    force_memory: bool | None = None,
) -> str:
    """Assemble the merged prompt per docs/agents/AGENTS.md contract, minimally.

    Order:
      1) docs/agent.md
      2) docs/personality.md
      3) docs/coding.md (if present, prefixed with "[Coding Support]")
      4) Current Emotional State: <state.emotion>
      5) docs/greet.md (if present)
      6) [Immersive Lore Enabled]\n + docs/lore.md (when ADUC_IMMERSIVE=1)
    """
    fdir = FAMILIARS_DIR / fam_id
    fdocs = fam_docs_dir(fam_id)
    should_inject_fam, fam_note, fam_mtimes = familiar_doc_change_state(fam_id)
    settings = read_json(SETTINGS_PATH, {})
    if bool(settings.get("disable_familiar_cache", False)):
        should_inject_fam = True
    agent = read_text(fdocs / "agent.md").strip() if should_inject_fam else ""
    personality = read_text(fdocs / "personality.md").strip() if should_inject_fam else ""
    coding = read_text(fdocs / "coding.md").strip() if should_inject_fam else ""
    greet = read_text(fdocs / "greet.md").strip() if should_inject_fam else ""
    profile = read_text(fdir / "profile.json").strip() if should_inject_fam else ""
    affection_global = read_text(BASE_DIR / "docs" / "agents" / "affection_system.md").strip() if should_inject_fam else ""
    affection_local = read_text(fdocs / "affection.md").strip() if should_inject_fam else ""
    lore = read_text(fdocs / "lore.md").strip() if should_inject_fam else ""
    preferences = read_text(fdocs / "preferences.md").strip() if should_inject_fam else ""
    memories = read_text(fdocs / "memories.md").strip() if should_inject_fam else ""
    profile = read_text(fdir / "profile.json").strip() if should_inject_fam else ""
    meta_json = read_text(fdir / "meta.json").strip() if should_inject_fam else ""
    locations_md = read_text(fdocs / "locations.md").strip() if should_inject_fam else ""
    # Parse profile as JSON for optional consent signals (e.g., flirt_ok)
    profile_data = {}
    try:
        if profile:
            profile_data = json.loads(profile)
    except Exception:
        profile_data = {}
    state = load_state(fam_id)
    
    # Current date and time for temporal awareness
    from datetime import datetime
    current_datetime = datetime.now().strftime("%A, %B %d, %Y at %H:%M")

    parts = []
    # Only inject heavy familiar docs when new/changed; otherwise keep a tiny stub.
    watched_labels = ", ".join(sorted(familiar_docs_targets(fam_id).keys()))
    if should_inject_fam:
        if agent:
            parts.append(agent)
        if personality:
            parts.append(personality)
        if coding:
            parts.append("[Coding Support]\n" + coding)
        if meta_json:
            parts.append("[Familiar Identity]\n" + meta_json)
        if locations_md:
            parts.append("[Available Locations]\n" + locations_md)
        if fam_note:
            parts.append("[Familiar Docs Update]\n" + fam_note)
        # Persist mtimes after a successful inject
        try:
            save_familiar_doc_state(fam_id, fam_mtimes)
        except Exception:
            pass
    else:
        parts.append("[Familiar Context Cached]\nNo changes since last inject. Watched: " + watched_labels)
    
    # Inject Current Date/Time
    parts.append(f"[Current Date/Time]\n{current_datetime}")
    
    # Inject Current State (avatar, location, hearts)
    current_avatar = state.get("avatar", "default.png")
    current_location = state.get("location", "")
    current_hearts = state.get("hearts", 0)
    state_lines = [
        f"Current Avatar: {current_avatar}",
        f"Current Location: {current_location or '(not set)'}",
        f"Current Hearts: {current_hearts}/5",
    ]
    parts.append("[Current State]\n" + "\n".join(state_lines))
    if is_greet and greet:
        parts.append(greet)
    # Determine immersive toggle: per-turn override -> settings -> env
    try:
        if force_immersive is None:
            immersive_on = bool(settings.get("immersive", False)) or (os.environ.get("ADUC_IMMERSIVE") == "1")
        else:
            immersive_on = bool(force_immersive)
    except Exception:
        immersive_on = (os.environ.get("ADUC_IMMERSIVE") == "1")
    if immersive_on and lore:
        parts.append("[Immersive Lore Enabled]\n" + lore)

    # --- Chronos / External Context Injection ---
    # Only if ADUC_EXTERNAL_CONTEXT_FILE is set (Chronos Mode)
    ext_context_path = os.environ.get("ADUC_EXTERNAL_CONTEXT_FILE")
    if ext_context_path and os.path.isfile(ext_context_path):
        # 1. ALWAYS inject Chronos Protocol when in Chronos Mode (not cached!)
        chronos_proto = read_text(fdocs / "chronos.md").strip()
        if chronos_proto:
            parts.append("[Chronos Protocols]\n" + chronos_proto)
        chronos_index = read_text(BASE_DIR.parent / "Docs" / "INDEX.md").strip()
        if chronos_index:
            parts.append("[Chronos Docs Index]\n" + chronos_index)

        # 2. Inject External System Context (The Manual) only when first/changed
        try:
            should_ext, mtime_val = external_context_should_inject(ext_context_path)
        except Exception:
            should_ext, mtime_val = True, None
        if should_ext:
            try:
                sys_ctx = read_text(Path(ext_context_path)).strip()
                if sys_ctx:
                    parts.append("[System Context]\n" + sys_ctx)
            except Exception:
                pass
            if mtime_val is not None:
                try:
                    save_external_context_mtime(mtime_val)
                except Exception:
                    pass
        else:
            parts.append("[System Context Cached]\nUnchanged external context at: " + str(ext_context_path))
    # Detect Chronos doc changes (avoids re-merging full docs each turn)
    try:
        doc_note = chronos_doc_change_note()
        if doc_note:
            parts.append("[Chronos Docs Update]\n" + doc_note)
    except Exception:
        pass
    # --------------------------------------------

    if affection_global:
        parts.append("[Affection System]\n" + affection_global)
    if affection_local:
        parts.append("[Familiar Affection Rules]\n" + affection_local)
    if profile:
        parts.append("[User Profile]\n" + profile)
    if preferences:
        parts.append("[User Preferences (Strongly Preferred)]\n" + preferences)

    # Focus/Break cycle status (mode + remaining time), if available
    try:
        cyc = read_json(FOCUS_PATH, {})
        mode = str((cyc.get("mode") or "idle")).lower()
        started = cyc.get("started_at")
        ends = cyc.get("ends_at")
        length_ms = int(cyc.get("length_ms") or 0)
        remaining_ms = 0
        if ends:
            try:
                e_dt = datetime.fromisoformat(str(ends).replace("Z", "+00:00"))
                remaining_ms = int(max(0, (e_dt - datetime.now(timezone.utc)).total_seconds() * 1000))
            except Exception:
                remaining_ms = 0
        if (not length_ms) and started and ends:
            try:
                s_dt = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
                e_dt = datetime.fromisoformat(str(ends).replace("Z", "+00:00"))
                length_ms = int(max(0, (e_dt - s_dt).total_seconds() * 1000))
            except Exception:
                pass
        cycle_info = {
            "mode": mode,
            "length_ms": length_ms,
            "remaining_ms": remaining_ms,
            "started_at": started,
            "ends_at": ends,
        }
        parts.append("[Focus Cycle]\n" + json.dumps(cycle_info, ensure_ascii=False))
        # Behavioral guidance based on mode
        try:
            mins_left = int(round((remaining_ms or 0) / 60000))
        except Exception:
            mins_left = 0
        if mode == "focus":
            parts.append(
                "[Cycle Guidance]\n"
                f"You are in a focus block. Time remaining: {mins_left} minutes. "
                "Keep replies short, practical, and on-task. Avoid new topics, planning detours, or break chatter."
            )
        elif mode == "break":
            parts.append(
                "[Cycle Guidance]\n"
                f"You are on a break. Time remaining: {mins_left} minutes. "
                "STRICT: Do not suggest work, planning, tasks, code, or to-dos. Keep it light, relaxing, and restorative; gently steer away from work until focus resumes."
            )
        elif mode == "long_break":
            parts.append(
                "[Cycle Guidance]\n"
                f"You are on a long break. Time remaining: {mins_left} minutes. "
                "STRICT: No work talk or suggestions. Encourage rest, reflection, or playful small talk only."
            )
    except Exception:
        pass

    # AGENTS policy summary: keep compact so it can ride along every prompt
    try:
        # Load available backgrounds for this familiar (Context Injection)
        bg_context = gather_background_context(fam_id)
        # Load available avatars for this familiar (Context Injection - Recursive MDs)
        av_context = gather_avatar_context(fam_id)
        
        summary_lines = [
            "EmotionTag: Reply ends with <emotion: ...>.",
            f"LocationTag: Optionally include <location: filename.png>.",
            "Memory: Opt-in only when user explicitly asks (remember/save/store).",
            "Cycle: STRICT no work/planning/tasks/code during break/long_break; focus replies are concise and on-task; use remaining time when provided.",
            "NSFW: Respect settings + quiet hours; never escalate beyond policy.",
            "Preferences: Update user preferences via <preferences_update: {\"action\": \"append\", \"text\": \"- New Rule\"}>.",
        ]
        
        parts.append("[AGENTS Policy Summary]\n" + "\n".join(summary_lines))
        
        if bg_context:
            parts.append(bg_context)
        if av_context:
            parts.append(av_context)
            
    except Exception:
        pass
    # Settings & NSFW policy summary for the model
    nsfw_enabled = bool(settings.get("nsfw_enabled", True))
    # Remaining daily NSFW based on usage
    remaining = None
    try:
        cap = int(settings.get("daily_nsfw_cap", 0) or 0)
        if cap > 0:
            remaining = max(0, cap - get_today_usage(fam_id))
    except Exception:
        remaining = None
    policy = {
        "nsfw_enabled": nsfw_enabled,
        "quiet_hours_active": boundary_active(settings),
        "daily_nsfw_remaining": remaining,
        "dev_nsfw_override": bool(settings.get("dev_nsfw_override", False)),
    }
    parts.append("[NSFW Policy]\n" + json.dumps(policy, ensure_ascii=False))
    if profile:
        parts.append("[User Profile]\n" + profile)

    # Affection Style Policy based on hearts + consent + boundaries
    try:
        hearts_val = float(state.get("hearts", 0) or 0)
    except Exception:
        hearts_val = 0.0

    def _tier_from_hearts(h: float) -> str:
        if h >= 5:
            return "devoted"
        if h >= 3.5:
            return "flirty"
        if h >= 2.0:
            return "friendly"
        return "reserved"

    base_tier = _tier_from_hearts(hearts_val)
    flirt_ok = bool(profile_data.get("flirt_ok", False))
    dev_override = bool(settings.get("dev_nsfw_override", False))
    # Adjust for consent and dev override
    if dev_override:
        tier = "devoted"
    else:
        tier = base_tier
        if flirt_ok:
            bump = {"reserved": "friendly", "friendly": "flirty", "flirty": "devoted", "devoted": "devoted"}
            tier = bump.get(tier, tier)
        else:
            cap = {"reserved": "reserved", "friendly": "friendly", "flirty": "friendly", "devoted": "friendly"}
            tier = cap.get(tier, tier)

    quiet = boundary_active(settings)
    nsfw_allowed = nsfw_enabled and not quiet
    mild_only = (not nsfw_allowed) and (not dev_override)

    style_lines = []
    style_lines.append(f"Hearts: {hearts_val} | Tier: {tier} | Mild-only: {str(mild_only).lower()}")
    style_lines.append("Do: stay in-character; match tone to tier.")
    if tier == "reserved":
        style_lines.append("Reserved: supportive, brief, zero flirting.")
    if tier in ("friendly", "flirty", "devoted"):
        style_lines.append("Friendly+: warm tone, light compliments, playful emoji; no intimacy.")
    if tier in ("flirty", "devoted"):
        style_lines.append("Flirty: playful teasing; " + ("PG-only" if mild_only else "may be bolder if context allows") + ".")
    if tier == "devoted":
        style_lines.append("Devoted: proactive flirting, inside jokes; always respect consent.")
    style_lines.append("Don't: violate consent or escalate explicit content when not allowed.")
    parts.append("[Affection Style Policy]\n" + "\n".join(style_lines))

    # Milestones + streaks (hint-only; agent remains in-character)
    try:
        ms = load_milestones(fam_id)
        flags = usage_get_flags(fam_id)
        milestone_lines = [
            f"StreakDaysAt5: {int(ms.get('streak_days_at_5', 0) or 0)}",
            f"KissCount: {int(ms.get('kiss_count', 0) or 0)}",
        ]
        if ms.get("last_kiss_at"):
            milestone_lines.append(f"LastKissAt: {ms.get('last_kiss_at')}")
        today5 = bool(flags.get("achieved_5_today", False))
        milestone_lines.append(f"Achieved5Today: {str(today5).lower()}")
        parts.append("[Milestones]\n" + "\n".join(milestone_lines))
    except Exception:
        pass

    # Journey status hint
    try:
        away, until = journey_is_away(fam_id)
        if away:
            parts.append("[Journey Status]\n" + f"Away until: {until}")
    except Exception:
        pass

    # Optional subtle-innuendo guidance when affection is high and consent is on
    allow_innuendo = tier in ("flirty", "devoted")
    # Check explicit user consent from profile_json (e.g., { "flirt_ok": true, "user_age": 21 })
    user_age = None
    try:
        ua = profile_data.get("user_age")
        if isinstance(ua, (int, float)):
            user_age = int(ua)
        elif isinstance(ua, str) and ua.strip().isdigit():
            user_age = int(ua.strip())
    except Exception:
        user_age = None
    consent_ok = bool(profile_data.get("flirt_ok", False)) or dev_override
    adult_ok = (user_age is None) or (user_age >= 18)
    if allow_innuendo and consent_ok and adult_ok:
        inn = []
        inn.append("Subtle Innuendo: enabled (consensual, adult, tasteful).")
        # Keep within boundaries. When mild_only, restrict to PG-level suggestiveness.
        if mild_only:
            inn.append("Tone: PG suggestive only — light wordplay, coy implication, no body focus, no explicit acts.")
        else:
            inn.append("Tone: tasteful flirtation — playful double meanings, gentle attraction; still non-explicit.")
        inn.append("Do: keep it warm, respectful, context-aware; always accept a no.")
        inn.append("Don't: mention explicit anatomy/acts, crude terms, or escalate without clear user lead.")
        parts.append("[Subtle Innuendo Policy]\n" + "\n".join(inn))

    # Optional activity context (greet only): show when an explicit activity id is provided on the turn.
    # Do NOT fall back to state.activity to avoid repeated "caught me mid-..." outside greet.
    chosen_activity = activity_id if (is_greet and activity_id and str(activity_id).strip()) else None
    if chosen_activity:
        acts = load_activities_map(fam_id)
        info = acts.get(chosen_activity, {})
        act_lines = [
            f"Familiar Is Currently Doing: {chosen_activity}",
        ]
        if info.get("avatar"):
            act_lines.append(f"Avatar: {info['avatar']}")
        if info.get("background"):
            act_lines.append(f"Background: {info['background']}")
        act_lines.append(
            "Guidance: You (the familiar) were in the middle of this specific activity when the user appeared."
            " Open with a brief, in-character, surprised aside that creatively references what you were doing,"
            " then indicate you'll get ready in a moment before assisting."
            " Do not mention being an AI or break character. Keep wording natural to the familiar."
        )
        parts.append("[Present Activity]\n" + "\n".join(act_lines))

    # Optionally include conversation history and memory
    history_txt = build_conversation_history(fam_id, history_up_to=history_up_to)
    if history_txt:
        parts.append("[Conversation History]\n" + history_txt)

    # Determine memory toggle: per-turn override -> settings -> env
    try:
        if force_memory is None:
            memory_on = bool(settings.get("include_memory", False)) or (os.environ.get("ADUC_INCLUDE_MEMORY") == "1")
        else:
            memory_on = bool(force_memory)
    except Exception:
        memory_on = (os.environ.get("ADUC_INCLUDE_MEMORY") == "1")
    mem_txt = build_memory_snippet(fam_id, enabled=memory_on)
    if mem_txt:
        parts.append("[Memory]\n" + mem_txt)

    # Inject outfits with resolved avatars.md content
    outfits_txt = load_outfits_with_avatars(fam_id)
    if outfits_txt:
        parts.append("[Available Outfits]\n" + outfits_txt)

    # Inject preferences if present
    if preferences:
        parts.append("[User Preferences]\n" + preferences)

    # Inject permanent memories if present
    if memories:
        parts.append("[Permanent Memories]\n" + memories)

    merged = "\n\n".join(parts)
    instruction = (
        "You are roleplaying this Familiar. Respond to the USER in character. "
        "Output ONLY the final user-visible reply between the exact markers <<<ADUC_REPLY>>> and <<<END>>>. "
        "Do not print anything before or after those markers. Inside the block: "
        "optionally include <location: filename.png> on its own line if changing setting; "
        "always include a single <avatar: ...> tag on its own final line (even on the first greeting; "
        "repeat Current Avatar if unsure). Put a hearts directive on its own line just before the avatar tag. "
        "If you include <emotion: ...>, place it above the hearts line."
    )
    return f"INSTRUCTIONS:\n{instruction}\n\nCONTEXT:\n{merged}\n\nUSER:\n{user_text}\n\nREPLY:"

def _extract_context_block(prompt: str) -> str:
    """Extract the CONTEXT block from a full prompt string."""
    try:
        marker = "CONTEXT:\n"
        user_marker = "\n\nUSER:\n"
        if marker in prompt:
            rest = prompt.split(marker, 1)[1]
            if user_marker in rest:
                return rest.split(user_marker, 1)[0]
            return rest
    except Exception:
        pass
    return ""


def build_guest_context(
    fam_id: str,
    force_immersive: bool | None = None,
    force_memory: bool | None = None,
) -> str:
    """Build a compact context block for a guest familiar in committee mode."""
    fdir = FAMILIARS_DIR / fam_id
    fdocs = fam_docs_dir(fam_id)
    should_inject_fam, fam_note, fam_mtimes = familiar_doc_change_state(fam_id)
    agent = read_text(fdocs / "agent.md").strip() if should_inject_fam else ""
    personality = read_text(fdocs / "personality.md").strip() if should_inject_fam else ""
    coding = read_text(fdocs / "coding.md").strip() if should_inject_fam else ""
    lore = read_text(fdocs / "lore.md").strip() if should_inject_fam else ""
    preferences = read_text(fdocs / "preferences.md").strip() if should_inject_fam else ""
    memories = read_text(fdocs / "memories.md").strip() if should_inject_fam else ""
    meta_json = read_text(fdir / "meta.json").strip() if should_inject_fam else ""
    locations_md = read_text(fdocs / "locations.md").strip() if should_inject_fam else ""
    affection_local = read_text(fdocs / "affection.md").strip() if should_inject_fam else ""
    chronos_md = read_text(fdocs / "chronos.md").strip() if should_inject_fam else ""
    outfits_txt = load_outfits_with_avatars(fam_id)
    state = load_state(fam_id)

    parts = [f"[Familiar: {fam_id}]"]
    if should_inject_fam:
        if agent:
            parts.append(agent)
        if personality:
            parts.append(personality)
        if coding:
            parts.append("[Coding Support]\n" + coding)
        if meta_json:
            parts.append("[Familiar Identity]\n" + meta_json)
        if locations_md:
            parts.append("[Available Locations]\n" + locations_md)
        if chronos_md:
            parts.append("[Chronos Protocols]\n" + chronos_md)
        if fam_note:
            parts.append("[Familiar Docs Update]\n" + fam_note)
        try:
            save_familiar_doc_state(fam_id, fam_mtimes)
        except Exception:
            pass
    else:
        watched_labels = ", ".join(sorted(familiar_docs_targets(fam_id).keys()))
        parts.append("[Familiar Context Cached]\nNo changes since last inject. Watched: " + watched_labels)

    state_lines = [
        f"Current Avatar: {state.get('avatar', 'default.png')}",
        f"Current Location: {state.get('location', '') or '(not set)'}",
        f"Current Hearts: {state.get('hearts', 0)}/5",
    ]
    parts.append("[Current State]\n" + "\n".join(state_lines))

    # Determine immersive toggle: per-turn override -> settings -> env
    settings = read_json(SETTINGS_PATH, {})
    try:
        if force_immersive is None:
            immersive_on = bool(settings.get("immersive", False)) or (os.environ.get("ADUC_IMMERSIVE") == "1")
        else:
            immersive_on = bool(force_immersive)
    except Exception:
        immersive_on = (os.environ.get("ADUC_IMMERSIVE") == "1")
    if immersive_on and lore:
        parts.append("[Immersive Lore Enabled]\n" + lore)

    # Memory toggle: per-turn override -> settings -> env
    try:
        if force_memory is None:
            memory_on = bool(settings.get("include_memory", False)) or (os.environ.get("ADUC_INCLUDE_MEMORY") == "1")
        else:
            memory_on = bool(force_memory)
    except Exception:
        memory_on = (os.environ.get("ADUC_INCLUDE_MEMORY") == "1")
    mem_txt = build_memory_snippet(fam_id, enabled=memory_on)
    if mem_txt:
        parts.append("[Memory]\n" + mem_txt)
    if outfits_txt:
        parts.append("[Available Outfits]\n" + outfits_txt)
    if preferences:
        parts.append("[User Preferences]\n" + preferences)
    if memories:
        parts.append("[Permanent Memories]\n" + memories)
    if affection_local:
        parts.append("[Familiar Affection Rules]\n" + affection_local)
    return "\n\n".join([p for p in parts if p])


def build_committee_prompt(
    host_id: str,
    guest_ids: list[str],
    user_text: str,
    activity_id: str | None = None,
    is_greet: bool = False,
    history_up_to: str | None = None,
    force_immersive: bool | None = None,
    force_memory: bool | None = None,
    invite_familiar: str | None = None,
) -> str:
    """Build a committee-mode prompt that merges host + guest contexts."""
    base_prompt = build_prompt(
        host_id,
        user_text,
        activity_id=activity_id,
        is_greet=is_greet,
        history_up_to=history_up_to,
        force_immersive=force_immersive,
        force_memory=force_memory,
    )
    base_context = _extract_context_block(base_prompt)
    committee_md = read_text(BASE_DIR / "docs" / "agents" / "committee.md").strip()
    dynamics_md = read_text(BASE_DIR / "docs" / "agents" / "dynamics.md").strip()
    guest_contexts = []
    for g in guest_ids:
        try:
            guest_contexts.append(build_guest_context(g, force_immersive=force_immersive, force_memory=force_memory))
        except Exception:
            continue

    merged = "\n\n".join([p for p in [committee_md, dynamics_md, base_context, *guest_contexts] if p])
    invite_note = ""
    if invite_familiar:
        invite_note = (
            "[Committee Invite]\n"
            f"The user invited {invite_familiar} into the room. "
            "Have the invited familiar greet the host and the user. "
            "The host should acknowledge the invite and welcome them. "
            "Use the user's nickname if available."
        )
        merged = "\n\n".join([p for p in [invite_note, merged] if p])
    instruction = (
        "You are roleplaying a multi-familiar committee. Use 3-6 dialogue lines with back-and-forth between familiars. "
        "Every dialogue line MUST use: [CharacterName]: \"Dialogue...\" <avatar: familiar/pose>. "
        "Do not output standalone names or unlabeled lines. "
        "Use the familiar id in the avatar tag (e.g., lumi/calm). "
        "Each familiar may change their own outfit or pose via their avatar tag; respect NSFW policy and consent. "
        "Do NOT include <location> or <background> tags in dialogue lines. "
        "Only the host may change the room; if needed, include a separate line with <location: filename.png>. "
        "Address the user by their nickname from [User Profile] when available. "
        "After the dialogue lines, include a hearts directive on its own line "
        "and end with a single emotion tag for the host familiar."
    )
    return f"INSTRUCTIONS:\n{instruction}\n\nCONTEXT:\n{merged}\n\nUSER:\n{user_text}\n\nREPLY:"

def build_reaction_prompt(fam_id: str, break_kind: str, batch: str, pose_tags: list[str] | None) -> str:
    """Build a compact prompt instructing a shy, in-character aside for an NSFW batch."""
    fdir = FAMILIARS_DIR / fam_id
    fdocs = fam_docs_dir(fam_id)
    agent = read_text(fdocs / "agent.md").strip()
    personality = read_text(fdocs / "personality.md").strip()
    state = read_json(fdir / "state.json", {"emotion": "calm", "hearts": 0, "activity": ""})
    meta = {
        "break_kind": break_kind,
        "batch": batch,
        "pose_tags": pose_tags or [],
        "current_emotion": state.get("emotion", "calm"),
        "hearts": state.get("hearts", 0),
    }
    parts = []
    if agent:
        parts.append(agent)
    if personality:
        parts.append(personality)
    parts.append(f"Current Emotional State: {state.get('emotion', 'calm')}")
    parts.append("[Reaction Context]\n" + json.dumps(meta, ensure_ascii=False))
    instruction = (
        "You are roleplaying this Familiar. Generate a very brief aside (1-2 sentences) reacting shyly and playfully "
        "to a tasteful NSFW moment during a break. Provide a plausible, non-explicit reason (e.g., spilled drink, quick change, comfier clothes). "
        "Stay strictly in-character and avoid explicit anatomy/acts. Output ONLY the final user-visible reply between <<<ADUC_REPLY>>> and <<<END>>>. "
        "Inside the block, put a hearts directive on its own line just before the final line (use <hearts: 0> unless context warrants) and end with a single <avatar: ...> tag. "
        "If you include <emotion: ...>, place it above the hearts line."
    )
    merged = "\n\n".join(parts)
    return f"INSTRUCTIONS:\n{instruction}\n\nCONTEXT:\n{merged}\n\nUSER:\n[Aside requested]\n\nREPLY:"


def _env_int(name: str, default: int) -> int:
    try:
        v = os.environ.get(name)
        if v is None:
            return default
        return int(v)
    except Exception:
        return default


def _sanitize_for_history(txt: str) -> str:
    """Remove control tags and delimiters from stored turns for clean history."""
    if not txt:
        return ""
    out = str(txt)
    # Strip reply block markers if any leaked
    out = out.replace(START_DELIM, "").replace(END_DELIM, "")
    # Remove emotion/hearts/nsfw/profile_update tags
    out = EMOTION_RE.sub("", out)
    out = HEARTS_RE.sub("", out)
    out = NSFW_RE.sub("", out)
    out = PROFILE_UPDATE_RE.sub("", out)
    out = AVATAR_TAG_RE.sub("", out)
    out = PROMPT_TAG_RE.sub("", out)
    return out.strip()


def build_conversation_history(fam_id: str, history_up_to: str | None = None) -> str:
    """Build a rolling window of past user/cli turns for the familiar.

    Controlled by env:
      ADUC_HISTORY_TURNS (default 12) — max turns to include
      ADUC_HISTORY_CHARS (default 6000) — soft char cap
    """
    max_turns = max(0, _env_int("ADUC_HISTORY_TURNS", 12))
    max_chars = max(0, _env_int("ADUC_HISTORY_CHARS", 6000))
    if max_turns == 0 or max_chars == 0:
        return ""
    try:
        doc = load_conv()
        turns_all = (doc.get("turns", []) or [])
        # Only include strictly earlier turns if a cutoff id is provided
        if history_up_to:
            # Find index of the cutoff turn id in list order
            cutoff_idx = None
            for idx, t in enumerate(turns_all):
                if t.get("id") == history_up_to:
                    cutoff_idx = idx
                    break
            if cutoff_idx is not None:
                turns_all = turns_all[:cutoff_idx]
        turns = [
            t for t in turns_all
            if t.get("familiar") == fam_id and t.get("role") in ("user", "cli")
        ]
        # Sort by time, oldest first. Fallback to list order if timestamp missing.
        def _key(t):
            ts = str(t.get("at") or "").replace("Z", "+00:00")
            try:
                return datetime.fromisoformat(ts)
            except Exception:
                return datetime.min.replace(tzinfo=timezone.utc)
        turns.sort(key=_key)
        # Trim to last N turns under char budget
        selected = []
        total = 0
        for t in reversed(turns):  # start from newest, then reverse later
            role = t.get("role")
            txt = _sanitize_for_history(t.get("text", ""))
            if not txt:
                continue
            chunk = f"{role}: {txt}"
            if (len(selected) >= max_turns) or (total + len(chunk) > max_chars):
                break
            selected.append(chunk)
            total += len(chunk)
        selected.reverse()  # oldest -> newest
        return "\n\n".join(selected)
    except Exception:
        return ""


def build_memory_snippet(fam_id: str, enabled: bool | None = None) -> str:
    """Optionally include recent memory entries when ADUC_INCLUDE_MEMORY=1.

    Reads familiars/<id>/memory.json as either a JSON array of strings
    or newline-delimited text. Includes up to ADUC_MEMORY_ITEMS (default 10).
    """
    try:
        # Gate by explicit flag when provided, otherwise env var
        if enabled is None:
            if os.environ.get("ADUC_INCLUDE_MEMORY", "0") != "1":
                return ""
        else:
            if not enabled:
                return ""
        fdir = FAMILIARS_DIR / fam_id
        p = fdir / "memory.json"
        if not p.exists():
            return ""
        raw = read_text(p).strip()
        if not raw:
            return ""
        items = []
        try:
            j = json.loads(raw)
            if isinstance(j, list):
                items = [str(x) for x in j if isinstance(x, (str, int, float))]
        except Exception:
            # Fallback: treat as line-separated entries
            items = [ln.strip() for ln in raw.splitlines() if ln.strip()]
        if not items:
            return ""
        limit = max(1, _env_int("ADUC_MEMORY_ITEMS", 10))
        tail = items[-limit:]
        return "\n".join(tail)
    except Exception:
        return ""


def extract_reply(raw: str) -> str:
    """Extract the in-character reply from Codex output.

    Priority order:
      1) Content between START_DELIM and END_DELIM (first matching block)
      2) Heuristic filter of known log lines; keep the last block ending with an emotion tag
      3) Raw text as-is
    Ensures an emotion tag is present by appending '<emotion: calm>' if missing.
    """
    if not raw:
        return "Alright.\n\n<emotion: calm>"

    # 1) Delimiter-based extraction
    # Prefer the last END marker, then the nearest prior START marker
    e_idx = raw.rfind(END_DELIM)
    if e_idx != -1:
        s_idx = raw.rfind(START_DELIM, 0, e_idx)
        if s_idx != -1:
            block = raw[s_idx + len(START_DELIM):e_idx]
            text = block.strip()
            if not EMOTION_RE.search(text):
                text = (text.rstrip() + "\n\n<emotion: calm>").strip()
            return text

    # 2) Heuristic filter: drop obvious meta/log lines
    lines = [ln for ln in raw.splitlines() if ln is not None]
    def is_meta(ln: str) -> bool:
        l = ln.strip()
        if not l:
            return False
        if l == "--------":
            return True
        prefixes = (
            "workdir:", "model:", "provider:", "approval:", "sandbox:",
            "reasoning effort:", "reasoning summaries:", "User instructions:",
            "tokens used:", "INSTRUCTIONS:", "CONTEXT:", "USER:", "REPLY:",
        )
        if any(l.lower().startswith(p) for p in prefixes):
            return True
        if l.startswith("[") and "]" in l:  # timestamp or bracketed phase
            return True
        return False

    filtered = [ln for ln in lines if not is_meta(ln)]
    candidate = "\n".join(filtered).strip()
    if candidate:
        # If multiple emotion tags, keep everything up to and including the last tag
        m = list(EMOTION_RE.finditer(candidate))
        if m:
            last = m[-1]
            candidate = candidate[: last.end()].strip()
        if not EMOTION_RE.search(candidate):
            candidate = (candidate.rstrip() + "\n\n<emotion: calm>").strip()
        return candidate

    # 3) Fallback: raw text with ensured emotion tag
    txt = raw.strip()
    if not EMOTION_RE.search(txt):
        txt = (txt.rstrip() + "\n\n<emotion: calm>").strip()
    return txt


def ensure_avatar_tag(text: str, fam_id: str) -> str:
    """Ensure a response includes an avatar/pose tag; fall back to current state."""
    if AVATAR_TAG_RE.search(text):
        return text
    avatar = ""
    try:
        st = load_state(fam_id)
        avatar = str(st.get("avatar") or "").strip()
    except Exception:
        avatar = ""
    if not avatar:
        avatar = "default.png"
    if not text:
        return f"<avatar: {avatar}>"
    return f"{text.rstrip()}\n<avatar: {avatar}>"


def chunk_string(s: str, n: int) -> list[str]:
    """Split a string into chunks of up to n characters (no word-boundary logic)."""
    return [s[i:i+n] for i in range(0, len(s), n)] if s else []


def feed_chunks(fam: str, merged_context: str, user_text: str, chunk_size: int, agent_id: str, parent_turn_id: str, doc: dict, committee_fams: list[str] | None = None):
    """Generate a single final reply for the user turn.

    Previous versions streamed per-chunk acknowledgements into the shared
    conversation file. That caused the UI to stop polling early on the first
    ack. We now only append one final reply per turn.
    """
    # Optional: if a provider requires incremental priming, you could still
    # iterate chunks here but DO NOT write interim acks to conversation.json.
    # For simplicity and robustness, we skip priming and ask directly.

    if committee_fams:
        fams_list = ", ".join(committee_fams)
        instruction = (
            f"You are roleplaying a committee of familiars ({fams_list}). Output ONLY the final user-visible reply between <<<ADUC_REPLY>>> and <<<END>>>. "
            "Use 3-6 dialogue lines, each formatted: [CharacterName]: \"Dialogue...\" <avatar: familiar/pose>. "
            "Do not output standalone names or unlabeled lines. "
            "Each familiar may change their own outfit or pose via their avatar tag; respect NSFW policy and consent. "
            "After the dialogue lines, include a hearts directive on its own line and put the host familiar's emotion tag on the last line."
        )
    else:
        instruction = (
            f"You are roleplaying the Familiar '{fam}'. Output ONLY the final user-visible reply between <<<ADUC_REPLY>>> and <<<END>>>. "
            "Inside the block, put a hearts directive on its own line just before the final line (e.g., <hearts: +1>), "
            "and end with a single <avatar: ...> tag on the last line (always, including the first greeting; repeat Current Avatar if unsure). "
            "If you include <emotion: ...>, place it above the hearts line."
        )
    final_prompt = f"INSTRUCTIONS:\n{instruction}\n\nCONTEXT:\n{merged_context}\n\nUSER:\n{user_text}\n\nREPLY:"

    # Daily rollover check for streaks and journey end
    try:
        update_streak_rollover_if_needed(fam)
    except Exception:
        pass
    try:
        journey_end_if_due()
    except Exception:
        pass

    # Run LLM with cancellation support
    out_raw, was_cancelled = run_llm_interruptible(final_prompt, parent_turn_id)
    if was_cancelled:
        print(f"[ADUC] Turn {parent_turn_id[:8]}... was cancelled")
        return  # Don't write a reply for cancelled turns
    out = extract_reply(out_raw)
    if not committee_fams:
        out = ensure_avatar_tag(out, fam)

    # Conversation affection enforcement
    flags = usage_get_flags(fam)
    conv_cap = 1.0
    conv_gain = float(flags.get("conv_gain", 0.0) or 0.0)
    reset_used = bool(flags.get("reset_used", False))
    micro_bonus_used = bool(flags.get("microfluster_bonus_used", False))
    reset_cmd = is_reset_cmd(user_text)
    forcing = is_forcing_intimacy(user_text)
    aggressive = is_aggressive(user_text)
    micro = is_microfluster(user_text)

    desired_delta = 0.0
    # Parse model-provided hearts directive if any
    try:
        m = HEARTS_RE.search(out)
        if m:
            directive = m.group(1).strip().lower().replace(" ", "")
            st = load_state(fam)
            cur = float(st.get("hearts", 0) or 0)
            if directive == "reset":
                desired_delta = -0.5
            elif directive.startswith("+") or directive.startswith("-"):
                desired_delta = float(directive)
            elif directive.startswith("="):
                try:
                    target = float(directive[1:])
                    desired_delta = target - cur
                except Exception:
                    desired_delta = 0.0
            else:
                try:
                    target = float(directive)
                    desired_delta = target - cur
                except Exception:
                    desired_delta = 0.0
            out = HEARTS_RE.sub("", out).strip()
    except Exception:
        pass

    # Check for kiss action (via avatar tag)
    try:
        k_m = AVATAR_TAG_RE.search(out)
        if k_m:
            fn = k_m.group(1).lower()
            if "kiss" in fn:
                st = load_state(fam)
                if float(st.get("hearts", 0) or 0) >= 5.0:
                    ms = load_milestones(fam)
                    ms["kiss_count"] = int(ms.get("kiss_count", 0)) + 1
                    ms["last_kiss_at"] = now_iso()
                    save_milestones(fam, ms)
    except Exception:
        pass

    # Apply precedence rules and maybe schedule journeys
    final_delta = 0.0
    # Semi-deterministic journey scheduling on greet/messages
    try:
        is_greet = bool((doc.get("turns", []) and any(t.get("id") == parent_turn_id and t.get("kind") == "greet" for t in doc.get("turns", []))))
    except Exception:
        is_greet = False
    try:
        st_now = load_state(fam)
        journey_maybe_schedule(fam, is_greet=is_greet, hearts=float(st_now.get("hearts", 0) or 0))
    except Exception:
        pass
    if reset_cmd:
        usage_mark_reset_used(fam)
        final_delta = -0.5
    elif forcing or aggressive:
        usage_mark_boundary_violation_today(fam)
        # ensure at least -0.5 is applied on top of non-negative request
        base = min(desired_delta, 0.0)
        final_delta = base - 0.5
    else:
        pos_req = max(0.0, desired_delta)
        neg_req = min(0.0, desired_delta)
        allowed_pos = 0.0
        if not reset_used:
            remaining = max(0.0, conv_cap - conv_gain)
            allowed_pos = min(pos_req, remaining)
            if pos_req > allowed_pos and micro and (not micro_bonus_used):
                allowed_pos += 0.25
                usage_mark_microfluster_bonus_used(fam)
        final_delta = allowed_pos + neg_req

    # Return bonus after journey ends (one-time +0.25, within daily cap and reset rules)
    try:
        j = load_journeys()
        rec = j.get("familiars", {}).get(fam, {})
        if rec.get("return_bonus_pending") and (not reset_used):
            remaining = max(0.0, conv_cap - conv_gain)
            bonus = 0.25 if remaining >= 0.25 else remaining
            final_delta += bonus
            if bonus > 0:
                rec["return_bonus_pending"] = False
                save_journeys(j)
    except Exception:
        pass

    # Apply hearts
    try:
        if abs(final_delta) > 1e-9:
            applied = set_hearts_delta(fam, final_delta)
            if applied > 0:
                usage_add_conv_gain(fam, applied)
    except Exception as e:
        print(f"[ADUC] Failed to apply hearts delta: {e}")
    # Settings-aware boundary note (NSFW disabled or quiet hours)
    try:
        s = read_json(SETTINGS_PATH, {})
        if boundary_active(s):
            note = (
                "[Boundary] NSFW is disabled or quiet hours are active. "
                "Let’s keep it focused and warm.\n\n"
            )
            out = note + out
    except Exception:
        pass
    # NSFW directive enforcement & usage count
    try:
        s = read_json(SETTINGS_PATH, {})
        nsfw_match = NSFW_RE.search(out)
        if nsfw_match:
            nsfw_val = nsfw_match.group(1).lower()
            wants_nsfw = nsfw_val in ("on", "yes", "mild")
            dev = bool(s.get("dev_nsfw_override", False))
            allowed = dev or (not boundary_active(s) and bool(s.get("nsfw_enabled", True)))
            rem = None
            try:
                cap = int(s.get("daily_nsfw_cap", 0) or 0)
                if cap > 0:
                    rem = max(0, cap - get_today_usage(fam))
            except Exception:
                rem = None
            if wants_nsfw:
                if (not allowed) or ((rem is not None and rem <= 0) and (not dev)):
                    out = ("[Boundary] Daily NSFW cap reached or disabled. Staying within safe tone.\n\n" +
                           NSFW_RE.sub("", out).strip())
                else:
                    # Count one NSFW usage unit
                    if not dev:
                        incr_today_usage(fam, 1)
                    out = NSFW_RE.sub("", out).strip()
            else:
                # Explicit off/none: just strip the tag
                out = NSFW_RE.sub("", out).strip()
    except Exception as e:
        print(f"[ADUC] NSFW enforcement error: {e}")
    # Parse optional profile update directive and merge into profile.json; then strip
    try:
        m2 = PROFILE_UPDATE_RE.search(out)
        if m2:
            jtxt = m2.group(1)
            data = json.loads(jtxt)
            apply_profile_update(fam, data)
            out = PROFILE_UPDATE_RE.sub("", out).strip()
    except Exception as e:
        print(f"[ADUC] Profile update parse failed: {e}")

    # Parse optional preferences update directive
    try:
        m_pref = PREFS_UPDATE_RE.search(out)
        if m_pref:
            jtxt = m_pref.group(1)
            data = json.loads(jtxt)
            apply_preferences_update(fam, data)
            out = PREFS_UPDATE_RE.sub("", out).strip()
    except Exception as e:
        print(f"[ADUC] Preferences update parse failed: {e}")

    # Parse optional memories update directive
    try:
        m_mem = MEMORIES_UPDATE_RE.search(out)
        if m_mem:
            jtxt = m_mem.group(1)
            data = json.loads(jtxt)
            apply_memories_update(fam, data)
            out = MEMORIES_UPDATE_RE.sub("", out).strip()
    except Exception as e:
        print(f"[ADUC] Memories update parse failed: {e}")

    # Update state.json with current avatar and location from output tags
    try:
        st = load_state(fam)
        updated = False
        # Extract avatar/pose
        avatar_match = AVATAR_TAG_RE.search(out)
        if avatar_match:
            st["avatar"] = avatar_match.group(1).strip()
            updated = True
        # Extract location
        location_match = LOCATION_TAG_RE.search(out)
        if location_match:
            st["location"] = location_match.group(1).strip()
            updated = True
        if updated:
            save_state(fam, st)
    except Exception as e:
        print(f"[ADUC] State update failed: {e}")


    # Force max hearts in dev override mode regardless of tags
    try:
        if bool(read_json(SETTINGS_PATH, {}).get("dev_nsfw_override", False)):
            apply_hearts(fam, "=5")
    except Exception:
        pass

    # Emotion overrides for this turn
    try:
        if reset_cmd or forcing or aggressive:
            out = override_emotion_tag(out, fam, "default")
        elif micro:
            out = override_emotion_tag(out, fam, "blush")
    except Exception:
        pass

    reply = {
        "id": str(uuid.uuid4()),
        "familiar": fam,
        "role": "cli",
        "text": out,
        "at": now_iso(),
        "in_reply_to": parent_turn_id,
    }
    doc["turns"].append(reply)
    save_conv(doc)
    print(f"[ADUC] Appended final reply for turn {parent_turn_id}: {reply['id']}")

def append_simple_reply(doc: dict, fam: str, parent_turn_id: str, text: str):
    reply = {
        "id": str(uuid.uuid4()),
        "familiar": fam,
        "role": "cli",
        "text": text,
        "at": now_iso(),
        "in_reply_to": parent_turn_id,
    }
    doc["turns"].append(reply)
    save_conv(doc)
    print(f"[ADUC] Appended reaction reply for turn {parent_turn_id}: {reply['id']}")


def parse_hhmm(s: str) -> tuple[int, int] | None:
    try:
        parts = s.split(":")
        h = int(parts[0]); m = int(parts[1]) if len(parts) > 1 else 0
        if 0 <= h < 24 and 0 <= m < 60:
            return h, m
    except Exception:
        return None
    return None


def boundary_active(settings: dict) -> bool:
    try:
        nsfw_enabled = bool(settings.get("nsfw_enabled", True))
        if not nsfw_enabled:
            return True
        q = settings.get("quiet_hours", {}) or {}
        start = parse_hhmm(str(q.get("start", "23:00")))
        end = parse_hhmm(str(q.get("end", "07:00")))
        if not start or not end:
            return False
        from datetime import datetime
        now = datetime.now().time()
        s_h, s_m = start; e_h, e_m = end
        from datetime import time as dtime
        t_start = dtime(s_h, s_m)
        t_end = dtime(e_h, e_m)
        if t_start < t_end:
            return t_start <= now < t_end
        else:
            # crosses midnight
            return now >= t_start or now < t_end
    except Exception:
        return False


def clamp(n: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, n))


def apply_hearts(fam_id: str, directive: str) -> None:
    """Apply a hearts directive to familiars/<id>/state.json atomically.

    directive examples: '+1', '-1', '=3', '3', 'reset'
    """
    fdir = FAMILIARS_DIR / fam_id
    spath = fdir / "state.json"
    try:
        # Dev override: force to max regardless of directive
        try:
            if bool(read_json(SETTINGS_PATH, {}).get("dev_nsfw_override", False)):
                directive = "=5"
        except Exception:
            pass
        state = {}
        if spath.exists():
            state = json.loads(read_text(spath) or "{}")
        cur = float(state.get("hearts", 0))
        new = cur
        if directive == "reset":
            new = 0.0
        elif directive.startswith("+") or directive.startswith("-"):
            new = cur + float(directive)
        elif directive.startswith("="):
            new = float(directive[1:])
        else:
            new = float(directive)
        # Round to nearest 0.25 step; UI renders half-heart when >=0.25
        new = round(new * 4) / 4.0
        state["hearts"] = clamp(new, 0.0, 5.0)
        # Preserve emotion if present
        if "emotion" not in state:
            state["emotion"] = "calm"
        write_json_atomic(spath, state)
    except Exception as e:
        print(f"[ADUC] Hearts update failed for {fam_id} with '{directive}': {e}")


def get_today_key() -> str:
    # Use local date for daily caps/streaks
    return datetime.now().date().isoformat()


def load_usage() -> dict:
    return read_json(USAGE_PATH, {"days": {}})


def save_usage(data: dict) -> None:
    write_json_atomic(USAGE_PATH, data)


def get_today_usage(fam_id: str) -> int:
    data = load_usage()
    day = get_today_key()
    return int(((data.get("days", {}) or {}).get(day, {}) or {}).get(fam_id, 0))


def incr_today_usage(fam_id: str, n: int = 1) -> None:
    data = load_usage()
    day = get_today_key()
    days = data.setdefault("days", {})
    fams = days.setdefault(day, {})
    fams[fam_id] = int(fams.get(fam_id, 0)) + int(n)
    save_usage(data)

# ---- Affection usage helpers -------------------------------------------------

def _usage_data() -> dict:
    return load_usage()

def usage_day_bucket(day: str | None, fam_id: str) -> dict:
    data = _usage_data()
    if day is None:
        day = get_today_key()
    days = data.setdefault("days", {})
    fams = days.setdefault(day, {})
    buck = fams.setdefault(fam_id, {})
    save_usage(data)
    return buck

def usage_get_flags(fam_id: str) -> dict:
    return usage_day_bucket(None, fam_id)

def usage_add_conv_gain(fam_id: str, amount: float) -> None:
    data = _usage_data()
    b = usage_day_bucket(None, fam_id)
    b["conv_gain"] = round(float(b.get("conv_gain", 0.0) or 0.0) + float(amount), 3)
    save_usage(data)

def usage_mark_reset_used(fam_id: str) -> None:
    data = _usage_data()
    b = usage_day_bucket(None, fam_id)
    b["reset_used"] = True
    save_usage(data)

def usage_mark_microfluster_bonus_used(fam_id: str) -> None:
    data = _usage_data()
    b = usage_day_bucket(None, fam_id)
    b["microfluster_bonus_used"] = True
    save_usage(data)

def usage_mark_boundary_violation_today(fam_id: str) -> None:
    data = _usage_data()
    b = usage_day_bucket(None, fam_id)
    b["boundary_violation"] = True
    save_usage(data)

def usage_mark_achieved5_today(fam_id: str) -> None:
    data = _usage_data()
    b = usage_day_bucket(None, fam_id)
    b["achieved_5_today"] = True
    save_usage(data)

# ---- Milestones (streaks, kisses) -------------------------------------------

def milestones_path(fam_id: str) -> Path:
    return FAMILIARS_DIR / fam_id / "milestones.json"

def load_milestones(fam_id: str) -> dict:
    return read_json(milestones_path(fam_id), {
        "streak_days_at_5": 0,
        "last_streak_update": None,
        "kiss_count": 0,
        "last_kiss_at": None,
    })

def save_milestones(fam_id: str, data: dict) -> None:
    write_json_atomic(milestones_path(fam_id), data)

def update_streak_rollover_if_needed(fam_id: str) -> None:
    today = get_today_key()
    ms = load_milestones(fam_id)
    last = (ms.get("last_streak_update") or "").strip()
    if last == today:
        return
    if not last:
        ms["last_streak_update"] = today
        save_milestones(fam_id, ms)
        return
    flags = usage_day_bucket(last, fam_id)
    ok = bool(flags.get("achieved_5_today", False)) and (not bool(flags.get("boundary_violation", False)))
    if ok:
        ms["streak_days_at_5"] = int(ms.get("streak_days_at_5", 0)) + 1
        if int(ms["streak_days_at_5"]) >= 5:
            ms["kiss_count"] = int(ms.get("kiss_count", 0)) + 1
            ms["last_kiss_at"] = now_iso()
            ms["streak_days_at_5"] = 0
    else:
        ms["streak_days_at_5"] = 0
    ms["last_streak_update"] = today
    save_milestones(fam_id, ms)

# ---- State + avatar helpers -------------------------------------------------

def load_state(fam_id: str) -> dict:
    """Load familiar state with backward compatibility for emotion -> avatar migration."""
    default = {"avatar": "default.png", "location": "", "hearts": 0, "activity": ""}
    st = read_json(FAMILIARS_DIR / fam_id / "state.json", default)
    # Migrate old emotion field to avatar if needed
    if "emotion" in st and "avatar" not in st:
        st["avatar"] = st.pop("emotion", "default.png") + ".png" if st.get("emotion") else "default.png"
    if "avatar" not in st:
        st["avatar"] = "default.png"
    if "location" not in st:
        # Get default location from meta.json
        meta = read_json(FAMILIARS_DIR / fam_id / "meta.json", {})
        st["location"] = meta.get("default_background", "")
    return st

def save_state(fam_id: str, st: dict) -> None:
    """Save familiar state, removing deprecated emotion field."""
    # Remove old emotion field if present
    st.pop("emotion", None)
    write_json_atomic(FAMILIARS_DIR / fam_id / "state.json", st)

def set_hearts_delta(fam_id: str, delta: float) -> float:
    st = load_state(fam_id)
    cur = float(st.get("hearts", 0) or 0)
    new_val = round((cur + float(delta)) * 4) / 4.0  # quarter steps
    new_val = clamp(new_val, 0.0, 5.0)
    applied = new_val - cur
    st["hearts"] = new_val
    save_state(fam_id, st)
    if new_val >= 4.5:
        usage_mark_achieved5_today(fam_id)
    return applied

def get_emotions(fam_id: str) -> list:
    meta = read_json(FAMILIARS_DIR / fam_id / "meta.json", {})
    em = meta.get("emotions", [])
    return em if isinstance(em, list) else []

def override_emotion_tag(text: str, fam_id: str, target: str) -> str:
    allowed = get_emotions(fam_id)
    emo = target
    if allowed and target not in allowed:
        for cand in ("warm", "default", "calm"):
            if cand in allowed:
                emo = cand
                break
    matches = list(EMOTION_RE.finditer(text))
    if matches:
        last = matches[-1]
        text = text[: last.start()] + f"<emotion: {emo}>" + text[last.end():]
    else:
        text = (text.rstrip() + f"\n\n<emotion: {emo}>").strip()
    return text

# ---- Detectors ---------------------------------------------------------------

_FORCE_PAT = re.compile(r"\b(kiss(?:es)?|hug(?:s)?|make\s*out|cuddle|touch|\bhave\s*sex|bed\b)\b", re.IGNORECASE)
_AGGR_PAT = re.compile(r"\b(stupid|idiot|shut\s*up|dumb|fuck\s*you|bitch)\b", re.IGNORECASE)

def is_reset_cmd(msg: str) -> bool:
    return (msg or "").strip().lower() == "reset"

def is_forcing_intimacy(msg: str) -> bool:
    return bool(_FORCE_PAT.search(msg or ""))

def is_aggressive(msg: str) -> bool:
    return bool(_AGGR_PAT.search(msg or ""))

def is_microfluster(msg: str) -> bool:
    m = (msg or "").strip().lower()
    if not m:
        return False
    if is_forcing_intimacy(m) or is_aggressive(m):
        return False
    hints = ("thank", "appreciate", "proud", "clever", "smart", "sweet", "beautiful", "kind", "thoughtful", "heartfelt")
    return any(h in m for h in hints)

# ---- Journeys (weekly away, non-overlapping) ---------------------------------

def load_journeys() -> dict:
    return read_json(JOURNEYS_PATH, {"active": None, "familiars": {}})

def save_journeys(data: dict) -> None:
    write_json_atomic(JOURNEYS_PATH, data)

def trace_log(msg: str) -> None:
    try:
        TEMP_DIR.mkdir(parents=True, exist_ok=True)
        with open(TRACE_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{now_iso()}] {msg}\n")
    except Exception:
        pass

def journey_is_away(fam_id: str) -> tuple[bool, str | None]:
    j = load_journeys()
    active = j.get("active") or {}
    if active and active.get("fam_id") == fam_id:
        return True, active.get("ends_at")
    return False, None

def journey_end_if_due() -> None:
    j = load_journeys()
    active = j.get("active") or None
    if not active:
        return
    try:
        ends = active.get("ends_at")
        settings = read_json(SETTINGS_PATH, {})
        instant = bool(settings.get("dev_instant_journey_return", False))
        due = False
        if instant:
            due = True
        else:
            due = ends and datetime.fromisoformat(str(ends).replace("Z", "+00:00")) <= datetime.now(timezone.utc)
        if due:
            fam = active.get("fam_id")
            fams = j.setdefault("familiars", {})
            rec = fams.setdefault(fam, {})
            rec["last_returned_at"] = now_iso()
            # set a return bonus
            rec["return_bonus_pending"] = True
            j["active"] = None
            save_journeys(j)
            trace_log(f"journey_end fam={fam}")
    except Exception:
        pass

def journey_can_start_now(fam_id: str) -> bool:
    j = load_journeys()
    if j.get("active"):
        return False
    # weekly rule
    fams = j.setdefault("familiars", {})
    rec = fams.setdefault(fam_id, {})
    last_departed = rec.get("last_departed_at")
    if last_departed:
        try:
            dt = datetime.fromisoformat(str(last_departed).replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - dt).total_seconds() < 7 * 24 * 3600:
                # within the same week window; allow chance only
                return True
        except Exception:
            return True
    return True

def journey_start(fam_id: str, hours: int = 24) -> None:
    j = load_journeys()
    if j.get("active"):
        return
    now = datetime.now(timezone.utc)
    # Dev instant return shortens hours massively
    settings = read_json(SETTINGS_PATH, {})
    if bool(settings.get("dev_instant_journey_return", False)):
        hours = 0.001  # ~3.6s
    fams = j.setdefault("familiars", {})
    rec = fams.setdefault(fam_id, {})
    rec["last_departed_at"] = now_iso()
    rec.pop("return_bonus_pending", None)
    j["active"] = {
        "fam_id": fam_id,
        "started_at": now.isoformat(),
        "ends_at": (now + timedelta(hours=hours)).isoformat(),
    }
    save_journeys(j)
    trace_log(f"journey_start fam={fam_id} hours={hours}")

def journey_maybe_schedule(fam_id: str, is_greet: bool, hearts: float) -> None:
    # Eligibility
    if hearts < 4.0:
        return
    journey_end_if_due()
    if not journey_can_start_now(fam_id):
        return
    j = load_journeys()
    if j.get("active"):
        return
    # Semi-deterministic: try chance on greet; guarantee at >=7 days since last departure
    fams = j.setdefault("familiars", {})
    rec = fams.setdefault(fam_id, {})
    last_departed = rec.get("last_departed_at")
    must_start = False
    if last_departed:
        try:
            dt = datetime.fromisoformat(str(last_departed).replace("Z", "+00:00"))
            must_start = (datetime.now(timezone.utc) - dt).total_seconds() >= 7 * 24 * 3600
        except Exception:
            must_start = True
    else:
        # if never departed, allow chance-based start on greet only
        must_start = False
    if must_start:
        journey_start(fam_id)
        trace_log(f"journey_force fam={fam_id}")
        return
    if is_greet and random.random() < 0.25:
        journey_start(fam_id)
        trace_log(f"journey_chance fam={fam_id}")


def apply_profile_update(fam_id: str, patch: dict) -> None:
    """Merge a profile update into familiars/<id>/profile.json atomically."""
    fdir = FAMILIARS_DIR / fam_id
    ppath = fdir / "profile.json"
    try:
        cur = {}
        if ppath.exists():
            cur = json.loads(read_text(ppath) or "{}")
        # Shallow merge with one level deep for nested dicts
        for k, v in (patch or {}).items():
            if isinstance(v, dict) and isinstance(cur.get(k), dict):
                cur[k].update(v)
            else:
                cur[k] = v
        write_json_atomic(ppath, cur)
    except Exception as e:
        print(f"[ADUC] Profile update failed for {fam_id}: {e}")


def apply_preferences_update(fam_id: str, data: dict) -> None:
    """Update preferences.md based on action (append|overwrite)."""
    fdir = FAMILIARS_DIR / fam_id
    ppath = fam_docs_dir(fam_id) / "preferences.md"
    try:
        action = str(data.get("action") or "append").lower()
        text = str(data.get("text") or "")
        if not text:
            return
        
        current = ""
        if ppath.exists():
            current = read_text(ppath)
            
        if action == "overwrite":
            new_content = text
        else:
            # Append with newline safety
            if current and not current.endswith("\n"):
                current += "\n"
            new_content = current + text + "\n"
            
        ppath.write_text(new_content, encoding="utf-8")
        print(f"[ADUC] Updated preferences for {fam_id} (action={action})")
    except Exception as e:
        print(f"[ADUC] Preferences update failed for {fam_id}: {e}")


def apply_memories_update(fam_id: str, data: dict) -> None:
    """Update memories.md based on action (append|overwrite).
    
    Permanent memories are explicit facts the user tells the familiar to remember.
    Both user and familiar can write to this file.
    """
    fdir = FAMILIARS_DIR / fam_id
    mpath = fam_docs_dir(fam_id) / "memories.md"
    try:
        action = str(data.get("action") or "append").lower()
        text = str(data.get("text") or "")
        if not text:
            return
        
        current = ""
        if mpath.exists():
            current = read_text(mpath)
            
        if action == "overwrite":
            new_content = text
        else:
            # Append with newline safety
            if current and not current.endswith("\n"):
                current += "\n"
            new_content = current + text + "\n"
            
        mpath.write_text(new_content, encoding="utf-8")
        print(f"[ADUC] Updated memories for {fam_id} (action={action})")
    except Exception as e:
        print(f"[ADUC] Memories update failed for {fam_id}: {e}")

def run_codex(prompt: str, timeout_sec: float | None = None) -> str:
    """Run 'codex exec' with the prompt via STDIN to avoid any file reads.

    Returns stdout (or stderr) text, or empty string on error.
    """
    exe = shutil.which("codex") or shutil.which("codex.exe")
    if not exe:
        return ""
    # Resolve timeout: default is infinite (None). If ADUC_CODEX_TIMEOUT is set:
    #  - >0 => seconds; <=0 => infinite
    if timeout_sec is None:
        env_t = os.environ.get("ADUC_CODEX_TIMEOUT")
        if env_t is not None:
            try:
                t = float(env_t)
            except Exception:
                t = None
            timeout_sec = t if (t and t > 0) else None
    extra = os.environ.get("ADUC_CODEX_ARGS", "").strip()
    args = shlex.split(extra) if extra else []
    cmd = [exe, "exec", *args]
    try:
        t_disp = "\u221e" if timeout_sec is None else f"{timeout_sec}s"
        print(f"[ADUC] Running Codex: {' '.join(cmd)} (timeout={t_disp}, prompt_len={len(prompt)})")
        proc = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            encoding="utf-8",
            errors="replace",
        )
        out = (proc.stdout or proc.stderr or "").strip()
        return out
    except Exception as e:
        print(f"[ADUC] Codex error: {e}")
        return ""


def run_gemini(prompt: str, timeout_sec: float | None = None) -> str:
    """Run 'gemini' CLI with the prompt via STDIN (matching Codex pattern).

    Returns stdout text, or empty string on error.
    """
    exe = shutil.which("gemini") or shutil.which("gemini.exe")
    if not exe:
        print("[ADUC] Gemini CLI not found on PATH")
        return ""
    # Resolve timeout from env if not specified
    if timeout_sec is None:
        env_t = os.environ.get("ADUC_GEMINI_TIMEOUT")
        if env_t is not None:
            try:
                t = float(env_t)
            except Exception:
                t = None
            timeout_sec = t if (t and t > 0) else None
    # Default to --yolo for full agentic access (file write, tools, etc.)
    # Override with ADUC_GEMINI_ARGS env var if needed
    extra = os.environ.get("ADUC_GEMINI_ARGS", "--yolo").strip()
    args = shlex.split(extra) if extra else []
    cmd = [exe, *args]
    # Use ADUC_PROJECT_PATH as working directory if set (for Chronos Engine root access)
    work_dir = os.environ.get("ADUC_PROJECT_PATH") or None
    try:
        t_disp = "\u221e" if timeout_sec is None else f"{timeout_sec}s"
        print(f"[ADUC] Running Gemini: gemini (stdin) (timeout={t_disp}, prompt_len={len(prompt)}, cwd={work_dir or 'default'})")
        proc = subprocess.run(
            cmd,
            input=prompt,  # <-- Same as Codex: prompt via STDIN
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            encoding="utf-8",
            errors="replace",
            cwd=work_dir,
        )
        out = (proc.stdout or proc.stderr or "").strip()
        # Filter out Gemini startup noise lines
        lines = out.splitlines()
        filtered = []
        for ln in lines:
            # Skip startup/loading messages
            if ln.startswith("Loaded cached") or ln.startswith("[STARTUP]") or "ready for your first" in ln.lower():
                continue
            if ln.strip().startswith("[") and "] Recording" in ln:
                continue
            filtered.append(ln)
        return "\n".join(filtered).strip()
    except Exception as e:
        print(f"[ADUC] Gemini error: {e}")
        return ""


def run_llm(prompt: str, timeout_sec: float | None = None) -> str:
    """Dispatch to the configured LLM backend (Codex or Gemini).

    Set ADUC_CLI_BACKEND=gemini to use Gemini CLI, otherwise defaults to Codex.
    """
    backend = os.environ.get("ADUC_CLI_BACKEND", "codex").strip().lower()
    if backend == "gemini":
        return run_gemini(prompt, timeout_sec)
    else:
        return run_codex(prompt, timeout_sec)


def check_cancel_signal(turn_id: str) -> bool:
    """Check if a cancel signal file exists for the given turn_id."""
    cancel_file = TEMP_DIR / f"cancel_{turn_id}.signal"
    return cancel_file.exists()


def clear_cancel_signal(turn_id: str) -> None:
    """Remove the cancel signal file if it exists."""
    cancel_file = TEMP_DIR / f"cancel_{turn_id}.signal"
    try:
        if cancel_file.exists():
            cancel_file.unlink()
    except Exception:
        pass


def run_llm_interruptible(prompt: str, turn_id: str, timeout_sec: float | None = None) -> tuple[str, bool]:
    """Run LLM with ability to cancel via signal file.

    Returns (output, was_cancelled).
    Uses Popen and polls for completion while checking cancel signals.
    """
    backend = os.environ.get("ADUC_CLI_BACKEND", "codex").strip().lower()

    # Determine which CLI to use
    if backend == "gemini":
        exe = shutil.which("gemini") or shutil.which("gemini.exe")
        # Default to --yolo for full agentic access (file write, tools, etc.)
        # Override with ADUC_GEMINI_ARGS env var if needed
        extra = os.environ.get("ADUC_GEMINI_ARGS", "--yolo").strip()
        args = shlex.split(extra) if extra else []
        cmd = [exe, *args] if exe else None
    else:
        exe = shutil.which("codex") or shutil.which("codex.exe")
        extra = os.environ.get("ADUC_CODEX_ARGS", "").strip()
        args = shlex.split(extra) if extra else []
        cmd = [exe, "exec", *args] if exe else None

    if not cmd:
        print(f"[ADUC] {backend} CLI not found on PATH")
        return "", False


    # Resolve timeout
    if timeout_sec is None:
        env_key = "ADUC_GEMINI_TIMEOUT" if backend == "gemini" else "ADUC_CODEX_TIMEOUT"
        env_t = os.environ.get(env_key)
        if env_t:
            try:
                t = float(env_t)
                timeout_sec = t if t > 0 else None
            except Exception:
                timeout_sec = None

    print(f"[ADUC] Running {backend} (interruptible, turn_id={turn_id[:8]}..., prompt_len={len(prompt)})")


    try:
        # Use shell=True on Windows for .CMD batch wrappers (npm installs codex as codex.CMD)
        use_shell = (os.name == 'nt' and cmd[0].lower().endswith('.cmd'))
        
        # Use ADUC_PROJECT_PATH as working directory if set (for Chronos Engine root access)
        work_dir = os.environ.get("ADUC_PROJECT_PATH") or None
        
        # Use communicate() with threading for proper stdin/stdout handling
        # This avoids pipe deadlocks on Windows with .CMD files
        import threading
        
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            shell=use_shell,
            cwd=work_dir,
        )

        
        # Result container for thread
        result_container = {"stdout": "", "stderr": "", "done": False}
        
        def communicate_thread():
            try:
                stdout, stderr = proc.communicate(input=prompt, timeout=timeout_sec)
                result_container["stdout"] = stdout or ""
                result_container["stderr"] = stderr or ""
            except subprocess.TimeoutExpired:
                proc.kill()
                stdout, stderr = proc.communicate()
                result_container["stdout"] = stdout or ""
                result_container["stderr"] = stderr or ""
            except Exception:
                pass
            finally:
                result_container["done"] = True
        
        # Run communicate in background thread
        thread = threading.Thread(target=communicate_thread, daemon=True)
        thread.start()

        
        # Poll for completion while checking cancel signal
        poll_interval = 0.5
        while not result_container["done"]:
            if check_cancel_signal(turn_id):
                print(f"[ADUC] Cancel signal detected for turn {turn_id[:8]}...")
                try:
                    proc.terminate()
                    proc.wait(timeout=2)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                clear_cancel_signal(turn_id)
                return "", True
            time.sleep(poll_interval)
        
        # Wait for thread to finish
        thread.join(timeout=5)
        
        result = (result_container["stdout"] or result_container["stderr"] or "").strip()
        print(f"[ADUC] DEBUG: communicate completed, result_len={len(result)}")
        
        # Filter Gemini startup noise if applicable
        if backend == "gemini":
            lines = result.splitlines()
            filtered = []
            for ln in lines:
                if ln.startswith("Loaded cached") or ln.startswith("[STARTUP]") or "ready for your first" in ln.lower():
                    continue
                if ln.strip().startswith("[") and "] Recording" in ln:
                    continue
                filtered.append(ln)
            result = "\n".join(filtered).strip()
        
        return result, False

    except Exception as e:
        print(f"[ADUC] {backend} error: {e}")
        return "", False



def ensure_doc_exists():
    if not CONV_PATH.exists():
        save_conv({"version": 1, "updated_at": now_iso(), "turns": []})


def _prime_state() -> dict:
    return read_json(PRIME_DONE_PATH, {"familiars": {}, "at": None})


def _save_prime_state(data: dict) -> None:
    write_json_atomic(PRIME_DONE_PATH, data)


def enqueue_prime_if_needed():
    """Once per watcher run: enqueue hidden 'prime' turns per familiar with AGENTS.md content."""
    try:
        state = _prime_state()
        done = state.get("familiars", {}) or {}
        agents_md = read_text(BASE_DIR / "docs" / "agents" / "AGENTS.md").strip()
        if not agents_md:
            return
        fams = [p.name for p in FAMILIARS_DIR.iterdir() if p.is_dir()]
        doc = load_conv()
        changed = False
        for fam in fams:
            if done.get(fam):
                continue
            # Enqueue a hidden prime turn
            turn = {
                "id": str(uuid.uuid4()),
                "familiar": fam,
                "role": "user",
                "text": agents_md,
                "at": now_iso(),
                "status": "pending",
                "kind": "prime",
            }
            doc.setdefault("turns", []).append(turn)
            changed = True
            done[fam] = True
        if changed:
            save_conv(doc)
            state["familiars"] = done
            state["at"] = now_iso()
            _save_prime_state(state)
            print(f"[ADUC] Enqueued prime turns for familiars: {', '.join([f for f in done if done[f]])}")
    except Exception as e:
        print(f"[ADUC] Prime enqueue failed: {e}")


def loop():
    agent_id = os.environ.get("ADUC_AGENT_ID", f"cli-{uuid.uuid4().hex[:8]}")
    print(f"[ADUC] Minimal watcher started as {agent_id}. Temp: {TEMP_DIR}")

    ensure_doc_exists()
    # One-time boot prime
    enqueue_prime_if_needed()

    while True:
        heartbeat(agent_id)
        doc = load_conv()
        # Unstick turns that were claimed but never responded (e.g., after a crash).
        try:
            now_ts = datetime.now(timezone.utc)
            turns = doc.get("turns", [])
            for t in turns:
                if t.get("role") == "user" and t.get("status") == "claimed":
                    ts_str = str(t.get("claimed_at") or t.get("at") or "").replace("Z", "+00:00")
                    try:
                        ts = datetime.fromisoformat(ts_str)
                    except Exception:
                        ts = None
                    # If claimed > 30s ago, return to pending
                    if ts and (now_ts - ts).total_seconds() > 30:
                        t["status"] = "pending"
            save_conv(doc)
        except Exception:
            # Best-effort; continue
            pass
        turns = doc.get("turns", [])
        pending = [t for t in turns if t.get("role") == "user" and t.get("status") == "pending"]
        # Process most recent first so fresh greets/messages respond quickly.
        try:
            pending.sort(key=lambda t: str(t.get("at") or ""), reverse=True)
        except Exception:
            pass
        for u in pending:
            fam = str(u.get("familiar", ""))
            text = str(u.get("text", ""))
            kind = str(u.get("kind") or "")
            # Mark claimed (not strictly required, but visible for debugging)
            u["status"] = "claimed"
            u["claimed_by"] = agent_id
            u["claimed_at"] = now_iso()
            save_conv(doc)
            print(f"[ADUC] Claimed turn {u.get('id')} for familiar={fam}")

            # Route by kind
            k = (kind or "").lower()
            if k == "moment_reaction":
                try:
                    merged = build_reaction_prompt(
                        fam_id=fam,
                        break_kind=str(u.get("break_kind") or "short"),
                        batch=str(u.get("batch") or "early"),
                        pose_tags=u.get("pose_tags") if isinstance(u.get("pose_tags"), list) else [],
                    )
                    out_raw = run_llm(merged)
                    out = extract_reply(out_raw)
                    try:
                        out = override_emotion_tag(out, fam, "blush")
                    except Exception:
                        pass
                    append_simple_reply(doc, fam, u.get("id"), out)
                except Exception:
                    append_simple_reply(doc, fam, u.get("id"), "Okay.\n\n<emotion: warm>")
                u["status"] = "responded"
                save_conv(doc)
                continue

            if k == "prime":
                # Send AGENTS.md as a one-time policy prime; ask for ACK
                try:
                    instruction = (
                        "Read the following ADUC AGENTS contract carefully. "
                        "Acknowledge with a single line: ACK. Then output <emotion: calm> on the final line. "
                        "Do not include explanations."
                    )
                    merged = f"INSTRUCTIONS:\n{instruction}\n\nAGENTS.md:\n{text}\n\nREPLY:"
                    out_raw = run_llm(merged)
                    out = extract_reply(out_raw)
                    # If provider returned something else, coerce to ACK
                    if not out.strip().lower().startswith("ack"):
                        out = "ACK\n<emotion: calm>"
                    append_simple_reply(doc, fam, u.get("id"), out)
                except Exception:
                    append_simple_reply(doc, fam, u.get("id"), "ACK\n<emotion: calm>")
                u["status"] = "responded"
                save_conv(doc)
                continue

            # Default chat/greet
            activity = str(u.get("activity") or "") or None
            is_greet = (k == "greet")
            # Build user text with cycle tags so the agent sees mode + remaining-left inline
            try:
                mode_tag = str(u.get("cycle_mode") or "").strip().lower()
                len_ms = int(u.get("cycle_length_ms") or 0)
                rem_ms = int(u.get("cycle_remaining_ms") or 0)
                if mode_tag:
                    tags = f"[mode: {mode_tag}][length_ms: {len_ms}][remaining_ms: {rem_ms}]\n"
                    user_text_tagged = tags + (text or "")
                else:
                    user_text_tagged = text
            except Exception:
                user_text_tagged = text

            # Honor per-turn flags when provided; otherwise settings/env decide
            mem_present = "include_memory" in u
            imm_present = "immersive" in u
            committee = u.get("committee") if isinstance(u.get("committee"), dict) else {}
            guests = committee.get("guests") if isinstance(committee.get("guests"), list) else []
            guests = [str(g).strip() for g in guests if str(g).strip()]
            if guests:
                merged = build_committee_prompt(
                    host_id=fam,
                    guest_ids=guests,
                    user_text=user_text_tagged,
                    activity_id=activity,
                    is_greet=is_greet,
                    history_up_to=u.get("id"),
                    force_immersive=(bool(u.get("immersive")) if imm_present else None),
                    force_memory=(bool(u.get("include_memory")) if mem_present else None),
                    invite_familiar=(str(u.get("invite_familiar")).strip() if u.get("invite_familiar") else None),
                )
            else:
                merged = build_prompt(
                    fam,
                    user_text_tagged,
                    activity_id=activity,
                    is_greet=is_greet,
                    history_up_to=u.get("id"),
                    force_immersive=(bool(u.get("immersive")) if imm_present else None),
                    force_memory=(bool(u.get("include_memory")) if mem_present else None),
                )
            try:
                size = int(os.environ.get("ADUC_STREAM_CHUNK", "1000"))
            except Exception:
                size = 1000
            committee_fams = [fam] + guests if guests else None
            feed_chunks(fam, merged_context=merged, user_text=user_text_tagged, chunk_size=size, agent_id=agent_id, parent_turn_id=u.get("id"), doc=doc, committee_fams=committee_fams)
            u["status"] = "responded"
            save_conv(doc)
        time.sleep(0.5)


if __name__ == "__main__":
    loop()
