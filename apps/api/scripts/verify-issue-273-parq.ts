import { PrismaClient } from '@prisma/client';
import { PARQ_CATALOG_VERSION } from '@corrida/types';
import {
  preRegistrationParqService,
  ParqServiceError,
} from '../src/modules/pre-registration-public/pre-registration-parq.service.js';

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

const negative = {
  q1: false,
  q2: false,
  q3: false,
  q4: false,
  q5: false,
  q6: false,
  q7: false,
} as const;
const positive = { ...negative, q2: true, q5: true };
const consent = (expectedVersion: number) => ({
  accepted: true as const,
  privacyNoticeVersion: '2026-07',
  expectedVersion,
});

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
  await prisma.companyContract.deleteMany({
    where: { id: { in: [ids.contract, ids.otherContract] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ids.studentUser, ids.otherUser, ids.professorUser] } },
  });
}

async function main() {
  await cleanup();
  await prisma.companyContract.createMany({
    data: [
      {
        id: ids.contract,
        type: 'academy',
        document: 'issue-273-runtime-contract-document',
        name: 'Issue 273 Runtime',
      },
      {
        id: ids.otherContract,
        type: 'academy',
        document: 'issue-273-runtime-other-document',
        name: 'Issue 273 Other Tenant',
      },
    ],
  });
  await prisma.user.createMany({
    data: [
      {
        id: ids.studentUser,
        email: 'issue273-student@example.test',
        passwordHash: 'not-used',
        type: 'aluno',
      },
      {
        id: ids.otherUser,
        email: 'issue273-other@example.test',
        passwordHash: 'not-used',
        type: 'aluno',
      },
      {
        id: ids.professorUser,
        email: 'issue273-professor@example.test',
        passwordHash: 'not-used',
        type: 'professor',
      },
    ],
  });
  await prisma.collaboratorFunctionOption.create({
    data: {
      id: ids.function,
      contractId: ids.contract,
      name: 'Profissional de saúde',
      code: 'issue-273-health',
      isSystem: false,
    },
  });
  await prisma.professor.create({
    data: {
      id: ids.professor,
      userId: ids.professorUser,
      contractId: ids.contract,
      collaboratorFunctionId: ids.function,
      role: 'master',
    },
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

  const initialA = await preRegistrationParqService.getSession(ids.studentUser, ids.aluno);
  const initialB = await preRegistrationParqService.getSession(ids.studentUser, ids.aluno);
  assert(initialA.version === 1 && initialB.version === 1, 'initial sessions did not share generation 1');
  assert(initialA.consent.version === 1, 'initial consent generation was not returned');

  const first = await preRegistrationParqService.saveDraft(ids.studentUser, ids.aluno, {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: 1,
    responses: { q1: false, q2: true },
    consent: consent(1),
  });
  assert(first.status === 'IN_PROGRESS' && first.version === 2, 'first draft did not advance the server generation');
  assert(first.consent.acceptedAt && first.consent.version === 1, 'first consent acceptance was not persisted');

  await expectCode(
    () => preRegistrationParqService.saveDraft(ids.studentUser, ids.aluno, {
      catalogVersion: PARQ_CATALOG_VERSION,
      expectedVersion: initialB.version,
      responses: negative,
      consent: consent(1),
    }),
    'CONCURRENT_MODIFICATION'
  );

  const resumed = await preRegistrationParqService.getSession(ids.studentUser, ids.aluno);
  assert(resumed.responses.q2 === true && resumed.version === 2, 'draft was not resumable');

  const second = await preRegistrationParqService.saveDraft(ids.studentUser, ids.aluno, {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: 2,
    responses: positive,
    consent: consent(1),
  });
  assert(second.version === 3, 'subsequent draft did not advance the generation');

  await expectCode(
    () => preRegistrationParqService.getSession(ids.otherUser, ids.aluno),
    'NOT_FOUND'
  );

  const completed = await preRegistrationParqService.complete(ids.studentUser, ids.aluno, {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: 3,
    responses: positive,
    consent: consent(1),
    declarationAccepted: true,
    idempotencyKey: 'issue-273-positive-retry',
  });
  assert(completed.status === 'COMPLETED_REVIEW_REQUIRED', 'positive completion did not require review');
  assert(completed.latestSubmission?.positiveCount === 2, 'positive count was not computed by the backend');
  assert(completed.version === 4, 'completion did not consume the session generation');
  const firstSubmissionId = completed.latestSubmission?.id;
  assert(firstSubmissionId, 'first submission id was not returned');

  await expectCode(
    () => preRegistrationParqService.complete(ids.studentUser, ids.aluno, {
      catalogVersion: PARQ_CATALOG_VERSION,
      expectedVersion: 3,
      responses: negative,
      consent: consent(1),
      declarationAccepted: true,
      idempotencyKey: 'issue-273-stale-second-tab',
    }),
    'CONCURRENT_MODIFICATION'
  );

  const immediateRetry = await preRegistrationParqService.complete(ids.studentUser, ids.aluno, {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: 3,
    responses: positive,
    consent: consent(1),
    declarationAccepted: true,
    idempotencyKey: 'issue-273-positive-retry',
  });
  assert(immediateRetry.replayedSubmission?.id === firstSubmissionId, 'immediate retry did not identify the original submission');
  assert(
    await prisma.studentParqSubmission.count({
      where: { alunoId: ids.aluno, idempotencyKey: 'issue-273-positive-retry' },
    }) === 1,
    'idempotent retry duplicated history'
  );

  const revoked = await preRegistrationParqService.revokeConsent(ids.studentUser, ids.aluno, 1);
  assert(revoked.consent.version === 2 && revoked.consent.revokedAt, 'consent revocation was not persisted');
  assert(revoked.latestSubmission?.id === firstSubmissionId, 'revocation changed completed history');

  await expectCode(
    () => preRegistrationParqService.complete(ids.studentUser, ids.aluno, {
      catalogVersion: PARQ_CATALOG_VERSION,
      expectedVersion: 4,
      responses: negative,
      consent: consent(1),
      declarationAccepted: true,
      idempotencyKey: 'issue-273-stale-consent',
    }),
    'CONCURRENT_MODIFICATION'
  );

  const next = await preRegistrationParqService.complete(ids.studentUser, ids.aluno, {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: 4,
    responses: negative,
    consent: consent(2),
    declarationAccepted: true,
    idempotencyKey: 'issue-273-deliberate-new-submission',
  });
  assert(next.status === 'COMPLETED_NO_ALERT', 'new all-negative submission did not become latest');
  assert(next.consent.version === 3 && next.consent.acceptedAt && !next.consent.revokedAt, 'new acceptance did not reactivate consent');
  assert(next.version === 5, 'new deliberate response did not advance generation');
  assert(
    await prisma.studentParqSubmission.count({ where: { alunoId: ids.aluno } }) === 2,
    'new deliberate submission did not preserve history'
  );
  assert(
    (await prisma.aluno.findUniqueOrThrow({ where: { id: ids.aluno } }))
      .parqRequiresProfessionalReview === true,
    'new negative submission cleared an older pending review'
  );

  const delayedRetry = await preRegistrationParqService.complete(ids.studentUser, ids.aluno, {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: 3,
    responses: positive,
    consent: consent(1),
    declarationAccepted: true,
    idempotencyKey: 'issue-273-positive-retry',
  });
  assert(delayedRetry.latestSubmission?.id === next.latestSubmission?.id, 'retry changed current latest state');
  assert(delayedRetry.replayedSubmission?.id === firstSubmissionId, 'delayed retry did not return original submission');

  const adminSummary = await preRegistrationParqService.summary(ids.contract, ids.aluno);
  const serializedSummary = JSON.stringify(adminSummary);
  assert(adminSummary.latestSubmission?.positiveCount === 0, 'admin summary did not expose the authorized count');
  for (const forbidden of ['responses', 'positiveItems', 'reviewNotes', 'q1', 'q2']) {
    assert(!serializedSummary.includes(`"${forbidden}"`), `admin summary leaked ${forbidden}`);
  }

  const pending = await prisma.studentParqProfessionalReview.findFirstOrThrow({
    where: { alunoId: ids.aluno, status: 'PENDING' },
  });
  await preRegistrationParqService.reviewProfessional(
    ids.contract,
    ids.aluno,
    pending.id,
    ids.professor,
    { reviewNotes: 'Análise registrada sem alterar o histórico clínico.' }
  );
  const reviewed = await prisma.studentParqProfessionalReview.findUniqueOrThrow({
    where: { id: pending.id },
  });
  assert(
    reviewed.status === 'REVIEWED' && reviewed.reviewedByProfessorId === ids.professor,
    'professional review was not audited'
  );
  assert(
    (await prisma.aluno.findUniqueOrThrow({ where: { id: ids.aluno } }))
      .parqRequiresProfessionalReview === false,
    'review projection remained stale after the final pending review was closed'
  );

  await expectCode(
    () => preRegistrationParqService.listSubmissions(ids.otherContract, ids.aluno),
    'NOT_FOUND'
  );
  const onboarding = await prisma.studentOnboardingProcess.findUniqueOrThrow({
    where: { alunoId: ids.aluno },
  });
  assert(onboarding.parqModuleStatus === 'COMPLETED' && onboarding.parqSubmissionId, 'onboarding reference/state was not updated');
  assert(onboarding.parqConsentVersion === 3, 'consent generation was not stored in onboarding');
  assert(!('responses' in onboarding), 'onboarding duplicated health responses');

  const lifecycle = await prisma.studentLifecycleEvent.findMany({
    where: { alunoId: ids.aluno },
  });
  for (const required of [
    'PARQ_STARTED',
    'PARQ_SAVED',
    'PARQ_COMPLETED',
    'PARQ_REVIEWED',
    'PARQ_CONSENT_ACCEPTED',
    'PARQ_CONSENT_REVOKED',
  ]) {
    assert(
      lifecycle.some((event) => event.eventType === required),
      `missing lifecycle event ${required}`
    );
  }

  console.log(
    'Issue #273 runtime verified: privacy boundary, resumable drafts, session concurrency, exact idempotent replay, consent lifecycle, review projection and tenant isolation.'
  );
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
