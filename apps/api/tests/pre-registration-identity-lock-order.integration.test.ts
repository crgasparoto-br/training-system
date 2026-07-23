import { PrismaClient } from '@prisma/client';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const prisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('public pre-registration identity lock order', () => {
  const suffix = `issue271-lock-order-${Date.now()}`;
  let contractId: string;
  let alunoId: string;
  let userId: string;
  const token = `${suffix}-token`;

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271l`,
        name: 'Academia Lock Order Issue 271',
      },
    });
    contractId = contract.id;

    const user = await prisma.user.create({
      data: {
        email: `${suffix}@example.com`,
        passwordHash: 'integration-test-hash',
        type: 'aluno',
        profile: { create: { name: 'Aluno Concorrente' } },
      },
    });
    userId = user.id;

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
      {
        name: 'Aluno Concorrente',
        email: `${suffix}@example.com`,
        phone: '15999990000',
        cpf: '52998224725',
        birthDate: '1990-01-01',
      },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_lock_order_fixture',
      }
    );

    await preRegistrationPublicService.claim(userId, { token, role: 'STUDENT' });
  });

  afterAll(async () => {
    if (contractId) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('rolls back an administrative edit immediately while onboarding is locked', async () => {
    const initial = await preRegistrationPublicService.getSession(userId, alunoId);
    let releaseOnboarding!: () => void;
    let announceLock!: () => void;
    const lockAcquired = new Promise<void>((resolve) => {
      announceLock = resolve;
    });
    const releaseLock = new Promise<void>((resolve) => {
      releaseOnboarding = resolve;
    });

    const publicLock = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "StudentOnboardingProcess"
        WHERE "alunoId" = ${alunoId} AND "contractId" = ${contractId}
        FOR UPDATE
      `;
      announceLock();
      await releaseLock;
    });

    await lockAcquired;

    const administrativeAttempt = prisma.$transaction((tx) =>
      upsertStudentIdentity(
        alunoId,
        contractId,
        { phone: '15888880000' },
        {
          client: tx,
          sourceType: 'professional',
          sourceReference: 'issue_271_lock_order_admin_edit',
        }
      )
    );

    const settledBeforeRelease = await Promise.race([
      administrativeAttempt.then(
        () => 'fulfilled' as const,
        () => 'rejected' as const
      ),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 2000)),
    ]);

    expect(settledBeforeRelease).toBe('rejected');
    releaseOnboarding();
    await publicLock;
    await expect(administrativeAttempt).rejects.toThrow(/pré-cadastro|alterado|transaction/i);

    const afterRollback = await preRegistrationPublicService.getSession(userId, alunoId);
    expect(afterRollback.version).toBe(initial.version);
    expect(afterRollback.identity.phone).toBe('15999990000');

    const saved = await preRegistrationPublicService.saveStep(userId, alunoId, {
      expectedVersion: initial.version,
      step: 'CONTACT',
      data: { phone: '15777770000' },
    });
    expect(saved.identity.phone).toBe('15777770000');
    expect(saved.version).toBe(initial.version + 1);
  });
});