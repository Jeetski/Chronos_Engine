# Chronos Starter Example Activation (generic)
# - Scans User/**/*_example.yml
# - Mirrors every example into User/Examples
# - Activates live copies by removing "_example" from filenames (if missing)

echo === Activating all *_example.yml items/templates ===
powershell -NoProfile -ExecutionPolicy Bypass -File "Scripts/starter_example_activation.ps1"
sequence sync core matrix behavior journal trends
today reschedule
today
