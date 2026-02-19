# Run these commands in the SAME folder you showed:
#   C:\Users\Valdemir Goncalves\Desktop\Projetos-2026\hotelplanner-agent-kimi
# This will create setup.ps1 right there, then run it.

$ErrorActionPreference = "Stop"

$here = Get-Location
$setupPath = Join-Path $here "setup.ps1"

@'
# setup.ps1 (auto-created)
Write-Host "✅ setup.ps1 is running from: $PSScriptRoot" -ForegroundColor Green

if (!(Test-Path "$PSScriptRoot\server\package.json")) { throw "Missing server\package.json" }
if (!(Test-Path "$PSScriptRoot\client\package.json")) { throw "Missing client\package.json" }

Write-Host "`nInstalling server deps..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot\server"
npm i
Pop-Location

Write-Host "`nInstalling client deps..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot\client"
npm i
Pop-Location

Write-Host "`n✅ Done. Next:" -ForegroundColor Yellow
Write-Host "1) Copy server\.env.example -> server\.env and fill NVIDIA_API_KEY + GAS settings"
Write-Host "2) Copy your Excel into: $PSScriptRoot\server\data\Service Matrix's 2026 Voice and Tickets.xlsx"
Write-Host "3) Start server:  cd server; npm run dev"
Write-Host "4) Start client:  cd ..\client; npm run dev"
'@ | Set-Content -Encoding UTF8 $setupPath

Write-Host "Created: $setupPath" -ForegroundColor Green
powershell -ExecutionPolicy Bypass -File $setupPath
