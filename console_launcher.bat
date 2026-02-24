@echo off
color 1F
echo Synchronizing chronometers...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0console_launcher.ps1" %*
