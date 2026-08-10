import { PrismaClient } from '@prisma/client';
import { preRegistrationGuardianAuthorizationAdminService } from '../src/modules/pre-registration-admin/pre-registration-guardian-authorization-admin.service.js';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';

const prisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('guardian authorization independent admin approval', () => {
  const suffix = `issue271-guardian-admin-${Date.now()}`;
  const authorizationCreatedAt = new Date('2026-07-23T09:00:00.000Z');
  const requestedAt = new Date('2026-07-23T10:15:00.000Z');
  let contractId: string;
  let professorId: string;
  let adminUserId: string;
  let guardianUserId: string;
  let alunoId: string;
  let validatedAt: string;

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271ga`,
        name: 'Academia Validação Responsável',
      },
    });
    contractId = contract.id;

    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId,
        name: 'Gestor',
        code: `manager-${suffix}`,
        isSystem: false,
      },
    });
    const admin = await prisma.user.create({
      data: {
        email: `${suffix}-admin@example.com`,
        passwordHash: 'integration-test-hash',
        type: 'professor',
        profile: { create: { name: 'Gestor Validador' } },
      },
    });
    adminUserId = admin.id;
    const professor = await prisma.professor.create({
      data: {
        userId: admin.id,
        contractId,
        role: 'master',
        collaboratorFunctionId: collaboratorFunction.id,
      },
    });
    professorId = professor.id;

    const guardian = await prisma.user.create({
      data: {
        email: `${suffix}-guardian@example.com`,
        passwordHash: 'integration-test-hash',
        type: 'aluno',
        profile: { create: { name: 'Responsável Declarado', phone: '15999990000' } },
      },
    });
    guardianUserId = guardian.id;

    const aluno = await prisma.aluno.create({
      data: {
        contractId,
        status: 'INVITED',
        leadName: 'Dependente Protegido',
        professorId,
        onboarding: {
          create: {
            contractId,
            claimRole: 'GUARDIAN',
            claimedByUserId: guardian.id,
            claimedAt: new Date(),
          },
        },
        guardianAuthorizations: {
          create: {
            contractId,
            guardianUserId: guardian.id,
            relationship: 'Mãe',
            status: 'PENDING',
            createdAt: authorizationCreatedAt,
            updatedAt: authorizationCreatedAt,
          },
        },
      },
    });
    alunoId = aluno.id;
    await upsertStudentIdentity(
      aluno.id,
      contractId,
      {
        name: 'Dependente Protegido',
        birthDate: '2012-05-10',
        cpf: '52998224725',
      },
      { sourceType: 'professional', sourceReference: 'issue_271_guardian_admin_fixture' }
    );

    await prisma.studentLifecycleEvent.createMany({
      data: [
        {
          alunoId,
          contractId,
          eventType: 'ACCOUNT_LINKED',
          actorUserId: guardianUserId,
          createdAt: requestedAt,
          metadata: {
            source: 'public_pre_registration',
            role: 'GUARDIAN',
            action: 'guardian_authorization_requested',
            relationship: 'Mãe',
            authorizationStatus: 'PENDING',
          },
        },
        {
          alunoId,
          contractId,
          eventType: 'ACCOUNT_LINKED',
          actorUserId: guardianUserId,
          createdAt: new Date('2026-07-23T11:30:00.000Z'),
          metadata: {
            source: 'unrelated_test_event',
            role: 'GUARDIAN',
          },
        },
      ],
    });
  });

  afterAll(async () => {
    if (contractId) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    if (guardianUserId) {
      await prisma.user.delete({ where: { id: guardianUserId } }).catch(() => undefined);
    }
    if (adminUserId) {
      await prisma.user.delete({ where: { id: adminUserId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  const actor = () => ({ userId: adminUserId, professorId, contractId });

  it('keeps self-validation blocked by the database invariant', async () => {
    await expect(
      prisma.preRegistrationGuardianAuthorization.updateMany({
        where: { alunoId, guardianUserId, status: 'PENDING' },
        data: {
          status: 'ACTIVE',
          validatedAt: new Date(),
          validatedByUserId: guardianUserId,
        },
      })
    ).rejects.toBeTruthy();

    const authorization = await prisma.preRegistrationGuardianAuthorization.findFirstOrThrow({
      where: { alunoId, guardianUserId },
    });
    expect(authorization.status).toBe('PENDING');
    expect(authorization.validatedByUserId).toBeNull();
  });

  it('allows an authorized academy user to approve and preserves the request date', async () => {
    const pending = await preRegistrationGuardianAuthorizationAdminService.get(actor(), alunoId);
    expect(pending).toMatchObject({
      status: 'PENDING',
      relationship: 'Mãe',
      guardian: { userId: guardianUserId, name: 'Responsável Declarado' },
      requestedAt: requestedAt.toISOString(),
    });
    expect(pending?.requestedAt).not.toBe(authorizationCreatedAt.toISOString());

    const approved = await preRegistrationGuardianAuthorizationAdminService.approve(
      actor(),
      alunoId
    );
    expect(approved).toMatchObject({
      status: 'ACTIVE',
      relationship: 'Mãe',
      requestedAt: requestedAt.toISOString(),
      validatedBy: { userId: adminUserId, name: 'Gestor Validador' },
    });
    expect(approved.validatedAt).toBeTruthy();
    expect(approved.validatedAt).not.toBe(approved.requestedAt);
    validatedAt = approved.validatedAt!;

    const event = await prisma.studentLifecycleEvent.findFirst({
      where: {
        alunoId,
        contractId,
        eventType: 'ADMIN_REVIEWED',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(event?.actorUserId).toBe(adminUserId);
    expect(event?.actorProfessorId).toBe(professorId);
    expect(event?.metadata).toMatchObject({ action: 'guardian_authorization_approved' });
  });

  it('revokes the relationship without rewriting request or validation dates', async () => {
    const revoked = await preRegistrationGuardianAuthorizationAdminService.revoke(
      actor(),
      alunoId,
      'Documento de tutela deixou de ser válido.'
    );
    expect(revoked).toMatchObject({
      status: 'REVOKED',
      requestedAt: requestedAt.toISOString(),
      validatedAt,
    });
    expect(revoked.revokedAt).toBeTruthy();
    expect(revoked.revokedAt).not.toBe(revoked.requestedAt);
    expect(revoked.revokedAt).not.toBe(revoked.validatedAt);

    const onboarding = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId },
    });
    expect(onboarding.claimedByUserId).toBeNull();

    await expect(
      preRegistrationGuardianAuthorizationAdminService.approve(actor(), alunoId)
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('does not resolve a guardian authorization across tenants', async () => {
    const otherContract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271gb`,
        name: 'Outro Tenant Guardian',
      },
    });
    const otherAluno = await prisma.aluno.create({
      data: {
        contractId: otherContract.id,
        status: 'INVITED',
        leadName: 'Dependente Outro Tenant',
        onboarding: { create: { contractId: otherContract.id } },
      },
    });

    await expect(
      preRegistrationGuardianAuthorizationAdminService.get(actor(), otherAluno.id)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await prisma.companyContract.delete({ where: { id: otherContract.id } });
  });
});