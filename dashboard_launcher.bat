@echo off
setlocal

REM Change to repo root
cd /d "%~dp0"

REM Prefer local virtualenv Python if available; fallback to system python
set "PYTHON_EXE=python"
if exist ".venv\Scripts\python.exe" set "PYTHON_EXE=.venv\Scripts\python.exe"

REM Run the dashboard command through the console
%PYTHON_EXE% Modules/Console.py dashboard

exit /b
