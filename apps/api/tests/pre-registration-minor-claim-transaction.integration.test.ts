import { PrismaClient } from '@prisma/client';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const prisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('minor self-claim transaction guard', () => {
  const suffix = `issue271-minor-claim-tx-${Date.now()}`;
  let contractId: string;
  let alunoId: string;
  let minorUserId: string;
  let guardianUserId: string;
  const token = `${suffix}-token`;

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271x`,
        name: 'Academia Claim Transaction Issue 271',
      },
    });
    contractId = contract.id;

    const [minor, guardian] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${suffix}-minor@example.com`,
          passwordHash: 'integration-test-hash',
          type: 'aluno',
          profile: {
            create: {
              name: 'Aluno Menor Transacional',
              cpf: '52998224725',
              birthDate: new Date('2012-04-10T12:00:00.000Z'),
            },
          },
        },
      }),
      prisma.user.create({
        data: {
          email: `${suffix}-guardian@example.com`,
          passwordHash: 'integration-test-hash',
          type: 'aluno',
          profile: { create: { name: 'Responsável Transacional' } },
        },
      }),
    ]);
    minorUserId = minor.id;
    guardianUserId = guardian.id;

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
        name: 'Aluno Menor Transacional',
        email: `${suffix}-minor@example.com`,
        cpf: '52998224725',
        birthDate: '2012-04-10',
      },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_minor_claim_tx_fixture',
      }
    );
  });

  afterAll(async () => {
    if (contractId) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    for (const userId of [minorUserId, guardianUserId]) {
      if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('rolls back a direct service claim without an active guardian', async () => {
    await expect(
      preRegistrationPublicService.claim(minorUserId, { token, role: 'STUDENT' })
    ).rejects.toMatchObject({ code: 'ACCOUNT_ALREADY_LINKED' });

    const blocked = await prisma.aluno.findUniqueOrThrow({
      where: { id: alunoId },
      include: { onboarding: true },
    });
    expect(blocked.userId).toBeNull();
    expect(blocked.onboarding?.claimedByUserId).toBeNull();

    await prisma.preRegistrationGuardianAuthorization.create({
      data: {
        contractId,
        alunoId,
        guardianUserId,
        relationship: 'Mãe',
        status: 'ACTIVE',
        validatedAt: new Date(),
        validatedByUserId: guardianUserId,
      },
    });

    const claimed = await preRegistrationPublicService.claim(minorUserId, {
      token,
      role: 'STUDENT',
    });
    expect(claimed.alunoId).toBe(alunoId);

    const allowed = await prisma.aluno.findUniqueOrThrow({
      where: { id: alunoId },
      include: { onboarding: true },
    });
    expect(allowed.userId).toBe(minorUserId);
    expect(allowed.onboarding?.claimedByUserId).toBe(minorUserId);
  });
});