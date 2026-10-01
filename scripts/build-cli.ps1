Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Push-Location "$PSScriptRoot\..\cli"
npm install
npm run build
Pop-Location
