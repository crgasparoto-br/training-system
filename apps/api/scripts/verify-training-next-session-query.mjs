/**
 * Prova nextSession no PostgreSQL migrado, usando o SQL real da API.
 * As fixtures só vivem em tabelas temporárias dentro de uma transação revertida.
 */
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/modules/workout/training-routine.service.ts', import.meta.url), 'utf8');
const anchor = 'const upcoming = await client.$queryRaw';
const at = source.indexOf(anchor);
if (at < 0 || source.indexOf(anchor, at + anchor.length) >= 0) {
  throw new Error('Expected exactly one canonical nextSession query');
}
const start = source.indexOf('`', at);
const end = source.indexOf('`;', start + 1);
if (start < 0 || end < 0) throw new Error('Missing nextSession SQL template');
const raw = source.slice(start + 1, end);
const placeholders = raw.match(/\$\{[^}]+\}/g) ?? [];
const allowed = new Set(['${query.alunoId}', '${query.contractId}', '${todayStart}']);
if (placeholders.length !== 7 || placeholders.some((value) => !allowed.has(value))) {
  throw new Error('Unexpected nextSession SQL placeholder contract');
}
const sql = raw
  .replaceAll('${query.alunoId}', "'student-a'")
  .replaceAll('${query.contractId}', "'contract-a'")
  .replaceAll('${todayStart}', "TIMESTAMP '2026-10-12 00:00:00'")
  .trim();

function expectSelectedId(expected, label) {
  const literal = expected === null ? 'NULL' : "'"+expected+"'";
  return String.raw`
DO $check$
DECLARE selected_id text;
BEGIN
  SELECT result."sessionId" INTO selected_id FROM (${sql}) AS result;
  IF selected_id IS DISTINCT FROM ${literal} THEN
    RAISE EXCEPTION '${label}: expected %, got %', ${literal}, selected_id;
  END IF;
END
$check$;
`;
}

process.stdout.write(String.raw`
BEGIN;
-- Validates real table and column names on the already migrated PostgreSQL.
EXPLAIN ${sql};

-- Session-scoped fixtures shadow public tables only for this connection.
CREATE TEMP TABLE "WorkoutDay" ("id" text, "templateId" text, "workoutDate" timestamp);
CREATE TEMP TABLE "WorkoutTemplate" ("id" text, "planId" text, "released" boolean);
CREATE TEMP TABLE "TrainingPlan" ("id" text, "alunoId" text);
CREATE TEMP TABLE "Aluno" ("id" text, "contractId" text);
CREATE TEMP TABLE "ConsolidatedPrescriptionOperationalRelease" (
  "workoutTemplateId" text, "alunoId" text, "contractId" text
);
CREATE TEMP TABLE "WorkoutSessionExecution" (
  "workoutDayId" text, "alunoId" text, "contractId" text, "status" text
);
INSERT INTO "Aluno" VALUES ('student-a','contract-a'),('student-b','contract-b');
INSERT INTO "TrainingPlan" VALUES ('plan-a','student-a'),('plan-b','student-b');
INSERT INTO "WorkoutTemplate" VALUES
  ('tpl-approved','plan-a',true),
  ('tpl-not-released','plan-a',false),
  ('tpl-no-release','plan-a',true),
  ('tpl-wrong-contract','plan-a',true),
  ('tpl-other-student','plan-b',true);
INSERT INTO "WorkoutDay" VALUES
  ('old','tpl-approved','2026-10-10'),
  ('terminal','tpl-approved','2026-10-13'),
  ('not-released','tpl-not-released','2026-10-13'),
  ('no-release','tpl-no-release','2026-10-13'),
  ('cross-contract','tpl-wrong-contract','2026-10-13'),
  ('foreign-student','tpl-other-student','2026-10-13'),
  ('next-approved','tpl-approved','2026-11-03');
INSERT INTO "ConsolidatedPrescriptionOperationalRelease" VALUES
  ('tpl-approved','student-a','contract-a'),
  ('tpl-not-released','student-a','contract-a'),
  ('tpl-wrong-contract','student-a','contract-b'),
  ('tpl-other-student','student-b','contract-b');
INSERT INTO "WorkoutSessionExecution" VALUES
  ('terminal','student-a','contract-a','completed');
`);
process.stdout.write(expectSelectedId('next-approved', 'approved cross-week future session'));
process.stdout.write(String.raw`
INSERT INTO "WorkoutSessionExecution" VALUES ('next-approved','student-a','contract-a','completed');
`);
process.stdout.write(expectSelectedId(null, 'no next when every future approved session is terminal'));
process.stdout.write(String.raw`
DELETE FROM "WorkoutSessionExecution" WHERE "workoutDayId"='next-approved';
DELETE FROM "ConsolidatedPrescriptionOperationalRelease" WHERE "workoutTemplateId"='tpl-approved';
`);
process.stdout.write(expectSelectedId(null, 'no next without matching consolidated release'));
process.stdout.write('ROLLBACK;\n');


// Reuse the exact production lastExecution SQL. No independent shadow query is accepted.
const lastAnchor = 'const latestExecution = await client.$queryRaw';
const lastAt = source.indexOf(lastAnchor);
if (lastAt < 0 || source.indexOf(lastAnchor, lastAt + lastAnchor.length) >= 0) {
  throw new Error('Expected exactly one canonical lastExecution query');
}
const lastStart = source.indexOf('`', lastAt);
const lastEnd = source.indexOf('`;', lastStart + 1);
if (lastStart < 0 || lastEnd < 0) throw new Error('Missing lastExecution SQL template');
const lastRaw = source.slice(lastStart + 1, lastEnd);
const lastPlaceholders = lastRaw.match(/\$\{[^}]+\}/g) ?? [];
const lastAllowed = new Set(['${query.alunoId}', '${query.contractId}']);
if (lastPlaceholders.length !== 4 || lastPlaceholders.some((value) => !lastAllowed.has(value))) {
  throw new Error('Unexpected lastExecution SQL placeholder contract');
}
const lastSql = lastRaw
  .replaceAll('${query.alunoId}', "'student-a'")
  .replaceAll('${query.contractId}', "'contract-a'")
  .trim();

function expectLastExecutionId(expected, label) {
  const literal = expected === null ? 'NULL' : "'" + expected + "'";
  return String.raw`
DO $check$
DECLARE selected_id text;
BEGIN
  SELECT result."sessionId" INTO selected_id FROM (${lastSql}) AS result;
  IF selected_id IS DISTINCT FROM ${literal} THEN
    RAISE EXCEPTION '${label}: expected %, got %', ${literal}, selected_id;
  END IF;
END
$check$;
`;
}

// An independent transaction keeps the previous nextSession fixture unchanged.
process.stdout.write(String.raw`
BEGIN;
-- The real migrated schema must parse the exact lastExecution SQL.
EXPLAIN ${lastSql};

CREATE TEMP TABLE "WorkoutDay" ("id" text, "templateId" text, "workoutDate" timestamp);
CREATE TEMP TABLE "WorkoutTemplate" ("id" text, "planId" text, "released" boolean);
CREATE TEMP TABLE "TrainingPlan" ("id" text, "alunoId" text);
CREATE TEMP TABLE "Aluno" ("id" text, "contractId" text);
CREATE TEMP TABLE "ConsolidatedPrescriptionOperationalRelease" (
  "id" text, "workoutTemplateId" text, "alunoId" text, "contractId" text
);
CREATE TEMP TABLE "WorkoutSessionExecution" (
  "id" text, "workoutDayId" text, "alunoId" text, "contractId" text,
  "originReleaseId" text, "status" text, "finishedAt" timestamp, "updatedAt" timestamp
);
INSERT INTO "Aluno" VALUES ('student-a','contract-a'),('student-b','contract-b');
INSERT INTO "TrainingPlan" VALUES ('plan-a','student-a'),('plan-b','student-b');
INSERT INTO "WorkoutTemplate" VALUES
  ('tpl-approved','plan-a',true),
  ('tpl-not-released','plan-a',false),
  ('tpl-no-release','plan-a',true),
  ('tpl-wrong-contract','plan-a',true),
  ('tpl-foreign','plan-b',true);
INSERT INTO "WorkoutDay" VALUES
  ('old-valid','tpl-approved','2026-09-01'),
  ('new-valid','tpl-approved','2026-10-11'),
  ('unreleased','tpl-not-released','2026-10-12'),
  ('orphan','tpl-no-release','2026-10-12'),
  ('wrong-contract','tpl-wrong-contract','2026-10-12'),
  ('foreign','tpl-foreign','2026-10-12'),
  ('in-progress','tpl-approved','2026-10-13'),
  ('wrong-template','tpl-no-release','2026-10-14');
INSERT INTO "ConsolidatedPrescriptionOperationalRelease" VALUES
  ('release-good','tpl-approved','student-a','contract-a'),
  ('release-unreleased','tpl-not-released','student-a','contract-a'),
  ('release-other-contract','tpl-wrong-contract','student-a','contract-b'),
  ('release-foreign','tpl-foreign','student-b','contract-b');
INSERT INTO "WorkoutSessionExecution" VALUES
  ('exec-old','old-valid','student-a','contract-a','release-good','completed','2026-09-01 12:00','2026-09-01 12:00'),
  ('exec-new','new-valid','student-a','contract-a','release-good','partial','2026-10-11 12:00','2026-10-11 12:00'),
  ('exec-unreleased','unreleased','student-a','contract-a','release-unreleased','completed','2026-10-12 14:00','2026-10-12 14:00'),
  ('exec-orphan','orphan','student-a','contract-a','release-deleted','completed','2026-10-12 14:00','2026-10-12 14:00'),
  ('exec-wrong-contract','wrong-contract','student-a','contract-a','release-other-contract','completed','2026-10-12 14:00','2026-10-12 14:00'),
  ('exec-foreign','foreign','student-b','contract-b','release-foreign','completed','2026-10-12 14:00','2026-10-12 14:00'),
  ('exec-in-progress','in-progress','student-a','contract-a','release-good','in_progress',NULL,'2026-10-13 14:00'),
  ('exec-wrong-template','wrong-template','student-a','contract-a','release-good','completed','2026-10-14 14:00','2026-10-14 14:00');
`);
process.stdout.write(expectLastExecutionId('new-valid', 'most recent released terminal execution'));
process.stdout.write(String.raw`
DELETE FROM "WorkoutSessionExecution" WHERE "id"='exec-new';
`);
process.stdout.write(expectLastExecutionId('old-valid', 'older released execution remains after newer removal'));
process.stdout.write(String.raw`
DELETE FROM "ConsolidatedPrescriptionOperationalRelease" WHERE "id"='release-good';
`);
process.stdout.write(expectLastExecutionId(null, 'no unauthorized execution without matching original release'));
process.stdout.write('ROLLBACK;\n');
