import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  StudentLifecycleStatus,
  UserType,
} from '@prisma/client';
import {
  CapacityPrescriptionDomainError,
  createCapacityPrescriptionExtensionService,
} from '../src/modules/capacity-prescriptions/index';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();
const service = createCapacityPrescriptionExtensionService(prisma);

const contractA = 'capacity-extension-contract-a';
const contractB = 'capacity-extension-contract-b';
const alunoA = 'capacity-extension-aluno-a';
const alunoB = 'capacity-extension-aluno-b';
const emailPrefix = 'capacity-extension-test-';

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
      name: `Função ${suffix}`,
      code: `capacity-extension-${suffix}`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}${suffix}@example.com`,
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

async function createAlunoAndGoal(input: {
  contractId: string;
  alunoId: string;
  professorId: string;
  suffix: string;
}) {
  const aluno = await prisma.aluno.create({
    data: {
      id: input.alunoId,
      contractId: input.contractId,
      professorId: input.professorId,
      status: StudentLifecycleStatus.ACTIVE_STUDENT,
    },
  });
  const record = await prisma.prontuarioRecord.create({
    data: {
      contractId: input.contractId,
      alunoId: aluno.id,
      professorId: input.professorId,
      code: `PRNT-EXT-${input.suffix}`,
      summary: 'Registro para integração da prescrição estendida',
    },
  });
  const goal = await prisma.prontuarioGoal.create({
    data: {
      recordId: record.id,
      title: `Objetivo ${input.suffix}`,
      priority: 1,
    },
  });
  return { aluno, goal };
}

describeDatabase('capacity prescription extension with PostgreSQL', () => {
  let professorA = '';
  let professorB = '';
  let goalA = '';
  let goalB = '';

  beforeEach(async () => {
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractA, contractB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });

    await createContract(contractA, '57365610000701');
    await createContract(contractB, '57365610000702');
    const createdProfessorA = await createProfessor(contractA, 'a');
    const createdProfessorB = await createProfessor(contractB, 'b');
    professorA = createdProfessorA.id;
    professorB = createdProfessorB.id;

    goalA = (
      await createAlunoAndGoal({
        contractId: contractA,
        alunoId: alunoA,
        professorId: professorA,
        suffix: 'A',
      })
    ).goal.id;
    goalB = (
      await createAlunoAndGoal({
        contractId: contractB,
        alunoId: alunoB,
        professorId: professorB,
        suffix: 'B',
      })
    ).goal.id;
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

  it('semeia e versiona catálogo técnico por contrato', async () => {
    const seeded = await service.seedCatalog(contractA, professorA);
    expect(seeded.created).toBeGreaterThan(0);

    const acronyms = await service.listCatalog(contractA, 'acronym');
    expect(acronyms.map((item) => item.code)).toEqual(
      expect.arrayContaining(['ADP', 'ORD', 'CHO', 'REG'])
    );

    const updated = await service.saveCatalogItem(
      { contractId: contractA, actorProfessorId: professorA },
      {
        category: 'acronym',
        code: 'ADP',
        name: 'Adaptação revisada',
        metadata: { source: 'integration-test' },
      }
    );
    expect(updated.version).toBe(2);
    expect(updated.name).toBe('Adaptação revisada');

    const current = await service.listCatalog(contractA, 'acronym');
    expect(current.filter((item) => item.code === 'ADP')).toHaveLength(1);
    expect(current.find((item) => item.code === 'ADP')?.version).toBe(2);

    const tenantB = await service.listCatalog(contractB, 'acronym');
    expect(tenantB).toHaveLength(0);
  });

  it('persiste a hierarquia macro, meso e micro com carga do microciclo', async () => {
    await service.seedCatalog(contractA, professorA);

    const macro = await service.savePlanningCycle(
      { contractId: contractA, alunoId: alunoA, actorProfessorId: professorA },
      {
        level: 'macro',
        code: 'MACRO-2026',
        name: 'Macrociclo 2026',
        objective: 'Preparação geral do aluno',
        status: 'planned',
      }
    );
    const meso = await service.savePlanningCycle(
      { contractId: contractA, alunoId: alunoA, actorProfessorId: professorA },
      {
        parentId: macro.id,
        level: 'meso',
        code: 'MESO-01',
        name: 'Mesociclo de adaptação',
        objective: 'Criar base para progressão',
        status: 'planned',
      }
    );
    const micro = await service.savePlanningCycle(
      { contractId: contractA, alunoId: alunoA, actorProfessorId: professorA },
      {
        parentId: meso.id,
        level: 'micro',
        code: 'MICRO-01',
        name: 'Microciclo inicial',
        loadCode: 'adp',
        volume: '3 sessões',
        frequency: '3x por semana',
        capacityParameters: {
          resisted: { sets: 3, repetitions: '8-12' },
        },
        status: 'planned',
      }
    );

    expect(micro.parentId).toBe(meso.id);
    expect(micro.loadCode).toBe('ADP');
    expect(micro.capacityParameters).toEqual({
      resisted: {
        type: 'resisted',
        resisted: { sets: 3, repetitions: '8-12' },
      },
    });

    const planning = await service.listPlanning(contractA, alunoA);
    expect(planning.map((item) => item.level)).toEqual(
      expect.arrayContaining(['macro', 'meso', 'micro'])
    );
  });

  it('rejeita parâmetros livres e carga inexistente na chamada direta ao serviço', async () => {
    await service.seedCatalog(contractA, professorA);

    await expect(
      service.savePlanningCycle(
        { contractId: contractA, alunoId: alunoA, actorProfessorId: professorA },
        {
          level: 'macro',
          code: 'MACRO-LIVRE',
          name: 'Macrociclo livre',
          capacityParameters: {
            invented: { hiddenFormula: '=A1*B1' },
          } as never,
        }
      )
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Capacidade técnica inválida no planejamento: invented',
    });

    await expect(
      service.savePlanningCycle(
        { contractId: contractA, alunoId: alunoA, actorProfessorId: professorA },
        {
          parentId: 'meso-inexistente',
          level: 'micro',
          code: 'MICRO-CARGA-LIVRE',
          name: 'Microciclo com carga livre',
          loadCode: 'UNKNOWN',
        }
      )
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Código de carga do microciclo inválido ou inativo',
    });
  });

  it('rejeita hierarquia inválida antes da persistência', async () => {
    await expect(
      service.savePlanningCycle(
        { contractId: contractA, alunoId: alunoA, actorProfessorId: professorA },
        {
          level: 'micro',
          code: 'MICRO-SEM-PAI',
          name: 'Microciclo sem mesociclo',
          status: 'planned',
        }
      )
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('classifica objetivo do mesmo tenant e não enumera objetivo externo', async () => {
    const saved = await service.saveGoalClassification(
      {
        contractId: contractA,
        alunoId: alunoA,
        actorProfessorId: professorA,
        goalId: goalA,
      },
      {
        capacities: ['resisted', 'flexibility'],
        relatesToAssessment: true,
        relatesToActionPlan: true,
      }
    );
    expect(saved.capacities).toEqual(['resisted', 'flexibility']);
    expect(saved.relatesToAssessment).toBe(true);

    await expect(
      service.saveGoalClassification(
        {
          contractId: contractA,
          alunoId: alunoA,
          actorProfessorId: professorA,
          goalId: goalB,
        },
        {
          capacities: ['cyclic'],
          relatesToAssessment: false,
          relatesToActionPlan: true,
        }
      )
    ).rejects.toBeInstanceOf(CapacityPrescriptionDomainError);

    const classifications = await service.listGoalClassifications(contractA, alunoA);
    expect(classifications).toHaveLength(1);
    expect(classifications[0].goalId).toBe(goalA);
  });
});
