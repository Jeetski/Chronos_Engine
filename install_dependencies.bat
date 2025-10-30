@echo off
setlocal ENABLEDELAYEDEXPANSION

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

REM Ensure pip is present and up to date
"%PYTHON_CMD%" -m ensurepip --upgrade >nul 2>&1
"%PYTHON_CMD%" -m pip install --upgrade pip

echo Installing Python dependencies...
"%PYTHON_CMD%" -m pip install PyYAML colorama playsound pygame
if %ERRORLEVEL% NEQ 0 goto :end_fail

echo.
echo Dependencies installed successfully.
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
