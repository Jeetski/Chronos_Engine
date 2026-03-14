$Host.UI.RawUI.BackgroundColor = "DarkBlue"
$Host.UI.RawUI.ForegroundColor = "White"
Clear-Host
Write-Host "Spooling event horizons..."

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$consoleScript = Join-Path $scriptRoot "modules\console.py"

# Set the console output encoding to UTF-8 to support emojis
$OutputEncoding = [System.Text.Encoding]::UTF8

# Set the PYTHONIOENCODING environment variable to utf-8
$env:PYTHONIOENCODING = "utf-8"

# Use system Python for environment debugging.
$pythonExe = "python"

$pythonDisplay = $pythonExe
try {
    if (-not ($pythonExe -like "*\*")) {
        $resolved = (Get-Command $pythonExe -ErrorAction Stop).Source
        if ($resolved) { $pythonDisplay = $resolved }
    } elseif (Test-Path $pythonExe) {
        $pythonDisplay = (Resolve-Path $pythonExe).Path
    }
} catch { }

Write-Host "[console] Python: $pythonDisplay"

# Run the Python script in launcher mode (full interactive startup), passing along all arguments
& $pythonExe $consoleScript prompt_toolkit:true startup_banner:true startup_sync:true startup_sound:true $args

