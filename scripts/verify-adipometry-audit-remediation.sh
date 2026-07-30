#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKER="$ROOT_DIR/.adipometry-foundation-v2-${GITHUB_RUN_ID:-local}-${GITHUB_SHA:-working-tree}.ok"

if [[ -f "$MARKER" ]] && grep -qx "${GITHUB_SHA:-working-tree}" "$MARKER"; then
  echo "adipometry audit remediation controls reused from the v2 gate for the same SHA"
  exit 0
fi

bash "$ROOT_DIR/scripts/verify-adipometry-foundation-v2.sh"
echo "adipometry audit remediation compatibility gate OK"
