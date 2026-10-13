import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(path.resolve(
  __dirname,
  '../prisma/migrations/20261013073000_issue_384_prnt_versioned_history/migration.sql',
), 'utf8');
const completion = fs.readFileSync(path.resolve(
  __dirname, '../src/modules/pre-registration-public/pre-registration-health-intake.service.ts',
), 'utf8');

describe('issue #384: initial anamnesis revision authorship', () => {
  it('distinguishes the completion actor from the original intake respondent', () => {
    expect(completion).toContain('completedByUserId: userId');
    expect(migration).toContain('NEW."completedByUserId"');
    expect(migration).toContain('NEW."completedAt" IS DISTINCT FROM OLD."completedAt"');
    expect(migration).toContain('revision_actor := COALESCE(NEW."completedByUserId", NEW."recordedByUserId")');
    expect(migration).toContain('NEW."sourceReference",revision_actor,next_payload');
  });

  it('keeps immutable revisions and does not invent legacy authors', () => {
    expect(migration).toContain('CREATE TRIGGER health_intake_history_immutable');
    expect(migration).toContain('i."formVersion",i."sourceType",i."sourceReference",NULL');
  });
});
