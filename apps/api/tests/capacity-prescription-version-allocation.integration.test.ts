import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  StudentLifecycleStatus,
  UserType,
} from '@prisma/client';
import { createCapacityPrescriptionExtensionService } from '../src/modules/capacity-prescriptions/index';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();
const service = createCapacityPrescriptionExtensionService(prisma);

const contractId = 'capacity-version-lock-contract';
const alunoId = 'capacity-version-lock-aluno';
const email = 'capacity-version-lock@example.com';

describeDatabase('capacity version allocation with PostgreSQL', () => {
  let professorId = '';

  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { email } });

    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: '57365610000951',
        name: 'Contrato concorrência da prescrição',
      },
    });
    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId,
        name: 'Professor concorrência',
        code: 'capacity-version-lock-professor',
        isActive: true,
      },
    });
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'test-hash',
        type: UserType.professor,
        profile: { create: { name: 'Professor Concorrência' } },
      },
    });
    const professor = await prisma.professor.create({
      data: {
        userId: user.id,
        contractId,
        role: ProfessorRole.master,
        collaboratorFunctionId: collaboratorFunction.id,
      },
    });
    professorId = professor.id;
    await prisma.aluno.create({
      data: {
        id: alunoId,
        contractId,
        professorId,
        status: StudentLifecycleStatus.ACTIVE_STUDENT,
      },
    });
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('aloca versões distintas para ciclos concorrentes da mesma chave lógica', async () => {
    const results = await Promise.all([
      service.savePlanningCycle(
        { contractId, alunoId, actorProfessorId: professorId },
        { level: 'macro', code: 'MACRO-CONCURRENT', name: 'Macrociclo A' }
      ),
      service.savePlanningCycle(
        { contractId, alunoId, actorProfessorId: professorId },
        { level: 'macro', code: 'MACRO-CONCURRENT', name: 'Macrociclo B' }
      ),
    ]);

    expect(results.map((item) => item.version).sort()).toEqual([1, 2]);
    const persisted = await service.listPlanning(contractId, alunoId);
    expect(
      persisted
        .filter((item) => item.code === 'MACRO-CONCURRENT')
        .map((item) => item.version)
        .sort()
    ).toEqual([1, 2]);
  });

  it('aloca versões distintas e mantém apenas um catálogo atual sob concorrência', async () => {
    const results = await Promise.all([
      service.saveCatalogItem(
        { contractId, actorProfessorId: professorId },
        { category: 'method', code: 'CONCURRENT_METHOD', name: 'Método A' }
      ),
      service.saveCatalogItem(
        { contractId, actorProfessorId: professorId },
        { category: 'method', code: 'CONCURRENT_METHOD', name: 'Método B' }
      ),
    ]);

    expect(results.map((item) => item.version).sort()).toEqual([1, 2]);
    const history = await service.listCatalog(contractId, 'method', true);
    const concurrentItems = history.filter((item) => item.code === 'CONCURRENT_METHOD');
    expect(concurrentItems.map((item) => item.version).sort()).toEqual([1, 2]);
    expect(concurrentItems.filter((item) => item.isCurrent)).toHaveLength(1);
    expect(concurrentItems.find((item) => item.isCurrent)?.version).toBe(2);
  });
});
