# Weekly data refresh for The Cape Index.
#
# Re-scrapes only the films that could still be moving (releases < ~10 months old,
# plus anything not yet out), re-derives the dataset, rebuilds the single HTML
# file + OG image, and deploys to Cloudflare. Older films stay frozen.
#
# Run it by hand first to confirm it works, then point Windows Task Scheduler at it.
#
#   powershell -ExecutionPolicy Bypass -File scripts\weekly-rebuild.ps1
#
# Switches:
#   -SkipDeploy   rebuild locally but don't push to Cloudflare
#   -Commit       also commit the refreshed data/*.json and push to origin/main
#                 (the registered Task Scheduler job passes this)
#   -BomDelay N   ms between Box Office Mojo requests (default 4000)

param(
  [switch]$SkipDeploy,
  [switch]$Commit,
  [int]$BomDelay = 4000
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$logDir = Join-Path $repo "scripts"
$log = Join-Path $logDir "weekly-rebuild.log"
function Say($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding utf8
}

Say "=== weekly rebuild start ==="

# Local secrets (OMDb key). Not committed. Copy scripts/local.env.example.ps1 to
# scripts/local.env.ps1 and fill it in, or set $env:OMDB_KEY yourself before running.
$secrets = Join-Path $PSScriptRoot "local.env.ps1"
if (Test-Path $secrets) { . $secrets }
if (-not $env:OMDB_KEY) { throw "OMDB_KEY not set. Create scripts/local.env.ps1 from the .example file." }
$env:BOM_REFRESH = "1"
$env:BOM_DELAY = "$BomDelay"

# film count before, so we can flag if a held-out film just went live
$before = (node -e "console.log(require('./data/films.json').films.length)").Trim()
Say "films before: $before"

# run a command, streaming each output line to both the console and the log
function Run($label, $block) {
  Say $label
  & $block 2>&1 | ForEach-Object {
    $s = "$_"
    Write-Host $s
    Add-Content -Path $log -Value $s -Encoding utf8
  }
  if ($LASTEXITCODE -ne 0) { throw "$label exited $LASTEXITCODE" }
}

try {
  Run "scrape:bom (refresh mode)" { npm run --silent scrape:bom }
  Run "data pipeline"             { npm run --silent data }

  $after = (node -e "console.log(require('./data/films.json').films.length)").Trim()
  Say "films after: $after"
  if ($after -ne $before) {
    Say "NOTE: film count changed ($before -> $after). Run 'npm run cast' to refresh the roster, then rebuild."
  }

  Run "build" { npm run --silent build }
}
catch {
  Say "FAILED before deploy: $_"
  Say "=== weekly rebuild aborted (nothing deployed) ==="
  exit 1
}

if (-not $SkipDeploy) {
  try {
    Run "wrangler deploy" { npx --yes wrangler deploy }
    Say "deployed"
  }
  catch {
    Say "DEPLOY FAILED: $_"
    exit 1
  }
} else {
  Say "skip deploy (-SkipDeploy)"
}

if ($Commit) {
  git add data 2>$null
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    $stamp = Get-Date -Format "yyyy-MM-dd"
    git commit -m "Weekly data refresh $stamp" | Out-Null
    Say "committed refreshed data (Weekly data refresh $stamp)"
    git push origin main 2>&1 | ForEach-Object { $s = "$_"; Write-Host $s; Add-Content -Path $log -Value $s -Encoding utf8 }
    if ($LASTEXITCODE -eq 0) { Say "pushed to origin/main" } else { Say "WARNING: git push failed (commit is local only) - push it by hand" }
  } else {
    git reset -q
    Say "no data changes to commit"
  }
} else {
  Say "commit skipped (pass -Commit to also record the refresh in git)"
}

Say "=== weekly rebuild done ==="
