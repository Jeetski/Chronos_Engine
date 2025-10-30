# Set the console output encoding to UTF-8 to support emojis
$OutputEncoding = [System.Text.Encoding]::UTF8

# Set the PYTHONIOENCODING environment variable to utf-8
$env:PYTHONIOENCODING = "utf-8"

# Run the Python script, passing along all arguments
python Modules/Console.py $args

# Pause if the script was run without arguments
if ($args.Count -eq 0) {
    Write-Host "Press any key to continue..."
    $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
}