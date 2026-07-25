import { PrismaClient } from '@prisma/client';
import { PARQ_CATALOG_VERSION } from '@corrida/types';
import { preRegistrationParqService, ParqServiceError } from '../src/modules/pre-registration-public/pre-registration-parq.service.js';

const prisma = new PrismaClient();
const ids = {
  contract: 'issue-273-runtime-contract',
  otherContract: 'issue-273-runtime-other-contract',
  studentUser: 'issue-273-runtime-student-user',
  otherUser: 'issue-273-runtime-other-user',
  professorUser: 'issue-273-runtime-professor-user',
  function: 'issue-273-runtime-function',
  professor: 'issue-273-runtime-professor',
  aluno: 'issue-273-runtime-aluno',
};

const negative = { q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false } as const;
const positive = { ...negative, q2: true, q5: true };
const consent = { accepted: true as const, privacyNoticeVersion: '2026-07' };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectCode(action: () => Promise<unknown>, code: string) {
  try {
    await action();
  } catch (error) {
    const actual = error instanceof ParqServiceError
      ? error.code
      : (error as { code?: string })?.code;
    if (actual === code) return;
    throw new Error(`Expected ${code}, received ${actual || String(error)}`);
  }
  throw new Error(`Expected ${code}, but operation succeeded`);
}

async function cleanup() {
  await prisma.companyContract.deleteMany({ where: { id: { in: [ids.contract, ids.otherContract] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.studentUser, ids.otherUser, ids.professorUser] } } });
}

async function main() {
  await cleanup();
  await prisma.companyContract.createMany({
    data: [
      { id: ids.contract, type: 'academy', document: 'issue-273-runtime-contract-document', name: 'Issue 273 Runtime' },
      { id: ids.otherContract, type: 'academy', document: 'issue-273-runtime-other-document', name: 'Issue 273 Other Tenant' },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: ids.studentUser, email: 'issue273-student@example.test', passwordHash: 'not-used', type: 'aluno' },
      { id: ids.otherUser, email: 'issue273-other@example.test', passwordHash: 'not-used', type: 'aluno' },
      { id: ids.professorUser, email: 'issue273-professor@example.test', passwordHash: 'not-used', type: 'professor' },
    ],
  });
  await prisma.collaboratorFunctionOption.create({
    data: { id: ids.function, contractId: ids.contract, name: 'Profissional de saúde', code: 'issue-273-health', isSystem: false },
  });
  await prisma.professor.create({
    data: { id: ids.professor, userId: ids.professorUser, contractId: ids.contract, collaboratorFunctionId: ids.function, role: 'master' },
  });
  await prisma.aluno.create({
    data: {
      id: ids.aluno,
      contractId: ids.contract,
      userId: ids.studentUser,
      status: 'PRE_REGISTRATION_COMPLETED',
      leadName: 'Aluno Issue 273',
      birthDate: new Date('1990-01-10T00:00:00.000Z'),
      onboarding: {
        create: {
          contractId: ids.contract,
          claimedByUserId: ids.studentUser,
          claimedAt: new Date(),
          claimRole: 'STUDENT',
          privacyNoticeVersion: '2026-07',
          privacyAcceptedAt: new Date(),
        },
      },
    },
  });

  const first = await preRegistrationParqService.saveDraft(ids.studentUser, ids.aluno, {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: 1,
    responses: { q1: false, q2: true },
    consent,
  });
  assert(first.status === 'IN_PROGRESS' && first.version === 1, 'first server draft was not persisted');

  const resumed = await preRegistrationParqService.getSession(ids.studentUser, ids.aluno);
  assert(resumed.responses.q2 === true, 'draft was not resumable from a new request');

  const second = await preRegistrationParqService.saveDraft(ids.studentUser, ids.aluno, {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: 1,
    responses: positive,
    consent,
  });
  assert(second.version === 2, 'optimistic version was not incremented');

  await expectCode(
    () => preRegistrationParqService.saveDraft(ids.studentUser, ids.aluno, {
      catalogVersion: PARQ_CATALOG_VERSION,
      expectedVersion: 1,
      responses: negative,
      consent,
    }),
    'CONCURRENT_MODIFICATION'
  );
  await expectCode(() => preRegistrationParqService.getSession(ids.otherUser, ids.aluno), 'NOT_FOUND');

  const completed = await preRegistrationParqService.complete(ids.studentUser, ids.aluno, {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: 2,
    responses: positive,
    consent,
    declarationAccepted: true,
    idempotencyKey: 'issue-273-positive-retry',
  });
  assert(completed.status === 'COMPLETED_REVIEW_REQUIRED', 'positive completion did not require review');
  assert(completed.latestSubmission?.positiveCount === 2, 'positive count was not computed by the backend');

  await preRegistrationParqService.complete(ids.studentUser, ids.aluno, {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: 2,
    responses: positive,
    consent,
    declarationAccepted: true,
    idempotencyKey: 'issue-273-positive-retry',
  });
  assert(
    await prisma.studentParqSubmission.count({ where: { alunoId: ids.aluno, idempotencyKey: 'issue-273-positive-retry' } }) === 1,
    'idempotent retry duplicated history'
  );

  const next = await preRegistrationParqService.complete(ids.studentUser, ids.aluno, {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: 1,
    responses: negative,
    consent,
    declarationAccepted: true,
    idempotencyKey: 'issue-273-deliberate-new-submission',
  });
  assert(next.status === 'COMPLETED_NO_ALERT', 'new all-negative submission did not become the latest state');
  assert(await prisma.studentParqSubmission.count({ where: { alunoId: ids.aluno } }) === 2, 'deliberate new submission did not preserve history');

  const pending = await prisma.studentParqProfessionalReview.findFirstOrThrow({
    where: { alunoId: ids.aluno, status: 'PENDING' },
  });
  await preRegistrationParqService.reviewProfessional(ids.contract, ids.aluno, pending.id, ids.professor, {
    reviewNotes: 'Análise registrada sem alterar o histórico clínico.',
  });
  const reviewed = await prisma.studentParqProfessionalReview.findUniqueOrThrow({ where: { id: pending.id } });
  assert(reviewed.status === 'REVIEWED' && reviewed.reviewedByProfessorId === ids.professor, 'professional review was not audited');
  assert((await prisma.aluno.findUniqueOrThrow({ where: { id: ids.aluno } })).parqRequiresProfessionalReview === false, 'derived review projection remained stale');

  await expectCode(() => preRegistrationParqService.listSubmissions(ids.otherContract, ids.aluno), 'NOT_FOUND');
  const onboarding = await prisma.studentOnboardingProcess.findUniqueOrThrow({ where: { alunoId: ids.aluno } });
  assert(onboarding.parqModuleStatus === 'COMPLETED' && onboarding.parqSubmissionId, 'onboarding reference/state was not updated');
  assert(!('responses' in onboarding), 'onboarding duplicated health responses');

  const lifecycle = await prisma.studentLifecycleEvent.findMany({ where: { alunoId: ids.aluno } });
  for (const required of ['PARQ_STARTED', 'PARQ_SAVED', 'PARQ_COMPLETED', 'PARQ_REVIEWED']) {
    assert(lifecycle.some((event) => event.eventType === required), `missing lifecycle event ${required}`);
  }

  console.log('Issue #273 runtime verified: resume, concurrency, authentication, idempotency, history, review and tenant isolation.');
}

main()
  .then(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
    process.exit(1);
  });
