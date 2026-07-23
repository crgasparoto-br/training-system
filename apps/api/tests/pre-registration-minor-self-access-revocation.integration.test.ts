import { PrismaClient } from '@prisma/client';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { assertPreRegistrationClaimRoleEligibility } from '../src/modules/pre-registration-public/pre-registration-claim-role.guard.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const prisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('minor self access follows guardian authorization', () => {
  const suffix = `issue271-minor-self-${Date.now()}`;
  let contractId: string;
  let alunoId: string;
  let minorUserId: string;
  let guardianUserId: string;
  const token = `${suffix}-token`;

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271m`,
        name: 'Academia Menor Issue 271',
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
              name: 'Aluno Menor',
              birthDate: new Date('2012-04-10T12:00:00.000Z'),
              cpf: '52998224725',
            },
          },
        },
      }),
      prisma.user.create({
        data: {
          email: `${suffix}-guardian@example.com`,
          passwordHash: 'integration-test-hash',
          type: 'aluno',
          profile: { create: { name: 'Responsável Ativo' } },
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
        name: 'Aluno Menor',
        email: `${suffix}-minor@example.com`,
        cpf: '52998224725',
        birthDate: '2012-04-10',
      },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_minor_self_fixture',
      }
    );
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

  it('clears the authenticated claim and blocks the minor after revocation', async () => {
    await expect(
      assertPreRegistrationClaimRoleEligibility(token, 'STUDENT')
    ).resolves.toBeUndefined();
    await preRegistrationPublicService.claim(minorUserId, { token, role: 'STUDENT' });

    const activeSession = await preRegistrationPublicService.getSession(minorUserId, alunoId);
    expect(activeSession.guardianAuthorization.status).toBe('ACTIVE');

    await prisma.preRegistrationGuardianAuthorization.updateMany({
      where: { alunoId, contractId, guardianUserId, status: 'ACTIVE' },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedByUserId: guardianUserId,
      },
    });

    const onboarding = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId },
    });
    expect(onboarding.claimedByUserId).toBeNull();
    expect(onboarding.claimedAt).toBeNull();
    expect(onboarding.version).toBe(activeSession.version + 1);

    await expect(
      preRegistrationPublicService.getSession(minorUserId, alunoId)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      assertPreRegistrationClaimRoleEligibility(token, 'STUDENT')
    ).rejects.toMatchObject({ code: 'GUARDIAN_AUTHORIZATION_REQUIRED' });
  });
});