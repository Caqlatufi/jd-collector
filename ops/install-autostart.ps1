$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $PSScriptRoot 'start.ps1'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'JD Collector.lnk'
$powershellExe = Join-Path $PSHOME 'powershell.exe'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershellExe
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = 'Start the local JD Collector after Windows sign-in'
$shortcut.Save()

Write-Output "Autostart shortcut installed: $shortcutPath"
