@echo off
setlocal
color 1F

REM Change to repo root
cd /d "%~dp0"

echo Synchronizing chronometers...

REM Use system Python for environment debugging
set "PYTHON_EXE=python"

echo [dashboard] Python: %PYTHON_EXE%

REM Run the dashboard command through the console and keep server logs in this same window
%PYTHON_EXE% modules/console.py dashboard restart_server:true

exit /b
