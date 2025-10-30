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
echo.
echo Ensuring optional utilities are present...
call :ensure_colorprint || echo Skipped colorprint setup.
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

:: ------------------------------
:: Helper: Ensure colorprint.exe
:: ------------------------------
:ensure_colorprint
  setlocal ENABLEDELAYEDEXPANSION
  set "CP_DIR=Utilities\colorprint"
  set "CP_EXE=%CP_DIR%\colorprint.exe"
  if exist "%CP_EXE%" (
    echo Found colorprint.exe
    endlocal & exit /b 0
  )

  rem Create directory if missing
  if not exist "%CP_DIR%" mkdir "%CP_DIR%" >nul 2>&1

  rem Try to download from GitHub Releases first
  set "CP_RELEASE_OWNER=Jeetski"
  set "CP_RELEASE_REPO=Chronos_Engine"
  rem Maintainer: Update this to the latest tag when publishing (e.g., v0.1.0)
  if not defined CP_RELEASE_VERSION set "CP_RELEASE_VERSION=v0.1.0"
  rem Optional: expected SHA256 for the current colorprint.exe asset (update when bumping version)
  if not defined CP_EXPECTED_SHA set "CP_EXPECTED_SHA=f509a48de37eded496fa59870a74695f572a8bc063483d06b5e08d5a1fbad868"
  rem Host the EXE as a release asset under the version tag
  set "CP_URL=https://github.com/%CP_RELEASE_OWNER%/%CP_RELEASE_REPO%/releases/download/%CP_RELEASE_VERSION%/colorprint.exe"
  echo Attempting to download colorprint from %CP_URL%
  powershell -NoProfile -Command "try {Invoke-WebRequest -Uri '%CP_URL%' -OutFile '%CP_EXE%' -UseBasicParsing -MaximumRedirection 5; exit 0} catch { exit 1 }"
  if exist "%CP_EXE%" (
    echo Downloaded colorprint.exe
    goto :colorprint_verify
  )

  rem Fallback: try to build locally with dotnet if available
  where dotnet >nul 2>&1
  if %ERRORLEVEL% EQU 0 (
    echo dotnet found. Building colorprint locally...
    dotnet publish "%CP_DIR%\colorprint.csproj" -c Release -r win-x64 -p:PublishSingleFile=true -p:SelfContained=true -p:EnableCompressionInSingleFile=true -o "%CP_DIR%\dist" >nul 2>&1
    if exist "%CP_DIR%\dist\colorprint.exe" (
      copy /Y "%CP_DIR%\dist\colorprint.exe" "%CP_EXE%" >nul
      echo Built colorprint.exe
      goto :colorprint_ok
    )
  ) else (
    echo dotnet not found, cannot build colorprint locally.
  )

  echo Could not obtain colorprint.exe automatically.
  echo You can manually download it from the GitHub Releases page:
  echo   https://github.com/%CP_RELEASE_OWNER%/%CP_RELEASE_REPO%/releases
  echo Then place it at: %CP_EXE%
  endlocal & exit /b 1

:colorprint_verify
  rem Optional: verify SHA256 if a .sha256 file exists for this version
  set "CP_SHA_URL=https://github.com/%CP_RELEASE_OWNER%/%CP_RELEASE_REPO%/releases/download/%CP_RELEASE_VERSION%/colorprint.sha256"
  set "CP_SHA_TMP=%TEMP%\colorprint.sha256"
  powershell -NoProfile -Command "try {Invoke-WebRequest -Uri '%CP_SHA_URL%' -OutFile '%CP_SHA_TMP%' -UseBasicParsing -MaximumRedirection 5; exit 0} catch { exit 1 }" >nul 2>&1
  if exist "%CP_SHA_TMP%" (
    for /f "usebackq tokens=1" %%H in ("%CP_SHA_TMP%") do set "EXPECTED_SHA=%%H"
    del /f /q "%CP_SHA_TMP%" >nul 2>&1
  ) else (
    if defined CP_EXPECTED_SHA set "EXPECTED_SHA=%CP_EXPECTED_SHA%"
  )
  if defined EXPECTED_SHA (
    for /f "tokens=*" %%S in ('certutil -hashfile "%CP_EXE%" SHA256 ^| find /i /v "certutil" ^| find /i /v "SHA256"') do set "ACTUAL_SHA=%%S"
    set "ACTUAL_SHA=%ACTUAL_SHA: =%"
    if /I "%EXPECTED_SHA%"=="%ACTUAL_SHA%" (
      echo Verified colorprint.exe SHA256.
    ) else (
      echo Warning: SHA256 mismatch for colorprint.exe. Expected: %EXPECTED_SHA% Got: %ACTUAL_SHA%
    )
  ) else (
    echo No SHA256 provided for colorprint; skipping verification.
  )

:colorprint_ok
  endlocal & exit /b 0
