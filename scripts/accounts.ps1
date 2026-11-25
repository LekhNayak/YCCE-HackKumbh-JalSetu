# Look after registered accounts in the hosted database. The connection string is asked for and hidden.
#   powershell -ExecutionPolicy Bypass -File scripts\accounts.ps1 list
#   powershell -ExecutionPolicy Bypass -File scripts\accounts.ps1 role <username> society_admin      (or resident, ward_officer)
#   powershell -ExecutionPolicy Bypass -File scripts\accounts.ps1 password <username>                (a person forgot theirs)
#   powershell -ExecutionPolicy Bypass -File scripts\accounts.ps1 delete <username>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if ($args.Count -eq 0) { Write-Host "Say what to do: list, role, password or delete (see the top of this file)."; exit 1 }
$secure = Read-Host "Database connection string (hidden while you paste)" -AsSecureString
$url = (New-Object System.Net.NetworkCredential("", $secure)).Password.Trim()
$url = ($url -replace "^psql\s+", "").Trim("'", '"', " ")
if ($url -notmatch "^postgres(ql)?://[^@\s]+@([^/:?\s]+)") { Write-Host "That is not a Postgres connection string. Nothing changed."; exit 1 }
$env:DATABASE_URL = $url
Push-Location "$root\backend"
try { python -m app.manage @args } finally { Pop-Location; Remove-Item Env:\DATABASE_URL }
