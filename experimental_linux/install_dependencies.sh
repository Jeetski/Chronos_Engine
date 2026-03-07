#!/usr/bin/env bash
set -euo pipefail

echo "==============================="
echo " Chronos Engine Setup (Unix)"
echo "==============================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Locate a usable Python interpreter (3.10+ recommended)
if command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD="python"
else
  echo "Python 3 not found on PATH."
  echo "Please install Python 3.10+ and re-run this script."
  exit 1
fi

echo "Using Python: $PYTHON_CMD"

# Create and use a local virtual environment (.venv)
if [[ ! -x ".venv/bin/python" ]]; then
  echo "Creating virtual environment in .venv ..."
  "$PYTHON_CMD" -m venv .venv
fi

PYTHON_CMD=".venv/bin/python"
echo "Using venv Python: $PYTHON_CMD"

# Ensure pip is present and up to date
"$PYTHON_CMD" -m ensurepip --upgrade >/dev/null 2>&1 || true
"$PYTHON_CMD" -m pip install --upgrade pip

echo "Installing Python dependencies from requirements.txt..."
if [[ ! -f "requirements.txt" ]]; then
  echo "requirements.txt not found in the project root."
  echo "Please ensure it exists and re-run this script."
  exit 1
fi

"$PYTHON_CMD" -m pip install -r requirements.txt

echo
echo "Dependencies installed successfully."
echo "Setup complete."

