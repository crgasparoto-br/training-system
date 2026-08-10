import { Prisma, PrismaClient } from '@prisma/client';
import {
  loadStudentIdentity,
  lockStudentIdentityDeduplicationScope,
  upsertStudentIdentity,
} from '../src/modules/alunos/student-identity.service.js';
import { preRegistrationPublicAtomicService } from '../src/modules/pre-registration-public/pre-registration-public-atomic.service.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const prisma = new PrismaClient();
const writerPrisma = new PrismaClient();
const suffix = `issue-274-loop-${Date.now()}`;
const contractId = `${suffix}-contract`;
const userIds: string[] = [];

type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createStudentUser(label: string, name: string, email: string) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'integration-test-hash',
      type: 'aluno',
      profile: { create: { name } },
    },
  });
  userIds.push(user.id);
  return user;
}

async function createStudentRecord(input: {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'LEAD' | 'INVITED';
  userId?: string;
  claimed?: boolean;
}) {
  await prisma.aluno.create({
    data: {
      id: input.id,
      contractId,
      status: input.status,
      userId: input.userId,
      leadOrigin: 'issue-274-loop-test',
      onboarding: {
        create: {
contractId,
claimedByUserId: input.claimed ? input.userId : undefined,
claimedAt: input.claimed ? new Date() : undefined,
claimRole: 'STUDENT',
        },
      },
    },
  });
  await upsertStudentIdentity(
    input.id,
    contractId,
    {
      name: input.name,
      email: input.email,
      phone: input.phone,
      birthDate: '1990-01-10',
    },
    { sourceType: 'professional', sourceReference: 'issue_274_loop_fixture' }
  );
}

describeDatabase('issue 274 audit findings 17-19 remediation', () => {
  beforeAll(async () => {
    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: 'academy',
        document: `${Date.now()}274loop`,
        name: 'Contrato Issue 274 Loop',
      },
    });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "issue274_test_claim_review_failure" ON "StudentProfileReview"'
    ).catch(() => undefined);
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS "issue274_test_claim_review_failure"()'
    ).catch(() => undefined);
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    for (const userId of userIds.reverse()) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await Promise.all([prisma.$disconnect(), writerPrisma.$disconnect()]);
  });

  it('serializes a concurrent candidate identity write before the public duplicate decision', async () => {
    const sharedEmail = `${suffix}-race-shared@example.com`;
    const sourceEmail = `${suffix}-race-source@example.com`;
    const user = await createStudentUser('race', 'Pessoa Corrida', sourceEmail);
    const sourceId = `${suffix}-race-source`;
    const candidateId = `${suffix}-race-candidate`;
    await createStudentRecord({
      id: sourceId,
      name: 'Pessoa Corrida',
      email: sourceEmail,
      phone: '+55 15 95555-1001',
      status: 'INVITED',
      userId: user.id,
      claimed: true,
    });
    await createStudentRecord({
      id: candidateId,
      name: 'Outra Pessoa',
      email: `${suffix}-race-candidate@example.com`,
      phone: '+55 15 95555-1002',
      status: 'LEAD',
    });

    const candidateWritten = deferred();
    const releaseCandidate = deferred();
    const writer = writerPrisma.$transaction(async (tx) => {
      await lockStudentIdentityDeduplicationScope(tx, contractId);
      await upsertStudentIdentity(
        candidateId,
        contractId,
        { email: sharedEmail },
        {
client: tx,
sourceType: 'professional',
sourceReference: 'issue_274_concurrent_candidate',
        }
      );
      candidateWritten.resolve();
      await releaseCandidate.promise;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
    await candidateWritten.promise;

    const onboardingBeforeSave = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId: sourceId },
      select: { version: true },
    });
    let settled = false;
    const save = preRegistrationPublicAtomicService.saveStep(user.id, sourceId, {
      expectedVersion: onboardingBeforeSave.version,
      step: 'CONTACT',
      data: { email: sharedEmail },
    }).finally(() => {
      settled = true;
    });

    await delay(150);
    expect(settled).toBe(false);
    releaseCandidate.resolve();
    await writer;

    await expect(save).rejects.toMatchObject({ code: 'DUPLICATE_REVIEW_REQUIRED' });
    const [source, identity] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: sourceId } }),
      loadStudentIdentity(sourceId, contractId),
    ]);
    expect(source.status).toBe('INVITED');
    expect(identity.email).toBe(sourceEmail);
  });

  it('rolls back account and invite linkage when private claim review persistence fails', async () => {
    const sharedEmail = `${suffix}-claim-shared@example.com`;
    const user = await createStudentUser('claim', 'Pessoa Claim Atômico', sharedEmail);
    const sourceId = `${suffix}-claim-source`;
    const candidateId = `${suffix}-claim-candidate`;
    await createStudentRecord({
      id: candidateId,
      name: 'Cadastro existente',
      email: sharedEmail,
      phone: '+55 15 96666-1001',
      status: 'LEAD',
    });
    await createStudentRecord({
      id: sourceId,
      name: 'Pessoa Claim Atômico',
      email: sharedEmail,
      phone: '+55 15 96666-1002',
      status: 'INVITED',
    });
    const token = `${suffix}-claim-token`;
    await prisma.preRegistrationInvite.create({
      data: {
        contractId,
        alunoId: sourceId,
        tokenHash: hashInviteToken(token),
        purpose: 'PRE_REGISTRATION',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const escapedSourceId = sourceId.replace(/'/g, "''");
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "issue274_test_claim_review_failure"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW."alunoId" = '${escapedSourceId}' THEN
RAISE EXCEPTION 'ISSUE274_TEST_CLAIM_REVIEW_FAILURE';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "issue274_test_claim_review_failure" ON "StudentProfileReview"'
    );
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "issue274_test_claim_review_failure"
      BEFORE INSERT ON "StudentProfileReview"
      FOR EACH ROW
      EXECUTE FUNCTION "issue274_test_claim_review_failure"()
    `);

    try {
      await expect(
        preRegistrationPublicService.claim(user.id, { token, role: 'STUDENT' })
      ).rejects.toBeDefined();
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS "issue274_test_claim_review_failure" ON "StudentProfileReview"'
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS "issue274_test_claim_review_failure"()'
      );
    }

    const [source, onboarding, linkedEvents, reviews] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: sourceId } }),
      prisma.studentOnboardingProcess.findUniqueOrThrow({ where: { alunoId: sourceId } }),
      prisma.studentLifecycleEvent.count({
        where: { alunoId: sourceId, contractId, eventType: 'ACCOUNT_LINKED' },
      }),
      prisma.studentProfileReview.count({ where: { alunoId: sourceId } }),
    ]);
    expect(source.userId).toBeNull();
    expect(onboarding.claimedByUserId).toBeNull();
    expect(linkedEvents).toBe(0);
    expect(reviews).toBe(0);
  });
});
