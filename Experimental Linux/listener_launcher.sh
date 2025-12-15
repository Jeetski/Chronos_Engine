#!/usr/bin/env bash
set -euo pipefail

# Chronos Engine listener launcher for Linux/macOS

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Prefer local virtualenv Python if available; fallback to system python3/python
PYTHON_EXE="python3"
if [[ -x ".venv/bin/python" ]]; then
  PYTHON_EXE=".venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_EXE="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_EXE="python"
fi

LISTENER_SCRIPT="Modules/Listener/Listener.py"

# Start the listener in the background so the shell is not blocked
"$PYTHON_EXE" "$LISTENER_SCRIPT" "$@" >/dev/null 2>&1 &
PID=$!
if command -v disown >/dev/null 2>&1; then
  disown "$PID" 2>/dev/null || true
fi
echo "Chronos listener started (PID $PID)"

