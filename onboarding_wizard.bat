@echo off
setlocal
set SCRIPT_DIR=%~dp0
if exist "%SCRIPT_DIR%\.venv\Scripts\activate.bat" (
  call "%SCRIPT_DIR%\.venv\Scripts\activate.bat" >nul 2>&1
)
python "%SCRIPT_DIR%\Modules\OnboardingWizard.py" %*
