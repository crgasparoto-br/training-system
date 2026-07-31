#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKER="$ROOT_DIR/.adipometry-foundation-v2-${GITHUB_RUN_ID:-local}-${GITHUB_SHA:-working-tree}.ok"
TMP_DIR="$(mktemp -d)"
PATCHED_PROFILE_GATE="$TMP_DIR/verify-adipometry-canonical-profile-contract.sh"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ -f "$MARKER" ]] && grep -qx "${GITHUB_SHA:-working-tree}" "$MARKER"; then
  echo "adipometry audit remediation controls reused from the v2 gate for the same SHA"
else
  bash "$ROOT_DIR/scripts/verify-adipometry-foundation.sh"
fi

# This historical positive fixture also predates persistence-level hash
# enforcement. Run an isolated copy with the canonical hash. The negative
# governance fixture continues to prove that a fake 64-character SHA is denied.
cp "$ROOT_DIR/scripts/verify-adipometry-canonical-profile-contract.sh" "$PATCHED_PROFILE_GATE"
python3 - "$PATCHED_PROFILE_GATE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
old = "REPEAT('e', 64)"
new = '''"buildAdipometrySpecificationHash"(
    protocol.code, protocol.version, protocol.reference, protocol."definitionSnapshot"
  )'''
if text.count(old) != 1:
    raise SystemExit('canonical profile approval hash marker not found exactly once')
path.write_text(text.replace(old, new))
PY

bash -n "$PATCHED_PROFILE_GATE"
bash "$PATCHED_PROFILE_GATE"
bash "$ROOT_DIR/scripts/verify-adipometry-no-textual-maturation-inference.sh"
bash "$ROOT_DIR/scripts/verify-adipometry-clinical-governance.sh"
bash "$ROOT_DIR/scripts/verify-adipometry-governance-audit-findings.sh"
echo "adipometry audit remediation compatibility gate OK"
