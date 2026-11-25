# Reload the demo ward (dates relative to today; today's tanker set 75 min from now). Run just before recording.
# Stop the API first if it is running, then start it again afterwards.
$root = Split-Path -Parent $PSScriptRoot
Push-Location "$root\backend"; python -m app.seed --reset; Pop-Location
Remove-Item "$root\backend\uploads\*" -Exclude ".gitkeep" -ErrorAction SilentlyContinue
Write-Host "Demo data reloaded."
