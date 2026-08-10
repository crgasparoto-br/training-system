import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { createStudentLead } from '../src/modules/alunos/student-lifecycle.service.js';
import {
  preRegistrationEnrollmentService,
  type PreRegistrationEnrollmentActor,
} from '../src/modules/pre-registration-enrollment/index.js';

const runScalarOwnershipIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' &&
  process.env.RUN_ISSUE_274_SCALAR_OWNERSHIP_TESTS === 'true';
const describeDatabase = runScalarOwnershipIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractId = 'issue-274-scalar-clinical-ownership';
const emailPrefix = 'issue-274-scalar-clinical-';
let sequence = 0;

async function seedActor(): Promise<PreRegistrationEnrollmentActor> {
  sequence += 1;
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Administrador',
      code: `issue-274-scalar-owner-${sequence}`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}actor-${sequence}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Administrador Issue 274' } },
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId,
      collaboratorFunctionId: collaboratorFunction.id,
      role: ProfessorRole.master,
    },
  });
  return { userId: user.id, professorId: professor.id, contractId };
}

async function createDuplicatePair(
  actor: PreRegistrationEnrollmentActor,
  suffix: string
) {
  const target = await createStudentLead({
    contractId,
    name: 'Pessoa Canônica',
    phone: '+55 15 98888-0274',
    email: `${emailPrefix}${suffix}-shared@example.com`,
    origin: `teste-${suffix}-target`,
    createdByProfessorId: actor.professorId,
  });
  const source = await createStudentLead({
    contractId,
    name: 'Pessoa Canônica',
    phone: '(15) 98888-0274',
    email: `${emailPrefix}${suffix}-shared@example.com`.toUpperCase(),
    origin: `teste-${suffix}-source`,
    createdByProfessorId: actor.professorId,
  });
  return { source, target };
}

describeDatabase('issue 274 scalar clinical ownership with PostgreSQL', () => {
  beforeEach(async () => {
    sequence = 0;
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: '57365610000247',
        name: 'Contrato Issue 274 Scalar Ownership',
      },
    });
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('blocks service consolidation when only scalar clinical data exists', async () => {
    const actor = await seedActor();
    const { source, target } = await createDuplicatePair(actor, 'service');
    await prisma.aluno.update({
      where: { id: source.id },
      data: { weight: 72.4, systolicPressure: 130 },
    });

    const review = await preRegistrationEnrollmentService.inspect(actor, source.id);
    expect(review.candidates.map((candidate) => candidate.candidateAlunoId)).toContain(target.id);

    await expect(
      preRegistrationEnrollmentService.decide(actor, source.id, {
        action: 'USE_EXISTING_CANONICAL',
        candidateAlunoId: target.id,
        reason: 'Mesma pessoa, mas dados clínicos escalares exigem reassociação assistida.',
        expectedVersion: review.recordVersion,
        fingerprint: review.fingerprint,
        fieldDecisions: {},
      })
    ).rejects.toMatchObject({
      code: 'HEALTH_REASSOCIATION_REQUIRED',
      details: { operationalPending: 'CLINICAL_REASSOCIATION_REQUIRED' },
    });

    const [sourceAfter, targetAfter] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: source.id } }),
      prisma.aluno.findUniqueOrThrow({ where: { id: target.id } }),
    ]);
    expect(sourceAfter.status).not.toBe('DISCARDED');
    expect(sourceAfter.canonicalAlunoId).toBeNull();
    expect(sourceAfter.weight).toBe(72.4);
    expect(sourceAfter.systolicPressure).toBe(130);
    expect(targetAfter.weight).toBeNull();
    expect(targetAfter.systolicPressure).toBeNull();
  });

  it('blocks direct duplicate-discard writes when only scalar clinical data exists', async () => {
    const actor = await seedActor();
    const { source, target } = await createDuplicatePair(actor, 'trigger');
    await prisma.aluno.update({
      where: { id: source.id },
      data: { restingHeartRate: 58, vo2Max: 46.2 },
    });

    await expect(
      prisma.aluno.update({
        where: { id: source.id },
        data: {
          status: 'DISCARDED',
          discardReason: `DUPLICATE_OF:${target.id}`,
        },
      })
    ).rejects.toThrow(/CLINICAL_REASSOCIATION_REQUIRED/);

    const sourceAfter = await prisma.aluno.findUniqueOrThrow({ where: { id: source.id } });
    expect(sourceAfter.status).not.toBe('DISCARDED');
    expect(sourceAfter.discardReason).toBeNull();
    expect(sourceAfter.canonicalAlunoId).toBeNull();
    expect(sourceAfter.restingHeartRate).toBe(58);
    expect(sourceAfter.vo2Max).toBe(46.2);
  });
});
