param(
    [int]$Port = 7367
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Pass([string]$msg) { Write-Host "[PASS] $msg" -ForegroundColor Green }
function Write-Fail([string]$msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red }

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$base = "http://127.0.0.1:$Port"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$prefix = "API_SMOKE_$timestamp"
$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure([string]$msg) {
    $script:failures.Add($msg)
    Write-Fail $msg
}

function Invoke-Api {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Payload = $null
    )
    $uri = "$base$Path"
    $body = $null
    if ($null -ne $Payload) {
        $body = ($Payload | ConvertTo-Json -Depth 12 -Compress)
    }
    $resp = Invoke-WebRequest -Method $Method -Uri $uri -Body $body -ContentType "text/yaml; charset=utf-8" -SkipHttpErrorCheck
    $parsed = $null
    try { $parsed = $resp.Content | ConvertFrom-Json -ErrorAction Stop } catch { }
    return [pscustomobject]@{
        StatusCode = [int]$resp.StatusCode
        Content    = [string]$resp.Content
        Json       = $parsed
    }
}

function Is-OkResponse($resp) {
    if ($resp.Json -and $null -ne $resp.Json.ok) { return [bool]$resp.Json.ok }
    return ($resp.Content -match "(?im)^\s*ok\s*:\s*true\s*$")
}

function Assert-Ok([string]$label, $resp, [int[]]$allowedStatus = @(200)) {
    if (($allowedStatus -contains $resp.StatusCode) -and (Is-OkResponse $resp)) {
        Write-Pass $label
        return $true
    }
    Add-Failure "$label (status=$($resp.StatusCode)) content=$($resp.Content)"
    return $false
}

function Assert([bool]$condition, [string]$label) {
    if ($condition) { Write-Pass $label } else { Add-Failure $label }
}

$oldPort = $env:CHRONOS_DASH_PORT
$env:CHRONOS_DASH_PORT = "$Port"
$serverProc = $null

try {
    Write-Info "Starting dashboard server on port $Port"
    $serverProc = Start-Process -FilePath "python" -ArgumentList "utilities/dashboard/server.py" -WorkingDirectory $root -PassThru -WindowStyle Hidden

    $healthy = $false
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 250
        try {
            $h = Invoke-WebRequest -Uri "$base/health" -Method GET -SkipHttpErrorCheck
            if ($h.StatusCode -eq 200) { $healthy = $true; break }
        } catch { }
    }
    if (-not $healthy) { throw "Dashboard server did not become healthy on $base/health" }
    Write-Pass "Server health check"

    # 1) Item CRUD through /api/item* routes
    $taskA = "$prefix Task A"
    $taskB = "$prefix Task B"
    $taskC = "$prefix Task C"

    $r = Invoke-Api -Method POST -Path "/api/item" -Payload @{
        type = "task"; name = $taskA; properties = @{ status = "pending"; priority = "high"; category = "smoke" }
    }
    Assert-Ok "Create task via /api/item" $r

    $r = Invoke-Api -Method POST -Path "/api/item" -Payload @{
        type = "task"; name = $taskA; properties = @{ status = "next"; priority = "medium" }
    }
    Assert-Ok "Update task via /api/item (set path)" $r

    $r = Invoke-Api -Method POST -Path "/api/item/copy" -Payload @{
        type = "task"; source = $taskA; new_name = $taskB
    }
    Assert-Ok "Copy task via /api/item/copy" $r

    $r = Invoke-Api -Method POST -Path "/api/item/rename" -Payload @{
        type = "task"; old_name = $taskB; new_name = $taskC
    }
    Assert-Ok "Rename task via /api/item/rename" $r

    $r = Invoke-Api -Method POST -Path "/api/item/delete" -Payload @{
        type = "task"; name = $taskC
    }
    Assert-Ok "Soft delete task via /api/item/delete" $r
    $taskCPath = Join-Path $root ("User\Tasks\{0}.yml" -f $taskC)
    Assert (-not (Test-Path $taskCPath)) "Soft-deleted task removed from active folder"

    # 2) Bulk set/copy/delete
    $noteA = "$prefix Note A"
    $noteB = "$prefix Note B"
    $r = Invoke-Api -Method POST -Path "/api/item" -Payload @{
        type = "note"; name = $noteA; properties = @{ content = "smoke A" }
    }
    Assert-Ok "Create note A" $r
    $r = Invoke-Api -Method POST -Path "/api/item" -Payload @{
        type = "note"; name = $noteB; properties = @{ content = "smoke B" }
    }
    Assert-Ok "Create note B" $r

    $r = Invoke-Api -Method POST -Path "/api/items/setprop" -Payload @{
        type = "note"; names = @($noteA, $noteB); property = "category"; value = "smoke"
    }
    Assert-Ok "Bulk setprop via /api/items/setprop" $r @(200, 207)

    $r = Invoke-Api -Method POST -Path "/api/items/copy" -Payload @{
        type = "note"; sources = @($noteA, $noteB); suffix = " Copy"
    }
    Assert-Ok "Bulk copy via /api/items/copy" $r @(200, 207)

    $r = Invoke-Api -Method POST -Path "/api/items/delete" -Payload @{
        type = "note"; names = @("$noteA Copy", "$noteB Copy")
    }
    Assert-Ok "Bulk delete via /api/items/delete" $r @(200, 207)

    # 3) Achievements update endpoint
    $ach = "$prefix Achievement"
    $r = Invoke-Api -Method POST -Path "/api/item" -Payload @{
        type = "achievement"; name = $ach; properties = @{ description = "smoke achievement"; points = 5 }
    }
    Assert-Ok "Create achievement" $r
    $r = Invoke-Api -Method POST -Path "/api/achievement/update" -Payload @{
        name = $ach; fields = @{ category = "smoke"; status = "pending" }; award_now = $true
    }
    Assert-Ok "Update + award achievement via /api/achievement/update" $r

    # 4) Milestone update endpoint
    $ms = "$prefix Milestone"
    $r = Invoke-Api -Method POST -Path "/api/item" -Payload @{
        type = "milestone"; name = $ms; properties = @{ status = "pending" }
    }
    Assert-Ok "Create milestone" $r
    $r = Invoke-Api -Method POST -Path "/api/milestone/update" -Payload @{
        name = $ms; action = "complete"
    }
    Assert-Ok "Complete milestone via /api/milestone/update" $r
    $r = Invoke-Api -Method POST -Path "/api/milestone/update" -Payload @{
        name = $ms; action = "reset"
    }
    Assert-Ok "Reset milestone via /api/milestone/update" $r

    # 5) Yesterday check-in via did command path
    $yDate = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
    $r = Invoke-Api -Method POST -Path "/api/yesterday/checkin" -Payload @{
        date = $yDate
        updates = @(
            @{
                name = "$prefix Block"
                scheduled_start = "09:00"
                scheduled_end = "09:30"
                status = "completed"
                note = "smoke"
            }
        )
        additional = @()
    }
    Assert-Ok "Yesterday check-in via /api/yesterday/checkin" $r @(200, 207)
    $completionPath = Join-Path $root "User\Schedules\completions\$yDate.yml"
    Assert (Test-Path $completionPath) "Completion file created/updated for yesterday"
    if (Test-Path $completionPath) {
        $content = Get-Content -Path $completionPath -Raw
        Assert ($content -like "*$prefix Block*") "Check-in entry written via did path"
    }

    # 6) Timer actions via CLI-backed endpoints
    $r = Invoke-Api -Method POST -Path "/api/timer/start" -Payload @{ profile = "classic_pomodoro" }
    Assert-Ok "Timer start via /api/timer/start" $r
    $r = Invoke-Api -Method POST -Path "/api/timer/pause" -Payload @{}
    Assert-Ok "Timer pause via /api/timer/pause" $r
    $r = Invoke-Api -Method POST -Path "/api/timer/resume" -Payload @{}
    Assert-Ok "Timer resume via /api/timer/resume" $r
    $r = Invoke-Api -Method POST -Path "/api/timer/confirm" -Payload @{ action = "skip" }
    Assert-Ok "Timer confirm via /api/timer/confirm" $r
    $r = Invoke-Api -Method POST -Path "/api/timer/stop" -Payload @{}
    Assert-Ok "Timer stop via /api/timer/stop" $r

    # 7) Template save endpoint
    $dayTemplate = "$prefix Day"
    $r = Invoke-Api -Method POST -Path "/api/template" -Payload @{
        type = "day"
        name = $dayTemplate
        children = @(
            @{ name = "$prefix Child Task"; type = "task"; duration = "30m"; ideal_start_time = "08:00" }
        )
    }
    Assert-Ok "Template save via /api/template" $r
    $r = Invoke-Api -Method GET -Path ("/api/template?type=day&name=" + [uri]::EscapeDataString($dayTemplate))
    Assert-Ok "Template fetch via /api/template GET" $r

    if ($failures.Count -gt 0) {
        Write-Host ""
        Write-Fail "Smoke test completed with $($failures.Count) failure(s)."
        $failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
        exit 1
    }

    Write-Host ""
    Write-Pass "Smoke test completed successfully."
    exit 0
}
finally {
    if ($serverProc -and -not $serverProc.HasExited) {
        try { Stop-Process -Id $serverProc.Id -Force -ErrorAction Stop } catch { }
    }
    if ($null -ne $oldPort) { $env:CHRONOS_DASH_PORT = $oldPort } else { Remove-Item Env:CHRONOS_DASH_PORT -ErrorAction SilentlyContinue }
}


