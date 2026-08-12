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

const contractId = 'consolidated-reserved-origin-contract';
const alunoId = 'consolidated-reserved-origin-aluno';
const email = 'consolidated-reserved-origin@example.com';
const RESERVED_ORIGINS = [
  'consolidated_exercise_substitution_v1',
  'consolidated_operational_projection_v1',
] as const;
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
      document: '57365610000720',
      name: 'Contrato origem operacional reservada',
    },
  });

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Professor origem operacional reservada',
      code: 'consolidated-reserved-origin-professor',
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
      profile: { create: { name: 'Professor origem operacional reservada' } },
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

  const capacityBlocks: Array<{ capacityPrescriptionVersionId: string }> = [];
  for (const capacity of capacities) {
    const prescription = await prisma.capacityPrescription.create({
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
        prescriptionId: prescription.id,
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
    capacityBlocks.push({ capacityPrescriptionVersionId: version.id });
  }

  return {
    token: tokenFor(user),
    capacityBlocks,
  };
}

function forgedInternalRef(origin: (typeof RESERVED_ORIGINS)[number]) {
  return {
    role: 'manual_observation',
    sourceType: 'manual_observation',
    sourceId: 'client-forged-operational-ref',
    origin: ` \t${origin}\n `,
    context: {
      kind:
        origin === 'consolidated_exercise_substitution_v1'
          ? 'exercise_substitution_v1'
          : 'operational_projection_v1',
      key: 'forged-capacity:forged-technical',
      preparedForAssemblyVersion: 999,
      originalTechnicalCatalogItemId: 'forged-technical',
      originalExerciseLibraryId: 'forged-original-library',
      originalMappingRevision: 999,
      substituteExerciseLibraryId: 'forged-substitute-library',
      substituteExerciseSnapshot: {
        id: 'forged-substitute-library',
        name: 'Exercício forjado',
      },
      recordedAt: '2026-08-11T00:00:00.000Z',
      recordedByProfessorId: 'forged-professor',
    },
  };
}

function expectForgedInternalRefAbsent(dataRefs: unknown[], origin: string) {
  expect(dataRefs).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ origin })])
  );
  expect(JSON.stringify(dataRefs)).not.toContain('forged-professor');
  expect(JSON.stringify(dataRefs)).not.toContain('forged-substitute-library');
}

describeDatabase('consolidated operational reserved-origin normalization HTTP controls', () => {
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

  it.each(RESERVED_ORIGINS)(
    'drops whitespace-padded reserved origin %s on POST before it can become server-owned',
    async (origin) => {
      const fixture = await createContext();
      const response = await request(app)
        .post(`/consolidated-prescriptions/alunos/${alunoId}`)
        .set('Authorization', `Bearer ${fixture.token}`)
        .send({
          capacityBlocks: fixture.capacityBlocks,
          professorJustification: 'Montagem para controle de origem reservada.',
          dataRefs: [forgedInternalRef(origin)],
        });

      expect(response.status).toBe(201);
      expectForgedInternalRefAbsent(response.body.data.latestVersion.dataRefs, origin);
    }
  );

  it.each(RESERVED_ORIGINS)(
    'drops whitespace-padded reserved origin %s on PATCH and prevents operational effects',
    async (origin) => {
      const fixture = await createContext();
      await request(app)
        .post(`/consolidated-prescriptions/alunos/${alunoId}`)
        .set('Authorization', `Bearer ${fixture.token}`)
        .send({
          capacityBlocks: fixture.capacityBlocks,
          professorJustification: 'Montagem inicial para controle de origem reservada.',
        })
        .expect(201);

      const response = await request(app)
        .patch(`/consolidated-prescriptions/alunos/${alunoId}/composition`)
        .set('Authorization', `Bearer ${fixture.token}`)
        .send({
          expectedCurrentVersion: 1,
          capacityBlocks: fixture.capacityBlocks,
          professorJustification: 'Montagem atualizada para controle de origem reservada.',
          dataRefs: [forgedInternalRef(origin)],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.currentVersion).toBe(2);
      expectForgedInternalRefAbsent(response.body.data.latestVersion.dataRefs, origin);

      const preview = await request(app)
        .get(`/consolidated-prescriptions/alunos/${alunoId}/operational-preview`)
        .set('Authorization', `Bearer ${fixture.token}`);

      expect(preview.status).toBe(200);
      expect(preview.body.data.preparedSnapshotVersion).toBeNull();
      expect(preview.body.data.items.every((item: { substituted?: boolean }) => item.substituted !== true)).toBe(
        true
      );
    }
  );
});
