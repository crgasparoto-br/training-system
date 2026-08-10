import { PrismaClient } from '@prisma/client';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { preRegistrationPublicAtomicService } from '../src/modules/pre-registration-public/pre-registration-public-atomic.service.js';
import { preRegistrationDuplicateReviewService } from '../src/modules/pre-registration-public/pre-registration-duplicate-review.service.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const prisma = new PrismaClient();
const revokerPrisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

type GuardianFixture = {
  contractId: string;
  alunoId: string;
  guardianUserId: string;
  validatorUserId: string;
  token: string;
  userIds: string[];
};

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

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

describeDatabase('pre-registration atomic authorization boundary', () => {
  let sequence = 0;
  const fixtures: GuardianFixture[] = [];

  async function createGuardianFixture(label: string): Promise<GuardianFixture> {
    sequence += 1;
    const suffix = `issue271-atomic-${Date.now()}-${sequence}-${label}`;
    const token = `${suffix}-token`;
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271atomic${sequence}`,
        name: `Academia ${label}`,
      },
    });
    const [guardian, validator] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${suffix}-guardian@example.com`,
          passwordHash: 'integration-test-hash',
          type: 'aluno',
          profile: { create: { name: `Responsável ${label}` } },
        },
      }),
      prisma.user.create({
        data: {
          email: `${suffix}-validator@example.com`,
          passwordHash: 'integration-test-hash',
          type: 'professor',
          profile: { create: { name: `Validador ${label}` } },
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
        name: `Dependente ${label}`,
        email: `${suffix}-student@example.com`,
        phone: '15999990000',
        cpf: sequence % 2 === 0 ? '11144477735' : '52998224725',
        birthDate: '2012-04-10',
        guardianName: `Responsável ${label}`,
        guardianCpf: '16899535009',
      },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_atomic_authorization_fixture',
      }
    );

    if (label === 'duplicidade') {
      const candidate = await prisma.aluno.create({
        data: {
          contractId: contract.id,
          status: 'LEAD',
          leadName: 'Cadastro canônico existente',
        },
      });
      await upsertStudentIdentity(
        candidate.id,
        contract.id,
        {
          name: 'Cadastro canônico existente',
          email: `${suffix}-canonical@example.com`,
          phone: '15888880000',
          cpf: '12345678909',
          birthDate: '1985-05-10',
        },
        {
          sourceType: 'professional',
          sourceReference: 'issue_274_atomic_duplicate_fixture',
        }
      );
    }

    await prisma.preRegistrationGuardianAuthorization.create({
      data: {
        contractId: contract.id,
        alunoId: aluno.id,
        guardianUserId: guardian.id,
        relationship: 'Responsável legal',
        status: 'ACTIVE',
        validatedAt: new Date(),
        validatedByUserId: validator.id,
      },
    });
    await preRegistrationPublicService.claim(guardian.id, { token, role: 'GUARDIAN' });

    const fixture = {
      contractId: contract.id,
      alunoId: aluno.id,
      guardianUserId: guardian.id,
      validatorUserId: validator.id,
      token,
      userIds: [guardian.id, validator.id],
    };
    fixtures.push(fixture);
    return fixture;
  }

  async function startHeldRevocation(fixture: GuardianFixture) {
    const updated = deferred();
    const release = deferred();
    const transaction = revokerPrisma.$transaction(
      async (tx) => {
        const changed = await tx.preRegistrationGuardianAuthorization.updateMany({
          where: {
            alunoId: fixture.alunoId,
            contractId: fixture.contractId,
            guardianUserId: fixture.guardianUserId,
            status: 'ACTIVE',
          },
          data: {
            status: 'REVOKED',
            revokedAt: new Date(),
            revokedByUserId: fixture.validatorUserId,
          },
        });
        expect(changed.count).toBe(1);
        updated.resolve();
        await release.promise;
      },
      { timeout: 10_000 }
    );
    await updated.promise;
    return { release: release.resolve, transaction };
  }

  afterAll(async () => {
    for (const fixture of fixtures.reverse()) {
      await prisma.companyContract.delete({ where: { id: fixture.contractId } }).catch(() => undefined);
      for (const userId of fixture.userIds) {
        await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      }
    }
    await Promise.all([prisma.$disconnect(), revokerPrisma.$disconnect()]);
  });

  it('does not return personal data when revocation has won the onboarding lock', async () => {
    const fixture = await createGuardianFixture('leitura');
    const held = await startHeldRevocation(fixture);

    let settled = false;
    const sessionPromise = preRegistrationPublicAtomicService
      .getSession(fixture.guardianUserId, fixture.alunoId)
      .finally(() => {
        settled = true;
      });

    await delay(100);
    expect(settled).toBe(false);

    held.release();
    await held.transaction;
    await expect(sessionPromise).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('preserves the first-save lifecycle transition atomically when CPF requires review', async () => {
    const fixture = await createGuardianFixture('duplicidade');
    const session = await preRegistrationPublicAtomicService.getSession(
      fixture.guardianUserId,
      fixture.alunoId
    );

    await preRegistrationDuplicateReviewService.preserveCpfConflict(
      fixture.guardianUserId,
      fixture.alunoId,
      {
        expectedVersion: session.version,
        step: 'IDENTIFICATION',
        data: { name: 'Dependente preservado', cpf: '12345678909' },
      }
    );

    const [student, onboarding, transitionEvents, review] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: fixture.alunoId } }),
      prisma.studentOnboardingProcess.findUniqueOrThrow({ where: { alunoId: fixture.alunoId } }),
      prisma.studentLifecycleEvent.count({
        where: {
          alunoId: fixture.alunoId,
          contractId: fixture.contractId,
          actorUserId: fixture.guardianUserId,
          eventType: 'STATUS_CHANGED',
        },
      }),
      prisma.studentProfileReview.findFirst({
        where: { alunoId: fixture.alunoId, status: 'pending', requiresApproval: true },
      }),
    ]);
    expect(student.status).toBe('PRE_REGISTRATION_IN_PROGRESS');
    expect(onboarding.startedAt).not.toBeNull();
    expect(onboarding.version).toBe(session.version + 1);
    expect(transitionEvents).toBe(1);
    expect(review).not.toBeNull();
  });

  it('rolls back the first-save lifecycle transition when authorization is revoked first', async () => {
    const fixture = await createGuardianFixture('primeiro-salvamento');
    const session = await preRegistrationPublicAtomicService.getSession(
      fixture.guardianUserId,
      fixture.alunoId
    );
    const held = await startHeldRevocation(fixture);

    let settled = false;
    const savePromise = preRegistrationPublicAtomicService
      .saveStep(fixture.guardianUserId, fixture.alunoId, {
        expectedVersion: session.version,
        step: 'IDENTIFICATION',
        data: { name: 'Não deve persistir' },
      })
      .finally(() => {
        settled = true;
      });

    await delay(100);
    expect(settled).toBe(false);

    held.release();
    await held.transaction;
    await expect(savePromise).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const [student, onboarding, transitionEvents, identity] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: fixture.alunoId } }),
      prisma.studentOnboardingProcess.findUniqueOrThrow({ where: { alunoId: fixture.alunoId } }),
      prisma.studentLifecycleEvent.count({
        where: {
          alunoId: fixture.alunoId,
          contractId: fixture.contractId,
          actorUserId: fixture.guardianUserId,
          eventType: 'STATUS_CHANGED',
        },
      }),
      prisma.studentProfile.findUniqueOrThrow({ where: { alunoId: fixture.alunoId } }),
    ]);
    expect(student.status).toBe('INVITED');
    expect(onboarding.startedAt).toBeNull();
    expect(transitionEvents).toBe(0);
    expect((identity.identificationData as { name?: string }).name).not.toBe('Não deve persistir');
  });
});
