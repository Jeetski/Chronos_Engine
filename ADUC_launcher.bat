@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: CHRONOS ADUC LAUNCHER
:: Launches ADUC in "Chronos Mode" (Pilot Mode)
:: 1. Reads settings from settings/launcher_config.yml
:: 2. Bundles Chronos Documentation into a single context file.
:: 3. Sets environment variables to inject this context into ADUC.
:: 4. Launches with configured CLI backend (Codex or Gemini).

set "CHRONOS_ROOT=%~dp0"
:: Remove trailing backslash
if "%CHRONOS_ROOT:~-1%"=="\" set "CHRONOS_ROOT=%CHRONOS_ROOT:~0,-1%"

set "ADUC_DIR=%CHRONOS_ROOT%\Agents Dress Up Comittee"
set "DOCS_DIR=%CHRONOS_ROOT%\Docs"
set "CTX_FILE=%TEMP%\chronos_full_context.md"
set "ADUC_TEMP_DIR=%TEMP%\ADUC"

if /i "%ADUC_DASHBOARD%"=="1" (
    set "ADUC_NO_BROWSER=1"
    if not exist "%ADUC_TEMP_DIR%" mkdir "%ADUC_TEMP_DIR%" >nul 2>&1
    echo 1 > "%ADUC_TEMP_DIR%\no_browser.flag"
)

:: Pick Python (prefer py)
set "PYCMD="
where py >nul 2>&1 && set "PYCMD=py"
if not defined PYCMD (
  where python >nul 2>&1 && set "PYCMD=python"
)
if not defined PYCMD (
  echo [ADUC] Python not found on PATH. Install Python 3.9+.
  pause
  exit /b 1
)

echo [Chronos] Initializing Pilot Mode...

:: Read configuration from launcher_config.yml
cd /d "%ADUC_DIR%"
for /f "tokens=*" %%a in ('%PYCMD% launch_config.py cli_backend') do set "CLI_BACKEND=%%a"
for /f "tokens=*" %%a in ('%PYCMD% launch_config.py working_directory') do set "WORK_DIR_SETTING=%%a"
for /f "tokens=*" %%a in ('%PYCMD% launch_config.py cli_timeout') do set "CLI_TIMEOUT=%%a"
for /f "tokens=*" %%a in ('%PYCMD% launch_config.py immersive') do set "IMMERSIVE=%%a"
for /f "tokens=*" %%a in ('%PYCMD% launch_config.py include_memory') do set "INCLUDE_MEMORY=%%a"

echo [Chronos] Config: backend=%CLI_BACKEND%, workdir=%WORK_DIR_SETTING%, timeout=%CLI_TIMEOUT%

:: Resolve working directory
if /i "%WORK_DIR_SETTING%"=="chronos" (
    set "WORK_DIR=%CHRONOS_ROOT%"
) else if /i "%WORK_DIR_SETTING%"=="aduc" (
    set "WORK_DIR=%ADUC_DIR%"
) else (
    set "WORK_DIR=%WORK_DIR_SETTING%"
)

:: 1. Bundle Documentation (Excluding Legal)
echo [Chronos] Bundling Documentation context...
if exist "%CTX_FILE%" del /q "%CTX_FILE%" >nul 2>&1

:: Header
echo # SYSTEM CONTEXT: CHRONOS ENGINE MANUAL > "%CTX_FILE%"
echo. >> "%CTX_FILE%"
echo You are running inside the Chronos Engine. The following is the reference manual for the system you control. >> "%CTX_FILE%"
echo. >> "%CTX_FILE%"

:: Loop through docs
for /r "%DOCS_DIR%" %%f in (*.md) do (
    set "file_path=%%f"
    echo Processing: !file_path!
    
    :: Check if path contains "\Legal\" - simplistic string check
    set "is_legal=0"
    echo "!file_path!" | findstr /i "\\Legal\\" >nul && set "is_legal=1"
    
    if "!is_legal!"=="0" (
        echo. >> "%CTX_FILE%"
        echo --- FILE: %%~nxf --- >> "%CTX_FILE%"
        echo. >> "%CTX_FILE%"
        type "%%f" >> "%CTX_FILE%"
        echo. >> "%CTX_FILE%"
    ) else (
        echo Skipping Legal: %%~nxf
    )
)

:: 1b. Bundle User Profile (pilot_brief.md, preferences.md)
set "PROFILE_DIR=%CHRONOS_ROOT%\User\Profile"
echo [Chronos] Bundling User Profile context...
echo. >> "%CTX_FILE%"
echo # USER PROFILE >> "%CTX_FILE%"
echo. >> "%CTX_FILE%"

for %%f in ("%PROFILE_DIR%\*.md") do (
    echo Processing: %%f
    echo. >> "%CTX_FILE%"
    echo --- FILE: %%~nxf --- >> "%CTX_FILE%"
    echo. >> "%CTX_FILE%"
    type "%%f" >> "%CTX_FILE%"
    echo. >> "%CTX_FILE%"
)

echo [Chronos] Context bundled to %CTX_FILE%

:: 2. Set Environment Variables
set "ADUC_EXTERNAL_CONTEXT_FILE=%CTX_FILE%"
set "ADUC_PROJECT_PATH=%WORK_DIR%"
set "ADUC_CLI_BACKEND=%CLI_BACKEND%"

:: Set timeout based on backend
if /i "%CLI_BACKEND%"=="gemini" (
    set "ADUC_GEMINI_TIMEOUT=%CLI_TIMEOUT%"
) else (
    set "ADUC_CODEX_TIMEOUT=%CLI_TIMEOUT%"
)

:: Set toggles
if /i "%IMMERSIVE%"=="true" set "ADUC_IMMERSIVE=1"
if /i "%INCLUDE_MEMORY%"=="true" set "ADUC_INCLUDE_MEMORY=1"

:: 3. Launch ADUC from the configured working directory
echo [Chronos] Working directory: %WORK_DIR%
echo [Chronos] CLI backend: %CLI_BACKEND%
cd /d "%WORK_DIR%"

:: Launch based on backend
cd /d "%ADUC_DIR%"
if /i "%CLI_BACKEND%"=="gemini" (
    if exist "run_aduc_gemini.bat" (
        echo [Chronos] Launching ADUC with Gemini...
        call "run_aduc_gemini.bat"
    ) else (
        echo [Error] run_aduc_gemini.bat not found in %ADUC_DIR%
        pause
    )
) else (
    if exist "run_aduc_codex.bat" (
        echo [Chronos] Launching ADUC with Codex...
        call "run_aduc_codex.bat"
    ) else (
        echo [Error] run_aduc_codex.bat not found in %ADUC_DIR%
        pause
    )
)

endlocal
