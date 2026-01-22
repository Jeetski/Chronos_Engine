#!/usr/bin/env bash
set -euo pipefail

# Minimal launcher for Linux/macOS
# - Starts Flask server
# - Starts CLI watcher
# - Opens browser

PORT="${1:-8080}"
export PORT

TEMP_DIR="${TMPDIR:-/tmp}/ADUC"
mkdir -p "$TEMP_DIR"
export ADUC_CONV_PATH="$TEMP_DIR/conversation.json"

echo "[ADUC] Temp dir: $TEMP_DIR"
echo "[ADUC] Conversation: $ADUC_CONV_PATH"

# Fresh-start cleanup
rm -f "$TEMP_DIR/conversation.json" "$TEMP_DIR/conversation.tmp" \
      "$TEMP_DIR/cli_heartbeat.json" "$TEMP_DIR/usage.json" 2>/dev/null || true
rm -f "$TEMP_DIR"/prompt_*.txt 2>/dev/null || true

# Optional: pass through to codex exec if installed
export ADUC_CODEX_ARGS="-c ask_for_approval=never --full-auto --skip-git-repo-check -c sandbox=danger-full-access"
export ADUC_CODEX_TIMEOUT=0
export ADUC_IMMERSIVE=1
export ADUC_INCLUDE_MEMORY=1

# Choose Python
PY="python3"
command -v "$PY" >/dev/null 2>&1 || PY="python"
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "[ADUC] Python not found. Install Python 3.9+ and Flask (pip install Flask)." >&2
  exit 1
fi

echo "[ADUC] Using Python: $PY"

echo "[ADUC] Starting server on http://localhost:$PORT"
"$PY" server.py &
SERVER_PID=$!

sleep 1
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:$PORT" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:$PORT" >/dev/null 2>&1 &
fi

echo "[ADUC] Starting CLI watcher"
"$PY" tools/cli_bridge_watcher.py &
WATCH_PID=$!

echo "[ADUC] Launched. PIDs: server=$SERVER_PID watcher=$WATCH_PID"
echo "[ADUC] Press Ctrl+C to stop (then kill $SERVER_PID $WATCH_PID if still running)."

# Keep script attached to background jobs so Ctrl+C stops them
wait

