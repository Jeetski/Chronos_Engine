@echo off
setlocal ENABLEDELAYEDEXPANSION

set "ROOT_DIR=%~dp0"

echo ==============================
echo Chronos Engine Setup
echo ==============================

REM Locate a usable Python interpreter
set "PYTHON_CMD="
call :find_python

if not defined PYTHON_CMD (
  echo Python not found. Attempting installation...
  where winget >nul 2>&1
  if %ERRORLEVEL% EQU 0 (
    echo Installing Python via winget...
    winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements || goto :py_install_fail
  ) else (
    echo winget not available.
    echo Please install Python 3.10+ from https://www.python.org/downloads/ and re-run this script.
    goto :end_fail
  )

  REM Refresh environment and try to find Python again
  call :find_python
  if not defined PYTHON_CMD goto :py_install_fail
)

echo Using Python: %PYTHON_CMD%

REM Create and use a local virtual environment (.venv)
if not exist ".venv\Scripts\python.exe" (
  echo Creating virtual environment in .venv ...
  "%PYTHON_CMD%" -m venv .venv || (
    echo Failed to create virtual environment.
    goto :end_fail
  )
)
set "PYTHON_CMD=.venv\Scripts\python.exe"
echo Using venv Python: %PYTHON_CMD%

REM Ensure pip is present and up to date
"%PYTHON_CMD%" -m ensurepip --upgrade >nul 2>&1
"%PYTHON_CMD%" -m pip install --upgrade pip

echo Installing Python dependencies from requirements.txt...
if not exist requirements.txt (
  echo requirements.txt not found in the project root.
  echo Please ensure it exists and re-run this script.
  goto :end_fail
)
"%PYTHON_CMD%" -m pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 goto :end_fail

echo.
echo Dependencies installed successfully.
echo.
call :offer_listener_startup
call :offer_tray_startup
call :offer_topos_startup
goto :end_ok

:find_python
  REM Prefer the Python launcher if available
  py -3 -V >nul 2>&1 && (
    set "PYTHON_CMD=py -3"
    goto :eof
  )
  python -V >nul 2>&1 && (
    set "PYTHON_CMD=python"
    goto :eof
  )
  goto :eof

:py_install_fail
  echo Failed to install or detect Python automatically.
  echo Please install Python 3.10+ manually and re-run this script.
  goto :end_fail

:end_ok
  echo Setup complete.
  goto :eof

:end_fail
  echo Setup encountered an error.
  exit /b 1

:: ----------------------------------------------
:: Helper: Offer Listener auto-start on login
:: ----------------------------------------------
:offer_listener_startup
  echo The Chronos Listener runs alarms, reminders, and timer ticks in the background.
  echo You can have it start automatically when you sign in to Windows.
  echo This means scheduled alarms and reminders will fire even if you forget
  echo to launch Chronos manually.
  echo.
  choice /C YN /N /M "Add 'Chronos Listener' to your Startup folder so it runs on sign-in? [Y/N]: "
  if errorlevel 2 goto listener_startup_no
  if errorlevel 1 goto listener_startup_yes
  goto listener_startup_done

:listener_startup_yes
  echo Creating Startup shortcut for Chronos Listener...
  powershell -NoProfile -Command ^
    "$shell = New-Object -ComObject WScript.Shell; " ^
    "$startup = [Environment]::GetFolderPath('Startup'); " ^
    "$target = Join-Path -Path '%ROOT_DIR%' -ChildPath 'listener_launcher.bat'; " ^
    "$shortcutPath = Join-Path -Path $startup -ChildPath 'Chronos Listener.lnk'; " ^
    "$shortcut = $shell.CreateShortcut($shortcutPath); " ^
    "$shortcut.TargetPath = $target; " ^
    "$shortcut.WorkingDirectory = '%ROOT_DIR%'; " ^
    "$shortcut.WindowStyle = 7; " ^
    "$shortcut.Save()"
  if %ERRORLEVEL% EQU 0 (
    echo Added 'Chronos Listener' shortcut to your Startup folder.
  ) else (
    echo Warning: Failed to create Startup shortcut automatically.
    echo You can still run the listener via listener_launcher.bat.
  )
  goto listener_startup_done

:listener_startup_no
  echo Skipping Startup shortcut. You can enable it later by rerunning this script.

:listener_startup_done
  exit /b 0

:: ----------------------------------------------
:: Helper: Offer Tray auto-start on login
:: ----------------------------------------------
:offer_tray_startup
  echo.
  echo Chronos Tray provides quick timer and schedule controls from the system tray.
  echo You can have it start automatically when you sign in to Windows.
  echo.
  choice /C YN /N /M "Add 'Chronos Tray' to your Startup folder so it runs on sign-in? [Y/N]: "
  if errorlevel 2 goto tray_startup_no
  if errorlevel 1 goto tray_startup_yes
  goto tray_startup_done

:tray_startup_yes
  if not exist "%ROOT_DIR%tray_launcher.bat" (
    echo Warning: tray_launcher.bat not found. Skipping tray shortcut creation.
    goto tray_startup_done
  )
  echo Creating Startup shortcut for Chronos Tray...
  powershell -NoProfile -Command ^
    "$shell = New-Object -ComObject WScript.Shell; " ^
    "$startup = [Environment]::GetFolderPath('Startup'); " ^
    "$target = Join-Path -Path '%ROOT_DIR%' -ChildPath 'tray_launcher.bat'; " ^
    "$shortcutPath = Join-Path -Path $startup -ChildPath 'Chronos Tray.lnk'; " ^
    "$shortcut = $shell.CreateShortcut($shortcutPath); " ^
    "$shortcut.TargetPath = $target; " ^
    "$shortcut.WorkingDirectory = '%ROOT_DIR%'; " ^
    "$shortcut.WindowStyle = 7; " ^
    "$shortcut.Save()"
  if %ERRORLEVEL% EQU 0 (
    echo Added 'Chronos Tray' shortcut to your Startup folder.
  ) else (
    echo Warning: Failed to create Startup shortcut automatically.
    echo You can still run the tray via tray_launcher.bat.
  )
  goto tray_startup_done

:tray_startup_no
  echo Skipping tray Startup shortcut. You can enable it later by rerunning this script.

:tray_startup_done
  exit /b 0

:: ----------------------------------------------
:: Helper: Offer Topos auto-start on login
:: ----------------------------------------------
:offer_topos_startup
  echo.
  echo Topos is the fullscreen Chronos shell with the bounded workspace interface.
  echo You can have it start automatically when you sign in to Windows.
  echo.
  choice /C YN /N /M "Add 'Chronos Topos' to your Startup folder so it runs on sign-in? [Y/N]: "
  if errorlevel 2 goto topos_startup_no
  if errorlevel 1 goto topos_startup_yes
  goto topos_startup_done

:topos_startup_yes
  if not exist "%ROOT_DIR%topos_launcher.bat" (
    echo Warning: topos_launcher.bat not found. Skipping Topos shortcut creation.
    goto topos_startup_done
  )
  echo Creating Startup shortcut for Chronos Topos...
  powershell -NoProfile -Command ^
    "$shell = New-Object -ComObject WScript.Shell; " ^
    "$startup = [Environment]::GetFolderPath('Startup'); " ^
    "$target = Join-Path -Path '%ROOT_DIR%' -ChildPath 'topos_launcher.bat'; " ^
    "$shortcutPath = Join-Path -Path $startup -ChildPath 'Chronos Topos.lnk'; " ^
    "$shortcut = $shell.CreateShortcut($shortcutPath); " ^
    "$shortcut.TargetPath = $target; " ^
    "$shortcut.WorkingDirectory = '%ROOT_DIR%'; " ^
    "$shortcut.WindowStyle = 7; " ^
    "$shortcut.Save()"
  if %ERRORLEVEL% EQU 0 (
    echo Added 'Chronos Topos' shortcut to your Startup folder.
  ) else (
    echo Warning: Failed to create Startup shortcut automatically.
    echo You can still run Topos via topos_launcher.bat.
  )
  goto topos_startup_done

:topos_startup_no
  echo Skipping Topos Startup shortcut. You can enable it later by rerunning this script.

:topos_startup_done
  exit /b 0
