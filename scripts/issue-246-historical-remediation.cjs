const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const PATCH_COMMIT = 'aa9b57c55dd3a5f99e5f7d3a8d3772a85885844b';
const WORKFLOW_PATH = '.github/workflows/validate-pr.yml';
const MIGRATION_PATH =
  'apps/api/prisma/migrations/20260730070000_issue_246_adipometry_foundation/migration.sql';
const VERIFIER_PATH = 'scripts/verify-adipometry-foundation.sh';

function replaceExactlyOnce(content, before, after, label) {
  const variants = [...new Set([before, before.replaceAll('"', '\\"')])];
  const matches = variants
    .map((candidate) => ({
      candidate,
      count: content.split(candidate).length - 1,
    }))
    .filter(({ count }) => count > 0);
  const total = matches.reduce((sum, match) => sum + match.count, 0);
  if (total !== 1) {
    throw new Error(`${label}: expected one anchor, found ${total}`);
  }
  return content.replace(matches[0].candidate, after);
}

function replaceRange(content, startAnchor, endAnchor, replacement, label) {
  const start = content.indexOf(startAnchor);
  const endStart = content.indexOf(endAnchor, start + startAnchor.length);
  if (start < 0 || endStart < 0) {
    throw new Error(`${label}: range anchors not found`);
  }
  const end = endStart + endAnchor.length;
  return content.slice(0, start) + replacement + content.slice(end);
}

function recoverAndRunBasePatch() {
  const workflow = execFileSync(
    'git',
    ['show', `${PATCH_COMMIT}:${WORKFLOW_PATH}`],
    { encoding: 'utf8' },
  );
  const startToken = "          node <<'NODE'\n";
  const endToken = '\n          NODE\n';
  const start = workflow.indexOf(startToken);
  const end = workflow.indexOf(endToken, start + startToken.length);
  if (start < 0 || end < 0) {
    throw new Error('historical patch heredoc not found');
  }

  let patch = workflow
    .slice(start + startToken.length, end)
    .split('\n')
    .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n');

  const oldHelper = `function replaceOnce(path, before, after, label) {
  const content = fs.readFileSync(path, 'utf8');
  const count = content.split(before).length - 1;
  if (count !== 1) {
    throw new Error(\`${'${label}'}: expected one anchor, found ${'${count}'}\`);
  }
  fs.writeFileSync(path, content.replace(before, after));
}`;
  const newHelper = `function replaceOnce(path, before, after, label) {
  const content = fs.readFileSync(path, 'utf8');
  const variants = [...new Set([before, before.replaceAll('"', '\\\\"')])];
  const matches = variants
    .map((candidate) => ({ candidate, count: content.split(candidate).length - 1 }))
    .filter(({ count }) => count > 0);
  const total = matches.reduce((sum, match) => sum + match.count, 0);
  if (total !== 1) {
    throw new Error(\`${'${label}'}: expected one anchor, found ${'${total}'}\`);
  }
  fs.writeFileSync(path, content.replace(matches[0].candidate, after));
}`;
  patch = replaceExactlyOnce(
    patch,
    oldHelper,
    newHelper,
    'base patch replaceOnce helper',
  );

  const tempPatch = '/tmp/issue-246-historical-base-patch.cjs';
  fs.writeFileSync(tempPatch, patch);
  execFileSync(process.execPath, [tempPatch], { stdio: 'inherit' });
}

function normalizeMigration() {
  let migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const start = migration.indexOf(
    'CREATE OR REPLACE FUNCTION protect_approved_adipometry_protocol_version()',
  );
  const end = migration.indexOf(
    'CREATE OR REPLACE FUNCTION protect_completed_adipometry_assessment()',
    start,
  );
  if (start < 0 || end < 0) {
    throw new Error('approved protocol guard function block not found');
  }
  let block = migration.slice(start, end);
  block = block
    .replace(/AS \$+\n/, 'AS $$$$\n')
    .replace(/\n\$+;\n/, '\n$$$$;\n');
  if (!block.includes('AS $$\n') || !block.includes('\n$$;\n')) {
    throw new Error('migration PL/pgSQL delimiters were not normalized');
  }
  migration = migration.slice(0, start) + block + migration.slice(end);
  fs.writeFileSync(MIGRATION_PATH, migration);
}

function normalizeVerifier() {
  let verifier = fs.readFileSync(VERIFIER_PATH, 'utf8');

  const helperStart = verifier.indexOf(
    'CREATE OR REPLACE FUNCTION issue246_snapshot(',
  );
  const helperEnd = verifier.indexOf(
    '\nSQL\npsql_run -f /work/setup.sql',
    helperStart,
  );
  if (helperStart < 0 || helperEnd < 0) {
    throw new Error('snapshot helper block not found');
  }
  let helper = verifier.slice(helperStart, helperEnd);
  helper = replaceExactlyOnce(
    helper,
    'p_assessment_date TIMESTAMP,',
    'p_assessment_date TIMESTAMPTZ,',
    'snapshot timestamp type',
  );
  helper = helper
    .replace(/AS \\?\$+\n/, 'AS $$$$\n')
    .replace(/\n\\?\$+;\n?$/, '\n$$$$;');
  if (!helper.includes('AS $$\n') || !helper.endsWith('$$;')) {
    throw new Error('snapshot helper SQL delimiters were not normalized');
  }
  verifier =
    verifier.slice(0, helperStart) + helper + verifier.slice(helperEnd);

  const protocolControls = String.raw`cat > "$TMP_DIR/approved-protocol-update.sql" <<'SQL'
UPDATE "AdipometryProtocolVersion"
SET "name" = 'mutated'
WHERE "id" = 'issue246-protocol-approved';
SQL
if psql_run -f /work/approved-protocol-update.sql >"$TMP_DIR/failure.out" 2>&1; then
  echo "Expected failure did not occur: approved protocol update" >&2
  cat "$TMP_DIR/failure.out" >&2
  exit 1
fi
grep -q 'ADIPOMETRY_APPROVED_PROTOCOL_IMMUTABLE' "$TMP_DIR/failure.out"
echo "negative-control OK: approved protocol update"

cat > "$TMP_DIR/approved-protocol-delete.sql" <<'SQL'
DELETE FROM "AdipometryProtocolVersion"
WHERE "id" = 'issue246-protocol-approved';
SQL
if psql_run -f /work/approved-protocol-delete.sql >"$TMP_DIR/failure.out" 2>&1; then
  echo "Expected failure did not occur: approved protocol delete" >&2
  cat "$TMP_DIR/failure.out" >&2
  exit 1
fi
grep -q 'ADIPOMETRY_APPROVED_PROTOCOL_IMMUTABLE' "$TMP_DIR/failure.out"
echo "negative-control OK: approved protocol delete"`;
  verifier = replaceRange(
    verifier,
    'expect_failure "approved protocol update"',
    "expect_failure \"approved protocol delete\" \"DELETE FROM \"AdipometryProtocolVersion\" WHERE \"id\" = 'issue246-protocol-approved';\"",
    protocolControls,
    'approved protocol controls',
  );

  const historicalControls = String.raw`echo "positive-control OK: completed assessment with approved protocol"

cat > "$TMP_DIR/snapshot-mismatch.sql" <<'SQL'
BEGIN;
WITH reserved AS (
  SELECT * FROM reserve_adipometry_code('issue246-contract-a', 'issue246-aluno-a1')
)
INSERT INTO "AdipometryAssessment" (
  "id", "contractId", "alunoId", "professorId", "code", "sequenceNumber", "assessmentDate", "status",
  "weightKg", "tricepsMm", "subscapularMm", "suprailiacMm", "abdominalMm", "thighMm", "sumSkinfoldsMm",
  "bodyFatPercentage", "fatMassKg", "leanMassKg", "protocolCode", "protocolVersion", "calculationSnapshot", "createdAt", "updatedAt"
)
SELECT
  'issue246-snapshot-mismatch', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a',
  "code", "sequenceNumber", CURRENT_TIMESTAMP, 'COMPLETED',
  70, 10, 10, 10, 10, 10, 50, 20, 14, 56,
  'ISSUE246-TEST', '1.0-test',
  issue246_snapshot(
    'ISSUE246-TEST', '1.0-test', CURRENT_TIMESTAMP,
    70, 10, 10, 10, 10, 10, 50, 21, 14, 56
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM reserved;
COMMIT;
SQL
if psql_run -f /work/snapshot-mismatch.sql >"$TMP_DIR/failure.out" 2>&1; then
  echo "Expected failure did not occur: snapshot result differs from persisted result" >&2
  cat "$TMP_DIR/failure.out" >&2
  exit 1
fi
grep -q 'AdipometryAssessment_completion_check' "$TMP_DIR/failure.out"
echo "negative-control OK: snapshot result differs from persisted result"

cat > "$TMP_DIR/historical-version.sql" <<'SQL'
INSERT INTO "AdipometryProtocolVersion" (
  "id", "code", "name", "version", "status", "reference", "populationCriteria",
  "requiredSkinfolds", "inputUnits", "outputUnits", "equations", "limits", "precisionRules",
  "missingDataBehavior", "testVectors", "approvedAt", "approvedBy", "createdAt", "updatedAt"
)
SELECT
  'issue246-protocol-approved-v2', "code", "name", '2.0-test', "status", "reference", "populationCriteria",
  "requiredSkinfolds", "inputUnits", "outputUnits", '["fixture-v2"]'::jsonb, "limits", "precisionRules",
  "missingDataBehavior", "testVectors", CURRENT_TIMESTAMP, "approvedBy", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AdipometryProtocolVersion"
WHERE "id" = 'issue246-protocol-approved';

DO $$
BEGIN
  IF (
    SELECT "protocolVersion"
    FROM "AdipometryAssessment"
    WHERE "id" = 'issue246-completed'
  ) <> '1.0-test' THEN
    RAISE EXCEPTION 'historical protocol version changed';
  END IF;
  IF (
    SELECT "calculationSnapshot" #>> '{protocol,version}'
    FROM "AdipometryAssessment"
    WHERE "id" = 'issue246-completed'
  ) <> '1.0-test' THEN
    RAISE EXCEPTION 'historical snapshot changed';
  END IF;
END $$;
SQL
psql_run -f /work/historical-version.sql
echo "positive-control OK: new protocol version preserves historical snapshot"`;
  verifier = replaceRange(
    verifier,
    'echo "positive-control OK: completed assessment with approved protocol"',
    'echo "positive-control OK: new protocol version preserves historical snapshot"',
    historicalControls,
    'historical integrity controls',
  );

  fs.writeFileSync(VERIFIER_PATH, verifier);
}

recoverAndRunBasePatch();
normalizeMigration();
normalizeVerifier();
