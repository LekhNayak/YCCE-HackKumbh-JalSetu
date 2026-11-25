# Start JalSetu locally: API on http://localhost:8100, web app on http://localhost:5180 (open this one).
#   powershell -ExecutionPolicy Bypass -File scripts\run_local.ps1            (two windows, live reload)
#   powershell -ExecutionPolicy Bypass -File scripts\run_local.ps1 -Single    (build once, everything on :8100)
param([switch]$Single)
$root = Split-Path -Parent $PSScriptRoot
if ($Single) {
  Push-Location "$root\frontend"; npm run build; Pop-Location
  $env:SERVE_FRONTEND = "1"
  Push-Location "$root\backend"; python -m uvicorn app.main:app --port 8100; Pop-Location
} else {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; python -m uvicorn app.main:app --port 8100 --reload"
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npx vite --port 5180"
  Write-Host "API: http://localhost:8100/docs   App: http://localhost:5180"
}
