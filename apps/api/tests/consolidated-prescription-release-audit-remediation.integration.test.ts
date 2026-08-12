import { randomUUID } from 'node:crypto';
import { ContractType, PrismaClient, ProfessorRole, UserType } from '@prisma/client';
import { createConsolidatedPrescriptionReleaseService } from '../src/modules/consolidated-prescriptions/consolidated-prescription-release.service.js';
import { CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN } from '../src/modules/consolidated-prescriptions/consolidated-prescription-operational-integrity.js';

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
if (runDatabaseIntegrationTests) jest.setTimeout(30_000);

const prisma = new PrismaClient();
const service = createConsolidatedPrescriptionReleaseService(prisma);
const FIXED_NOW = new Date('2026-08-12T12:00:00.000Z');
const CAPACITIES = ['resisted', 'flexibility', 'cyclic', 'balance'] as const;

const FLEXIBILITY_PARAMETERS = {
  articulations: [{ name: 'Ombro', suggestedPrescription: '3 x 30 s' }],
} as const;
const BALANCE_PARAMETERS = {
  focus: 'estabilidade unipodal',
  supports: ['unipodal'],
} as const;
const CYCLIC_PARAMETERS = { category: 'continuous', time: '30 min' } as const;

type Fixture = {
  contractId: string;
  professorId: string;
  professorUserId: string;
  alunoId: string;
  planId: string;
  sourceVersionId: string;
  capacityVersionIds: Record<(typeof CAPACITIES)[number], string>;
};

function contextFor(fixture: Fixture) {
  return {
    contractId: fixture.contractId,
    alunoId: fixture.alunoId,
    actorProfessorId: fixture.professorId,
  };
}

function commandFor(fixture: Fixture) {
  return {
    expectedCurrentVersion: 1,
    target: {
      trainingPlanId: fixture.planId,
      mesocycleNumber: 1,
      weekNumber: 1,
      weekStartDate: '2026-08-17T00:00:00.000Z',
      placements: [
        {
          projectionKey: 'flexibility:audit-remediation',
          dayOfWeek: 1,
          workoutDate: '2026-08-17T00:00:00.000Z',
        },
        {
          projectionKey: 'cyclic:audit-remediation',
          dayOfWeek: 1,
          workoutDate: '2026-08-17T00:00:00.000Z',
        },
        {
          projectionKey: 'balance:audit-remediation',
          dayOfWeek: 1,
          workoutDate: '2026-08-17T00:00:00.000Z',
        },
      ],
    },
  };
}

function capacityParameters(capacity: (typeof CAPACITIES)[number]) {
  if (capacity === 'flexibility') {
    return { type: 'flexibility', flexibility: FLEXIBILITY_PARAMETERS };
  }
  if (capacity === 'balance') {
    return { type: 'balance', balance: BALANCE_PARAMETERS };
  }
  if (capacity === 'cyclic') {
    return { type: 'cyclic', cyclic: CYCLIC_PARAMETERS };
  }
  return { type: 'resisted', resisted: {} };
}

async function seedFixture(label: string): Promise<Fixture> {
  const suffix = `${label}-${randomUUID()}`;
  const contractId = `issue-320-audit-${suffix}`;
  await prisma.companyContract.create({
    data: {
      id: contractId,
      type: ContractType.academy,
      document: randomUUID().replace(/-/g, '').slice(0, 14),
      name: `Issue 320 audit remediation ${label}`,
    },
  });

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Gestor de teste',
      code: `issue-320-audit-manager-${randomUUID()}`,
      isActive: true,
    },
  });
  const professorUser = await prisma.user.create({
    data: {
      email: `issue-320-audit-${randomUUID()}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: `Professor ${label}` } },
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: professorUser.id,
      contractId,
      collaboratorFunctionId: collaboratorFunction.id,
      role: ProfessorRole.master,
    },
  });
  const alunoUser = await prisma.user.create({
    data: {
      email: `issue-320-audit-aluno-${randomUUID()}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.aluno,
      profile: { create: { name: `Aluno ${label}` } },
    },
  });
  const aluno = await prisma.aluno.create({
    data: {
      userId: alunoUser.id,
      professorId: professor.id,
      contractId,
      schedulePlan: 'free',
      age: 35,
    },
  });
  const plan = await prisma.trainingPlan.create({
    data: {
      professorId: professor.id,
      alunoId: aluno.id,
      name: `Plano ${label}`,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
    },
  });

  const capacityVersionIds = {} as Fixture['capacityVersionIds'];
  for (const capacity of CAPACITIES) {
    const root = await prisma.capacityPrescription.create({
      data: {
        contractId,
        alunoId: aluno.id,
        capacity,
        status: 'active',
        currentVersion: 1,
        createdByProfessorId: professor.id,
        updatedByProfessorId: professor.id,
      },
    });
    const version = await prisma.capacityPrescriptionVersion.create({
      data: {
        prescriptionId: root.id,
        contractId,
        alunoId: aluno.id,
        responsibleProfessorId: professor.id,
        capacity,
        status: 'active',
        version: 1,
        technicalJustification: `Justificativa ${capacity}`,
        professorSummary: `Resumo ${capacity}`,
        studentMessage: `Orientação ${capacity}`,
        parameters: capacityParameters(capacity),
      },
    });
    capacityVersionIds[capacity] = version.id;
  }

  const assembly = await prisma.consolidatedPrescription.create({
    data: {
      contractId,
      alunoId: aluno.id,
      currentVersion: 1,
      currentStatus: 'approved',
      createdByProfessorId: professor.id,
      updatedByProfessorId: professor.id,
    },
  });
  const source = await prisma.consolidatedPrescriptionVersion.create({
    data: {
      assemblyId: assembly.id,
      contractId,
      alunoId: aluno.id,
      version: 1,
      status: 'approved',
      responsibleProfessorId: professor.id,
      professorJustification: 'Montagem aprovada para teste de liveness.',
      approvedByProfessorId: professor.id,
      approvedAt: new Date('2026-08-12T10:00:00.000Z'),
      createdByProfessorId: professor.id,
      conflicts: [],
    },
  });

  for (const [position, capacity] of CAPACITIES.entries()) {
    await prisma.consolidatedPrescriptionCapacityBlock.create({
      data: {
        assemblyVersionId: source.id,
        contractId,
        alunoId: aluno.id,
        capacityPrescriptionVersionId: capacityVersionIds[capacity],
        capacity,
        capacityVersion: 1,
        capacityStatus: 'active',
        position,
      },
    });
  }

  const projections = [
    {
      key: 'resisted:audit-remediation',
      capacity: 'resisted',
      target: 'WorkoutTemplate',
      proposedFields: { WorkoutTemplate: { trainingMethod: 'combined' } },
      sourceParameters: {},
    },
    {
      key: 'flexibility:audit-remediation',
      capacity: 'flexibility',
      target: 'WorkoutDay',
      proposedFields: {
        WorkoutDay: { detailNotes: 'Flexibilidade estruturada' },
        WorkoutDayCapacityOperationalBlock: {
          contractVersion: 1,
          capacity: 'flexibility',
          capacityPrescriptionVersionId: capacityVersionIds.flexibility,
          parameters: FLEXIBILITY_PARAMETERS,
        },
      },
      sourceParameters: FLEXIBILITY_PARAMETERS,
    },
    {
      key: 'cyclic:audit-remediation',
      capacity: 'cyclic',
      target: 'WorkoutDay',
      proposedFields: { WorkoutDay: { method: 'continuous', stimulusDurationMin: 30 } },
      sourceParameters: CYCLIC_PARAMETERS,
    },
    {
      key: 'balance:audit-remediation',
      capacity: 'balance',
      target: 'WorkoutDay',
      proposedFields: {
        WorkoutDay: { complementNotes: 'Equilíbrio estruturado' },
        WorkoutDayCapacityOperationalBlock: {
          contractVersion: 1,
          capacity: 'balance',
          capacityPrescriptionVersionId: capacityVersionIds.balance,
          parameters: BALANCE_PARAMETERS,
        },
      },
      sourceParameters: BALANCE_PARAMETERS,
    },
  ] as const;

  for (const projection of projections) {
    await prisma.consolidatedPrescriptionDataRef.create({
      data: {
        assemblyVersionId: source.id,
        role: 'manual_observation',
        sourceType: 'operational_projection',
        sourceId: projection.key,
        label: `Projection ${projection.capacity}`,
        origin: CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN,
        sourceVersion: '1',
        responsibleProfessorId: professor.id,
        context: {
          kind: 'operational_projection_v1',
          key: projection.key,
          capacity: projection.capacity,
          capacityPrescriptionVersionId: capacityVersionIds[projection.capacity],
          target: projection.target,
          compatibility: 'mapped',
          proposedFields: projection.proposedFields,
          unsupportedParameters: [],
          sourceParameters: projection.sourceParameters,
          preparedForAssemblyVersion: 1,
        },
      },
    });
  }

  return {
    contractId,
    professorId: professor.id,
    professorUserId: professorUser.id,
    alunoId: aluno.id,
    planId: plan.id,
    sourceVersionId: source.id,
    capacityVersionIds,
  };
}

async function addSourceRef(
  fixture: Fixture,
  sourceType: string,
  sourceId: string,
  label: string | null
) {
  await prisma.consolidatedPrescriptionDataRef.create({
    data: {
      assemblyVersionId: fixture.sourceVersionId,
      role: 'capacity_source',
      sourceType,
      sourceId,
      label,
      origin: `issue-320-audit-${sourceType}`,
      responsibleProfessorId: fixture.professorId,
    },
  });
}

async function expectReleaseRejectedWithoutEffects(fixture: Fixture) {
  await expect(service.release(contextFor(fixture), commandFor(fixture), FIXED_NOW)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  const assembly = await prisma.consolidatedPrescription.findFirst({
    where: { contractId: fixture.contractId, alunoId: fixture.alunoId },
  });
  expect(assembly).toMatchObject({ currentVersion: 1, currentStatus: 'approved' });
  expect(await prisma.workoutTemplate.count({ where: { planId: fixture.planId } })).toBe(0);
  const ledger = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS "count"
    FROM "ConsolidatedPrescriptionOperationalRelease"
    WHERE "sourceAssemblyVersionId" = ${fixture.sourceVersionId}
  `;
  expect(Number(ledger[0]?.count ?? 0n)).toBe(0);
}

describeDatabase('issue 320 audit remediation - source liveness at release', () => {
  afterAll(async () => {
    await prisma.companyContract.deleteMany({
      where: { id: { startsWith: 'issue-320-audit-' } },
    });
    await prisma.$disconnect();
  });

  it('REF-LIVE-001 falha fechado quando objetivo clínico válido na aprovação é removido antes do release', async () => {
    const fixture = await seedFixture('clinical-deleted');
    const record = await prisma.prontuarioRecord.create({
      data: {
        alunoId: fixture.alunoId,
        contractId: fixture.contractId,
        professorId: fixture.professorId,
        code: `PRNT-${randomUUID()}`,
      },
    });
    const goal = await prisma.prontuarioGoal.create({
      data: {
        recordId: record.id,
        title: 'Objetivo clínico usado na aprovação',
        description: 'Deve continuar acessível até a liberação.',
      },
    });
    await addSourceRef(fixture, 'prontuario_goal', goal.id, goal.title);
    await prisma.prontuarioGoal.delete({ where: { id: goal.id } });

    await expectReleaseRejectedWithoutEffects(fixture);
  });

  it('REF-LIVE-003 falha fechado quando avaliação canônica é removida antes do release', async () => {
    const fixture = await seedFixture('assessment-deleted');
    const assessment = await prisma.studentAssessmentRecord.create({
      data: {
        alunoId: fixture.alunoId,
        contractId: fixture.contractId,
        assessmentCategory: 'ventilometry',
        assessmentCode: `VENT-${randomUUID()}`,
        title: 'Ventilometria usada na aprovação',
        sourceReference: `VENT-${randomUUID()}`,
        performedByProfessorId: fixture.professorId,
        recordedByUserId: fixture.professorUserId,
        performedAt: new Date('2026-08-11T10:00:00.000Z'),
        status: 'completed',
      },
    });
    await addSourceRef(fixture, 'ventilometry', assessment.id, assessment.title);
    await prisma.studentAssessmentRecord.delete({ where: { id: assessment.id } });

    await expectReleaseRejectedWithoutEffects(fixture);
  });

  it('REF-LIVE-002 falha fechado quando a mesma avaliação perde elegibilidade de categoria', async () => {
    const fixture = await seedFixture('assessment-ineligible');
    const assessment = await prisma.studentAssessmentRecord.create({
      data: {
        alunoId: fixture.alunoId,
        contractId: fixture.contractId,
        assessmentCategory: 'ventilometry',
        assessmentCode: `VENT-${randomUUID()}`,
        title: 'Ventilometria que muda de categoria',
        sourceReference: `VENT-${randomUUID()}`,
        performedByProfessorId: fixture.professorId,
        recordedByUserId: fixture.professorUserId,
        performedAt: new Date('2026-08-11T10:00:00.000Z'),
        status: 'completed',
      },
    });
    await addSourceRef(fixture, 'ventilometry', assessment.id, assessment.title);
    await prisma.studentAssessmentRecord.update({
      where: { id: assessment.id },
      data: { assessmentCategory: 'adipometry' },
    });

    await expectReleaseRejectedWithoutEffects(fixture);
  });
});
