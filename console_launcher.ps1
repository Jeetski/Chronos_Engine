$Host.UI.RawUI.BackgroundColor = "DarkBlue"
$Host.UI.RawUI.ForegroundColor = "White"
Clear-Host
Write-Host "Spooling event horizons..."

# Set the console output encoding to UTF-8 to support emojis
$OutputEncoding = [System.Text.Encoding]::UTF8

# Set the PYTHONIOENCODING environment variable to utf-8
$env:PYTHONIOENCODING = "utf-8"

# Run the Python script, passing along all arguments
python Modules/Console.py $args

