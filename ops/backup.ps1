param([string]$AccountKeyPath)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'env.ps1')
$backupDir = Join-Path $projectRoot 'backups'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outputFile = Join-Path $backupDir "jd-collector-$timestamp.sql"
if (-not $AccountKeyPath) { $AccountKeyPath = Join-Path $projectRoot 'runtime\accounts\master.key' }
$keyBackup = Join-Path $backupDir "jd-collector-$timestamp.accounts.key"

$databaseUrl = $env:JD_COLLECTOR_DB_URL
$databaseUser = $env:JD_COLLECTOR_DB_USERNAME
$databasePassword = $env:JD_COLLECTOR_DB_PASSWORD
if (-not $databaseUrl -or -not $databaseUser) {
    throw 'JD Collector database environment variables are missing.'
}

$match = [regex]::Match($databaseUrl, '^jdbc:mysql://(?<host>[^:/?]+)(:(?<port>\d+))?/(?<database>[^?]+)')
if (-not $match.Success) {
    throw 'Only the configured MySQL JDBC URL format is supported by the backup script.'
}

$dump = (Get-Command mysqldump.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$env:MYSQL_PWD = $databasePassword
try {
    & $dump --host=$($match.Groups['host'].Value) --port=$(if ($match.Groups['port'].Success) { $match.Groups['port'].Value } else { '3306' }) --user=$databaseUser --single-transaction --no-tablespaces --result-file=$outputFile $match.Groups['database'].Value
    if ($LASTEXITCODE -ne 0) {
        throw "mysqldump failed with exit code $LASTEXITCODE"
    }
}
finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}

Write-Output "Database backup created: $outputFile"
if (Test-Path -LiteralPath $AccountKeyPath) {
    Copy-Item -LiteralPath $AccountKeyPath -Destination $keyBackup -ErrorAction Stop
    if ((Get-FileHash -LiteralPath $AccountKeyPath).Hash -ne (Get-FileHash -LiteralPath $keyBackup).Hash) {
        throw 'Account key backup verification failed.'
    }
    Write-Output "Account key backup created: $keyBackup (keep with the matching SQL backup; do not share)"
} else {
    Write-Output 'No account key found. If a custom jd.accounts.key-path is configured, rerun with -AccountKeyPath.'
}
