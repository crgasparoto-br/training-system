import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import type { UpdatePreRegistrationLeadCommercialDTO } from '@corrida/types';
import { createStudentLead } from '../src/modules/alunos/student-lifecycle.service.js';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { preRegistrationAdminService } from '../src/modules/pre-registration-admin/pre-registration-admin.service.js';
import {
  preRegistrationEnrollmentService,
  type PreRegistrationEnrollmentActor,
} from '../src/modules/pre-registration-enrollment/pre-registration-enrollment.service.js';
import { PRE_REGISTRATION_PRIVACY_NOTICE_VERSION } from '../src/modules/pre-registration-public/pre-registration-policy.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();
const suffix = `issue-274-review-invalidation-${Date.now()}`;
const contractId = `${suffix}-contract`;
let sequence = 0;
let actorUserId: string;
let actor: PreRegistrationEnrollmentActor;

async function seedCompletedLead(label: string) {
  sequence += 1;
  const phone = `+55 15 94444-${String(sequence).padStart(4, '0')}`;
  const email = `${suffix}-${sequence}@example.com`;
  const lead = await createStudentLead({
    contractId,
    name: `Pessoa ${label} ${sequence}`,
    phone,
    email,
    origin: 'origem-inicial',
    createdByProfessorId: actor.professorId,
  });

  await upsertStudentIdentity(
    lead.id,
    contractId,
    {
      name: `Pessoa ${label} ${sequence}`,
      birthDate: '1990-01-01',
      phone,
      email,
    },
    {
      sourceType: 'professional',
      sourceReference: 'issue_274_review_invalidation_fixture',
    }
  );

  await prisma.aluno.update({
    where: { id: lead.id },
    data: {
      status: 'PRE_REGISTRATION_COMPLETED',
      professorId: actor.professorId,
    },
  });
  await prisma.studentOnboardingProcess.update({
    where: { alunoId: lead.id },
    data: {
      completedAt: new Date(),
      currentStep: 'PRIVACY',
      privacyNoticeVersion: PRE_REGISTRATION_PRIVACY_NOTICE_VERSION,
      privacyAcceptedAt: new Date(),
      reviewedAt: null,
      reviewedByProfessorId: null,
    },
  });

  return lead;
}

describeDatabase('issue 274 stale commercial review invalidation', () => {
  beforeAll(async () => {
    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: `${Date.now()}27415`,
        name: 'Contrato Issue 274 AUD-274-15',
      },
    });
    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId,
        name: 'Administrador da matrícula',
        code: `${suffix}-master`,
        isActive: true,
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `${suffix}-actor@example.com`,
        passwordHash: 'integration-test-hash',
        type: UserType.professor,
        profile: { create: { name: 'Administrador Issue 274' } },
      },
    });
    actorUserId = user.id;
    const professor = await prisma.professor.create({
      data: {
        userId: user.id,
        contractId,
        collaboratorFunctionId: collaboratorFunction.id,
        role: ProfessorRole.master,
      },
    });
    actor = {
      userId: user.id,
      professorId: professor.id,
      contractId,
    };
  });

  afterAll(async () => {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    if (actorUserId) {
      await prisma.user.delete({ where: { id: actorUserId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it.each<[string, UpdatePreRegistrationLeadCommercialDTO]>([
    ['unidade', { unit: 'Unidade Centro' }],
    ['observações', { commercialNotes: 'Contato realizado pela recepção.' }],
    [
      'origem, unidade e observações na mesma transação',
      {
        origin: 'indicação-professor',
        unit: 'Unidade Norte',
        commercialNotes: 'Preferência por atendimento no período da manhã.',
      },
    ],
  ])(
    'incrementa a versão uma única vez para alteração de %s antes da primeira revisão',
    async (label, patch) => {
      const lead = await seedCompletedLead(label);
      const staleReview = await preRegistrationEnrollmentService.inspect(actor, lead.id);

      await preRegistrationAdminService.updateCommercial(actor, lead.id, patch);

      const onboarding = await prisma.studentOnboardingProcess.findUniqueOrThrow({
        where: { alunoId: lead.id },
        select: { version: true, reviewedAt: true, reviewedByProfessorId: true },
      });
      expect(onboarding.version).toBe(staleReview.recordVersion + 1);
      expect(onboarding.reviewedAt).toBeNull();
      expect(onboarding.reviewedByProfessorId).toBeNull();

      await expect(
        preRegistrationEnrollmentService.markReady(actor, lead.id, {
          expectedVersion: staleReview.recordVersion,
          fingerprint: staleReview.fingerprint,
          reason: 'Revisão aberta antes da alteração comercial.',
        })
      ).rejects.toMatchObject({ code: 'REVIEW_STALE' });

      const currentReview = await preRegistrationEnrollmentService.inspect(actor, lead.id);
      const ready = await preRegistrationEnrollmentService.markReady(actor, lead.id, {
        expectedVersion: currentReview.recordVersion,
        fingerprint: currentReview.fingerprint,
        reason: 'Dados comerciais atuais revisados.',
      });
      expect(ready.status).toBe('READY_FOR_ENROLLMENT');
    }
  );
});
