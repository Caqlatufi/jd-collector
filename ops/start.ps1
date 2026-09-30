$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'env.ps1')
$runtimeDir = Join-Path $projectRoot 'runtime'
$jar = Join-Path $projectRoot 'backend\app\build\libs\app-0.1.0.jar'
$pidFile = Join-Path $runtimeDir 'jd-collector.pid'
$stdoutLog = Join-Path $runtimeDir 'jd-collector.out.log'
$stderrLog = Join-Path $runtimeDir 'jd-collector.err.log'
$healthUrl = 'http://127.0.0.1:7890/jd-collector/api/system/health'

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($health.code -eq 200) {
        Write-Output 'JD Collector is already running.'
        exit 0
    }
}
catch {
    # Expected when the application is not running yet.
}

if (-not (Test-Path -LiteralPath $jar)) {
    throw "Executable jar is missing. Run ops\build.ps1 first: $jar"
}

$javaExe = if ($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    Join-Path $env:JAVA_HOME 'bin\java.exe'
} else {
    (Get-Command java.exe -ErrorAction Stop).Source
}

$process = Start-Process -FilePath $javaExe `
    -ArgumentList @('-jar', $jar) `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru
[IO.File]::WriteAllText($pidFile, $process.Id.ToString())

for ($attempt = 1; $attempt -le 45; $attempt++) {
    Start-Sleep -Seconds 1
    if ($process.HasExited) {
        $tail = if (Test-Path -LiteralPath $stderrLog) { (Get-Content -Tail 30 $stderrLog) -join [Environment]::NewLine } else { '' }
        throw "JD Collector exited during startup. $tail"
    }
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        if ($health.code -eq 200) {
            Write-Output "JD Collector started. PID=$($process.Id) URL=http://127.0.0.1:7890/jd-collector/"
            exit 0
        }
    }
    catch {
        # Keep waiting until the deadline.
    }
}

throw "JD Collector did not become healthy within 45 seconds. See $stderrLog"
