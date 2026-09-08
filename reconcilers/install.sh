#!/usr/bin/env bash
# Installs The Reconcilers into the CURRENT directory's .claude folder (project-scoped).
# Run from the folder that holds the product you want audited:
#   bash <path-to-bundle>/install.sh
set -euo pipefail
bundle="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target="$(pwd)"
mkdir -p "$target/.claude/agents" "$target/.claude/skills/reconcilers"
cp "$bundle"/agents/*.md "$target/.claude/agents/"
cp "$bundle/SKILL.md" "$target/.claude/skills/reconcilers/SKILL.md"
cat <<EOF

  THE RECONCILERS are on call in $target
  Ten agents in .claude/agents, the skill in .claude/skills/reconcilers.

  Start Claude Code here and type:  /reconcilers
  Same Bat-time. Same Bat-channel.

EOF
