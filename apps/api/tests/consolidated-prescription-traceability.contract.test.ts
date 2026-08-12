import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.env.GITHUB_WORKSPACE || path.resolve(process.cwd(), '../..');
const servicePath = path.join(
  repoRoot,
  'apps/api/src/modules/consolidated-prescriptions/consolidated-prescription-traceability.service.ts'
);
const routesPath = path.join(
  repoRoot,
  'apps/api/src/modules/consolidated-prescriptions/consolidated-prescription-traceability.routes.ts'
);

const service = readFileSync(servicePath, 'utf8');
const routes = readFileSync(routesPath, 'utf8');

describe('issue #320 operational traceability contract', () => {
  it('allows lookup from template, day or exercise without text reconstruction', () => {
    expect(routes).toContain('workoutTemplateId');
    expect(routes).toContain('workoutDayId');
    expect(routes).toContain('workoutExerciseId');
    expect(service).toContain('FROM "WorkoutTemplate" wt');
    expect(service).toContain('FROM "WorkoutDay" wd');
    expect(service).toContain('FROM "WorkoutExercise" we');
  });

  it('keeps read authorization and plans data scope server-side', () => {
    expect(service).toContain("const CONSOLIDATED_VIEW_BLOCK = 'plans.consolidatedPrescriptions.view'");
    expect(service).toContain('canProfessorAccessBlock(professor, CONSOLIDATED_VIEW_BLOCK, tx)');
    expect(service).toContain("getEffectiveDataScopeForProfessor(professor, 'plans', tx)");
    expect(service).toContain('a."contractId" = ${context.contractId}');
    expect(service).toContain('tp."alunoId" = ${context.alunoId}');
  });

  it('walks the relational chain from operational output to release, versions, capacities and refs', () => {
    expect(service).toContain('FROM "ConsolidatedPrescriptionOperationalRelease"');
    expect(service).toContain('FROM "ConsolidatedPrescriptionVersion"');
    expect(service).toContain('FROM "ConsolidatedPrescriptionCapacityBlock"');
    expect(service).toContain('FROM "ConsolidatedPrescriptionDataRef"');
    expect(service).toContain('sourceAssemblyVersionId');
    expect(service).toContain('releasedAssemblyVersionId');
    expect(service).toContain('capacityPrescriptionVersionId');
    expect(service).toContain('sourceRefs');
  });

  it('uses a generic not-found boundary for inaccessible or unlinked operational IDs', () => {
    expect(service).toContain("fail('NOT_FOUND', 'Recurso não encontrado')");
    expect(routes).toContain("sendError(res, 'Recurso não encontrado', 404)");
  });
});
