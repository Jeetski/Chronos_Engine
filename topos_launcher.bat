@echo off
setlocal

cd /d "%~dp0"

set "PYTHON_GUI_EXE=pythonw"

echo [topos] Python: %PYTHON_GUI_EXE%

start "" /B "%PYTHON_GUI_EXE%" utilities/topos/app.py

exit /b
