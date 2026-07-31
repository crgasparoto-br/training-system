#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKER="$ROOT_DIR/.adipometry-foundation-v2-${GITHUB_RUN_ID:-local}-${GITHUB_SHA:-working-tree}.ok"

bash "$ROOT_DIR/scripts/verify-adipometry-foundation-v2.sh"
bash "$ROOT_DIR/scripts/verify-adipometry-protocol-validator.sh"
bash "$ROOT_DIR/scripts/verify-adipometry-demographic-provenance.sh"
printf '%s\n' "${GITHUB_SHA:-working-tree}" > "$MARKER"
echo "adipometry foundation compatibility gate OK"
