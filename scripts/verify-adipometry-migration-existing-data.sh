#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEGACY_SCRIPT="$ROOT_DIR/scripts/verify-adipometry-migration-existing-data-legacy.sh"
PATCHED_SCRIPT="$(mktemp "$ROOT_DIR/scripts/.verify-adipometry-migration-existing-data.XXXXXX.sh")"

cleanup() {
  rm -f "$PATCHED_SCRIPT"
}
trap cleanup EXIT

awk '
  /^    20260731173000_enforce_adipometry_approval_hash\)$/ {
    print "    20260731173000_enforce_adipometry_approval_hash|\\"
    print "    20260804193000_invalidate_adipometry_capacity_confirmation|\\"
    print "    20260811141500_disable_legacy_adipometry_draft_overloads)"
    next
  }
  /^  20260731173000_enforce_adipometry_approval_hash$/ {
    print "  20260731173000_enforce_adipometry_approval_hash \\"
    print "  20260804193000_invalidate_adipometry_capacity_confirmation \\"
    print "  20260811141500_disable_legacy_adipometry_draft_overloads"
    next
  }
  { print }
' "$LEGACY_SCRIPT" > "$PATCHED_SCRIPT"

bash "$PATCHED_SCRIPT"
