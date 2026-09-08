#!/usr/bin/env bash
# Installs The Reconcilers into the CURRENT directory.
# Usage: bash <path-to-bundle>/install.sh [--platform claude|codex]
#   default: claude (copies to .claude/skills and .claude/agents)
#   codex:   copies adapters/codex/AGENTS.md to AGENTS.md at the current directory
set -euo pipefail

platform="claude"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) platform="$2"; shift 2 ;;
    --platform=*) platform="${1#*=}"; shift ;;
    -h|--help) sed -n '3,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

bundle="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target="$(pwd)"

case "$platform" in
  claude)
    mkdir -p "$target/.claude/agents" "$target/.claude/skills/reconcilers"
    cp "$bundle"/agents/*.md "$target/.claude/agents/"
    cp "$bundle/SKILL.md" "$target/.claude/skills/reconcilers/SKILL.md"
    cat <<EOF

  THE RECONCILERS are on call in $target
  Ten agents in .claude/agents, the skill in .claude/skills/reconcilers.

  Start Claude Code here and type:  /reconcilers
  Same Bat-time. Same Bat-channel.

EOF
    ;;
  codex)
    if [[ -e "$target/AGENTS.md" && ! -e "$target/AGENTS.md.bak" ]]; then
      cp "$target/AGENTS.md" "$target/AGENTS.md.bak"
      echo "  Backed up existing AGENTS.md to AGENTS.md.bak"
    fi
    cp "$bundle/adapters/codex/AGENTS.md" "$target/AGENTS.md"
    cat <<EOF

  THE RECONCILERS are on call in $target (Codex adapter)
  AGENTS.md dropped at the repo root; Codex reads it on startup.

  Start Codex here and say:  run the Reconcilers episode against this repo
  Same Bat-time. Same Bat-channel.

EOF
    ;;
  *)
    echo "unknown platform: $platform (use 'claude' or 'codex')" >&2
    exit 2
    ;;
esac
