#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEGACY_FIXTURE="$ROOT_DIR/scripts/verify-adipometry-persistence-boundaries-legacy.sh"
PATCHED_FIXTURE="$(mktemp "$ROOT_DIR/scripts/.verify-adipometry-persistence-boundaries.XXXXXX.sh")"
trap 'rm -f "$PATCHED_FIXTURE"' EXIT

# Preserve the full historical boundary scenario and adapt only its positive
# fixtures to the current persistence contracts. Dedicated negative controls
# continue to reject unrelated approval hashes and revoked ADPT permissions.
cp "$LEGACY_FIXTURE" "$PATCHED_FIXTURE"
python3 - "$PATCHED_FIXTURE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

old_hash = """  'Boundary clinical responsible', 'CREF-BOUNDARY-246', REPEAT('c', 64),
  protocol.\"definitionSnapshot\", CURRENT_TIMESTAMP
"""
new_hash = """  'Boundary clinical responsible', 'CREF-BOUNDARY-246',
  \"buildAdipometrySpecificationHash\"(
    protocol.code, protocol.version, protocol.reference, protocol.\"definitionSnapshot\"
  ),
  protocol.\"definitionSnapshot\", CURRENT_TIMESTAMP
"""
if text.count(old_hash) != 1:
    raise SystemExit('persistence boundary positive approval hash marker not found exactly once')
text = text.replace(old_hash, new_hash)

permission_marker = """-- Direct assessment INSERT cannot choose the sequence or code.
"""
permission_fixture = """-- The positive cross-contract sequence case uses an ordinary professor in
-- contract B. Make that responsible explicitly eligible for ADPT before the
-- trigger-protected draft is created; revoked permission is tested separately.
INSERT INTO \"AccessPermission\" (
  \"id\", \"collaboratorFunctionId\", \"screenKey\", \"blockKey\", \"canView\",
  \"createdAt\", \"updatedAt\"
) VALUES
  (
    'issue246-boundary-adpt-screen-b', 'issue246-boundary-function-b',
    'physicalAssessment.protocol', '', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'issue246-boundary-adpt-manage-b', 'issue246-boundary-function-b',
    'physicalAssessment.protocol', 'physicalAssessment.adpt.actions.manage',
    TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
ON CONFLICT (\"collaboratorFunctionId\", \"screenKey\", \"blockKey\")
DO UPDATE SET \"canView\" = TRUE, \"updatedAt\" = CURRENT_TIMESTAMP;

-- Direct assessment INSERT cannot choose the sequence or code.
"""
if text.count(permission_marker) != 1:
    raise SystemExit('persistence boundary permission insertion marker not found exactly once')
text = text.replace(permission_marker, permission_fixture)

path.write_text(text)
PY

bash -n "$PATCHED_FIXTURE"
bash "$PATCHED_FIXTURE"
