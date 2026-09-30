$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'env.ps1')
$frontendRoot = Join-Path $projectRoot 'frontend'
$asciiRoot = $env:JD_COLLECTOR_BUILD_ROOT
$backendTarget = Join-Path $projectRoot 'backend'

Push-Location $frontendRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend build failed with exit code $LASTEXITCODE"
    }
    & npm.cmd run desktop:build
    if ($LASTEXITCODE -ne 0) {
        throw "Desktop build failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

if ($asciiRoot) {
    if (-not (Test-Path -LiteralPath $asciiRoot)) {
        New-Item -ItemType Junction -Path $asciiRoot -Target $projectRoot | Out-Null
    }
    $resolvedTarget = (Get-Item -LiteralPath $asciiRoot).Target
    if ($resolvedTarget -notcontains $projectRoot) {
        throw 'Configured build junction points to an unexpected project.'
    }
} else {
    $asciiRoot = $projectRoot
}

Push-Location (Join-Path $asciiRoot 'backend')
try {
    & .\gradlew.bat :app:bootJar
    if ($LASTEXITCODE -ne 0) {
        throw "Backend build failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$jar = Join-Path $backendTarget 'app\build\libs\app-0.1.0.jar'
if (-not (Test-Path -LiteralPath $jar)) {
    throw "Executable jar was not produced: $jar"
}

Write-Output "JD Collector build completed: $jar"
