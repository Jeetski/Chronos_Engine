# Runs the Chronos Listener without a visible console window
param(
  [string]$ArgsLine
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Prefer local venv Python
$venvPy = Join-Path $root ".venv\Scripts\python.exe"
$python = if (Test-Path $venvPy) { $venvPy } else { "python" }

$script = Join-Path $root "Modules\Listener\Listener.py"

# Build argument list; preserve any passthrough args
$argList = @()
if ($ArgsLine) { $argList += $ArgsLine }
$argList += $script

Start-Process -FilePath $python -ArgumentList $argList -WorkingDirectory $root -WindowStyle Hidden
