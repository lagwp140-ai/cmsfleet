$requirements = @(
  @{ Name = "node"; Command = "node --version" },
  @{ Name = "npm"; Command = "npm --version" },
  @{ Name = "docker"; Command = "docker --version" },
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

Write-Host "Recommended local bootstrap:"
Write-Host "1. npm run dev:setup"
Write-Host "2. npm run dev:stack:up"
Write-Host "3. npm run dev:db:migrate"
Write-Host "4. npm run dev:seed"
Write-Host "5. npm run dev:start"
Write-Host "Optional mocks: npm run dev:gps:send and npm run dev:display:watch"