#!/usr/bin/env bash
set -euo pipefail

python3 scripts/issue-136-angular-detail-patch.py
rm -f \
  .audit/issue-loop-engineer/issue-136/angular-detail-trigger.json \
  .github/workflows/issue-136-angular-detail-patch.yml \
  scripts/issue-136-angular-detail-patch.py \
  scripts/issue-136-angular-detail-patch.sh

git add -A
git diff --cached --check
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git commit -m 'fix(issue-136): restrict derived assessment values to angles'
git push origin HEAD:fix/136-capacity-prescription-persistence
