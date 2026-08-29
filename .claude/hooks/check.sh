#!/bin/bash
# Runs the app's checks when Claude finishes a turn, and says plainly whether
# they passed. Purely informative -- it never blocks and never sends Claude
# back round, because a hook that argues with Claude can loop and each loop
# costs money. The hard gate is .githooks/pre-push, which refuses the push.
#
# Output is one line of JSON, which is how a hook talks to the app.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
[ -f package.json ] || exit 0

out=$(npm test 2>&1)
if [ $? -eq 0 ]; then
  n=$(printf '%s' "$out" | awk -F'[ ,]' '/passed,/{s+=$1} END{print s+0}')
  msg="✅ All checks passed ($n) — safe to push."
else
  first=$(printf '%s' "$out" | grep -m1 -E "FAIL|app script threw" | sed 's/^ *//' | cut -c1-160)
  msg="❌ CHECKS FAILED — do not push yet. First failure: ${first:-see npm test}"
fi
printf '{"systemMessage":%s,"suppressOutput":true}\n' "$(printf '%s' "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
