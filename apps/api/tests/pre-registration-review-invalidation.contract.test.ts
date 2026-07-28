import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const migration = readFileSync(
  resolve(
    root,
    'apps/api/prisma/migrations/20260728021500_issue_274_review_invalidation_once/migration.sql'
  ),
  'utf8'
);
const enrollmentService = readFileSync(
  resolve(
    root,
    'apps/api/src/modules/pre-registration-enrollment/pre-registration-enrollment.service.ts'
  ),
  'utf8'
);

describe('issue 274 commercial review invalidation contract', () => {
  it('coordinates Aluno and StudentProfile invalidation once per transaction', () => {
    expect(migration).toContain('invalidate_pre_registration_review_once');
    expect(migration).toContain('current_setting(marker_name, true)');
    expect(migration).toContain("set_config(marker_name, '1', true)");
    expect(migration).toContain(
      'PERFORM "invalidate_pre_registration_review_once"(NEW."id", NEW."contractId")'
    );
    expect(migration).toContain(
      'PERFORM "invalidate_pre_registration_review_once"(NEW."alunoId", NEW."contractId")'
    );
  });

  it('consolidates legacy trigger variants before creating one trigger per projection', () => {
    expect(migration).toContain("trigger_function.proname LIKE 'invalidate_pre_registration_review%'");
    expect(migration).toContain("DROP TRIGGER IF EXISTS %I ON %I.%I");
    expect(migration.match(/CREATE TRIGGER "Aluno_invalidate_pre_registration_review"/g)).toHaveLength(1);
    expect(
      migration.match(/CREATE TRIGGER "StudentProfile_invalidate_pre_registration_review"/g)
    ).toHaveLength(1);
  });

  it('does not depend on an existing reviewedAt value', () => {
    expect(migration).not.toContain('onboarding."reviewedAt" IS NOT NULL');
    expect(migration).toContain(
      "student.\"status\" IN ('PRE_REGISTRATION_COMPLETED', 'READY_FOR_ENROLLMENT')"
    );
    expect(migration).toContain('"version" = "version" + 1');
    expect(migration).toContain('"reviewedAt" = NULL');
    expect(migration).toContain('"reviewedByProfessorId" = NULL');
  });

  it('keeps markReady and activation bound to the current version and fingerprint', () => {
    expect(enrollmentService).toContain(
      'detection.recordVersion !== input.expectedVersion || detection.fingerprint !== input.fingerprint'
    );
    expect(enrollmentService).toContain("'REVIEW_STALE'");
  });
});
