#!/usr/bin/env bash
set -euo pipefail

python3 scripts/issue-136-ui-assessment-review-patch.py
rm -f \
  .audit/issue-loop-engineer/issue-136/ui-assessment-review-trigger.json \
  scripts/issue-136-ui-assessment-review-patch.py \
  scripts/issue-136-ui-assessment-review-patch.sh

git add -A
git diff --cached --check
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git commit -m 'fix(web): expose assessment angles before versioning'
git push origin HEAD:fix/136-capacity-prescription-persistence
