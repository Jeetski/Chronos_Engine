$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$userRoot = Join-Path $repoRoot "user"
$examplesRoot = Join-Path $userRoot "Examples"

New-Item -ItemType Directory -Path $examplesRoot -Force | Out-Null

$exampleFiles = Get-ChildItem -Path $userRoot -Recurse -File -Filter "*_example.yml" |
  Where-Object {
    $_.FullName -notlike "$examplesRoot*" -and
    $_.FullName -notlike (Join-Path $userRoot "Archive*")
  }

$mirrored = 0
$activated = 0
$skipped = 0

foreach ($file in $exampleFiles) {
  $relative = $file.FullName.Substring($userRoot.Length).TrimStart('\', '/')

  # Mirror every example into user/examples preserving User-relative layout.
  $mirrorPath = Join-Path $examplesRoot $relative
  $mirrorDir = Split-Path $mirrorPath -Parent
  New-Item -ItemType Directory -Path $mirrorDir -Force | Out-Null
  Copy-Item -Path $file.FullName -Destination $mirrorPath -Force
  $mirrored++

  # Activate a live copy by removing "_example" from filename if missing.
  $liveName = $file.Name -replace "_example(?=\.yml$)", ""
  if ($liveName -eq $file.Name) {
    $skipped++
    continue
  }

  $livePath = Join-Path $file.DirectoryName $liveName
  if (Test-Path $livePath) {
    $skipped++
    continue
  }

  Copy-Item -Path $file.FullName -Destination $livePath
  $activated++
}

Write-Host "Starter activation summary:"
Write-Host ("  Found examples : {0}" -f $exampleFiles.Count)
Write-Host ("  Mirrored       : {0}" -f $mirrored)
Write-Host ("  Activated new  : {0}" -f $activated)
Write-Host ("  Skipped        : {0}" -f $skipped)


