ADUC — Local Familiars UI

This repository contains a small local web UI and backend for "Familiars" (local roleplay agents). It is local-first and integrates with external CLI agents via a shared JSON file. See `docs/index.md` for the full docs index and `docs/agents/AGENTS.md` for the agent contract.

Quick start (Windows)

1) Install dependencies (one‑time):

```powershell
py -3 -m pip install --user -r requirements.txt
```

2) Start everything (server + watcher + open browser):

```powershell
# from repo root
./run_aduc_codex.bat 8080
```

What the launcher does
- Starts `server.py` (Flask) in a new console window
- Starts the CLI bridge watcher `tools\cli_bridge_watcher.py` in a new console window
- Opens the browser to http://localhost:8080

Linux/macOS

Use the provided bash script:

```bash
chmod +x ./run_aduc.sh
./run_aduc.sh 8080
```

Or run components manually:

```bash
# Terminal 1
PORT=8080 python3 server.py

# Terminal 2
python3 tools/cli_bridge_watcher.py
```

How the CLI bridge works (high level)
- The server and UI write each user message to a shared JSON file at `<os temp>/ADUC/conversation.json`.
- The watcher reads pending user turns and appends a `role: "cli"` reply with an `<avatar: ...>` tag on the last line.
- The UI polls for the reply and swaps the avatar based on the avatar tag.

Focus/Break cycle (Pomodoro-style)
- You can start/stop focus or break windows so Familiars act accordingly and reference time remaining.
- Endpoints:
  - `GET /cycle/status` → `{ mode, length_ms, remaining_ms, started_at, ends_at, familiar }`
  - `POST /cycle/start_focus` with `{ length_ms? | minutes?, familiar? }`
  - `POST /cycle/start_break` with `{ length_ms? | minutes?, familiar? }`
  - `POST /cycle/start_long_break` with `{ length_ms? | minutes?, familiar? }`
  - `POST /cycle/stop`
- The CLI watcher automatically includes a `[Focus Cycle]` block in the merged prompt with the current mode and remaining time.
 - Each user message is also tagged with inline cycle info, e.g.: `[mode: break][length_ms: 300000][remaining_ms: 120000]` to strengthen “no work during breaks”.

Key files
- `server.py`: Flask backend and endpoints for chat, settings, and assets.
- `tools/cli_bridge_watcher.py`: watches the conversation file and (optionally) calls `codex exec` to generate replies; otherwise returns a safe local stub.
- `ADUC.html`, `static/ui.js`, `static/styles.css`: minimal UI.
- `familiars/<name>/`: familiar definitions (meta/state/memory/avatars) and `docs/` for persona files.
- `docs/index.md`: full documentation index.
- `docs/README.md`: deep-dive landing page.
- `docs/agents/AGENTS.md`: CLI integration guide (prompt merge, file locations, JSON schema).

Settings
- `GET /settings` / `POST /settings`: persisted toggles in `<temp>/ADUC/settings.json`.
  - `include_memory` (bool): include recent `memory.json` entries in merged prompts.
  - `immersive` (bool): include `lore.md` in merged prompts (same effect as `ADUC_IMMERSIVE=1`).
  - Other keys: `nsfw_enabled`, `quiet_hours`, `daily_nsfw_cap`, `dev_*`.
  - `/chat` applies `include_memory` and `immersive` from settings to each user turn; the watcher honors per-turn flags, then settings, then env.

Environment variables (common)
- `ADUC_CONV_PATH`: absolute path to the shared conversation JSON (the launchers set this automatically).
- `ADUC_IMMERSIVE=1`: include `lore.md` in merged prompts (can be overridden by settings).
- `ADUC_INCLUDE_MEMORY=1`: include recent memory entries in prompts (can be overridden by settings).
- `ADUC_CODEX_ARGS`: extra flags passed to `codex exec` by the watcher (when `codex` is on PATH).
- `ADUC_CODEX_TIMEOUT`: seconds to allow `codex exec` to run (unset/0 = infinite).

Notes
- If `codex` is not on PATH, the watcher still appends a simple reply so the UI remains responsive.
- The shared conversation file lives in the OS temp dir (e.g., `%TEMP%\ADUC\conversation.json` on Windows, `/tmp/ADUC/conversation.json` on Linux).
