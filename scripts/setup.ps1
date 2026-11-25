# One-time setup: Python packages, frontend packages, local .env. Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Write-Host "Installing backend packages..."
python -m pip install -r "$root\backend\requirements.txt"
Write-Host "Installing frontend packages..."
Push-Location "$root\frontend"; npm install; Pop-Location
if (-not (Test-Path "$root\backend\.env")) {
  Copy-Item "$root\backend\.env.example" "$root\backend\.env"
  Write-Host "Created backend\.env from .env.example - add keys if you have them (all optional)."
}
Write-Host "Done. Start the app with: scripts\run_local.ps1"
