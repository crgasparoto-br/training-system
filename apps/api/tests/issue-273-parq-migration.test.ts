import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  __dirname,
  '../prisma/migrations/20260725201000_issue_273_canonical_parq/migration.sql'
);
const auditMigrationPath = path.resolve(
  __dirname,
  '../prisma/migrations/20260726010000_issue_273_audit_fixes/migration.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const auditMigration = fs.readFileSync(auditMigrationPath, 'utf8');

describe('issue 273 PAR-Q migration contract', () => {
  it('creates draft, review and read-only legacy reconciliation structures', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "StudentParqDraft"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "StudentParqProfessionalReview"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "StudentParqLegacyRecord"');
  });

  it('preserves provenance and prevents duplicate reruns', () => {
    expect(migration).toContain('"legacySourceType"');
    expect(migration).toContain('"legacySourceId"');
    expect(migration).toContain('ON CONFLICT ("sourceType", "sourceId") DO NOTHING');
    expect(migration).toContain('StudentParqSubmission_legacy_origin_key');
    expect(migration).toContain('SELECT DISTINCT ON');
  });

  it('requires boolean legacy answers and does not fabricate missing evidence', () => {
    expect(migration).toContain("'missing_observed_at'");
    expect(migration).toContain("'declaration_not_supported'");
    expect(migration).toContain("'non_boolean_answer'");
    expect(migration).toContain("jsonb_typeof(intake.\"parqResponses\"->'q1') = 'boolean'");
    expect(migration).toContain('legacy."observedAt"');
  });

  it('records consent lifecycle and canonical divergence in the corrective migration', () => {
    expect(auditMigration).toContain('PARQ_CONSENT_ACCEPTED');
    expect(auditMigration).toContain('PARQ_CONSENT_REVOKED');
    expect(auditMigration).toContain('"parqConsentVersion"');
    expect(auditMigration).toContain('conflicts_with_canonical_submission_same_observed_at');
    expect(auditMigration).toContain('non_boolean_answer');
  });

  it('guards tenant consistency and keeps onboarding free of answer copies', () => {
    expect(migration).toContain('validate_student_parq_tenant');
    expect(migration).toContain('PARQ_TENANT_MISMATCH');
    expect(migration).toContain('"parqSubmissionId"');
    expect(migration).not.toContain('ALTER TABLE "StudentOnboardingProcess" ADD COLUMN IF NOT EXISTS "parqResponses"');
  });
});
