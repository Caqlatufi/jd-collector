param([switch]$Running, [switch]$ProbeModel)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
$nodeExe = if ($env:JD_RECOGNITION_NODE) { $env:JD_RECOGNITION_NODE } else { 'node' }
$doctorArgs = @((Join-Path $PSScriptRoot 'doctor.mjs'))
if ($Running) { $doctorArgs += '--running' }
if ($ProbeModel) { $doctorArgs += '--probe-model' }
try {
    & $nodeExe @doctorArgs
    exit $LASTEXITCODE
} catch {
    Write-Output '[FAIL] Node: install Node.js 22.12+ or set JD_RECOGNITION_NODE in local/env.json.'
    exit 1
}
