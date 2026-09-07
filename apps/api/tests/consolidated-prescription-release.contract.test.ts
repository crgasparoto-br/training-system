import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.env.GITHUB_WORKSPACE || path.resolve(process.cwd(), '../..');
const servicePath = path.join(
  repoRoot,
  'apps/api/src/modules/consolidated-prescriptions/consolidated-prescription-release.service.ts'
);
const migrationPath = path.join(
  repoRoot,
  'apps/api/prisma/migrations/20260812143000_issue_320_consolidated_operational_release/migration.sql'
);
const accessPath = path.join(repoRoot, 'packages/types/access-control.ts');

const service = readFileSync(servicePath, 'utf8');
const migration = readFileSync(migrationPath, 'utf8');
const access = readFileSync(accessPath, 'utf8');

describe('issue #320 operational release contract', () => {
  it('keeps release as a dedicated permission and backend command', () => {
    expect(access).toContain("plans.consolidatedPrescriptions.release");
    expect(service).toContain("export const CONSOLIDATED_RELEASE_BLOCK = 'plans.consolidatedPrescriptions.release'");
    expect(service).toContain('canProfessorAccessBlock(professor, CONSOLIDATED_RELEASE_BLOCK, tx)');
    expect(service).toContain("getEffectiveDataScopeForProfessor(professor, 'plans', tx)");
  });

  it('serializes the definitive release after a row lock and revalidates approval', () => {
    expect(service).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(service).toContain('FOR UPDATE');
    expect(service).toContain("assembly.currentStatus !== 'approved'");
    expect(service).toContain("source.status !== 'approved'");
    expect(service).toContain('source.approvedByProfessorId');
    expect(service).toContain('source.approvedAt');
  });

  it('protects started or executed workouts from overwrite', () => {
    expect(service).toContain("day.status !== 'planned'");
    expect(service).toContain('day.startedAt || day.finishedAt');
    expect(service).toContain('exercise.executions.length > 0');
    expect(service).toContain('já foi iniciado ou executado');
  });

  it('persists relational, immutable and idempotent traceability', () => {
    expect(migration).toContain('CREATE TABLE "ConsolidatedPrescriptionOperationalRelease"');
    expect(migration).toContain('FOREIGN KEY ("sourceAssemblyVersionId") REFERENCES "ConsolidatedPrescriptionVersion"');
    expect(migration).toContain('FOREIGN KEY ("workoutTemplateId") REFERENCES "WorkoutTemplate"');
    expect(migration).toContain('CREATE UNIQUE INDEX "ConsolidatedPrescriptionOperationalRelease_sourceVersion_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "ConsolidatedPrescriptionOperationalRelease_template_key"');
    expect(migration).toContain('ConsolidatedPrescriptionOperationalRelease_immutable_guard');
  });

  it('marks WorkoutTemplate released only after creating audit linkage', () => {
    const insertRelease = service.indexOf('INSERT INTO "ConsolidatedPrescriptionOperationalRelease"');
    const markReleased = service.indexOf('data: { released: true, releasedAt: now }');
    expect(insertRelease).toBeGreaterThan(-1);
    expect(markReleased).toBeGreaterThan(insertRelease);
  });
});
