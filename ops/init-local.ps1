$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localDir = Join-Path $projectRoot 'local'
New-Item -ItemType Directory -Path $localDir -Force | Out-Null
foreach ($item in @{
    'env.example.json' = 'env.json'
    'criteria.example.json' = 'JD门槛.json'
    'resume-starter.example.md' = 'resume-starter.md'
    'search-task.example.md' = 'JD搜索任务单.md'
    'sprint-plan.example.md' = '求职冲刺计划.md'
}.GetEnumerator()) {
    $target = Join-Path $localDir $item.Value
    if (-not (Test-Path -LiteralPath $target)) {
        Copy-Item -LiteralPath (Join-Path $projectRoot ('config/' + $item.Key)) -Destination $target
    }
}
New-Item -ItemType Directory -Path (Join-Path $localDir 'resume') -Force | Out-Null
Write-Output 'Local configuration initialized. Existing files were preserved.'
