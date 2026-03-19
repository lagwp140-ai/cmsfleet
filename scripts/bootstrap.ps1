$requirements = @(
  @{ Name = "node"; Command = "node --version" },
  @{ Name = "npm"; Command = "npm --version" },
  @{ Name = "java"; Command = "java --version" }
)

Write-Host "Checking local tooling for cmsfleet..."

foreach ($requirement in $requirements) {
  Write-Host "- $($requirement.Name)"
  try {
    Invoke-Expression $requirement.Command | Select-Object -First 1 | ForEach-Object { Write-Host "  $_" }
  } catch {
    Write-Warning "$($requirement.Name) is not currently available on PATH."
  }
}

Write-Host "Next steps:"
Write-Host "1. Copy .env.example files into working .env files."
Write-Host "2. Start PostgreSQL with deploy/docker-compose.dev.yml or your local instance."
Write-Host "3. Run npm install from the repository root."