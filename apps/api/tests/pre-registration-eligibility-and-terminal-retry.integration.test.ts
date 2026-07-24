import { PrismaClient } from '@prisma/client';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { completePublicStudentPreRegistration } from '../src/modules/alunos/student-public-pre-registration.service.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const prisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

type Fixture = {
  alunoId: string;
  studentUserId: string;
  guardianUserId: string;
  token: string;
};

describeDatabase('pre-registration eligibility transitions and terminal retry authorization', () => {
  const suffix = `issue271-post-audit-${Date.now()}`;
  let contractId: string;
  let validatorUserId: string;
  let sequence = 0;
  const createdUserIds: string[] = [];

  async function createUser(input: {
    label: string;
    name: string;
    type?: 'aluno' | 'professor';
    email?: string;
    birthDate?: Date;
    cpf?: string;
  }) {
    const user = await prisma.user.create({
      data: {
        email: input.email || `${suffix}-${input.label}@example.com`,
        passwordHash: 'integration-test-hash',
        type: input.type || 'aluno',
        profile: {
          create: {
            name: input.name,
            birthDate: input.birthDate,
            cpf: input.cpf,
          },
        },
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createStudentFixture(input: {
    label: string;
    birthDate: string;
    cpf: string;
    activeGuardian?: boolean;
  }): Promise<Fixture> {
    sequence += 1;
    const token = `${suffix}-${input.label}-${sequence}-token`;
    const email = `${suffix}-${input.label}-${sequence}@example.com`;
    const student = await createUser({
      label: `${input.label}-${sequence}-student`,
      name: `Aluno ${input.label}`,
      email,
      birthDate: new Date(`${input.birthDate}T12:00:00.000Z`),
      cpf: input.cpf,
    });
    const guardian = await createUser({
      label: `${input.label}-${sequence}-guardian`,
      name: `Responsável ${input.label}`,
    });

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

    await upsertStudentIdentity(
      aluno.id,
      contractId,
      {
        name: `Aluno ${input.label}`,
        email,
        phone: '15999990000',
        cpf: input.cpf,
        birthDate: input.birthDate,
        guardianName: `Responsável ${input.label}`,
        guardianCpf: '16899535009',
      },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_post_audit_fixture',
      }
    );

    if (input.activeGuardian) {
      await prisma.preRegistrationGuardianAuthorization.create({
        data: {
          contractId,
          alunoId: aluno.id,
          guardianUserId: guardian.id,
          relationship: 'Responsável legal',
          status: 'ACTIVE',
          validatedAt: new Date(),
          validatedByUserId: validatorUserId,
        },
      });
    }

    return {
      alunoId: aluno.id,
      studentUserId: student.id,
      guardianUserId: guardian.id,
      token,
    };
  }

  async function claimAndStart(fixture: Fixture) {
    await preRegistrationPublicService.claim(fixture.studentUserId, {
      token: fixture.token,
      role: 'STUDENT',
    });
    const claimed = await preRegistrationPublicService.getSession(
      fixture.studentUserId,
      fixture.alunoId
    );
    return preRegistrationPublicService.saveStep(fixture.studentUserId, fixture.alunoId, {
      expectedVersion: claimed.version,
      step: 'IDENTIFICATION',
      data: { name: claimed.identity.name || 'Aluno' },
    });
  }

  async function activateGuardian(fixture: Fixture) {
    await prisma.preRegistrationGuardianAuthorization.create({
      data: {
        contractId,
        alunoId: fixture.alunoId,
        guardianUserId: fixture.guardianUserId,
        relationship: 'Responsável legal',
        status: 'PENDING',
      },
    });
    const activated = await prisma.preRegistrationGuardianAuthorization.updateMany({
      where: {
        contractId,
        alunoId: fixture.alunoId,
        guardianUserId: fixture.guardianUserId,
        status: 'PENDING',
      },
      data: {
        status: 'ACTIVE',
        validatedAt: new Date(),
        validatedByUserId: validatorUserId,
      },
    });
    expect(activated.count).toBe(1);
  }

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271post`,
        name: 'Academia Issue 271 Pós-auditoria',
      },
    });
    contractId = contract.id;
    const validator = await createUser({
      label: 'validator',
      name: 'Validador Independente',
      type: 'professor',
    });
    validatorUserId = validator.id;
  });

  afterAll(async () => {
    if (contractId) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    for (const userId of createdUserIds.reverse()) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('suspends an in-progress student claim after adult-to-minor correction and restores it only after active authorization', async () => {
    const fixture = await createStudentFixture({
      label: 'in-progress-transition',
      birthDate: '1990-05-10',
      cpf: '52998224725',
    });
    const started = await claimAndStart(fixture);

    await upsertStudentIdentity(
      fixture.alunoId,
      contractId,
      { birthDate: '2012-05-10' },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_adult_to_minor_in_progress',
      }
    );

    const suspended = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId: fixture.alunoId },
    });
    expect(suspended.version).toBe(started.version + 1);
    expect(suspended.claimedByUserId).toBeNull();
    expect(suspended.claimedAt).toBeNull();
    await expect(
      preRegistrationPublicService.getSession(fixture.studentUserId, fixture.alunoId)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await preRegistrationPublicService.listProcesses(fixture.studentUserId)).toEqual([]);

    await activateGuardian(fixture);

    const restored = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId: fixture.alunoId },
    });
    expect(restored.claimedByUserId).toBe(fixture.studentUserId);
    expect(restored.claimedAt).not.toBeNull();
    const session = await preRegistrationPublicService.getSession(
      fixture.studentUserId,
      fixture.alunoId
    );
    expect(session.isMinor).toBe(true);
    expect(session.guardianAuthorization.status).toBe('ACTIVE');
  });

  it('suspends a completed claim after adult-to-minor correction and restores it when canonical eligibility becomes adult again', async () => {
    const fixture = await createStudentFixture({
      label: 'completed-transition',
      birthDate: '1988-03-10',
      cpf: '11144477735',
    });
    const started = await claimAndStart(fixture);
    const completed = await preRegistrationPublicService.complete(
      fixture.studentUserId,
      fixture.alunoId,
      {
        expectedVersion: started.version,
        privacyAccepted: true,
      }
    );
    expect(completed.status).toBe('PRE_REGISTRATION_COMPLETED');

    await upsertStudentIdentity(
      fixture.alunoId,
      contractId,
      { birthDate: '2011-03-10' },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_adult_to_minor_completed',
      }
    );

    const suspended = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId: fixture.alunoId },
    });
    expect(suspended.claimedByUserId).toBeNull();
    expect(await preRegistrationPublicService.listProcesses(fixture.studentUserId)).toEqual([]);
    await expect(
      preRegistrationPublicService.getSession(fixture.studentUserId, fixture.alunoId)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await upsertStudentIdentity(
      fixture.alunoId,
      contractId,
      { birthDate: '1988-03-10' },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_minor_to_adult_completed',
      }
    );

    const restored = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId: fixture.alunoId },
    });
    expect(restored.claimedByUserId).toBe(fixture.studentUserId);
    const resumed = await preRegistrationPublicService.getSession(
      fixture.studentUserId,
      fixture.alunoId
    );
    expect(resumed.status).toBe('PRE_REGISTRATION_COMPLETED');
    expect(resumed.isMinor).toBe(false);
  });

  it('rejects a stale terminal retry after revocation without changing metadata, invitations or events', async () => {
    const fixture = await createStudentFixture({
      label: 'terminal-retry',
      birthDate: '2012-04-10',
      cpf: '12345678909',
      activeGuardian: true,
    });
    const started = await claimAndStart(fixture);
    const completed = await preRegistrationPublicService.complete(
      fixture.studentUserId,
      fixture.alunoId,
      {
        expectedVersion: started.version,
        privacyAccepted: true,
      },
      { ipAddress: '192.0.2.10', userAgent: 'initial-agent' }
    );
    expect(completed.status).toBe('PRE_REGISTRATION_COMPLETED');

    const revoked = await prisma.preRegistrationGuardianAuthorization.updateMany({
      where: {
        contractId,
        alunoId: fixture.alunoId,
        guardianUserId: fixture.guardianUserId,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedByUserId: validatorUserId,
      },
    });
    expect(revoked.count).toBe(1);

    const before = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId: fixture.alunoId },
    });
    const beforeInvites = await prisma.preRegistrationInvite.findMany({
      where: { alunoId: fixture.alunoId, contractId },
      orderBy: { id: 'asc' },
    });
    const beforeLifecycleEvents = await prisma.studentLifecycleEvent.count({
      where: { alunoId: fixture.alunoId, contractId },
    });
    const inviteIds = beforeInvites.map((invite) => invite.id);
    const beforeInviteEvents = await prisma.preRegistrationInviteEvent.count({
      where: { inviteId: { in: inviteIds } },
    });

    await expect(
      completePublicStudentPreRegistration({
        alunoId: fixture.alunoId,
        contractId,
        actorUserId: fixture.studentUserId,
        accessRole: 'STUDENT',
        expectedVersion: completed.version,
        privacyNoticeVersion: '2026-07-retry-must-not-write',
        privacyAcceptedAt: new Date(Date.now() + 60_000),
        ipAddress: '192.0.2.200',
        userAgent: 'stale-terminal-retry',
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const after = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId: fixture.alunoId },
    });
    const afterInvites = await prisma.preRegistrationInvite.findMany({
      where: { alunoId: fixture.alunoId, contractId },
      orderBy: { id: 'asc' },
    });
    const afterLifecycleEvents = await prisma.studentLifecycleEvent.count({
      where: { alunoId: fixture.alunoId, contractId },
    });
    const afterInviteEvents = await prisma.preRegistrationInviteEvent.count({
      where: { inviteId: { in: inviteIds } },
    });

    expect(after).toEqual(before);
    expect(afterInvites).toEqual(beforeInvites);
    expect(afterLifecycleEvents).toBe(beforeLifecycleEvents);
    expect(afterInviteEvents).toBe(beforeInviteEvents);
  });
});
