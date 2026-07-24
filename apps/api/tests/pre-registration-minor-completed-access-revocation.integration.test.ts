import { PrismaClient } from '@prisma/client';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const prisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

type Fixture = {
  contractId: string;
  alunoId: string;
  minorUserId: string;
  guardianUserId: string;
  validatorUserId: string;
  startedVersion: number;
};

describeDatabase('completed minor access follows guardian revocation', () => {
  let fixture: Fixture | undefined;
  let fixtureSequence = 0;

  async function prepareInProgressMinor(): Promise<Fixture> {
    fixtureSequence += 1;
    const suffix = `issue271-completed-revocation-${Date.now()}-${fixtureSequence}`;
    const token = `${suffix}-token`;

    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271c${fixtureSequence}`,
        name: 'Academia Revogação Pós-Conclusão',
      },
    });

    const [minor, guardian, validator] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${suffix}-minor@example.com`,
          passwordHash: 'integration-test-hash',
          type: 'aluno',
          profile: {
            create: {
              name: 'Aluno Menor Concluído',
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
          profile: { create: { name: 'Responsável Revogável' } },
        },
      }),
      prisma.user.create({
        data: {
          email: `${suffix}-validator@example.com`,
          passwordHash: 'integration-test-hash',
          type: 'professor',
          profile: { create: { name: 'Validador Independente' } },
        },
      }),
    ]);

    const aluno = await prisma.aluno.create({
      data: {
        contractId: contract.id,
        status: 'INVITED',
        onboarding: { create: { contractId: contract.id } },
        preRegistrationInvites: {
          create: {
            contractId: contract.id,
            tokenHash: hashInviteToken(token),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        },
      },
    });

    await upsertStudentIdentity(
      aluno.id,
      contract.id,
      {
        name: 'Aluno Menor Concluído',
        email: minor.email,
        phone: '15999990000',
        cpf: '52998224725',
        birthDate: '2012-04-10',
        guardianName: 'Responsável Revogável',
        guardianCpf: '16899535009',
      },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_completed_revocation_fixture',
      }
    );

    await prisma.preRegistrationGuardianAuthorization.create({
      data: {
        contractId: contract.id,
        alunoId: aluno.id,
        guardianUserId: guardian.id,
        relationship: 'Mãe',
        status: 'ACTIVE',
        validatedAt: new Date(),
        validatedByUserId: validator.id,
      },
    });

    await preRegistrationPublicService.claim(minor.id, { token, role: 'STUDENT' });
    const claimed = await preRegistrationPublicService.getSession(minor.id, aluno.id);
    const started = await preRegistrationPublicService.saveStep(minor.id, aluno.id, {
      expectedVersion: claimed.version,
      step: 'IDENTIFICATION',
      data: { name: 'Aluno Menor Concluído' },
    });

    fixture = {
      contractId: contract.id,
      alunoId: aluno.id,
      minorUserId: minor.id,
      guardianUserId: guardian.id,
      validatorUserId: validator.id,
      startedVersion: started.version,
    };
    return fixture;
  }

  async function revokeGuardian(current: Fixture) {
    return prisma.preRegistrationGuardianAuthorization.updateMany({
      where: {
        alunoId: current.alunoId,
        contractId: current.contractId,
        guardianUserId: current.guardianUserId,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedByUserId: current.validatorUserId,
      },
    });
  }

  afterEach(async () => {
    if (!fixture) return;
    await prisma.companyContract
      .delete({ where: { id: fixture.contractId } })
      .catch(() => undefined);
    for (const userId of [
      fixture.minorUserId,
      fixture.guardianUserId,
      fixture.validatorUserId,
    ]) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    fixture = undefined;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('removes the authenticated claim after revocation even when pre-registration is completed', async () => {
    const current = await prepareInProgressMinor();
    const completed = await preRegistrationPublicService.complete(
      current.minorUserId,
      current.alunoId,
      {
        expectedVersion: current.startedVersion,
        privacyAccepted: true,
      }
    );
    expect(completed.status).toBe('PRE_REGISTRATION_COMPLETED');

    const revoked = await revokeGuardian(current);
    expect(revoked.count).toBe(1);

    const [student, onboarding, processes] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: current.alunoId } }),
      prisma.studentOnboardingProcess.findUniqueOrThrow({
        where: { alunoId: current.alunoId },
      }),
      preRegistrationPublicService.listProcesses(current.minorUserId),
    ]);

    expect(student.status).toBe('PRE_REGISTRATION_COMPLETED');
    expect(onboarding.claimedByUserId).toBeNull();
    expect(onboarding.claimedAt).toBeNull();
    expect(onboarding.version).toBe(completed.version + 1);
    expect(processes).toEqual([]);
    await expect(
      preRegistrationPublicService.getSession(current.minorUserId, current.alunoId)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps personal data inaccessible when completion races with guardian revocation', async () => {
    const current = await prepareInProgressMinor();

    const [completion, revocation] = await Promise.allSettled([
      preRegistrationPublicService.complete(current.minorUserId, current.alunoId, {
        expectedVersion: current.startedVersion,
        privacyAccepted: true,
      }),
      revokeGuardian(current),
    ]);

    expect(revocation.status).toBe('fulfilled');
    if (revocation.status === 'fulfilled') {
      expect(revocation.value.count).toBe(1);
    }

    if (completion.status === 'fulfilled') {
      expect(completion.value.status).toBe('PRE_REGISTRATION_COMPLETED');
    } else {
      const code = (completion.reason as { code?: string }).code;
      expect([
        'CONCURRENT_MODIFICATION',
        'GUARDIAN_AUTHORIZATION_REQUIRED',
        'NOT_FOUND',
      ]).toContain(code);
    }

    const [authorization, onboarding, processes] = await Promise.all([
      prisma.preRegistrationGuardianAuthorization.findFirstOrThrow({
        where: {
          alunoId: current.alunoId,
          contractId: current.contractId,
          guardianUserId: current.guardianUserId,
        },
      }),
      prisma.studentOnboardingProcess.findUniqueOrThrow({
        where: { alunoId: current.alunoId },
      }),
      preRegistrationPublicService.listProcesses(current.minorUserId),
    ]);

    expect(authorization.status).toBe('REVOKED');
    expect(onboarding.claimedByUserId).toBeNull();
    expect(onboarding.claimedAt).toBeNull();
    expect(processes).toEqual([]);
    await expect(
      preRegistrationPublicService.getSession(current.minorUserId, current.alunoId)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
