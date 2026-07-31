#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKER="$ROOT_DIR/.adipometry-foundation-v2-${GITHUB_RUN_ID:-local}-${GITHUB_SHA:-working-tree}.ok"
TMP_DIR="$(mktemp -d)"
PATCHED_FIXTURE="$TMP_DIR/verify-adipometry-foundation-v2.sh"
trap 'rm -rf "$TMP_DIR"' EXIT

# The historical v2 fixture predates persistence-level hash enforcement and
# used a syntactically valid placeholder SHA. Execute the same scenario from a
# temporary copy with the canonical database hash, while the dedicated
# governance control keeps proving that an unrelated 64-character SHA is
# rejected at the persistence boundary.
cp "$ROOT_DIR/scripts/verify-adipometry-foundation-v2.sh" "$PATCHED_FIXTURE"
python3 - "$PATCHED_FIXTURE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
old = """  'Responsável clínico R2', 'CREF-R2-0001', repeat('a', 64),
  protocol.\"definitionSnapshot\", CURRENT_TIMESTAMP
"""
new = """  'Responsável clínico R2', 'CREF-R2-0001',
  \"buildAdipometrySpecificationHash\"(
    protocol.code, protocol.version, protocol.reference, protocol.\"definitionSnapshot\"
  ),
  protocol.\"definitionSnapshot\", CURRENT_TIMESTAMP
"""
if text.count(old) != 1:
    raise SystemExit('canonical approval fixture marker not found exactly once')
path.write_text(text.replace(old, new))
PY

bash -n "$PATCHED_FIXTURE"
bash "$PATCHED_FIXTURE"
bash "$ROOT_DIR/scripts/verify-adipometry-protocol-validator.sh"
bash "$ROOT_DIR/scripts/verify-adipometry-demographic-provenance.sh"
printf '%s\n' "${GITHUB_SHA:-working-tree}" > "$MARKER"
echo "adipometry foundation compatibility gate OK"
