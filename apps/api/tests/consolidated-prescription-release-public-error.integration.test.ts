import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { ContractType, PrismaClient, ProfessorRole, UserType } from '@prisma/client';
import { CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN } from '../src/modules/consolidated-prescriptions/consolidated-prescription-operational-integrity.js';
import { consolidatedPrescriptionReleaseService } from '../src/modules/consolidated-prescriptions/consolidated-prescription-release.service.js';

const request = require('supertest');
const { consolidatedPrescriptionRoutes } = require('../src/modules/consolidated-prescriptions/index');

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
if (runDatabaseIntegrationTests) jest.setTimeout(30_000);

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use('/consolidated-prescriptions', consolidatedPrescriptionRoutes);

const CAPACITIES = ['resisted', 'flexibility', 'cyclic', 'balance'] as const;
const RELEASE_NOW = new Date('2026-08-16T12:00:00.000Z');
const FLEXIBILITY_PARAMETERS = {
  articulations: [{ name: 'Ombro', suggestedPrescription: '3 x 30 s' }],
} as const;
const BALANCE_PARAMETERS = {
  focus: 'estabilidade unipodal',
  supports: ['unipodal'],
} as const;
const CYCLIC_PARAMETERS = { category: 'continuous', time: '30 min' } as const;
const RAW_MARKERS = ['PB-ERR-001', 'fingerprint-marker', 'idempotency-marker', '123.45', 'P0001'];

type Fixture = {
  contractId: string;
  professorId: string;
  professorUser: { id: string; email: string; type: UserType };
  alunoId: string;
  planId: string;
  assemblyId: string;
  sourceVersionId: string;
  capacityVersionIds: Record<(typeof CAPACITIES)[number], string>;
};

function tokenFor(user: Fixture['professorUser']) {
  return jwt.sign(
    { userId: user.id, email: user.email, type: user.type },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
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
          projectionKey: 'flexibility:pb-err',
          dayOfWeek: 1,
          workoutDate: '2026-08-17T00:00:00.000Z',
        },
        {
          projectionKey: 'cyclic:pb-err',
          dayOfWeek: 1,
          workoutDate: '2026-08-17T00:00:00.000Z',
        },
        {
          projectionKey: 'balance:pb-err',
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
  const contractId = `issue-320-pb-err-${suffix}`;
  await prisma.companyContract.create({
    data: {
      id: contractId,
      type: ContractType.academy,
      document: randomUUID().replace(/-/g, '').slice(0, 14),
      name: `Issue 320 PB-ERR ${label}`,
    },
  });

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Gestor PB-ERR',
      code: `issue-320-pb-err-manager-${randomUUID()}`,
      isActive: true,
    },
  });
  const professorUser = await prisma.user.create({
    data: {
      email: `issue-320-pb-err-${randomUUID()}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: `Professor PB-ERR ${label}` } },
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
      email: `issue-320-pb-err-aluno-${randomUUID()}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.aluno,
      profile: { create: { name: `Aluno PB-ERR ${label}` } },
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
      name: `Plano PB-ERR ${label}`,
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
      professorJustification: 'Montagem aprovada para controle PB-ERR-001.',
      approvedByProfessorId: professor.id,
      approvedAt: new Date('2026-08-12T12:00:00.000Z'),
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
      key: 'resisted:pb-err',
      capacity: 'resisted',
      target: 'WorkoutTemplate',
      proposedFields: { WorkoutTemplate: { trainingMethod: 'combined' } },
      sourceParameters: {},
    },
    {
      key: 'flexibility:pb-err',
      capacity: 'flexibility',
      target: 'WorkoutDay',
      proposedFields: {
        WorkoutDay: { detailNotes: 'Flexibilidade PB-ERR' },
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
      key: 'cyclic:pb-err',
      capacity: 'cyclic',
      target: 'WorkoutDay',
      proposedFields: { WorkoutDay: { method: 'continuous', stimulusDurationMin: 30 } },
      sourceParameters: CYCLIC_PARAMETERS,
    },
    {
      key: 'balance:pb-err',
      capacity: 'balance',
      target: 'WorkoutDay',
      proposedFields: {
        WorkoutDay: { complementNotes: 'Equilíbrio PB-ERR' },
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
    professorUser: {
      id: professorUser.id,
      email: professorUser.email,
      type: professorUser.type,
    },
    alunoId: aluno.id,
    planId: plan.id,
    assemblyId: assembly.id,
    sourceVersionId: source.id,
    capacityVersionIds,
  };
}

async function dropFailureInjection() {
  await prisma.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS "test_issue320_pb_err_failure" ON "ConsolidatedPrescriptionOperationalRelease"'
  );
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS "test_issue320_pb_err_failure"()');
}

async function installFailureInjection() {
  await dropFailureInjection();
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "test_issue320_pb_err_failure"()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'PB-ERR-001 fingerprint-marker idempotency-marker 123.45'
        USING ERRCODE = 'P0001';
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "test_issue320_pb_err_failure"
    BEFORE INSERT ON "ConsolidatedPrescriptionOperationalRelease"
    FOR EACH ROW EXECUTE FUNCTION "test_issue320_pb_err_failure"()
  `);
}

async function expectNoReleaseEffects(fixture: Fixture) {
  const assembly = await prisma.consolidatedPrescription.findUnique({
    where: { id: fixture.assemblyId },
  });
  const versions = await prisma.consolidatedPrescriptionVersion.findMany({
    where: { assemblyId: fixture.assemblyId },
  });
  const templates = await prisma.workoutTemplate.findMany({
    where: { planId: fixture.planId },
  });
  const ledger = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS "count"
    FROM "ConsolidatedPrescriptionOperationalRelease"
    WHERE "sourceAssemblyVersionId" = ${fixture.sourceVersionId}
  `;

  expect(assembly).toMatchObject({ currentVersion: 1, currentStatus: 'approved' });
  expect(versions).toHaveLength(1);
  expect(templates).toHaveLength(0);
  expect(Number(ledger[0]?.count ?? 0n)).toBe(0);
}

function expectSanitizedInternalError(response: { status: number; body: Record<string, unknown> }) {
  expect(response.status).toBe(500);
  expect(response.body).toMatchObject({
    success: false,
    error: 'Erro ao liberar saída operacional da montagem consolidada',
  });
  expect(typeof response.body.correlationId).toBe('string');
  expect(response.body.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  const serialized = JSON.stringify(response.body);
  for (const marker of RAW_MARKERS) expect(serialized).not.toContain(marker);
  expect(serialized).not.toContain('ConsolidatedPrescriptionOperationalRelease');
  expect(serialized).not.toContain('stack');
}

describeDatabase('PB-ERR-001 consolidated operational release public boundary', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await dropFailureInjection();
  });

  afterAll(async () => {
    await dropFailureInjection();
    await prisma.$disconnect();
  });

  it('sanitiza falha inesperada antes de escrita e preserva correlationId no log interno', async () => {
    const fixture = await seedFixture('pre-write');
    const rawError = Object.assign(
      new Error('PB-ERR-001 fingerprint-marker idempotency-marker 123.45'),
      { code: 'P0001' }
    );
    jest.spyOn(consolidatedPrescriptionReleaseService, 'release').mockRejectedValueOnce(rawError);
    const logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app)
      .post(`/consolidated-prescriptions/alunos/${fixture.alunoId}/operational-release`)
      .set('Authorization', `Bearer ${tokenFor(fixture.professorUser)}`)
      .send(commandFor(fixture));

    expectSanitizedInternalError(response);
    expect(logSpy).toHaveBeenCalledWith(
      'Erro ao liberar saída operacional da montagem consolidada:',
      expect.objectContaining({ correlationId: response.body.correlationId, error: rawError })
    );
    await expectNoReleaseEffects(fixture);
  });

  it('sanitiza P0001 após escrita operacional e comprova rollback integral pela rota pública', async () => {
    const fixture = await seedFixture('rollback');
    await installFailureInjection();
    const releaseWithFrozenNow = consolidatedPrescriptionReleaseService.release.bind(
      consolidatedPrescriptionReleaseService
    );
    jest.spyOn(consolidatedPrescriptionReleaseService, 'release').mockImplementationOnce(
      (context, command) => releaseWithFrozenNow(context, command, RELEASE_NOW)
    );
    const logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app)
      .post(`/consolidated-prescriptions/alunos/${fixture.alunoId}/operational-release`)
      .set('Authorization', `Bearer ${tokenFor(fixture.professorUser)}`)
      .send(commandFor(fixture));

    expectSanitizedInternalError(response);
    const logContext = logSpy.mock.calls[0]?.[1] as { correlationId?: string; error?: unknown } | undefined;
    expect(logContext?.correlationId).toBe(response.body.correlationId);
    expect(logContext?.error).toBeTruthy();
    await expectNoReleaseEffects(fixture);
  });
});
