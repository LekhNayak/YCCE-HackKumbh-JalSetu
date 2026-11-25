# Load (or reload) the demo ward into the hosted Postgres database. It ERASES that database first.
# Run it once after creating the database, and again just before a demo (dates are relative to today).
#   powershell -ExecutionPolicy Bypass -File scripts\seed_remote.ps1
# Paste the connection string when asked. It is not shown on screen and not saved anywhere.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$secure = Read-Host "Database connection string (hidden while you paste)" -AsSecureString
$url = (New-Object System.Net.NetworkCredential("", $secure)).Password.Trim()
$url = ($url -replace "^psql\s+", "").Trim("'", '"', " ")
if ($url -notmatch "^postgres(ql)?://[^@\s]+@([^/:?\s]+)") { Write-Host "That is not a Postgres connection string. Nothing changed."; exit 1 }
$dbHost = $Matches[2]
$answer = Read-Host "This ERASES everything in the database on $dbHost and loads the demo ward. Type YES to continue"
if ($answer -cne "YES") { Write-Host "Stopped. Nothing changed."; exit 1 }
$env:DATABASE_URL = $url
Push-Location "$root\backend"
try {
  python -m app.seed --reset
  if ($LASTEXITCODE -ne 0) { throw "Seeding failed (see the message above)." }
  Write-Host "Demo data loaded on $dbHost."
} finally {
  Pop-Location
  Remove-Item Env:\DATABASE_URL
}
