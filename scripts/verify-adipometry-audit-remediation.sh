#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKER="$ROOT_DIR/.adipometry-foundation-v2-${GITHUB_RUN_ID:-local}-${GITHUB_SHA:-working-tree}.ok"

if [[ -f "$MARKER" ]] && grep -qx "${GITHUB_SHA:-working-tree}" "$MARKER"; then
  echo "adipometry audit remediation controls reused from the v2 gate for the same SHA"
else
  bash "$ROOT_DIR/scripts/verify-adipometry-foundation-v2.sh"
fi

bash "$ROOT_DIR/scripts/verify-adipometry-canonical-profile-contract.sh"
bash "$ROOT_DIR/scripts/verify-adipometry-no-textual-maturation-inference.sh"
bash "$ROOT_DIR/scripts/verify-adipometry-clinical-governance.sh"
bash "$ROOT_DIR/scripts/verify-adipometry-governance-audit-findings.sh"
echo "adipometry audit remediation compatibility gate OK"
