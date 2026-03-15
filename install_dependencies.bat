@echo off
setlocal ENABLEDELAYEDEXPANSION

set "ROOT_DIR=%~dp0"
set "CHRONOS_CLI_PATH_RESULT=not_requested"

echo ==============================
echo Chronos Engine Setup
echo ==============================

REM Locate a usable Python interpreter
set "PYTHON_EXE="
set "PYTHON_ARGS="
call :find_python

if not defined PYTHON_EXE (
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
  if not defined PYTHON_EXE goto :py_install_fail
)
call :ensure_python_310_plus
if %ERRORLEVEL% NEQ 0 goto :py_install_fail

echo Using Python: %PYTHON_EXE% %PYTHON_ARGS%

REM Create and use a local virtual environment (.venv)
if not exist ".venv\Scripts\python.exe" (
  echo Creating virtual environment in .venv ...
  "%PYTHON_EXE%" %PYTHON_ARGS% -m venv .venv || (
    echo Failed to create virtual environment.
    goto :end_fail
  )
)
set "PYTHON_EXE=.venv\Scripts\python.exe"
set "PYTHON_ARGS="
echo Using venv Python: %PYTHON_EXE%

REM Ensure pip is present and up to date
"%PYTHON_EXE%" -m ensurepip --upgrade >nul 2>&1
"%PYTHON_EXE%" -m pip install --upgrade pip

echo Installing Python dependencies from requirements.txt...
if not exist requirements.txt (
  echo requirements.txt not found in the project root.
  echo Please ensure it exists and re-run this script.
  goto :end_fail
)
"%PYTHON_EXE%" -m pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 goto :end_fail

echo.
echo Dependencies installed successfully.
echo.
call :offer_listener_startup
call :offer_tray_startup
call :offer_topos_startup
call :offer_cli_path
goto :end_ok

:find_python
  REM Prefer the Python launcher if available
  py -3 -V >nul 2>&1 && (
    set "PYTHON_EXE=py"
    set "PYTHON_ARGS=-3"
    goto :eof
  )
  python -V >nul 2>&1 && (
    set "PYTHON_EXE=python"
    set "PYTHON_ARGS="
    goto :eof
  )
  goto :eof

:ensure_python_310_plus
  "%PYTHON_EXE%" %PYTHON_ARGS% -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
  if %ERRORLEVEL% NEQ 0 (
    echo Detected Python is older than 3.10.
    echo Chronos requires Python 3.10 or newer.
    exit /b 1
  )
  exit /b 0

:py_install_fail
  echo Failed to install or detect Python automatically.
  echo Please install Python 3.10+ manually and re-run this script.
  goto :end_fail

:end_ok
  echo.
  echo Setup complete.
  call :show_cli_path_summary
  call :pause_before_exit
  goto :eof

:end_fail
  echo.
  echo Setup encountered an error.
  call :show_cli_path_summary
  call :pause_before_exit
  exit /b 1

:: ----------------------------------------------
:: Helper: Offer Listener auto-start on login
:: ----------------------------------------------
:offer_listener_startup
  call :startup_shortcut_exists "Chronos Listener.lnk"
  if %ERRORLEVEL% EQU 0 (
    echo Chronos Listener startup shortcut already exists. Skipping prompt.
    goto listener_startup_done
  )
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
  call :startup_shortcut_exists "Chronos Tray.lnk"
  if %ERRORLEVEL% EQU 0 (
    echo Chronos Tray startup shortcut already exists. Skipping prompt.
    goto tray_startup_done
  )
  echo.
  echo Chronos Tray provides quick timer and schedule controls from the system tray.
  echo You can have it start automatically when you sign in to Windows.
  echo.
  choice /C YN /N /M "Add 'Chronos Tray' to your Startup folder so it runs on sign-in? [Y/N]: "
  if errorlevel 2 goto tray_startup_no
  if errorlevel 1 goto tray_startup_yes
  goto tray_startup_done

:tray_startup_yes
  if not exist "%ROOT_DIR%\tray_launcher.bat" (
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
  call :startup_shortcut_exists "Chronos Topos.lnk"
  if %ERRORLEVEL% EQU 0 (
    echo Chronos Topos startup shortcut already exists. Skipping prompt.
    goto topos_startup_done
  )
  echo.
  echo Topos is the fullscreen Chronos shell with the bounded workspace interface.
  echo You can have it start automatically when you sign in to Windows.
  echo.
  choice /C YN /N /M "Add 'Chronos Topos' to your Startup folder so it runs on sign-in? [Y/N]: "
  if errorlevel 2 goto topos_startup_no
  if errorlevel 1 goto topos_startup_yes
  goto topos_startup_done

:topos_startup_yes
  if not exist "%ROOT_DIR%\topos_launcher.bat" (
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

:: ----------------------------------------------
:: Helper: Offer `chronos` command on PATH
:: ----------------------------------------------
:offer_cli_path
  call :chronos_cli_installed
  if %ERRORLEVEL% EQU 0 (
    echo Chronos command is already installed on PATH. Skipping prompt.
    goto cli_path_done
  )
  echo.
  echo You can make Chronos available as a normal shell command.
  echo This will create a small chronos.cmd wrapper in your user bin folder
  echo and add that folder to your user PATH if needed.
  echo.
  choice /C YN /N /M "Add chronos to your user PATH so `chronos today` works anywhere? [Y/N]: "
  if errorlevel 2 goto cli_path_no
  if errorlevel 1 goto cli_path_yes
  goto cli_path_done

:cli_path_yes
  if not exist "%ROOT_DIR%\console_launcher.bat" (
    echo Warning: console_launcher.bat not found. Cannot create Chronos CLI wrapper.
    goto cli_path_done
  )
  echo Creating Chronos command wrapper and updating PATH...
  set "CHRONOS_BIN_DIR=%USERPROFILE%\bin"
  set "CHRONOS_WRAPPER=%CHRONOS_BIN_DIR%\chronos.cmd"
  if not exist "%CHRONOS_BIN_DIR%" mkdir "%CHRONOS_BIN_DIR%"
  > "%CHRONOS_WRAPPER%" (
    echo @echo off
    echo call "%ROOT_DIR%console_launcher.bat" %%*
  )
  if not exist "%CHRONOS_WRAPPER%" (
    echo ERROR: Failed to create %CHRONOS_WRAPPER%.
    echo Chronos was not added to PATH.
    goto cli_path_done
  )
  powershell -NoProfile -Command ^
    "$binDir = Join-Path $env:USERPROFILE 'bin'; " ^
    "$userPath = [Environment]::GetEnvironmentVariable('Path', 'User'); " ^
    "$parts = @(); if ($userPath) { $parts = $userPath -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ } }; " ^
    "$hasBin = $parts | Where-Object { $_.TrimEnd('\') -ieq $binDir.TrimEnd('\') }; " ^
    "if (-not $hasBin) { " ^
    "  $newPath = if ($userPath -and $userPath.Trim()) { $userPath.TrimEnd(';') + ';' + $binDir } else { $binDir }; " ^
    "  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User'); " ^
    "}"
  if %ERRORLEVEL% NEQ 0 (
    echo ERROR: PowerShell reported a failure while creating the Chronos command wrapper.
    echo Chronos was not added to PATH.
    goto cli_path_done
  )
  call :chronos_cli_installed
  if %ERRORLEVEL% EQU 0 (
    set "PATH=%USERPROFILE%\bin;%PATH%"
    set "CHRONOS_CLI_PATH_RESULT=success"
    echo SUCCESS: Added Chronos wrapper at %USERPROFILE%\bin\chronos.cmd
    echo SUCCESS: Confirmed %USERPROFILE%\bin is present in your user PATH.
    echo.
    echo Chronos installed successfully.
    echo Try:
    echo     chronos
    echo     chronos help
    echo     chronos dashboard
  ) else (
    set "CHRONOS_CLI_PATH_RESULT=verification_failed"
    echo ERROR: The Chronos PATH setup command ran, but verification failed.
    echo Expected wrapper: %USERPROFILE%\bin\chronos.cmd
    echo Expected PATH entry: %USERPROFILE%\bin
    echo Re-run this installer or create the wrapper manually.
  )
  goto cli_path_done

:cli_path_no
  set "CHRONOS_CLI_PATH_RESULT=skipped"
  echo Skipping PATH setup. You can enable it later by rerunning this script.

:cli_path_done
  exit /b 0

:: ----------------------------------------------
:: Helper: detect Startup shortcut by name
:: ----------------------------------------------
:startup_shortcut_exists
  set "CHRONOS_SHORTCUT_NAME=%~1"
  powershell -NoProfile -Command ^
    "$startup = [Environment]::GetFolderPath('Startup'); " ^
    "$path = Join-Path $startup '%CHRONOS_SHORTCUT_NAME%'; " ^
    "if (Test-Path $path) { exit 0 } else { exit 1 }"
  exit /b %ERRORLEVEL%

:: ----------------------------------------------
:: Helper: detect Chronos CLI wrapper + user PATH
:: ----------------------------------------------
:chronos_cli_installed
  powershell -NoProfile -Command ^
    "$binDir = Join-Path $env:USERPROFILE 'bin'; " ^
    "$wrapper = Join-Path $binDir 'chronos.cmd'; " ^
    "$userPath = [Environment]::GetEnvironmentVariable('Path', 'User'); " ^
    "$parts = @(); if ($userPath) { $parts = $userPath -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ } }; " ^
    "$hasBin = $parts | Where-Object { $_.TrimEnd('\') -ieq $binDir.TrimEnd('\') }; " ^
    "if ((Test-Path $wrapper) -and $hasBin) { exit 0 } else { exit 1 }"
  exit /b %ERRORLEVEL%

:show_cli_path_summary
  if /I "%CHRONOS_CLI_PATH_RESULT%"=="success" (
    echo Final status: Chronos command install succeeded.
    exit /b 0
  )
  if /I "%CHRONOS_CLI_PATH_RESULT%"=="verification_failed" (
    echo Final status: Chronos command install failed verification.
    exit /b 0
  )
  if /I "%CHRONOS_CLI_PATH_RESULT%"=="skipped" (
    echo Final status: Chronos command install was skipped.
    exit /b 0
  )
  if /I "%CHRONOS_CLI_PATH_RESULT%"=="not_requested" (
    exit /b 0
  )
  exit /b 0

:pause_before_exit
  if /I "%CHRONOS_INSTALLER_NO_PAUSE%"=="1" exit /b 0
  echo.
  pause
  exit /b 0
