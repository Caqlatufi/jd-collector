$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'env.ps1')
$startScript = Join-Path $PSScriptRoot 'start.ps1'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutName = if ($env:JD_DESKTOP_SHORTCUT_NAME) { $env:JD_DESKTOP_SHORTCUT_NAME } else { 'JD Collector' }
if ($shortcutName -match '[\\/:*?"<>|]') { throw 'Invalid autostart shortcut name.' }
$shortcutPath = Join-Path $startupDir ($shortcutName + '.lnk')
$powershellExe = Join-Path $PSHOME 'powershell.exe'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershellExe
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = 'Start the local JD Collector after Windows sign-in'
$shortcut.Save()

Write-Output "Autostart shortcut installed: $shortcutPath"
