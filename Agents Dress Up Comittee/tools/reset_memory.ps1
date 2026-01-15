$tempDir = Join-Path $env:TEMP "ADUC"
$convPath = Join-Path $tempDir "conversation.json"
$famDir = "..\familiars"

# 1. Delete conversation history
if (Test-Path $convPath) {
    Remove-Item $convPath -Force
    Write-Host "Deleted conversation history."
}

# 2. Reset Familiar State and Profile
$familiars = Get-ChildItem $famDir -Directory
foreach ($fam in $familiars) {
    $statePath = Join-Path $fam.FullName "state.json"
    $profilePath = Join-Path $fam.FullName "profile.json"

    # Reset State
    $defaultState = @{
        emotion = "calm"
        hearts = 0
        activity = ""
    } | ConvertTo-Json
    $defaultState | Out-File $statePath -Encoding utf8
    Write-Host "Reset state for $($fam.Name)."

    # Reset Profile
    $defaultProfile = @{
        nickname = ""
        pronouns = ""
        timezone = ""
        preferences = @{
            tone = "concise"
            pet_names_allowed = $false
        }
    } | ConvertTo-Json
    $defaultProfile | Out-File $profilePath -Encoding utf8
    Write-Host "Reset profile for $($fam.Name)."
}

Write-Host "Memory reset complete."
