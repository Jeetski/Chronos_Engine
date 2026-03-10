$Host.UI.RawUI.BackgroundColor = "DarkCyan"
$Host.UI.RawUI.ForegroundColor = "White"
Clear-Host
Write-Host "Entering Topos..."

$pythonw = "pythonw"
if (Test-Path ".venv\Scripts\pythonw.exe") {
    $pythonw = ".venv\Scripts\pythonw.exe"
}

Start-Process -FilePath $pythonw -ArgumentList "utilities/topos/app.py" -WorkingDirectory $PSScriptRoot
