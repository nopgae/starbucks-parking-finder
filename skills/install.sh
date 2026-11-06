#!/bin/sh
# Installs (or updates) the starbucks-parking skill for Claude Code (~/.claude/skills) and Codex (~/.agents/skills).
set -e
src="$(cd "$(dirname "$0")" && pwd)/starbucks-parking"
for dir in "$HOME/.claude/skills" "$HOME/.agents/skills"; do
  mkdir -p "$dir"
  rm -rf "$dir/starbucks-parking"
  cp -R "$src" "$dir/starbucks-parking"
  echo "installed: $dir/starbucks-parking"
done
