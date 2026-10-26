# Dot-source before build, start, backup or direct Gradle commands.
$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = if ($env:JD_COLLECTOR_ENV_FILE) { $env:JD_COLLECTOR_ENV_FILE } else { Join-Path $projectRoot 'local/env.json' }
if (Test-Path -LiteralPath $envFile) {
    try { $localSettings = Get-Content -Raw -Encoding UTF8 -LiteralPath $envFile | ConvertFrom-Json }
    catch { throw 'Local environment configuration is invalid JSON; values are not displayed.' }
    if ($null -eq $localSettings -or $localSettings -is [Array] -or $localSettings -is [string]) {
        throw 'Local environment configuration must be a JSON object.'
    }
    foreach ($setting in $localSettings.PSObject.Properties) {
        if ($setting.Name -notmatch '^JD_[A-Z0-9_]+$' -or $setting.Value -isnot [string]) {
            throw 'Local environment configuration requires JD_* keys and string values.'
        }
        if ($localSettings.JD_COLLECTOR_ISOLATED -eq 'true' -or
            $null -eq [Environment]::GetEnvironmentVariable($setting.Name, 'Process')) {
            [Environment]::SetEnvironmentVariable($setting.Name, $setting.Value, 'Process')
        }
    }
}
foreach ($name in 'JD_COLLECTOR_DB_URL', 'JD_COLLECTOR_DB_USERNAME', 'JD_COLLECTOR_DB_PASSWORD') {
    if ($null -eq [Environment]::GetEnvironmentVariable($name, 'Process')) {
        $value = [Environment]::GetEnvironmentVariable($name, 'User')
        if ($null -ne $value) { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
    }
}
# Files are resolved relative to this root, even when invoked through an ASCII junction.
if (-not $env:JD_COLLECTOR_PROJECT_DIR) { $env:JD_COLLECTOR_PROJECT_DIR = $projectRoot }

# Embedded data is separate from build artifacts and can be relocated by an installer.
if (-not $env:JD_COLLECTOR_DATA_DIR) { $env:JD_COLLECTOR_DATA_DIR = Join-Path $projectRoot 'local/data' }
if (-not [IO.Path]::IsPathRooted($env:JD_COLLECTOR_DATA_DIR)) {
    $env:JD_COLLECTOR_DATA_DIR = Join-Path $projectRoot $env:JD_COLLECTOR_DATA_DIR
}
$env:JD_COLLECTOR_DATA_DIR = [IO.Path]::GetFullPath($env:JD_COLLECTOR_DATA_DIR).Replace('\', '/')
if ($env:JD_COLLECTOR_DATA_DIR -match '[;\r\n]') { throw 'Database directory contains unsupported characters.' }
if (-not $env:JD_COLLECTOR_DB_URL) {
    $env:JD_COLLECTOR_DB_URL = 'jdbc:h2:file:' + $env:JD_COLLECTOR_DATA_DIR + '/jd-collector;MODE=MySQL;DATABASE_TO_LOWER=TRUE;AUTO_SERVER=TRUE'
}
if ($env:JD_COLLECTOR_DB_URL -match '^jdbc:h2:file:(?<file>[^;]+)(?<options>;.*)?$') {
    $databaseFile = $Matches['file']
    $databaseOptions = $Matches['options']
    if ($databaseFile.StartsWith('~/')) {
        $databaseFile = Join-Path $env:USERPROFILE $databaseFile.Substring(2)
    } elseif (-not [IO.Path]::IsPathRooted($databaseFile)) {
        $databaseFile = Join-Path $projectRoot $databaseFile
    }
    $env:JD_COLLECTOR_DB_URL = 'jdbc:h2:file:' + [IO.Path]::GetFullPath($databaseFile).Replace('\', '/') + $databaseOptions
}
if (-not $env:JD_COLLECTOR_DB_USERNAME) { $env:JD_COLLECTOR_DB_USERNAME = 'sa' }
if ($null -eq [Environment]::GetEnvironmentVariable('JD_COLLECTOR_DB_PASSWORD', 'Process')) {
    $env:JD_COLLECTOR_DB_PASSWORD = ''
}
