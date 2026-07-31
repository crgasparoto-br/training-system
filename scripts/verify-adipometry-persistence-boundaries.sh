#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEGACY_FIXTURE="$ROOT_DIR/scripts/verify-adipometry-persistence-boundaries-legacy.sh"
PATCHED_FIXTURE="$(mktemp "$ROOT_DIR/scripts/.verify-adipometry-persistence-boundaries.XXXXXX.sh")"
trap 'rm -f "$PATCHED_FIXTURE"' EXIT

# Preserve the full historical boundary scenario and adapt only its positive
# approval row to the persistence-level canonical hash. The dedicated
# governance test continues to submit and reject an unrelated 64-character SHA.
cp "$LEGACY_FIXTURE" "$PATCHED_FIXTURE"
python3 - "$PATCHED_FIXTURE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
old = """  'Boundary clinical responsible', 'CREF-BOUNDARY-246', REPEAT('c', 64),
  protocol.\"definitionSnapshot\", CURRENT_TIMESTAMP
"""
new = """  'Boundary clinical responsible', 'CREF-BOUNDARY-246',
  \"buildAdipometrySpecificationHash\"(
    protocol.code, protocol.version, protocol.reference, protocol.\"definitionSnapshot\"
  ),
  protocol.\"definitionSnapshot\", CURRENT_TIMESTAMP
"""
if text.count(old) != 1:
    raise SystemExit('persistence boundary positive approval hash marker not found exactly once')
path.write_text(text.replace(old, new))
PY

bash -n "$PATCHED_FIXTURE"
bash "$PATCHED_FIXTURE"
