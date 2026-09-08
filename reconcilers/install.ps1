# Installs The Reconcilers into the CURRENT directory's .claude folder (project-scoped).
# Run from the folder that holds the product you want audited:
#   & "<path-to-bundle>\install.ps1"
$ErrorActionPreference = "Stop"
$bundle = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Get-Location
New-Item -ItemType Directory -Force -Path (Join-Path $target ".claude\agents") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $target ".claude\skills\reconcilers") | Out-Null
Copy-Item -Path (Join-Path $bundle "agents\*.md") -Destination (Join-Path $target ".claude\agents") -Force
Copy-Item -Path (Join-Path $bundle "SKILL.md") -Destination (Join-Path $target ".claude\skills\reconcilers\SKILL.md") -Force
Write-Host ""
Write-Host "  THE RECONCILERS are on call in $target"
Write-Host "  Ten agents in .claude\agents, the skill in .claude\skills\reconcilers."
Write-Host ""
Write-Host "  Start Claude Code here and type:  /reconcilers"
Write-Host "  Same Bat-time. Same Bat-channel."
Write-Host ""
