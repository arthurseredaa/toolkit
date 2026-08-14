#!/usr/bin/env bash
# PostToolUse(Write|Edit): autofix + format, then report leftover lint errors.
set -u

f=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
[ -n "$f" ] || exit 0

case "$f" in
  *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -x ./node_modules/.bin/oxlint ] || exit 0

./node_modules/.bin/oxlint --fix "$f" >/dev/null 2>&1
./node_modules/.bin/oxfmt "$f" >/dev/null 2>&1

if ! out=$(./node_modules/.bin/oxlint "$f" 2>&1); then
  printf '%s\n' "$out" >&2
  exit 2
fi
exit 0
