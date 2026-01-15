"""
Minimal simple_watcher for tests
--------------------------------
Provides a tiny API used by tests:

- merge_prompt(fam_id, include_memory=False, immersive=False) -> str
- generate_reply(prompt, user_text, fam_id) -> str

This mirrors the prompt merge contract described in docs/agents/AGENTS.md, but keeps
logic intentionally simple and local-only. No networking or model calls.
"""
from __future__ import annotations

import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
FAMILIARS_DIR = BASE_DIR / "familiars"
FAMILIAR_DOCS_SUBDIR = "docs"


def _read_text(path: Path) -> str:
    try:
        if not path.exists():
            return ""
        return path.read_text(encoding="utf-8", errors="replace").strip()
    except Exception:
        return ""


def _read_json(path: Path, default):
    try:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def merge_prompt(fam_id: str, include_memory: bool = False, immersive: bool = False) -> str:
    """Assemble the merged prompt for a familiar.

    Order per docs/agents/AGENTS.md:
      1) docs/agent.md
      2) docs/personality.md
      3) docs/coding.md (optional, prefixed with "[Coding Support]")
      4) Current Emotional State: <state.emotion>
      5) memory (optional)
      6) lore (optional, with prefix)
    """
    fdir = FAMILIARS_DIR / fam_id
    fdocs = fdir / FAMILIAR_DOCS_SUBDIR
    agent = _read_text(fdocs / "agent.md")
    personality = _read_text(fdocs / "personality.md")
    coding = _read_text(fdocs / "coding.md")
    state = _read_json(fdir / "state.json", {"emotion": "calm"})
    parts: list[str] = []
    if agent:
        parts.append(agent)
    if personality:
        parts.append(personality)
    if coding:
        parts.append("[Coding Support]\n" + coding)
    parts.append(f"Current Emotional State: {state.get('emotion', 'calm')}")

    if include_memory:
        mem_txt = _read_text(fdir / "memory.json")
        if mem_txt:
            parts.append("[Recent Memory]\n" + mem_txt)

    if immersive:
        lore = _read_text(fdocs / "lore.md")
        if lore:
            parts.append("[Immersive Lore Enabled]\n" + lore)

    return "\n\n".join(parts)


def generate_reply(prompt: str, user_text: str, fam_id: str) -> str:
    """Return a tiny deterministic stub reply with a valid emotion tag.

    Ensures the last line contains `<emotion: ...>` so the UI can update.
    """
    # Pick a safe default emotion from meta if available
    meta = _read_json((FAMILIARS_DIR / fam_id / "meta.json"), {})
    emotions = meta.get("emotions") if isinstance(meta.get("emotions"), list) else []
    preferred = "calm"
    for cand in ("focus", "warm", "default", "calm"):
        if cand in emotions:
            preferred = cand
            break

    # Extremely simple echo-style reply; tests only print it.
    body = "Got it — I’ll think on that and circle back with something helpful."
    if user_text:
        body = f"You said: {user_text}. Here’s a quick thought."

    return body + f"\n<emotion: {preferred}>"


__all__ = [
    "merge_prompt",
    "generate_reply",
]
