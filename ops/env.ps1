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
