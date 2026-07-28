import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { createStudentLead } from '../src/modules/alunos/student-lifecycle.service.js';
import { preRegistrationAdminService } from '../src/modules/pre-registration-admin/pre-registration-admin.service.js';
import { preRegistrationEnrollmentCreateService } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.js';
import {
  preRegistrationEnrollmentService,
  type PreRegistrationEnrollmentActor,
} from '../src/modules/pre-registration-enrollment/index.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractId = 'issue-274-enrollment-integration';
const emailPrefix = 'issue-274-enrollment-';
let sequence = 0;

async function seedActor(): Promise<PreRegistrationEnrollmentActor> {
  sequence += 1;
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Administrador',
      code: `issue-274-master-${sequence}`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}actor-${sequence}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Administrador Issue 274' } },
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId,
      collaboratorFunctionId: collaboratorFunction.id,
      role: ProfessorRole.master,
    },
  });
  return { userId: user.id, professorId: professor.id, contractId };
}

async function createLead(
  actor: PreRegistrationEnrollmentActor,
  suffix: string,
  phone: string,
  email: string
) {
  return createStudentLead({
    contractId,
    name: 'Pessoa Canônica',
    phone,
    email,
    origin: `teste-${suffix}`,
    createdByProfessorId: actor.professorId,
  });
}

async function createDuplicatePair(
  actor: PreRegistrationEnrollmentActor,
  suffix: string
) {
  const target = await createLead(
    actor,
    `${suffix}-target`,
    '+55 15 98888-0274',
    `${emailPrefix}${suffix}-shared@example.com`
  );
  const source = await createLead(
    actor,
    `${suffix}-source`,
    '(15) 98888-0274',
    `${emailPrefix}${suffix}-shared@example.com`.toUpperCase()
  );
  return { source, target };
}

describeDatabase('pre-registration enrollment with PostgreSQL', () => {
  beforeEach(async () => {
    sequence = 0;
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: '57365610000220',
        name: 'Contrato Issue 274',
      },
    });
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('links the duplicate to the canonical record and does not poison later detection', async () => {
    const actor = await seedActor();
    const target = await createLead(
      actor,
      'target',
      '+55 15 99999-0000',
      'same-person@example.com'
    );
    const source = await createLead(
      actor,
      'source',
      '(15) 99999-0000',
      'SAME-PERSON@example.com'
    );

    const sourceReview = await preRegistrationEnrollmentService.inspect(actor, source.id);
    expect(sourceReview.classification).toBe('REVIEW_REQUIRED');
    expect(sourceReview.candidates.map((candidate) => candidate.candidateAlunoId)).toContain(target.id);

    await preRegistrationEnrollmentService.decide(actor, source.id, {
      action: 'USE_EXISTING_CANONICAL',
      candidateAlunoId: target.id,
      reason: 'Cadastros confirmados como a mesma pessoa durante a matrícula.',
      expectedVersion: sourceReview.recordVersion,
      fingerprint: sourceReview.fingerprint,
      fieldDecisions: {},
    });

    const [discardedSource, targetReview, targetAudit] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: source.id } }),
      preRegistrationEnrollmentService.inspect(actor, target.id),
      prisma.studentLifecycleEvent.findFirstOrThrow({
        where: { alunoId: target.id, contractId, eventType: 'ADMIN_REVIEWED' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    expect(discardedSource.status).toBe('DISCARDED');
    expect(discardedSource.canonicalAlunoId).toBe(target.id);
    expect(targetReview.classification).toBe('NONE');
    expect(targetReview.candidates).toHaveLength(0);
    expect(targetAudit.metadata).toMatchObject({
      kind: 'DEDUPLICATION_CONSOLIDATION',
      sourceAlunoId: source.id,
      targetAlunoId: target.id,
      fingerprint: targetReview.fingerprint,
      reviewedRecordVersion: targetReview.recordVersion,
    });

    const third = await createLead(
      actor,
      'third',
      '(15) 97777-0000',
      'third-person@example.com'
    );
    await expect(
      prisma.aluno.update({
        where: { id: target.id },
        data: { canonicalAlunoId: third.id },
      })
    ).rejects.toThrow();
    expect(
      (await prisma.aluno.findUniqueOrThrow({ where: { id: target.id } }))
        .canonicalAlunoId
    ).toBeNull();
  });

  it('stores a lead-creation false-positive decision with the persisted onboarding version', async () => {
    const actor = await seedActor();
    await createLead(
      actor,
      'existing',
      '+55 15 98888-0000',
      'shared-contact@example.com'
    );

    const proposed = await preRegistrationEnrollmentService.inspectProposedLead(actor, {
      name: 'Pessoa Diferente',
      phone: '(15) 98888-0000',
      email: 'SHARED-CONTACT@example.com',
    });
    expect(proposed.classification).toBe('REVIEW_REQUIRED');

    const createdId = await preRegistrationEnrollmentCreateService.create(actor, {
      name: 'Pessoa Diferente',
      phone: '(15) 98888-0000',
      email: 'SHARED-CONTACT@example.com',
      origin: 'teste-falso-positivo',
      responsibleProfessorId: actor.professorId,
      confirmedDuplicateFingerprint: proposed.fingerprint,
      confirmedDuplicateReason: 'Contato compartilhado, identidades confirmadas como distintas.',
    });

    const review = await preRegistrationEnrollmentService.inspect(actor, createdId);
    expect(review.currentDecision).toMatchObject({
      action: 'CONFIRM_DIFFERENT',
      fingerprint: review.fingerprint,
      reviewedRecordVersion: review.recordVersion,
    });
    expect(review.recordVersion).toBeGreaterThan(0);
  });

  it('serializes concurrent administrative edits that would create the same identity', async () => {
    const actor = await seedActor();
    const first = await createLead(
      actor,
      'concurrent-first',
      '+55 15 91111-0001',
      'concurrent-first@example.com'
    );
    const second = await createLead(
      actor,
      'concurrent-second',
      '+55 15 91111-0002',
      'concurrent-second@example.com'
    );
    const desiredPhone = '+55 15 92222-0000';
    const desiredEmail = 'concurrent-shared@example.com';

    const results = await Promise.allSettled([
      preRegistrationAdminService.updateCommercial(actor, first.id, {
        phone: desiredPhone,
        email: desiredEmail,
      }),
      preRegistrationAdminService.updateCommercial(actor, second.id, {
        phone: desiredPhone,
        email: desiredEmail,
      }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const persisted = await prisma.aluno.count({
      where: {
        contractId,
        OR: [
          { leadPhoneNormalized: '5515922220000' },
          { leadEmailNormalized: desiredEmail },
        ],
      },
    });
    expect(persisted).toBe(1);
  });

  it('blocks consolidation when only a StudentAssessmentRecord exists and preserves both records', async () => {
    const actor = await seedActor();
    const { source, target } = await createDuplicatePair(actor, 'owned-assessment');
    const assessment = await prisma.studentAssessmentRecord.create({
      data: {
        alunoId: source.id,
        contractId,
        assessmentCategory: 'physical_assessment',
        title: 'Avaliação física canônica',
        performedAt: new Date('2026-07-28T08:00:00.000Z'),
      },
    });

    const review = await preRegistrationEnrollmentService.inspect(actor, source.id);
    expect(review.candidates.map((candidate) => candidate.candidateAlunoId)).toContain(target.id);

    await expect(
      preRegistrationEnrollmentService.decide(actor, source.id, {
        action: 'USE_EXISTING_CANONICAL',
        candidateAlunoId: target.id,
        reason: 'Mesma pessoa confirmada, mas a avaliação deve impedir consolidação automática.',
        expectedVersion: review.recordVersion,
        fingerprint: review.fingerprint,
        fieldDecisions: {},
      })
    ).rejects.toMatchObject({
      code: 'HEALTH_REASSOCIATION_REQUIRED',
      details: { operationalPending: 'CLINICAL_REASSOCIATION_REQUIRED' },
    });

    const [sourceAfter, targetAfter, assessmentAfter] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: source.id } }),
      prisma.aluno.findUniqueOrThrow({ where: { id: target.id } }),
      prisma.studentAssessmentRecord.findUniqueOrThrow({ where: { id: assessment.id } }),
    ]);
    expect(sourceAfter.status).not.toBe('DISCARDED');
    expect(sourceAfter.canonicalAlunoId).toBeNull();
    expect(targetAfter.canonicalAlunoId).toBeNull();
    expect(assessmentAfter.alunoId).toBe(source.id);
  });

  it('enforces the ownership invariant in PostgreSQL for direct duplicate-discard writes', async () => {
    const actor = await seedActor();
    const { source, target } = await createDuplicatePair(actor, 'direct-trigger');
    await prisma.studentAssessmentRecord.create({
      data: {
        alunoId: source.id,
        contractId,
        assessmentCategory: 'physical_assessment',
        performedAt: new Date('2026-07-28T08:05:00.000Z'),
      },
    });

    await expect(
      prisma.aluno.update({
        where: { id: source.id },
        data: {
          status: 'DISCARDED',
          discardReason: `DUPLICATE_OF:${target.id}`,
        },
      })
    ).rejects.toThrow(/CLINICAL_REASSOCIATION_REQUIRED/);

    const sourceAfter = await prisma.aluno.findUniqueOrThrow({ where: { id: source.id } });
    expect(sourceAfter.status).not.toBe('DISCARDED');
    expect(sourceAfter.discardReason).toBeNull();
    expect(sourceAfter.canonicalAlunoId).toBeNull();
  });
});
