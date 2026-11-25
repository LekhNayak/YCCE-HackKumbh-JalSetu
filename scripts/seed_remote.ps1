# Renew the demo ward in the hosted Postgres database, with dates relative to today. Run it just before a demo.
# Registered accounts, and everything those people entered, stay. The first run on an empty database loads everything.
#   powershell -ExecutionPolicy Bypass -File scripts\seed_remote.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\seed_remote.ps1 -EraseEverything    (accounts too: cannot be undone)
# Paste the connection string when asked. It is not shown on screen and not saved anywhere.
param([switch]$EraseEverything)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$secure = Read-Host "Database connection string (hidden while you paste)" -AsSecureString
$url = (New-Object System.Net.NetworkCredential("", $secure)).Password.Trim()
$url = ($url -replace "^psql\s+", "").Trim("'", '"', " ")
if ($url -notmatch "^postgres(ql)?://[^@\s]+@([^/:?\s]+)") { Write-Host "That is not a Postgres connection string. Nothing changed."; exit 1 }
$dbHost = $Matches[2]
if ($EraseEverything) {
  $answer = Read-Host "This ERASES EVERYTHING on $dbHost, registered accounts included. Type ERASE to continue"
  if ($answer -cne "ERASE") { Write-Host "Stopped. Nothing changed."; exit 1 }
  $flags = @("--reset", "--erase-hosted")
} else {
  $answer = Read-Host "Renew the demo entries on $dbHost (accounts stay). Type YES to continue"
  if ($answer -cne "YES") { Write-Host "Stopped. Nothing changed."; exit 1 }
  $flags = @("--refresh")
}
$env:DATABASE_URL = $url
Push-Location "$root\backend"
try {
  python -m app.seed @flags
  if ($LASTEXITCODE -ne 0) { throw "It did not work (see the message above)." }
  Write-Host "Done on $dbHost."
} finally {
  Pop-Location
  Remove-Item Env:\DATABASE_URL
}
