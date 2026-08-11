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

const contractA = 'consolidated-workspace-contract-a';
const contractB = 'consolidated-workspace-contract-b';
const alunoA = 'consolidated-workspace-aluno-a';
const emailPrefix = 'consolidated-workspace-test-';
const capacities = ['resisted', 'flexibility', 'cyclic', 'balance'] as const;

function tokenFor(user: { id: string; email: string; type: UserType }) {
  return jwt.sign(
    { userId: user.id, email: user.email, type: user.type },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

async function createContract(id: string, document: string) {
  await prisma.companyContract.create({
    data: { id, type: ContractType.academy, document, name: `Contrato ${id}` },
  });
}

async function createProfessor(input: {
  contractId: string;
  suffix: string;
  dataScope: 'self' | 'managed' | 'contract';
  responsibleManagerId?: string | null;
}) {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: input.contractId,
      name: `Função ${input.suffix}`,
      code: `consolidated-workspace-${input.suffix}`,
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
        dataScope: input.dataScope,
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: 'plans.consolidatedPrescriptions.view',
        canView: true,
      },
    ],
  });
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}${input.suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: `Professor ${input.suffix}` } },
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId: input.contractId,
      role: ProfessorRole.professor,
      collaboratorFunctionId: collaboratorFunction.id,
      responsibleManagerId: input.responsibleManagerId ?? null,
    },
  });
  return { user, professor, token: tokenFor(user) };
}

async function createCapacitySet(professorId: string) {
  for (const capacity of capacities) {
    const root = await prisma.capacityPrescription.create({
      data: {
        contractId: contractA,
        alunoId: alunoA,
        capacity,
        status: 'active',
        currentVersion: 1,
        createdByProfessorId: professorId,
        updatedByProfessorId: professorId,
        publishesTodayWorkout: false,
      },
    });
    await prisma.capacityPrescriptionVersion.create({
      data: {
        prescriptionId: root.id,
        contractId: contractA,
        alunoId: alunoA,
        responsibleProfessorId: professorId,
        capacity,
        status: 'active',
        version: 1,
        technicalJustification: `Justificativa ${capacity}`,
        professorSummary: `Resumo ${capacity}`,
        studentMessage: null,
        methodologyVersion: null,
        parameterSetIds: [],
        publishesTodayWorkout: false,
        sources: {
          create: {
            sourceType: 'professor_note',
            sourceId: `source-${capacity}`,
            label: `Origem ${capacity}`,
            origin: 'workspace-test',
            sourceVersion: '1',
            responsibleProfessorId: professorId,
          },
        },
      },
    });
  }
}

async function cleanup() {
  const contractIds = [contractA, contractB];
  await prisma.consolidatedPrescription.deleteMany({ where: { contractId: { in: contractIds } } });
  await prisma.capacityPrescription.deleteMany({ where: { contractId: { in: contractIds } } });
  await prisma.aluno.deleteMany({ where: { contractId: { in: contractIds } } });
  await prisma.professor.deleteMany({ where: { contractId: { in: contractIds } } });
  await prisma.collaboratorFunctionOption.deleteMany({ where: { contractId: { in: contractIds } } });
  await prisma.companyContract.deleteMany({ where: { id: { in: contractIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
}

describeDatabase('consolidated prescription workspace HTTP integration', () => {
  const app = express();
  app.use(express.json());
  app.use('/consolidated-prescriptions', consolidatedPrescriptionRoutes);

  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('usa o dataScope de plans e devolve elegibilidade e motivo autoritativos', async () => {
    await createContract(contractA, '57365610000801');
    await createContract(contractB, '57365610000802');
    const assigned = await createProfessor({ contractId: contractA, suffix: 'assigned', dataScope: 'self' });
    const manager = await createProfessor({ contractId: contractA, suffix: 'manager', dataScope: 'contract' });
    const outsider = await createProfessor({ contractId: contractA, suffix: 'outsider', dataScope: 'self' });
    const tenantB = await createProfessor({ contractId: contractB, suffix: 'tenant-b', dataScope: 'contract' });

    await prisma.aluno.create({
      data: {
        id: alunoA,
        contractId: contractA,
        professorId: assigned.professor.id,
        status: StudentLifecycleStatus.ACTIVE_STUDENT,
      },
    });
    await createCapacitySet(assigned.professor.id);

    const allowed = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}/workspace`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.aluno.id).toBe(alunoA);
    expect(allowed.body.data.actorProfessor.id).toBe(manager.professor.id);
    expect(allowed.body.data.assignedProfessor.id).toBe(assigned.professor.id);
    expect(allowed.body.data.capacityCandidates).toHaveLength(4);
    expect(allowed.body.data.capacityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capacity: 'resisted',
          eligible: true,
          reasonCode: 'eligible',
          reason: null,
        }),
      ])
    );

    const resisted = await prisma.capacityPrescription.findFirstOrThrow({
      where: { contractId: contractA, alunoId: alunoA, capacity: 'resisted' },
    });
    await prisma.capacityPrescription.update({
      where: { id: resisted.id },
      data: { status: 'suspended' },
    });

    const revalidated = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}/workspace`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(revalidated.status).toBe(200);
    expect(revalidated.body.data.capacityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capacity: 'resisted',
          eligible: false,
          reasonCode: 'prescription_not_active',
          reason: expect.stringContaining('suspended'),
        }),
      ])
    );

    const outsideSelfScope = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}/workspace`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(outsideSelfScope.status).toBe(404);

    const crossTenant = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}/workspace`)
      .set('Authorization', `Bearer ${tenantB.token}`);
    expect(crossTenant.status).toBe(404);
  });
});
