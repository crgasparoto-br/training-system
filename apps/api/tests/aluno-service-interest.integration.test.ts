import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { alunoService } from '../src/modules/alunos/aluno.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractA = 'service-interest-contract-a';
const contractB = 'service-interest-contract-b';
const emailPrefix = 'service-interest-test-';

async function createContract(id: string, document: string) {
  return prisma.companyContract.create({
    data: {
      id,
      type: ContractType.academy,
      document,
      name: `Contrato ${id}`,
    },
  });
}

async function createProfessor(contractId: string, suffix: string) {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Professor',
      code: `professor-${suffix}`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}professor-${suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: `Professor ${suffix}` } },
    },
  });

  return prisma.professor.create({
    data: {
      userId: user.id,
      contractId,
      role: ProfessorRole.master,
      collaboratorFunctionId: collaboratorFunction.id,
    },
  });
}

async function createService(
  contractId: string,
  suffix: string,
  options: { isActive?: boolean; parentServiceId?: string | null; origin?: string } = {}
) {
  return prisma.serviceOption.create({
    data: {
      contractId,
      name: `Serviço ${suffix}`,
      code: `service_interest_${suffix}`,
      category: 'individual_service',
      displayOrder: 0,
      origin: options.origin ?? 'manual',
      isActive: options.isActive ?? true,
      parentServiceId: options.parentServiceId,
    },
  });
}

async function createExistingAluno(
  professorId: string,
  serviceId: string,
  suffix: string
) {
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}aluno-${suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.aluno,
      profile: { create: { name: `Aluno ${suffix}` } },
    },
  });

  return prisma.aluno.create({
    data: {
      userId: user.id,
      professorId,
      serviceId,
      schedulePlan: 'free',
      age: 35,
    },
  });
}

describeDatabase('student service interest with PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractA, contractB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await createContract(contractA, '57365610000201');
    await createContract(contractB, '57365610000202');
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractA, contractB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a new student with an active main service from the same contract', async () => {
    const professor = await createProfessor(contractA, 'new-student');
    const service = await createService(contractA, 'active-main');

    const result = await alunoService.create({
      name: 'Aluno Novo',
      email: `${emailPrefix}new@example.com`,
      professorId: professor.id,
      serviceId: service.id,
      schedulePlan: 'free',
      age: 29,
    });

    expect(result.aluno.serviceId).toBe(service.id);
  });

  it('keeps an already linked migrated service after it becomes inactive', async () => {
    const professor = await createProfessor(contractA, 'inactive-current');
    const service = await createService(contractA, 'migrated-current', {
      isActive: false,
      origin: 'reference_2026',
    });
    const aluno = await createExistingAluno(
      professor.id,
      service.id,
      'inactive-current'
    );

    const updated = await alunoService.update(aluno.id, {
      serviceId: service.id,
      age: 36,
    });

    expect(updated.serviceId).toBe(service.id);
    expect(updated.age).toBe(36);
  });

  it('preserves a legacy service that is not part of the initial catalog on partial update', async () => {
    const professor = await createProfessor(contractA, 'legacy');
    const legacyService = await createService(contractA, 'legacy-unmapped', {
      origin: 'legacy',
    });
    const aluno = await createExistingAluno(
      professor.id,
      legacyService.id,
      'legacy'
    );

    const updated = await alunoService.update(aluno.id, { weight: 72.5 });

    expect(updated.serviceId).toBe(legacyService.id);
    expect(updated.weight).toBe(72.5);
  });

  it('keeps an inactive current service readable but rejects it for a new student', async () => {
    const professor = await createProfessor(contractA, 'inactive-new');
    const service = await createService(contractA, 'inactive-new', {
      isActive: false,
    });
    const existing = await createExistingAluno(
      professor.id,
      service.id,
      'inactive-existing'
    );

    await expect(
      alunoService.update(existing.id, { age: 40 })
    ).resolves.toMatchObject({ serviceId: service.id, age: 40 });

    await expect(
      alunoService.create({
        name: 'Aluno Novo Inativo',
        email: `${emailPrefix}new-inactive@example.com`,
        professorId: professor.id,
        serviceId: service.id,
        schedulePlan: 'free',
        age: 30,
      })
    ).rejects.toThrow('Serviço selecionado está inativo');
  });

  it('does not erase the persisted selection when an edit targets another contract', async () => {
    const professorA = await createProfessor(contractA, 'tenant-a');
    const serviceA = await createService(contractA, 'tenant-a');
    const serviceB = await createService(contractB, 'tenant-b');
    const aluno = await createExistingAluno(professorA.id, serviceA.id, 'tenant-a');

    await expect(
      alunoService.update(aluno.id, { serviceId: serviceB.id, age: 41 })
    ).rejects.toThrow('Serviço não encontrado');

    await expect(
      prisma.aluno.findUniqueOrThrow({ where: { id: aluno.id } })
    ).resolves.toMatchObject({ serviceId: serviceA.id, age: 35 });
  });

  it('does not remove the current service when serviceId is omitted', async () => {
    const professor = await createProfessor(contractA, 'partial');
    const service = await createService(contractA, 'partial');
    const aluno = await createExistingAluno(professor.id, service.id, 'partial');

    const updated = await alunoService.update(aluno.id, {
      restingHeartRate: 55,
    });

    expect(updated.serviceId).toBe(service.id);
    expect(updated.restingHeartRate).toBe(55);
  });
});
