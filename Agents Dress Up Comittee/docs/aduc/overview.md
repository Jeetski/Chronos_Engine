# ADUC Overview

ADUC is a local-first UI and backend for "Familiars" (agent personas). It
supports a direct chat flow and a CLI bridge flow that lets external agents
participate through a shared JSON file.

Core ideas
- Local only: no cloud accounts, no telemetry.
- File-based personas: each familiar has a folder with state, profile, avatars,
  and docs that define voice and behavior.
- Optional immersion and memory: lore and memory are included only when enabled.

Key components
- `ADUC.html` + `static/ui.js` + `static/styles.css` for the UI
- `server.py` for chat, settings, and assets
- `tools/cli_bridge_watcher.py` for file-based CLI bridge replies
