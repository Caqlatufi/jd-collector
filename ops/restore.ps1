param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [Parameter(Mandatory = $true)][string]$DatabasePath
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$archive = (Resolve-Path -LiteralPath $BackupFile).Path
$target = [IO.Path]::GetFullPath($DatabasePath)
if ($target.EndsWith('.mv.db') -or $target -match '[;\r\n]') {
    throw 'DatabasePath must be a database base path without .mv.db or JDBC options.'
}
$directory = Split-Path -Parent $target
$name = Split-Path -Leaf $target
if (-not $name -or $name -match '[*?]') { throw 'A database base filename is required.' }
foreach ($suffix in @('.mv.db', '.lock.db', '.trace.db')) {
    if (Test-Path -LiteralPath ($target + $suffix)) { throw 'Restore target already exists. Choose a new database path.' }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
    if ($zip.Entries.Count -ne 1 -or $zip.Entries[0].FullName -notmatch '^[^/\\]+\.mv\.db$') {
        throw 'Expected an H2 backup containing exactly one database file.'
    }
} finally { $zip.Dispose() }
$jar = Join-Path $projectRoot 'backend/app/build/libs/app-0.1.0.jar'
if (-not (Test-Path -LiteralPath $jar)) { throw 'Build the backend before restoring H2.' }
$javaExe = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { (Get-Command java.exe -ErrorAction Stop).Source }
New-Item -ItemType Directory -Path $directory -Force | Out-Null
& $javaExe '-Dloader.main=org.h2.tools.Restore' '-cp' $jar 'org.springframework.boot.loader.PropertiesLauncher' '-file' $archive '-dir' $directory '-db' $name
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath ($target + '.mv.db'))) { throw 'H2 restore failed.' }
Write-Output "Restored to a separate database: $target.mv.db. Runtime configuration was not changed."
