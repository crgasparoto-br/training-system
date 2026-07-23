import { PrismaClient } from '@prisma/client';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { preRegistrationDuplicateReviewService } from '../src/modules/pre-registration-public/pre-registration-duplicate-review.service.js';
import {
  PreRegistrationPublicError,
  preRegistrationPublicService,
} from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const prisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('public pre-registration integration', () => {
  const suffix = `issue271-${Date.now()}`;
  let contractId: string;
  let guardianUserId: string;
  let unrelatedUserId: string;
  let firstAlunoId: string;
  let secondAlunoId: string;
  const firstToken = `${suffix}-first-token`;
  const secondToken = `${suffix}-second-token`;

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271`,
        name: 'Academia Issue 271',
      },
    });
    contractId = contract.id;

    const guardian = await prisma.user.create({
      data: {
        email: `${suffix}-guardian@example.com`,
        passwordHash: 'integration-test-hash',
        type: 'aluno',
        profile: { create: { name: 'Responsável Teste' } },
      },
    });
    guardianUserId = guardian.id;

    const unrelated = await prisma.user.create({
      data: {
        email: `${suffix}-unrelated@example.com`,
        passwordHash: 'integration-test-hash',
        type: 'aluno',
        profile: { create: { name: 'Sem vínculo' } },
      },
    });
    unrelatedUserId = unrelated.id;

    const first = await prisma.aluno.create({
      data: {
        contractId,
        status: 'INVITED',
        leadName: 'Dependente Um',
        onboarding: { create: { contractId } },
        preRegistrationInvites: {
          create: {
            contractId,
            tokenHash: hashInviteToken(firstToken),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        },
      },
    });
    firstAlunoId = first.id;

    const second = await prisma.aluno.create({
      data: {
        contractId,
        status: 'INVITED',
        leadName: 'Dependente Dois',
        onboarding: { create: { contractId } },
        preRegistrationInvites: {
          create: {
            contractId,
            tokenHash: hashInviteToken(secondToken),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        },
      },
    });
    secondAlunoId = second.id;
  });

  afterAll(async () => {
    if (contractId) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    if (guardianUserId) {
      await prisma.user.delete({ where: { id: guardianUserId } }).catch(() => undefined);
    }
    if (unrelatedUserId) {
      await prisma.user.delete({ where: { id: unrelatedUserId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('allows one guardian account to claim multiple dependents without using Aluno.userId', async () => {
    await preRegistrationPublicService.claim(guardianUserId, {
      token: firstToken,
      role: 'GUARDIAN',
    });
    await preRegistrationPublicService.claim(guardianUserId, {
      token: secondToken,
      role: 'GUARDIAN',
    });

    const alunos = await prisma.aluno.findMany({
      where: { id: { in: [firstAlunoId, secondAlunoId] } },
      orderBy: { leadName: 'asc' },
      select: { userId: true, status: true },
    });
    expect(alunos).toEqual([
      { userId: null, status: 'PRE_REGISTRATION_IN_PROGRESS' },
      { userId: null, status: 'PRE_REGISTRATION_IN_PROGRESS' },
    ]);

    const authorizations = await prisma.$queryRaw<
      Array<{ alunoId: string; contractId: string; status: string }>
    >`
      SELECT "alunoId", "contractId", "status"
      FROM "PreRegistrationGuardianAuthorization"
      WHERE "guardianUserId" = ${guardianUserId}
      ORDER BY "alunoId"
    `;
    expect(authorizations).toHaveLength(2);
    expect(authorizations.every((item) => item.contractId === contractId)).toBe(true);
    expect(authorizations.every((item) => item.status === 'ACTIVE')).toBe(true);
  });

  it('rejects an account without an active tenant-scoped authorization', async () => {
    await expect(preRegistrationPublicService.getSession(unrelatedUserId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<PreRegistrationPublicError>);
  });

  it('detects stale saves and preserves the server version', async () => {
    const session = await preRegistrationPublicService.getSession(guardianUserId);
    const saved = await preRegistrationPublicService.saveStep(guardianUserId, {
      expectedVersion: session.version,
      step: 'IDENTIFICATION',
      data: {
        name: 'Dependente Dois',
        birthDate: '2012-05-10',
        cpf: '52998224725',
      },
    });
    expect(saved.version).toBe(session.version + 1);
    expect(saved.currentStep).toBe('CONTACT');

    await expect(
      preRegistrationPublicService.saveStep(guardianUserId, {
        expectedVersion: session.version,
        step: 'IDENTIFICATION',
        data: { name: 'Versão antiga' },
      })
    ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });
  });

  it('preserves non-conflicting fields and opens administrative review for duplicate CPF', async () => {
    const conflictingAluno = await prisma.aluno.create({
      data: {
        contractId,
        status: 'LEAD',
        leadName: 'Cadastro Existente',
      },
    });
    await upsertStudentIdentity(
      conflictingAluno.id,
      contractId,
      { name: 'Cadastro Existente', cpf: '11144477735' },
      {
        actor: { userId: guardianUserId },
        sourceType: 'professional',
        sourceReference: 'issue_271_integration_test',
      }
    );

    const session = await preRegistrationPublicService.getSession(guardianUserId);
    const input = {
      expectedVersion: session.version,
      step: 'IDENTIFICATION' as const,
      data: {
        name: 'Rascunho Preservado',
        cpf: '11144477735',
      },
    };

    await expect(
      preRegistrationPublicService.saveStep(guardianUserId, input)
    ).rejects.toMatchObject({ code: 'DUPLICATE_REVIEW_REQUIRED' });
    await preRegistrationDuplicateReviewService.preserveCpfConflict(guardianUserId, input);

    const [resumed, review] = await Promise.all([
      preRegistrationPublicService.getSession(guardianUserId),
      prisma.studentProfileReview.findFirst({
        where: {
          alunoId: secondAlunoId,
          status: 'pending',
          requiresApproval: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    expect(resumed.version).toBe(session.version + 1);
    expect(resumed.currentStep).toBe('IDENTIFICATION');
    expect(resumed.identity.name).toBe('Rascunho Preservado');
    expect(resumed.identity.cpf).toBe('52998224725');
    expect(review).not.toBeNull();
    expect(review?.changedFields).toEqual(['cpf']);
    expect((review?.snapshotAfter as { cpf?: string }).cpf).toBe('11144477735');
  });

  it('completes status, consent and invite atomically and supports a safe retry', async () => {
    const identification = await preRegistrationPublicService.getSession(guardianUserId);
    const contact = await preRegistrationPublicService.saveStep(guardianUserId, {
      expectedVersion: identification.version,
      step: 'CONTACT',
      data: {
        phone: '15999990000',
        email: `${suffix}-dependent@example.com`,
      },
    });
    const guardian = await preRegistrationPublicService.saveStep(guardianUserId, {
      expectedVersion: contact.version,
      step: 'GUARDIAN',
      data: {
        guardianName: 'Responsável Teste',
        guardianCpf: '12345678909',
        guardianPhone: '15988880000',
        guardianEmail: `${suffix}-guardian@example.com`,
        guardianRelationship: 'Mãe',
        guardianDeclarationAccepted: true,
      },
    });

    const completed = await preRegistrationPublicService.complete(
      guardianUserId,
      { expectedVersion: guardian.version, privacyAccepted: true },
      { ipAddress: '127.0.0.1', userAgent: 'issue-271-integration-test' }
    );
    expect(completed.status).toBe('PRE_REGISTRATION_COMPLETED');
    expect(completed.privacy.acceptedAt).toBeTruthy();

    const [aluno, onboarding, invite, completedEvents] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: secondAlunoId } }),
      prisma.studentOnboardingProcess.findUniqueOrThrow({ where: { alunoId: secondAlunoId } }),
      prisma.preRegistrationInvite.findUniqueOrThrow({
        where: { tokenHash: hashInviteToken(secondToken) },
      }),
      prisma.preRegistrationInviteEvent.count({
        where: {
          invite: { alunoId: secondAlunoId },
          eventType: 'COMPLETED',
        },
      }),
    ]);
    expect(aluno.status).toBe('PRE_REGISTRATION_COMPLETED');
    expect(onboarding.completedAt).not.toBeNull();
    expect(onboarding.privacyNoticeVersion).toBeTruthy();
    expect(invite.status).toBe('COMPLETED');
    expect(completedEvents).toBe(1);

    const retried = await preRegistrationPublicService.complete(
      guardianUserId,
      { expectedVersion: guardian.version, privacyAccepted: true },
      { ipAddress: '127.0.0.1', userAgent: 'issue-271-integration-test-retry' }
    );
    expect(retried.status).toBe('PRE_REGISTRATION_COMPLETED');
    expect(
      await prisma.preRegistrationInviteEvent.count({
        where: {
          invite: { alunoId: secondAlunoId },
          eventType: 'COMPLETED',
        },
      })
    ).toBe(1);
  });

  it('revokes access immediately when all guardian authorizations are revoked', async () => {
    await prisma.$executeRaw`
      UPDATE "PreRegistrationGuardianAuthorization"
      SET "status" = 'REVOKED',
          "revokedAt" = CURRENT_TIMESTAMP,
          "revokedByUserId" = ${guardianUserId},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "guardianUserId" = ${guardianUserId}
        AND "contractId" = ${contractId}
    `;

    await expect(preRegistrationPublicService.getSession(guardianUserId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});