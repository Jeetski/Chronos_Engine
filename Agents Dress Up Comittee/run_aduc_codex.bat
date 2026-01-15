@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: Minimal launcher (Codex-based). No installers, no prompts.
set "PORT=8080"
set "ADUC_CONV_PATH=%TEMP%\ADUC\conversation.json"
echo [ADUC] Conversation path: %ADUC_CONV_PATH%
set "ADUC_ROOT=%~dp0"
if "%ADUC_ROOT:~-1%"=="\" set "ADUC_ROOT=%ADUC_ROOT:~0,-1%"

:: Fresh-start cleanup: remove stale temp files (conversation, heartbeat, usage, prompts)
set "ADUC_TEMP_DIR=%TEMP%\ADUC"
if not exist "%ADUC_TEMP_DIR%" mkdir "%ADUC_TEMP_DIR%" >nul 2>&1
echo [ADUC] Resetting temp state in %ADUC_TEMP_DIR%
if exist "%ADUC_TEMP_DIR%\conversation.json" del /q "%ADUC_TEMP_DIR%\conversation.json" >nul 2>&1
if exist "%ADUC_TEMP_DIR%\conversation.tmp" del /q "%ADUC_TEMP_DIR%\conversation.tmp" >nul 2>&1
if exist "%ADUC_TEMP_DIR%\cli_heartbeat.json" del /q "%ADUC_TEMP_DIR%\cli_heartbeat.json" >nul 2>&1
if exist "%ADUC_TEMP_DIR%\usage.json" del /q "%ADUC_TEMP_DIR%\usage.json" >nul 2>&1
del /q "%ADUC_TEMP_DIR%\prompt_*.txt" >nul 2>&1
if exist "%ADUC_TEMP_DIR%\no_browser.flag" (
  set "ADUC_NO_BROWSER=1"
  del /q "%ADUC_TEMP_DIR%\no_browser.flag" >nul 2>&1
)
if exist "%ADUC_ROOT%\temp\no_browser.flag" (
  set "ADUC_NO_BROWSER=1"
  del /q "%ADUC_ROOT%\temp\no_browser.flag" >nul 2>&1
)
if /i "%ADUC_DASHBOARD%"=="1" (
  set "ADUC_NO_BROWSER=1"
)

:: Recommend Codex non-interactive + full access (if supported by your Codex build)
:: The watcher passes these through to `codex exec`.
set "ADUC_CODEX_ARGS=-c ask_for_approval=never --full-auto --skip-git-repo-check -c sandbox=danger-full-access"
:: Infinite Codex timeout for large prompts (0 or unset = infinite)
set "ADUC_CODEX_TIMEOUT=0"
:: Toggle immersive lore in prompts (enabled): include lore.md in merged prompts
set "ADUC_IMMERSIVE=1"
:: Include opt-in memory entries from familiars/<id>/memory.json in prompts
set "ADUC_INCLUDE_MEMORY=1"
rem Optional: cap items included (default 10)
rem set "ADUC_MEMORY_ITEMS=10"

:: Pick Python (prefer py)
set "PYCMD="
where py >nul 2>&1 && set "PYCMD=py"
if not defined PYCMD (
  where python >nul 2>&1 && set "PYCMD=python"
)
if not defined PYCMD (
  echo [ADUC] Python not found on PATH. Install Python 3.9+ and Flask.
  echo        Example: py -3 -m pip install flask
  exit /b 1
)

echo [ADUC] Using Python: %PYCMD%
echo [ADUC] Starting server on http://localhost:%PORT%
start "ADUC Server" cmd /k "%PYCMD% server.py"

timeout /t 1 >nul 2>&1
if defined ADUC_NO_BROWSER (
  echo [ADUC] Skipping browser launch - ADUC_NO_BROWSER=1
) else (
  start "" http://localhost:%PORT%
)

echo [ADUC] Starting minimal CLI watcher (Codex if available)
start "ADUC Watcher" cmd /k "%PYCMD% tools\cli_bridge_watcher.py"

echo [ADUC] Launched. Close windows to stop processes.
endlocal
exit /b 0
