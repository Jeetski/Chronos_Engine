@echo off
REM Launch the listener hidden via PowerShell (no visible console)
powershell -NoProfile -WindowStyle Hidden -File "%~dp0listener_launcher.ps1" %*
exit /b
