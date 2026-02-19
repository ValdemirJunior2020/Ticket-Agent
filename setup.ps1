# setup.ps1 (auto-created)
Write-Host "âœ… setup.ps1 is running from: $PSScriptRoot" -ForegroundColor Green

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

Write-Host "`nâœ… Done. Next:" -ForegroundColor Yellow
Write-Host "1) Copy server\.env.example -> server\.env and fill NVIDIA_API_KEY + GAS settings"
Write-Host "2) Copy your Excel into: $PSScriptRoot\server\data\Service Matrix's 2026 Voice and Tickets.xlsx"
Write-Host "3) Start server:  cd server; npm run dev"
Write-Host "4) Start client:  cd ..\client; npm run dev"
