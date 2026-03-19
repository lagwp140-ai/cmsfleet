param(
  [ValidateSet('up', 'down')]
  [string]$Direction = 'up',
  [string]$DatabaseUrl = $env:CMS_DATABASE_URL
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw 'Set CMS_DATABASE_URL or pass -DatabaseUrl before applying migrations.'
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  throw 'psql was not found on PATH. Install PostgreSQL client tools first.'
}

$migrationRoot = Join-Path $PSScriptRoot '..\backend\api\db\migrations'
$migrationRoot = [System.IO.Path]::GetFullPath($migrationRoot)
$pattern = "*.$Direction.sql"
$files = Get-ChildItem -Path $migrationRoot -Filter $pattern | Sort-Object Name

if ($files.Count -eq 0) {
  throw "No migration files matched $pattern in $migrationRoot"
}

foreach ($file in $files) {
  Write-Host "Applying $($file.Name)..."
  & $psql.Source $DatabaseUrl -v ON_ERROR_STOP=1 -f $file.FullName
}

Write-Host "Completed $Direction migrations from $migrationRoot"
