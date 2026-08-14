#!/usr/bin/env bash
# Scaffold a plan folder: plan.md from the template, steps.md empty.
#
#   new-plan.sh <feature>              -> .claude/plans/<feature>/
#   new-plan.sh <feature> <chunk>      -> .claude/plans/<feature>/<chunk>/
#
# Refuses if the target already exists. Ask the user what to do; do not
# overwrite a plan on your own judgement.
set -euo pipefail

usage() {
  echo "usage: new-plan.sh <feature-slug> [chunk-slug]" >&2
  echo "  new-plan.sh toolkit                 -> .claude/plans/toolkit/" >&2
  echo "  new-plan.sh toolkit 01-foundation   -> .claude/plans/toolkit/01-foundation/" >&2
  exit 64
}

[ $# -ge 1 ] && [ $# -le 2 ] || usage

slug_ok() {
  case "$1" in
    ''|*[!a-z0-9-]*) return 1 ;;
    -*|*-) return 1 ;;
    *) return 0 ;;
  esac
}

feature=$1
chunk=${2:-}

slug_ok "$feature" || {
  echo "error: '$feature' is not a slug (lowercase, digits, single dashes)" >&2
  exit 64
}
if [ -n "$chunk" ]; then
  slug_ok "$chunk" || {
    echo "error: '$chunk' is not a slug (lowercase, digits, single dashes)" >&2
    exit 64
  }
fi

root=${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || true)}
[ -n "$root" ] || {
  echo "error: not in a git repo and CLAUDE_PROJECT_DIR is unset" >&2
  exit 69
}

template="$root/.claude/skills/planner/templates/plan.md"
[ -f "$template" ] || {
  echo "error: template missing at $template" >&2
  exit 69
}

dir="$root/.claude/plans/$feature"
[ -n "$chunk" ] && dir="$dir/$chunk"

if [ -e "$dir/plan.md" ] || [ -e "$dir/steps.md" ]; then
  echo "error: a plan already exists at $dir" >&2
  echo "Ask the user: overwrite it, or pick a different name?" >&2
  exit 73
fi

# Splitting an existing flat plan is a move, not a fresh scaffold.
if [ -n "$chunk" ] && [ -e "$root/.claude/plans/$feature/plan.md" ]; then
  echo "error: $feature already holds a flat plan.md" >&2
  echo "Splitting means moving those files into a chunk folder first," >&2
  echo "then fixing the links. Ask the user before restructuring." >&2
  exit 73
fi

mkdir -p "$dir"
cp "$template" "$dir/plan.md"
: > "$dir/steps.md"

echo "$dir/plan.md"
echo "$dir/steps.md"
