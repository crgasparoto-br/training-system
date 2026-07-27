import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { syncAccessPermissionsForFunction } from '../src/modules/access-control/access-control.service.js';
import { createStudentLead } from '../src/modules/alunos/student-lifecycle.service.js';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import {
  preRegistrationEnrollmentService,
  type PreRegistrationEnrollmentActor,
} from '../src/modules/pre-registration-enrollment/index.js';
import { preRegistrationInviteAdminService } from '../src/modules/pre-registration-invites/pre-registration-invite-admin.service.js';
import { PRE_REGISTRATION_PRIVACY_NOTICE_VERSION } from '../src/modules/pre-registration-public/pre-registration-policy.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/index.js';

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();
const suffix = `issue-274-a005-a006-${Date.now()}`;
const contractId = `${suffix}-contract`;
const createdUserIds: string[] = [];

async function createUser(label: string, type: UserType, name: string, email?: string) {
  const user = await prisma.user.create({
    data: {
      email: email ?? `${suffix}-${label}@example.com`,
      passwordHash: 'integration-test-hash',
      type,
      profile: { create: { name } },
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createActor(label: string): Promise<PreRegistrationEnrollmentActor & { functionId: string; functionCode: string }> {
  const functionCode = `${suffix}-${label}`;
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: `Função ${label}`,
      code: functionCode,
      isActive: true,
    },
  });
  const user = await createUser(label, UserType.professor, `Professor ${label}`);
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId,
      collaboratorFunctionId: collaboratorFunction.id,
      role: ProfessorRole.master,
    },
  });
  await syncAccessPermissionsForFunction(collaboratorFunction.id, functionCode);
  await prisma.accessPermission.updateMany({
    where: { collaboratorFunctionId: collaboratorFunction.id },
    data: { canView: true, dataScope: 'contract' },
  });
  return {
    userId: user.id,
    professorId: professor.id,
    contractId,
    functionId: collaboratorFunction.id,
    functionCode,
  };
}

describeDatabase('issue 274 findings A-005 and A-006 remediation', () => {
  beforeAll(async () => {
    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: `${Date.now()}2746`,
        name: 'Contrato Issue 274 A-005 A-006',
      },
    });
  });

  afterAll(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    for (const userId of createdUserIds.reverse()) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('renews a stale READY_FOR_ENROLLMENT review and then activates the same record', async () => {
    const actor = await createActor('renew-review');
    const studentUser = await createUser(
      'renew-review-student',
      UserType.aluno,
      'Aluno Revisão Renovável'
    );
    const lead = await createStudentLead({
      contractId,
      name: 'Aluno Revisão Renovável',
      phone: '+55 15 95555-0274',
      email: `${suffix}-renew-review@example.com`,
      origin: 'teste-renovacao-revisao',
      createdByProfessorId: actor.professorId,
    });
    await upsertStudentIdentity(
      lead.id,
      contractId,
      {
        name: 'Aluno Revisão Renovável',
        birthDate: '1992-02-14',
        phone: '+55 15 95555-0274',
        email: `${suffix}-renew-review@example.com`,
      },
      { sourceType: 'professional', sourceReference: 'issue_274_a005_seed' }
    );
    await prisma.aluno.update({
      where: { id: lead.id },
      data: {
        status: 'PRE_REGISTRATION_COMPLETED',
        userId: studentUser.id,
        professorId: actor.professorId,
      },
    });
    await prisma.studentOnboardingProcess.update({
      where: { alunoId: lead.id },
      data: {
        completedAt: new Date(),
        privacyNoticeVersion: PRE_REGISTRATION_PRIVACY_NOTICE_VERSION,
        privacyAcceptedAt: new Date(),
      },
    });

    const initial = await preRegistrationEnrollmentService.inspect(actor, lead.id);
    const ready = await preRegistrationEnrollmentService.markReady(actor, lead.id, {
      expectedVersion: initial.recordVersion,
      fingerprint: initial.fingerprint,
      reason: 'Primeira revisão administrativa.',
    });
    expect(ready.status).toBe('READY_FOR_ENROLLMENT');
    expect(ready.canConfirmEnrollment).toBe(true);

    await upsertStudentIdentity(
      lead.id,
      contractId,
      { phone: '+55 15 95555-1274' },
      {
        actor: { userId: actor.userId, professorId: actor.professorId },
        sourceType: 'professional',
        sourceReference: 'issue_274_a005_change',
      }
    );

    const stale = await preRegistrationEnrollmentService.inspect(actor, lead.id);
    expect(stale.status).toBe('READY_FOR_ENROLLMENT');
    expect(stale.canConfirmEnrollment).toBe(false);
    expect(stale.canMarkReady).toBe(true);

    const renewed = await preRegistrationEnrollmentService.markReady(actor, lead.id, {
      expectedVersion: stale.recordVersion,
      fingerprint: stale.fingerprint,
      reason: 'Revisão renovada após alteração cadastral.',
    });
    expect(renewed.status).toBe('READY_FOR_ENROLLMENT');
    expect(renewed.canMarkReady).toBe(false);
    expect(renewed.canConfirmEnrollment).toBe(true);

    const activated = await preRegistrationEnrollmentService.confirmEnrollment(actor, lead.id, {
      expectedVersion: renewed.recordVersion,
      fingerprint: renewed.fingerprint,
      confirmationAccepted: true,
    });
    expect(activated).toMatchObject({
      alunoId: lead.id,
      status: 'ACTIVE_STUDENT',
      idempotent: false,
    });
    expect(await prisma.studentLifecycleEvent.count({
      where: {
        alunoId: lead.id,
        contractId,
        eventType: 'CONVERTED_TO_ACTIVE_STUDENT',
      },
    })).toBe(1);
  });

  it('persists claim-time duplicate detection privately and idempotently', async () => {
    const actor = await createActor('claim-review');
    const sharedEmail = `${suffix}-claim-shared@example.com`;
    await createStudentLead({
      contractId,
      name: 'Cadastro candidato',
      phone: '+55 15 96666-0274',
      email: sharedEmail,
      origin: 'teste-claim-candidate',
      createdByProfessorId: actor.professorId,
    });
    const source = await createStudentLead({
      contractId,
      name: 'Pessoa Claim',
      phone: '+55 15 97777-0274',
      email: sharedEmail,
      origin: 'teste-claim-source',
      createdByProfessorId: actor.professorId,
    });
    const studentUser = await createUser(
      'claim-student',
      UserType.aluno,
      'Pessoa Claim',
      sharedEmail
    );
    const invite = await preRegistrationInviteAdminService.generateFirstInvite(
      source.id,
      contractId,
      actor
    );

    const claimed = await preRegistrationPublicService.claim(studentUser.id, {
      token: invite.token,
      role: 'STUDENT',
    });
    expect(claimed).toEqual({ alunoId: source.id, redirectTo: '/pre-cadastro' });

    const pending = await prisma.studentProfileReview.findFirstOrThrow({
      where: {
        alunoId: source.id,
        requestedByUserId: studentUser.id,
        status: 'pending',
        requiresApproval: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(pending.changedFields).toEqual(expect.arrayContaining(['email']));
    expect(pending.sectionsRequested).toEqual(expect.arrayContaining(['contact']));
    expect(pending.snapshotAfter).toEqual(pending.snapshotBefore);

    const audit = await prisma.studentLifecycleEvent.findFirstOrThrow({
      where: {
        alunoId: source.id,
        contractId,
        eventType: 'ADMIN_REVIEWED',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.metadata).toMatchObject({
      source: 'public_pre_registration_claim',
      action: 'duplicate_review_requested',
      classification: 'REVIEW_REQUIRED',
      publicDisclosure: 'NONE',
    });
    expect(audit.metadata).not.toHaveProperty('candidateAlunoId');
    expect(audit.metadata).not.toHaveProperty('candidateAlunoIds');

    const retried = await preRegistrationPublicService.claim(studentUser.id, {
      token: invite.token,
      role: 'STUDENT',
    });
    expect(retried).toEqual(claimed);
    expect(await prisma.studentProfileReview.count({
      where: {
        alunoId: source.id,
        requestedByUserId: studentUser.id,
        status: 'pending',
        requiresApproval: true,
      },
    })).toBe(1);
    expect(await prisma.studentLifecycleEvent.count({
      where: {
        alunoId: source.id,
        contractId,
        eventType: 'ADMIN_REVIEWED',
      },
    })).toBe(1);

    const cleanEmail = `${suffix}-claim-clean@example.com`;
    const cleanSource = await createStudentLead({
      contractId,
      name: 'Pessoa Claim Sem Duplicidade',
      phone: '+55 15 98888-0274',
      email: cleanEmail,
      origin: 'teste-claim-clean',
      createdByProfessorId: actor.professorId,
    });
    const cleanUser = await createUser(
      'claim-clean-student',
      UserType.aluno,
      'Pessoa Claim Sem Duplicidade',
      cleanEmail
    );
    const cleanInvite = await preRegistrationInviteAdminService.generateFirstInvite(
      cleanSource.id,
      contractId,
      actor
    );
    const cleanClaim = await preRegistrationPublicService.claim(cleanUser.id, {
      token: cleanInvite.token,
      role: 'STUDENT',
    });
    expect(Object.keys(cleanClaim).sort()).toEqual(Object.keys(claimed).sort());
    expect(await prisma.studentProfileReview.count({
      where: {
        alunoId: cleanSource.id,
        status: 'pending',
        requiresApproval: true,
      },
    })).toBe(0);
  });
});
