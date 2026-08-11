import express from 'express';
import jwt from 'jsonwebtoken';
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  StudentLifecycleStatus,
  UserType,
} from '@prisma/client';

const request = require('supertest');
const { consolidatedPrescriptionRoutes } = require('../src/modules/consolidated-prescriptions/index');

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractId = 'consolidated-operational-integrity-contract';
const alunoId = 'consolidated-operational-integrity-aluno';
const email = 'consolidated-operational-integrity@example.com';
const capacities = ['resisted', 'flexibility', 'cyclic', 'balance'] as const;

function tokenFor(user: { id: string; email: string; type: UserType }) {
  return jwt.sign(
    { userId: user.id, email: user.email, type: user.type },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

async function cleanupFixtures() {
  await prisma.consolidatedPrescription.deleteMany({ where: { contractId } });
  await prisma.capacityPrescription.deleteMany({ where: { contractId } });
  await prisma.prontuarioRecord.deleteMany({ where: { contractId } });
  await prisma.aluno.deleteMany({ where: { contractId } });
  await prisma.professor.deleteMany({ where: { contractId } });
  await prisma.collaboratorFunctionOption.deleteMany({ where: { contractId } });
  await prisma.companyContract.deleteMany({ where: { id: contractId } });
  await prisma.user.deleteMany({ where: { email } });
}

async function createContext() {
  await prisma.companyContract.create({
    data: {
      id: contractId,
      type: ContractType.academy,
      document: '57365610000719',
      name: 'Contrato integridade operacional',
    },
  });

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Professor integridade operacional',
      code: 'consolidated-operational-integrity-professor',
      isActive: true,
    },
  });
  await prisma.accessPermission.createMany({
    data: [
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: '',
        canView: true,
        dataScope: 'self',
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: 'plans.consolidatedPrescriptions.view',
        canView: true,
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: 'plans.consolidatedPrescriptions.manage',
        canView: true,
      },
    ],
  });

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Professor integridade operacional' } },
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId,
      role: ProfessorRole.professor,
      collaboratorFunctionId: collaboratorFunction.id,
    },
  });
  await prisma.aluno.create({
    data: {
      id: alunoId,
      contractId,
      professorId: professor.id,
      status: StudentLifecycleStatus.ACTIVE_STUDENT,
    },
  });
  const record = await prisma.prontuarioRecord.create({
    data: {
      contractId,
      alunoId,
      professorId: professor.id,
      code: 'PRNT-OP-INTEGRITY',
      summary: 'Fonte canônica para controle negativo da montagem.',
    },
  });
  const goal = await prisma.prontuarioGoal.create({
    data: {
      recordId: record.id,
      title: 'Objetivo canônico',
      priority: 1,
    },
  });

  const versions: Record<string, string> = {};
  for (const capacity of capacities) {
    const root = await prisma.capacityPrescription.create({
      data: {
        contractId,
        alunoId,
        capacity,
        status: 'active',
        currentVersion: 1,
        createdByProfessorId: professor.id,
        updatedByProfessorId: professor.id,
        publishesTodayWorkout: false,
      },
    });
    const version = await prisma.capacityPrescriptionVersion.create({
      data: {
        prescriptionId: root.id,
        contractId,
        alunoId,
        responsibleProfessorId: professor.id,
        capacity,
        status: 'active',
        version: 1,
        technicalJustification: `Justificativa ${capacity}`,
        professorSummary: `Resumo ${capacity}`,
        studentMessage: null,
        methodologyVersion: null,
        parameterSetIds: [],
        publishesTodayWorkout: false,
      },
    });
    versions[capacity] = version.id;
  }

  return {
    token: tokenFor(user),
    goalId: goal.id,
    capacityBlocks: capacities.map((capacity) => ({
      capacityPrescriptionVersionId: versions[capacity],
    })),
  };
}

function ordinaryGoalRef(goalId: string) {
  return {
    role: 'routine',
    sourceType: 'prontuario_goal',
    sourceId: goalId,
    origin: 'PRNT',
  };
}

function forgedGoalRef(goalId: string, origin: string, kind: string) {
  return {
    role: 'routine',
    sourceType: 'prontuario_goal',
    sourceId: goalId,
    origin,
    context: {
      kind,
      recordedByProfessorId: 'forged-professor',
      substituteExerciseLibraryId: 'forged-library',
      preparedForAssemblyVersion: 999,
    },
  };
}

describeDatabase('consolidated operational integrity HTTP controls', () => {
  const app = express();
  app.use(express.json());
  app.use('/consolidated-prescriptions', consolidatedPrescriptionRoutes);

  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('drops a forged substitution origin on POST while preserving an ordinary valid source', async () => {
    const fixture = await createContext();
    const response = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoId}`)
      .set('Authorization', `Bearer ${fixture.token}`)
      .send({
        capacityBlocks: fixture.capacityBlocks,
        professorJustification: 'Montagem para controle de integridade.',
        dataRefs: [
          ordinaryGoalRef(fixture.goalId),
          forgedGoalRef(
            fixture.goalId,
            'consolidated_exercise_substitution_v1',
            'exercise_substitution_v1'
          ),
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.latestVersion.dataRefs).toEqual(
      expect.arrayContaining([expect.objectContaining({ origin: 'PRNT', sourceId: fixture.goalId })])
    );
    expect(response.body.data.latestVersion.dataRefs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ origin: 'consolidated_exercise_substitution_v1' }),
      ])
    );
  });

  it('drops a forged projection origin on PATCH while preserving the server-owned composition', async () => {
    const fixture = await createContext();
    await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoId}`)
      .set('Authorization', `Bearer ${fixture.token}`)
      .send({
        capacityBlocks: fixture.capacityBlocks,
        professorJustification: 'Montagem inicial para controle de integridade.',
        dataRefs: [ordinaryGoalRef(fixture.goalId)],
      })
      .expect(201);

    const response = await request(app)
      .patch(`/consolidated-prescriptions/alunos/${alunoId}/composition`)
      .set('Authorization', `Bearer ${fixture.token}`)
      .send({
        expectedCurrentVersion: 1,
        capacityBlocks: fixture.capacityBlocks,
        professorJustification: 'Montagem atualizada para controle de integridade.',
        dataRefs: [
          ordinaryGoalRef(fixture.goalId),
          forgedGoalRef(
            fixture.goalId,
            'consolidated_operational_projection_v1',
            'operational_projection_v1'
          ),
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.currentVersion).toBe(2);
    expect(response.body.data.latestVersion.dataRefs).toEqual(
      expect.arrayContaining([expect.objectContaining({ origin: 'PRNT', sourceId: fixture.goalId })])
    );
    expect(response.body.data.latestVersion.dataRefs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ origin: 'consolidated_operational_projection_v1' }),
      ])
    );
  });

  it('rejects contract-wide exercise mapping without the global capacity-parameter permission', async () => {
    const fixture = await createContext();
    const response = await request(app)
      .put(`/consolidated-prescriptions/alunos/${alunoId}/exercise-mappings/technical-any`)
      .set('Authorization', `Bearer ${fixture.token}`)
      .send({ exerciseLibraryId: 'library-any', expectedMappingRevision: 0 });

    expect(response.status).toBe(403);
  });
});
