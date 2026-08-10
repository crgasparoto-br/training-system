import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  __dirname,
  '../prisma/migrations/20260725010000_issue_272_canonical_health_intake/migration.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');

describe('issue #272 canonical health-intake migration contract', () => {
  it('backfills canonical health data without copying PAR-Q or generic form responses', () => {
    expect(migration).toContain('canonical_wins_then_fill_missing');
    expect(migration).toContain("jsonb_build_array('parqResponses', 'formResponses')");
    expect(migration).not.toMatch(/legacy\."parqResponses"/u);
    expect(migration).not.toMatch(/legacy\."formResponses"/u);
  });

  it('preserves canonical precedence and flags unresolved divergence', () => {
    expect(migration).toContain('migrationReviewRequired');
    expect(migration).toContain("'precedence', 'canonical'");
    expect(migration).toContain('ON CONFLICT ("alunoId") DO NOTHING');
  });

  it('enforces the post-cutover legacy table as read-only', () => {
    expect(migration).toContain('reject_legacy_aluno_intake_write');
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON "AlunoIntakeForm"');
  });

  it('removes financial contract triggers that previously wrote the legacy intake table', () => {
    expect(migration).toContain(
      'DROP TRIGGER IF EXISTS "StudentContract_sync_financial_service_update"'
    );
    expect(migration).toContain(
      'DROP FUNCTION IF EXISTS sync_active_student_contract_financial_service()'
    );
    expect(migration).toContain('CREATE OR REPLACE FUNCTION repair_student_contract_service_authority_data()');
  });
});
