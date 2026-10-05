$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'env.ps1')
$startScript = Join-Path $PSScriptRoot 'start-desktop.ps1'
$desktopDir = [Environment]::GetFolderPath('Desktop')
if (-not $desktopDir) { throw 'The current user desktop directory is unavailable.' }
$shortcutName = if ($env:JD_DESKTOP_SHORTCUT_NAME) { $env:JD_DESKTOP_SHORTCUT_NAME } else { 'JD Collector' }
if ($shortcutName -match '[\\/:*?"<>|]') { throw 'Invalid desktop shortcut name.' }
$shortcutPath = Join-Path $desktopDir ($shortcutName + '.lnk')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $PSHOME 'powershell.exe'
$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $startScript + '"'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = (Join-Path $projectRoot 'frontend\node_modules\electron\dist\electron.exe') + ',0'
$shortcut.Description = 'Open JD Collector desktop client and start its local backend if needed'
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Output "Desktop shortcut installed: $shortcutPath"
