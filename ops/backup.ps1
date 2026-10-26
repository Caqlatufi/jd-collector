param([string]$AccountKeyPath)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'env.ps1')
$backupDir = Join-Path $projectRoot 'backups'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
if (-not $AccountKeyPath) { $AccountKeyPath = Join-Path $projectRoot 'runtime\accounts\master.key' }
$keyBackup = Join-Path $backupDir "jd-collector-$timestamp.accounts.key"

$databaseUrl = $env:JD_COLLECTOR_DB_URL
$databaseUser = $env:JD_COLLECTOR_DB_USERNAME
$databasePassword = $env:JD_COLLECTOR_DB_PASSWORD
if (-not $databaseUrl -or -not $databaseUser) {
    throw 'JD Collector database environment variables are missing.'
}

New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
if ($databaseUrl.StartsWith('jdbc:h2:file:')) {
    $outputFile = Join-Path $backupDir "jd-collector-$timestamp.zip"
    $jar = Join-Path $projectRoot 'backend/app/build/libs/app-0.1.0.jar'
    if (-not (Test-Path -LiteralPath $jar)) { throw 'Build the backend before backing up H2.' }
    $javaExe = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { (Get-Command java.exe -ErrorAction Stop).Source }
    & $javaExe '-Dloader.main=com.jd.app.DatabaseBackup' '-cp' $jar 'org.springframework.boot.loader.PropertiesLauncher' $outputFile
    if ($LASTEXITCODE -ne 0) { throw 'H2 backup failed. The configured database was not changed.' }
} else {
    $outputFile = Join-Path $backupDir "jd-collector-$timestamp.sql"
    $match = [regex]::Match($databaseUrl, '^jdbc:mysql://(?<host>[^:/?]+)(:(?<port>\d+))?/(?<database>[^?]+)')
    if (-not $match.Success) { throw 'Backup supports H2 file databases and MySQL JDBC URLs.' }
    $dump = (Get-Command mysqldump.exe -ErrorAction Stop).Source
    $previousMysqlPassword = [Environment]::GetEnvironmentVariable('MYSQL_PWD', 'Process')
    $env:MYSQL_PWD = $databasePassword
    try {
        & $dump --host=$($match.Groups['host'].Value) --port=$(if ($match.Groups['port'].Success) { $match.Groups['port'].Value } else { '3306' }) --user=$databaseUser --single-transaction --no-tablespaces --result-file=$outputFile $match.Groups['database'].Value
        if ($LASTEXITCODE -ne 0) { throw "mysqldump failed with exit code $LASTEXITCODE" }
    } finally {
        [Environment]::SetEnvironmentVariable('MYSQL_PWD', $previousMysqlPassword, 'Process')
    }
}
if (-not (Test-Path -LiteralPath $outputFile) -or (Get-Item -LiteralPath $outputFile).Length -eq 0) {
    throw 'Database backup is missing or empty.'
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
