$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'env.ps1')
$frontendDir = Join-Path $projectRoot 'frontend'
$desktopApp = Join-Path $frontendDir 'dist-electron'
$electronExe = Join-Path $frontendDir 'node_modules\electron\dist\electron.exe'
$powershellExe = Join-Path $PSHOME 'powershell.exe'
$runtimeDir = Join-Path $projectRoot 'runtime'
$launchLock = New-Object System.Threading.Mutex($false, 'Local\JDCollectorDesktopLauncher')
$lockHeld = $false

function Test-BackendReady {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:7890/jd-collector/api/system/health' -TimeoutSec 3
        return ($health.code -eq 200 -and $health.result.service -eq 'jd-collector' -and $health.result.status -eq 'UP')
    }
    catch { return $false }
}

try {
    try { $lockHeld = $launchLock.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $lockHeld = $true }
    if (-not $lockHeld) { exit 0 }

    foreach ($required in @($electronExe, (Join-Path $desktopApp 'main.cjs'), (Join-Path $desktopApp 'preload.cjs'),
            (Join-Path $desktopApp 'browser.html'), (Join-Path $desktopApp 'browser.js'))) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw 'Desktop files are missing. Build the application and run npm run desktop:build in frontend first.'
        }
    }

    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    if (-not (Test-BackendReady)) {
        $startScript = Join-Path $PSScriptRoot 'start.ps1'
        $backend = Start-Process -FilePath $powershellExe `
            -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $startScript + '"')) `
            -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $runtimeDir 'desktop-backend-start.out.log') `
            -RedirectStandardError (Join-Path $runtimeDir 'desktop-backend-start.err.log')
        # Windows PowerShell may return a null ExitCode with redirected output.
        # Health is authoritative; wait only for the script, never the Java process tree.
        $finished = $backend.WaitForExit(60000)
        if (-not (Test-BackendReady)) {
            if (-not $finished) { throw 'Backend startup is still pending. Check runtime logs before retrying.' }
            throw 'The local backend is not healthy. See runtime/desktop-backend-start.err.log and runtime/jd-collector.err.log.'
        }
    }

    foreach ($name in @('ELECTRON_RUN_AS_NODE', 'JD_DESKTOP_DEV', 'JD_DESKTOP_URL', 'JD_DESKTOP_ALLOW_LOCAL_HTTP')) {
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    # The single-instance lock focuses the current client without closing its tabs.
    $desktopArguments = ('"' + $desktopApp + '"')
    Start-Process -FilePath $electronExe -ArgumentList $desktopArguments `
        -WorkingDirectory $frontendDir -WindowStyle Normal | Out-Null
}
catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'JD Collector startup failed',
        [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    exit 1
}
finally {
    if ($lockHeld) { $launchLock.ReleaseMutex() }
    $launchLock.Dispose()
}
