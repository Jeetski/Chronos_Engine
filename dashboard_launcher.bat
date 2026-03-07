@echo off
setlocal
color 1F

REM Change to repo root
cd /d "%~dp0"

echo Synchronizing chronometers...

REM Prefer local virtualenv Python if available; fallback to system python
set "PYTHON_EXE=python"
if exist ".venv\Scripts\python.exe" set "PYTHON_EXE=.venv\Scripts\python.exe"

REM Run the dashboard command through the console
%PYTHON_EXE% modules/console.py dashboard

exit /b
