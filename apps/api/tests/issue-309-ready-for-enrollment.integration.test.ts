import { PrismaClient } from '@prisma/client';
import { loadStudentIdentity, upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { preRegistrationDuplicateReviewService } from '../src/modules/pre-registration-public/pre-registration-duplicate-review.service.js';
import { preRegistrationHealthIntakeService } from '../src/modules/pre-registration-public/pre-registration-health-intake.service.js';
import { preRegistrationParqService } from '../src/modules/pre-registration-public/pre-registration-parq.service.js';
import { preRegistrationPublicAtomicService } from '../src/modules/pre-registration-public/pre-registration-public-atomic.service.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';

const prisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('issue 309 - READY_FOR_ENROLLMENT no onboarding autenticado', () => {
  const suffix = `issue309-${Date.now()}`;
  let contractId: string;
  let userId: string;
  let alunoId: string;

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}309`,
        name: 'Academia Issue 309',
      },
    });
    contractId = contract.id;

    const user = await prisma.user.create({
      data: {
        email: `${suffix}@example.com`,
        passwordHash: 'integration-test-hash',
        type: 'aluno',
        profile: { create: { name: 'Lead Issue 309' } },
      },
    });
    userId = user.id;

    const aluno = await prisma.aluno.create({
      data: {
        contractId,
        userId,
        status: 'READY_FOR_ENROLLMENT',
        leadName: 'Lead Issue 309',
        onboarding: {
          create: {
            contractId,
            claimedByUserId: userId,
            claimRole: 'STUDENT',
            currentStep: 'PRIVACY',
            version: 3,
            completedAt: new Date(),
            privacyNoticeVersion: '2026-07',
            privacyAcceptedAt: new Date(),
          },
        },
      },
    });
    alunoId = aluno.id;

    await upsertStudentIdentity(
      alunoId,
      contractId,
      {
        name: 'Lead Issue 309',
        email: user.email,
        phone: '11912345678',
        cpf: '52998224725',
        birthDate: '1990-01-01',
      },
      {
        sourceType: 'professional',
        sourceReference: 'issue_309_ready_for_enrollment_test',
      }
    );
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

  it('mantém READY_FOR_ENROLLMENT visível e libera os módulos opcionais de saúde', async () => {
    const processes = await preRegistrationPublicService.listProcesses(userId);
    expect(processes).toEqual([
      expect.objectContaining({
        alunoId,
        status: 'READY_FOR_ENROLLMENT',
      }),
    ]);

    const session = await preRegistrationPublicAtomicService.getSession(userId, alunoId);
    expect(session.status).toBe('READY_FOR_ENROLLMENT');

    await expect(preRegistrationHealthIntakeService.getSession(userId, alunoId)).resolves.toMatchObject({
      alunoId,
      status: 'NOT_STARTED',
    });
    await expect(preRegistrationParqService.getSession(userId, alunoId)).resolves.toMatchObject({
      alunoId,
      status: 'NOT_STARTED',
    });

    await prisma.aluno.update({
      where: { id: alunoId },
      data: { status: 'PRE_REGISTRATION_IN_PROGRESS' },
    });
    try {
      await expect(
        preRegistrationHealthIntakeService.getSession(userId, alunoId)
      ).rejects.toMatchObject({ code: 'BASIC_PRE_REGISTRATION_REQUIRED' });
      await expect(preRegistrationParqService.getSession(userId, alunoId)).rejects.toMatchObject({
        code: 'BASIC_PRE_REGISTRATION_REQUIRED',
      });
    } finally {
      await prisma.aluno.update({
        where: { id: alunoId },
        data: { status: 'READY_FOR_ENROLLMENT' },
      });
    }
  });

  it('mantém os dados cadastrais somente leitura em READY_FOR_ENROLLMENT, inclusive com revisão de duplicidade pendente', async () => {
    const onboardingBefore = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId },
    });
    const identityBefore = await loadStudentIdentity(alunoId, contractId);

    await prisma.studentProfileReview.create({
      data: {
        alunoId,
        requestedByUserId: userId,
        requestedAt: new Date(),
        status: 'pending',
        sectionsRequested: ['contact'],
        snapshotBefore: { phone: identityBefore.phone || null },
        snapshotAfter: { phone: '11988888888' },
        changedFields: ['phone'],
        requiresApproval: true,
      },
    });
    expect(await preRegistrationDuplicateReviewService.hasPendingDuplicateReview(userId, alunoId)).toBe(true);

    await expect(
      preRegistrationDuplicateReviewService.preserveDuplicateConflict(userId, alunoId, {
        expectedVersion: onboardingBefore.version,
        step: 'CONTACT',
        data: { phone: '11988888888' },
      })
    ).rejects.toMatchObject({ code: 'PRE_REGISTRATION_COMPLETED' });

    await expect(
      preRegistrationPublicAtomicService.saveStep(userId, alunoId, {
        expectedVersion: onboardingBefore.version,
        step: 'CONTACT',
        data: { phone: '11999999999' },
      })
    ).rejects.toMatchObject({ code: 'PRE_REGISTRATION_COMPLETED' });

    const onboardingAfter = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId },
    });
    const identityAfter = await loadStudentIdentity(alunoId, contractId);

    expect(onboardingAfter.version).toBe(onboardingBefore.version);
    expect(identityAfter.phone).toBe(identityBefore.phone);
  });
});
