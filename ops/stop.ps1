$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot 'runtime\jd-collector.pid'
if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Output 'JD Collector PID file does not exist.'
    exit 0
}

$processId = [int]([IO.File]::ReadAllText($pidFile).Trim())
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
$expectedJar = Join-Path $projectRoot 'backend\app\build\libs\app-0.1.0.jar'
if ($null -ne $process -and $process.Name -eq 'java.exe' -and
    $process.CommandLine.IndexOf($expectedJar, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
    Stop-Process -Id $processId -Force
    Write-Output "JD Collector stopped. PID=$processId"
} else {
    Write-Output 'Recorded process is no longer the JD Collector process.'
}

Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
