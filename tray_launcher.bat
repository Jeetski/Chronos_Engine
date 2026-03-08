@echo off
setlocal

cd /d "%~dp0"

set "PYTHONW_EXE=pythonw"
if exist ".venv\Scripts\pythonw.exe" set "PYTHONW_EXE=.venv\Scripts\pythonw.exe"

start "" /B "%PYTHONW_EXE%" utilities/tray/app.py

exit /b
