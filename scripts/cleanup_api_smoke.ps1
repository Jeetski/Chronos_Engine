param(
  [string]$Prefix = "api_smoke_",
  [switch]$DryRun,
  [switch]$ActiveOnly
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$userRoot = Join-Path $repoRoot "user"
if (-not (Test-Path $userRoot)) {
  throw "Could not find user folder at: $userRoot"
}

$prefixLower = $Prefix.ToLowerInvariant()

$allFiles = Get-ChildItem -Path $userRoot -Recurse -File

if ($ActiveOnly) {
  $archiveRoot = (Join-Path $userRoot "archive").ToLowerInvariant()
  $allFiles = $allFiles | Where-Object { -not $_.DirectoryName.ToLowerInvariant().StartsWith($archiveRoot) }
}

$matches = $allFiles | Where-Object {
  $_.BaseName.ToLowerInvariant().StartsWith($prefixLower)
}

if (-not $matches -or $matches.Count -eq 0) {
  Write-Host "No matching files found."
  Write-Host ("  Prefix     : {0}" -f $Prefix)
  Write-Host ("  ActiveOnly : {0}" -f ([bool]$ActiveOnly))
  exit 0
}

Write-Host "API smoke cleanup candidates:"
Write-Host ("  Count      : {0}" -f $matches.Count)
Write-Host ("  Prefix     : {0}" -f $Prefix)
Write-Host ("  ActiveOnly : {0}" -f ([bool]$ActiveOnly))
Write-Host ("  DryRun     : {0}" -f ([bool]$DryRun))
Write-Host ""

$byFolder = @{}
foreach ($f in $matches) {
  $relDir = $f.DirectoryName.Substring($userRoot.Length).TrimStart('\', '/')
  if (-not $byFolder.ContainsKey($relDir)) { $byFolder[$relDir] = 0 }
  $byFolder[$relDir]++
}

foreach ($k in ($byFolder.Keys | Sort-Object)) {
  Write-Host ("  {0}\{1}" -f $k, $byFolder[$k])
}

Write-Host ""
if ($DryRun) {
  Write-Host "Dry run only. No files were deleted."
  exit 0
}

$deleted = 0
foreach ($f in $matches) {
  [System.IO.File]::Delete($f.FullName)
  $deleted++
}

Write-Host ("Deleted files: {0}" -f $deleted)
