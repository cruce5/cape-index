# Installs The Reconcilers into the CURRENT directory.
# Usage: & "<path-to-bundle>\install.ps1" [-Platform claude|codex]
#   default: claude (copies to .claude\skills and .claude\agents)
#   codex:   copies adapters\codex\AGENTS.md to AGENTS.md at the current directory
param(
  [ValidateSet("claude","codex")]
  [string]$Platform = "claude"
)
$ErrorActionPreference = "Stop"
$bundle = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Get-Location

switch ($Platform) {
  "claude" {
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
  }
  "codex" {
    $agents = Join-Path $target "AGENTS.md"
    $backup = Join-Path $target "AGENTS.md.bak"
    if ((Test-Path $agents) -and -not (Test-Path $backup)) {
      Copy-Item $agents $backup -Force
      Write-Host "  Backed up existing AGENTS.md to AGENTS.md.bak"
    }
    Copy-Item -Path (Join-Path $bundle "adapters\codex\AGENTS.md") -Destination $agents -Force
    Write-Host ""
    Write-Host "  THE RECONCILERS are on call in $target (Codex adapter)"
    Write-Host "  AGENTS.md dropped at the repo root; Codex reads it on startup."
    Write-Host ""
    Write-Host "  Start Codex here and say:  run the Reconcilers episode against this repo"
    Write-Host "  Same Bat-time. Same Bat-channel."
    Write-Host ""
  }
}
