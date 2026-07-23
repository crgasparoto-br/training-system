import { PrismaClient } from '@prisma/client';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const prisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('public pre-registration claim concurrency', () => {
  const suffix = `issue271-claim-race-${Date.now()}`;
  let contractId: string;
  let alunoId: string;
  const userIds: string[] = [];
  const token = `${suffix}-token`;

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271q`,
        name: 'Academia Claim Race Issue 271',
      },
    });
    contractId = contract.id;

    const aluno = await prisma.aluno.create({
      data: {
        contractId,
        status: 'INVITED',
        onboarding: { create: { contractId } },
        preRegistrationInvites: {
          create: {
            contractId,
            tokenHash: hashInviteToken(token),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        },
      },
    });
    alunoId = aluno.id;
    await upsertStudentIdentity(
      alunoId,
      contractId,
      { name: 'Pessoa Concorrente', birthDate: '1990-01-01' },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_claim_race_fixture',
      }
    );

    for (const label of ['one', 'two']) {
      const user = await prisma.user.create({
        data: {
          email: `${suffix}-${label}@example.com`,
          passwordHash: 'integration-test-hash',
          type: 'aluno',
          profile: { create: { name: 'Pessoa Concorrente' } },
        },
      });
      userIds.push(user.id);
    }
  });

  afterAll(async () => {
    if (contractId) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    for (const userId of userIds) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('allows exactly one account to claim the invite and keeps retry idempotent for the winner', async () => {
    const attempts = await Promise.allSettled(
      userIds.map((userId) =>
        preRegistrationPublicService.claim(userId, { token, role: 'STUDENT' })
      )
    );

    const fulfilled = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<{ alunoId: string; redirectTo: '/pre-cadastro' }> =>
        attempt.status === 'fulfilled'
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected'
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'ACCOUNT_ALREADY_LINKED' });

    const aluno = await prisma.aluno.findUniqueOrThrow({
      where: { id: alunoId },
      include: { onboarding: true },
    });
    expect(aluno.userId).toBeTruthy();
    expect(aluno.onboarding?.claimedByUserId).toBe(aluno.userId);

    const retry = await preRegistrationPublicService.claim(aluno.userId!, {
      token,
      role: 'STUDENT',
    });
    expect(retry.alunoId).toBe(alunoId);
    expect(
      await prisma.studentLifecycleEvent.count({
        where: { alunoId, eventType: 'ACCOUNT_LINKED' },
      })
    ).toBe(1);
  });
});