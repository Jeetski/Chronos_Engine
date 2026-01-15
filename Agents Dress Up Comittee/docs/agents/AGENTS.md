# ADUC Agent Integration Guide (for CLI agents)

This document explains how external CLI agents (e.g., Codex CLI, Gemini CLI, custom scripts) can integrate with the local ADUC app and roleplay Familiars using the same files the UI uses.

ADUC is local-first. Integration is file-based and HTTP-optional. The simplest bridge is a shared JSON file in the OS temp directory that both the browser (via ADUC backend) and your CLI agent read/write.

## Familiar Structure

Each familiar lives in `familiars/<name>/` with docs in `familiars/<name>/docs/`:

- `meta.json`: identity, UI traits, `emotions`, `default_background`.
- `state.json`: current emotion, e.g. `{ "emotion": "calm" }`.
- `memory.json`: opt-in memory; append only when user explicitly asks (remember/save/store).
- `skills.yml`: model/tool preferences (optional for CLI agents).
- `avatar/*.png`: images keyed by emotion (`default.png`, `focus.png`, etc.).
- `docs/agent.md`: functional role and capabilities.
- `docs/personality.md`: tone, speech patterns, boundaries.
- `docs/coding.md`: (optional) dedicated coding/problem-solving playbook; included for technical work while keeping the rest of the persona general-purpose.
- `docs/greet.md`: (optional) first-run greeting snippet.
- `docs/lore.md`: world flavor; included only when "immersive" is on.
- `docs/chronos.md`: (optional) Chronos pilot protocol for Chronos mode.
- `docs/affection.md`: (optional) familiar-specific hearts rules.
- `docs/outfits.md`: (optional) outfit registry with avatar references.
- `docs/locations.md`: (optional) available backgrounds/locations.
- `docs/preferences.md`: user-defined behavior preferences (e.g., "be more casual").
- `docs/memories.md`: permanent facts about the user (e.g., "user's dog is named Max").

## Prompt Merge (roleplay contract)

To roleplay a familiar, assemble the system prompt like this:

1) `docs/agent.md`
2) `docs/personality.md`
3) `docs/coding.md` (if present) prefixed with `[Coding Support]`
4) `Current Emotional State: <state.json.emotion>`
5) If memory enabled: summarize or include `memory.json` (recent entries)
6) If immersive mode: append `docs/lore.md` prefixed with `[Immersive Lore Enabled]`
7) `docs/preferences.md` (if present) prefixed with `[User Preferences]`
8) `docs/memories.md` (if present) prefixed with `[Permanent Memories]`

User message follows after the system prompt. Responses should include an avatar tag in the final line so the UI can update the avatar:

```
<avatar: calm>
```

Keep avatar tags to the familiar's allowed set in `meta.json.emotions`.

Prompt suggestions (UI bubbles)

To provide clickable prompt suggestions in the UI, append one or more prompt tags near the end of every reply. Each tag becomes a suggestion bubble that fills the chat box when clicked. Place them on their own lines just before the final avatar tag:

```
<prompt: Want a lighter version?>
<prompt: Ask me to summarize>
<prompt: Switch the topic>
<avatar: calm>
```

Notes:
- Use multiple `<prompt: ...>` tags to offer several options.
- Keep suggestions short and action-oriented.

## Conversation Bridge (Temp JSON)

When the user enables “CLI Bridge” in the UI, ADUC writes each user message to a shared JSON file in the OS temp directory and waits for a CLI agent to respond by appending a reply. The browser then displays that reply and updates the familiar’s avatar.

Location (Windows/macOS/Linux):

- Directory: `<os temp>/ADUC/`
- File: `<os temp>/ADUC/conversation.json`
- Env var exported by launcher: `ADUC_CONV_PATH`

Example paths:

- Windows: `C:\Users\<you>\AppData\Local\Temp\ADUC\conversation.json`
- macOS: `/var/folders/.../T/ADUC/conversation.json`
- Linux: `/tmp/ADUC/conversation.json`

Schema (v1):

```json
{
  "version": 1,
  "updated_at": "2025-01-01T00:00:00Z",
  "turns": [
    {
      "id": "9b0a...",
      "familiar": "lumi",
      "role": "user",
      "text": "I’m stuck on this function.",
      "at": "2025-01-01T00:00:00Z",
      "status": "pending"
    },
    {
      "id": "e4f1...",
      "familiar": "lumi",
      "role": "cli",
      "text": "Got it. Show the code.\n<avatar: focus>",
      "at": "2025-01-01T00:00:02Z",
      "in_reply_to": "9b0a..."
    }
  ]
}
```

Rules:

- ADUC appends a `role: user` turn with `status: pending` for each message when CLI Bridge is on.
- CLI agent must append a `role: cli` turn with `in_reply_to` pointing at the user turn `id`.
- Include an avatar tag (`<avatar: ...>`) in the last line of the `text` to drive avatar updates.
- Keep your writes atomic: read → modify → write (ADUC does the same). Prefer temp file + replace.

## What a CLI Agent Should Do

1) Watch `<temp>/ADUC/conversation.json` for new `role: user` turns with `status: pending` for the familiar you plan to roleplay.
2) Build the merged prompt using that familiar's files (see above). You can read them from `familiars/<name>/docs/` relative to the project root (or accept a configurable base path).
3) Generate a reply in the familiar's voice and include `<avatar: X>` on the last line.
4) Append your `role: cli` turn with `in_reply_to` set to the user turn id. Optionally mark the user turn’s `status: responded`.
5) Do not modify memory unless the user explicitly asked to remember; if you do, append to `familiars/<name>/memory.json` atomically.

### Data Update Directives

Familiars can update their own data files by including these directives in their response (hidden from user):

**Preferences Update** (behavior rules):
```
<preferences_update: { "action": "append", "text": "Be more casual in tone" }>
```

**Memories Update** (permanent facts):
```
<memories_update: { "action": "append", "text": "User's dog is named Max" }>
```

Actions: `append` (add to file) or `overwrite` (replace entire file).

These directives are stripped from the displayed reply but persist the data to the familiar's directory.

### Minimal Pseudocode (JSON)

```python
import uuid, time, json, pathlib, datetime, tempfile

BASE = pathlib.Path(__file__).resolve().parent  # repo root
TEMP = pathlib.Path(tempfile.gettempdir()) / "ADUC"
JSN  = TEMP / "conversation.json"

def load_doc():
    if not JSN.exists():
        return {"version": 1, "updated_at": None, "turns": []}
    return json.loads(JSN.read_text(encoding="utf-8"))

def save_doc(doc):
    TEMP.mkdir(parents=True, exist_ok=True)
    tmp = JSN.with_suffix(".tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(JSN)

while True:
    doc = load_doc()
    pending = [t for t in doc.get("turns", []) if t.get("role") == "user" and t.get("status") == "pending" and t.get("familiar") == "lumi"]
    for u in pending:
        reply = {
            "id": str(uuid.uuid4()),
            "familiar": u["familiar"],
            "role": "cli",
            "text": "Show me the code.\n<avatar: focus>",
            "at": datetime.datetime.utcnow().isoformat() + "Z",
            "in_reply_to": u["id"],
        }
        u["status"] = "responded"
        doc["turns"].append(reply)
        doc["updated_at"] = datetime.datetime.utcnow().isoformat() + "Z"
        save_doc(doc)
    time.sleep(0.5)
```

## Optional HTTP Endpoints

If reading the file is inconvenient, you can talk to the ADUC backend instead:

- `GET /familiars` → list familiars (`id`, `name`, `emotions`, etc.)
- `POST /chat` → default merge + local stub reply
- `POST /chat` with `{ bridge_cli: true }` → writes to conversation.json and returns a `turn_id` (UI polls for your reply)
- `GET /cli/status?familiar=<id>&turn_id=<id>` → returns `pending|responded` and the CLI text when available

## Launching With An External Agent CLI

`run_aduc.bat` supports launching your agent CLI alongside the server:

- Example: `run_aduc.bat 8080 --agent-cmd="codex watch --file %ADUC_CONV_PATH%"`
- The batch file sets `ADUC_CONV_PATH` to the full path of `conversation.json`.
- Your agent should watch that file, append replies, and include `<avatar: ...>` in the last line.

Environment variables provided by the launcher (child processes inherit):

- `ADUC_PROJECT_PATH`: absolute path to the selected project directory (also current working directory for the agent).
- `ADUC_CONV_PATH`: absolute path to the shared conversation JSON.
- `ADUC_AGENTS_DOC`: absolute path to `docs/agents/AGENTS.md` (empty if not present).

Passing this guide to an agent CLI depends on its interface:

- If it accepts a context/config file flag, pass `"%ADUC_AGENTS_DOC%"`.
- If it reads from stdin, you can pipe: `type "%ADUC_AGENTS_DOC%" ^| your-agent-cli ...`
- If it wants a working directory, the launcher already `cd`s into `ADUC_PROJECT_PATH` before spawning your agent.

Alternatively, run the built-in watcher:

- `run_aduc.bat --with-watcher`
- Or manually: `py tools/cli_bridge_watcher.py --familiar lumi` (extensible to real LLMs).

## Cycle Awareness (Focus/Break/Long Break)

Familiars must adapt tone and content based on the active cycle mode and time remaining. This prevents work prompts during breaks and keeps focus replies tight.

Turn Snapshot (conversation.json)
- Every `role: "user"` turn SHOULD include the following fields when available:
  - `cycle_mode`: `"focus" | "break" | "long_break" | "idle"`
  - `cycle_length_ms`: integer total length in ms (0 if unknown)
  - `cycle_remaining_ms`: integer ms remaining at enqueue time (0 if unknown)
  - `cycle_started_at`: ISO timestamp or null
  - `cycle_ends_at`: ISO timestamp or null
- Agents MUST read these when present and treat them as authoritative for the turn.

Inline Tags On User Message (recommended)
- The backend MAY prepend an inline tag line to the user text for redundancy:
  - `[mode: break][length_ms: 300000][remaining_ms: 120000]`
- Agents SHOULD parse either the JSON snapshot fields, the inline tags, or both.

Prompt Merge Requirements
- When merging prompts, agents SHOULD include a compact block summarizing the cycle for the model, e.g.:
  - `[Focus Cycle]\n{"mode":"break","length_ms":300000,"remaining_ms":120000}`
- Agents MUST add explicit behavior guidance based on mode:
  - Focus: “Keep replies short, practical, strictly on‑task. Avoid planning detours or off‑topic chatter. Use remaining time to pace guidance.”
  - Break: “STRICT: Do not suggest work, planning, tasks, code, or to‑dos. Keep it light, relaxing, and restorative. If the user brings up work, acknowledge and defer until focus resumes.”
  - Long Break: “STRICT: No work talk or suggestions. Encourage rest, reflection, or playful small talk only.”
  - Missing cycle (idle/unknown): treat as normal chat without break constraints.

Non‑Compliance Examples
- Break: “We can outline your next steps…” → NOT allowed.
- Break: “Hydrate, stretch, then when focus resumes we’ll continue.” → Allowed.
- Focus: “Here’s the next step; you have ~2 min left.” → Encouraged.
- Long Break: “Let’s plan the next sprint.” → NOT allowed.

Edge Cases
- If `remaining_ms` is missing but `ends_at` is present, agents SHOULD compute remaining time approximately.
- If both inline tags and JSON exist, prefer JSON (turn snapshot) as source‑of‑truth.
- Agents SHOULD avoid converting micro‑break tips into “tasks” lists.

## Safety and Boundaries

- Do not initiate romance/NSFW; require explicit user toggles.
- Keep emotional intensity contextual, not manipulative.
- Memory is opt-in only.

That’s it: pick a familiar, adopt the files, speak in their voice, and write back to the shared JSON.
