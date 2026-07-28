import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { syncAccessPermissionsForFunction } from '../src/modules/access-control/access-control.service.js';
import { createStudentLead } from '../src/modules/alunos/student-lifecycle.service.js';
import {
  preRegistrationEnrollmentService,
  type PreRegistrationEnrollmentActor,
} from '../src/modules/pre-registration-enrollment/index.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();
const suffix = `issue-274-clinical-guard-${Date.now()}`;
const contractId = `${suffix}-contract`;
const createdUserIds: string[] = [];
let actorSequence = 0;
let pairSequence = 0;

async function createActor(): Promise<PreRegistrationEnrollmentActor> {
  actorSequence += 1;
  const label = `${suffix}-${actorSequence}`;
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: `Administrador clínico ${actorSequence}`,
      code: `${label}-admin`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${label}-actor@example.com`,
      passwordHash: 'integration-test-hash',
      type: UserType.professor,
      profile: { create: { name: `Administrador clínico ${actorSequence}` } },
    },
  });
  createdUserIds.push(user.id);
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId,
      collaboratorFunctionId: collaboratorFunction.id,
      role: ProfessorRole.master,
    },
  });
  await syncAccessPermissionsForFunction(collaboratorFunction.id, collaboratorFunction.code);
  await prisma.accessPermission.updateMany({
    where: { collaboratorFunctionId: collaboratorFunction.id },
    data: { canView: true, dataScope: 'contract' },
  });
  return { userId: user.id, professorId: professor.id, contractId };
}

async function createDuplicatePair(actor: PreRegistrationEnrollmentActor) {
  pairSequence += 1;
  const phoneSuffix = String(2700 + pairSequence).padStart(4, '0');
  const sharedEmail = `${suffix}-shared-${pairSequence}@example.com`;
  const target = await createStudentLead({
    contractId,
    name: `Pessoa com avaliação ${pairSequence}`,
    phone: `+55 15 98888-${phoneSuffix}`,
    email: sharedEmail,
    origin: 'target',
    createdByProfessorId: actor.professorId,
  });
  const source = await createStudentLead({
    contractId,
    name: `Pessoa com avaliação ${pairSequence}`,
    phone: `(15) 98888-${phoneSuffix}`,
    email: sharedEmail.toUpperCase(),
    origin: 'source',
    createdByProfessorId: actor.professorId,
  });
  return { source, target };
}

describeDatabase('issue 274 clinical ownership consolidation guard', () => {
  beforeAll(async () => {
    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: `${Date.now()}2747`,
        name: 'Contrato Issue 274 Clinical Guard',
      },
    });
  });

  afterAll(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    for (const userId of createdUserIds.reverse()) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('blocks consolidation when only a StudentAssessmentRecord exists and preserves both records', async () => {
    const actor = await createActor();
    const { source, target } = await createDuplicatePair(actor);
    const assessment = await prisma.studentAssessmentRecord.create({
      data: {
        alunoId: source.id,
        contractId,
        assessmentCategory: 'physical_assessment',
        title: 'Avaliação física canônica',
        performedAt: new Date('2026-07-28T08:00:00.000Z'),
      },
    });

    const review = await preRegistrationEnrollmentService.inspect(actor, source.id);
    expect(review.candidates.map((candidate) => candidate.candidateAlunoId)).toContain(target.id);

    await expect(
      preRegistrationEnrollmentService.decide(actor, source.id, {
        action: 'USE_EXISTING_CANONICAL',
        candidateAlunoId: target.id,
        reason: 'Mesma pessoa confirmada, mas a avaliação deve impedir consolidação automática.',
        expectedVersion: review.recordVersion,
        fingerprint: review.fingerprint,
        fieldDecisions: {},
      })
    ).rejects.toMatchObject({
      code: 'HEALTH_REASSOCIATION_REQUIRED',
      details: { operationalPending: 'CLINICAL_REASSOCIATION_REQUIRED' },
    });

    const [sourceAfter, targetAfter, assessmentAfter] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: source.id } }),
      prisma.aluno.findUniqueOrThrow({ where: { id: target.id } }),
      prisma.studentAssessmentRecord.findUniqueOrThrow({ where: { id: assessment.id } }),
    ]);
    expect(sourceAfter.status).not.toBe('DISCARDED');
    expect(sourceAfter.canonicalAlunoId).toBeNull();
    expect(targetAfter.canonicalAlunoId).toBeNull();
    expect(assessmentAfter.alunoId).toBe(source.id);
  });

  it('enforces the same invariant in PostgreSQL for direct writes', async () => {
    const actor = await createActor();
    const { source, target } = await createDuplicatePair(actor);
    await prisma.studentAssessmentRecord.create({
      data: {
        alunoId: source.id,
        contractId,
        assessmentCategory: 'physical_assessment',
        performedAt: new Date('2026-07-28T08:05:00.000Z'),
      },
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
  });
});
