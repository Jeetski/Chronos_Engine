# HTTP API

Selected endpoints (local only)
- `GET /familiars`: list familiars.
- `POST /chat`: direct merge and reply.
- `POST /chat` with `{ bridge_cli: true }`: enqueue a CLI turn.
- `GET /cli/status?familiar=<id>&turn_id=<id>`: poll for CLI replies.
- `GET /cycle/status`: read focus/break status.
- `POST /cycle/start_focus|start_break|start_long_break|stop`: manage cycles.

The full list lives in `server.py` and the UI.
