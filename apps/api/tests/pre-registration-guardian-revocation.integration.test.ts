import { PrismaClient } from '@prisma/client';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const prisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('public pre-registration guardian revocation concurrency', () => {
  const suffix = `issue271-revocation-${Date.now()}`;
  let contractId: string;
  let guardianUserId: string;
  let alunoId: string;
  const token = `${suffix}-token`;

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271r`,
        name: 'Academia Revogação Issue 271',
      },
    });
    contractId = contract.id;

    const guardian = await prisma.user.create({
      data: {
        email: `${suffix}@example.com`,
        passwordHash: 'integration-test-hash',
        type: 'aluno',
        profile: { create: { name: 'Responsável Revogável' } },
      },
    });
    guardianUserId = guardian.id;

    const aluno = await prisma.aluno.create({
      data: {
        contractId,
        status: 'INVITED',
        leadName: 'Dependente Revogável',
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
        name: 'Dependente Revogável',
        birthDate: '2012-02-10',
        cpf: '52998224725',
      },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_revocation_fixture',
      }
    );
  });

  afterAll(async () => {
    if (contractId) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    if (guardianUserId) {
      await prisma.user.delete({ where: { id: guardianUserId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('bumps the process version and blocks the stale guardian save after revocation', async () => {
    await preRegistrationPublicService.claim(guardianUserId, {
      token,
      role: 'GUARDIAN',
    });
    const active = await preRegistrationPublicService.confirmGuardianAuthorization(
      guardianUserId,
      alunoId,
      { relationship: 'Tutor', declarationAccepted: true }
    );

    await prisma.preRegistrationGuardianAuthorization.updateMany({
      where: {
        alunoId,
        contractId,
        guardianUserId,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedByUserId: guardianUserId,
      },
    });

    const onboarding = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId },
    });
    expect(onboarding.version).toBe(active.version + 1);

    await expect(
      preRegistrationPublicService.saveStep(guardianUserId, alunoId, {
        expectedVersion: active.version,
        step: 'IDENTIFICATION',
        data: { name: 'Alteração após revogação' },
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const identity = await prisma.studentProfile.findUniqueOrThrow({ where: { alunoId } });
    expect((identity.identificationData as { name?: string }).name).toBe('Dependente Revogável');
  });
});