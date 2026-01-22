# ADUC Architecture

High-level flow
1) UI sends a message to `/chat`.
2) Backend merges familiar context and returns a reply (or enqueues a CLI turn).
3) If CLI bridge is enabled, a watcher appends a reply to the shared JSON.
4) UI renders the reply and updates the avatar/state.

Components
- UI: `ADUC.html`, `static/ui.js`, `static/styles.css`
- Backend: `server.py` (Flask)
- CLI bridge: `tools/cli_bridge_watcher.py`

Modes
- Direct chat: backend merges prompt and calls the configured model.
- CLI bridge: backend writes a user turn into `conversation.json`; a CLI agent
  appends a reply.
