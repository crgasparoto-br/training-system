import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PARQ_CATALOG_VERSION, type ParqResponses } from '@corrida/types';
import { preRegistrationEnrollmentCreateService } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.js';
import {
  preRegistrationEnrollmentService,
  type PreRegistrationEnrollmentActor,
} from '../src/modules/pre-registration-enrollment/pre-registration-enrollment.service.js';
import { preRegistrationInviteAdminService } from '../src/modules/pre-registration-invites/pre-registration-invite-admin.service.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { preRegistrationHealthIntakeService } from '../src/modules/pre-registration-public/pre-registration-health-intake.service.js';
import { preRegistrationParqService } from '../src/modules/pre-registration-public/pre-registration-parq.service.js';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const createdContractIds: string[] = [];
const createdUserIds: string[] = [];

const negativeParq = {
  q1: false,
  q2: false,
  q3: false,
  q4: false,
  q5: false,
  q6: false,
  q7: false,
} satisfies ParqResponses;

const positiveParq = { ...negativeParq, q2: true, q5: true } satisfies ParqResponses;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectCode(action: () => Promise<unknown>, code: string) {
  try {
    await action();
  } catch (error) {
    const observed = (error as { code?: string })?.code;
    if (observed === code) return error;
    throw new Error(`Esperado ${code}, recebido ${observed || String(error)}`);
  }
  throw new Error(`Esperado ${code}, mas a operação foi concluída`);
}

async function createTenant(label: string) {
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `275-${label}-${suffix}`,
      name: `Academia Issue 275 ${label}`,
    },
  });
  createdContractIds.push(contract.id);

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: contract.id,
      name: `Administrador ${label}`,
      code: `issue-275-master-${label}-${suffix}`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `issue-275-master-${label}-${suffix}@example.test`,
      passwordHash: 'not-used',
      type: 'professor',
      profile: { create: { name: `Administrador ${label}` } },
    },
  });
  createdUserIds.push(user.id);
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId: contract.id,
      collaboratorFunctionId: collaboratorFunction.id,
      role: 'master',
    },
  });
  const actor: PreRegistrationEnrollmentActor = {
    userId: user.id,
    professorId: professor.id,
    contractId: contract.id,
  };
  return { contract, user, professor, actor };
}

async function createStudentUser(label: string, name: string, email?: string) {
  const user = await prisma.user.create({
    data: {
      email: email ?? `issue-275-${label}-${suffix}@example.test`,
      passwordHash: 'not-used',
      type: 'aluno',
      profile: { create: { name } },
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createLead(
  actor: PreRegistrationEnrollmentActor,
  label: string,
  input: { name: string; phone?: string; email?: string; cpf?: string }
) {
  return preRegistrationEnrollmentCreateService.create(actor, {
    name: input.name,
    phone: input.phone,
    email: input.email,
    cpf: input.cpf,
    origin: `issue-275-${label}`,
    responsibleProfessorId: actor.professorId,
  });
}

async function claimAndCompleteBasic(params: {
  actor: PreRegistrationEnrollmentActor;
  label: string;
  name: string;
  phone: string;
  email: string;
  cpf: string;
  birthDate?: string;
}) {
  const alunoId = await createLead(params.actor, params.label, {
    name: params.name,
    phone: params.phone,
    email: params.email,
  });
  const invitation = await preRegistrationInviteAdminService.generateFirstInvite(
    alunoId,
    params.actor.contractId,
    params.actor
  );
  const student = await createStudentUser(params.label, params.name, params.email);
  const claim = await preRegistrationPublicService.claim(student.id, {
    token: invitation.token,
    role: 'STUDENT',
  });
  assert(claim.alunoId === alunoId, `${params.label}: claim alterou o identificador canônico`);

  let session = await preRegistrationPublicService.getSession(student.id, alunoId);
  session = await preRegistrationPublicService.saveStep(student.id, alunoId, {
    expectedVersion: session.version,
    step: 'IDENTIFICATION',
    data: {
      name: params.name,
      birthDate: params.birthDate ?? '1990-05-10',
      cpf: params.cpf,
    },
  });
  session = await preRegistrationPublicService.saveStep(student.id, alunoId, {
    expectedVersion: session.version,
    step: 'CONTACT',
    data: { phone: params.phone, email: params.email },
  });
  session = await preRegistrationPublicService.saveStep(student.id, alunoId, {
    expectedVersion: session.version,
    step: 'ADDRESS',
    data: {},
  });
  const completed = await preRegistrationPublicService.complete(student.id, alunoId, {
    expectedVersion: session.version,
    privacyAccepted: true,
  });
  assert(completed.status === 'PRE_REGISTRATION_COMPLETED', `${params.label}: dados básicos não concluídos`);
  return { alunoId, student, invitation, completed };
}

async function completeHealthIntake(userId: string, alunoId: string) {
  let session = await preRegistrationHealthIntakeService.getSession(userId, alunoId);
  session = await preRegistrationHealthIntakeService.saveStep(userId, alunoId, {
    expectedVersion: session.version,
    step: 'HEALTH_HISTORY',
    consent: { accepted: true, privacyNoticeVersion: '2026-07' },
    data: { mainGoal: 'Condicionamento', hasMedicalConditions: false },
  });
  session = await preRegistrationHealthIntakeService.saveStep(userId, alunoId, {
    expectedVersion: session.version,
    step: 'MEDICATIONS',
    data: { usesMedication: false, hasAllergies: false },
  });
  session = await preRegistrationHealthIntakeService.saveStep(userId, alunoId, {
    expectedVersion: session.version,
    step: 'INJURIES',
    data: { hasInjuries: false, hasExerciseRestrictions: false },
  });
  session = await preRegistrationHealthIntakeService.saveStep(userId, alunoId, {
    expectedVersion: session.version,
    step: 'ACTIVITY',
    data: { trainingBackground: 'Treino recreativo' },
  });
  const completed = await preRegistrationHealthIntakeService.complete(userId, alunoId, {
    expectedVersion: session.version,
    declarationAccepted: true,
  });
  assert(completed.status === 'COMPLETED', 'Anamnese não foi concluída');
  const persisted = await prisma.studentHealthIntake.findUniqueOrThrow({ where: { alunoId } });
  return { session: completed, id: persisted.id };
}

async function completeParq(
  userId: string,
  alunoId: string,
  responses: ParqResponses,
  idempotencyKey: string
) {
  const session = await preRegistrationParqService.getSession(userId, alunoId);
  return preRegistrationParqService.complete(userId, alunoId, {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: session.version,
    responses,
    consent: {
      accepted: true,
      privacyNoticeVersion: '2026-07',
      expectedVersion: session.consent.version,
    },
    declarationAccepted: true,
    idempotencyKey,
  });
}

async function reviewAndConvert(
  actor: PreRegistrationEnrollmentActor,
  alunoId: string,
  label: string
) {
  const review = await preRegistrationEnrollmentService.inspect(actor, alunoId);
  const ready = await preRegistrationEnrollmentService.markReady(actor, alunoId, {
    expectedVersion: review.recordVersion,
    fingerprint: review.fingerprint,
    reason: `Revisão integrada ${label}`,
  });
  const result = await preRegistrationEnrollmentService.confirmEnrollment(actor, alunoId, {
    expectedVersion: ready.recordVersion,
    fingerprint: ready.fingerprint,
    confirmationAccepted: true,
  });
  assert(result.alunoId === alunoId, `${label}: conversão criou outro identificador`);
  assert(result.status === 'ACTIVE_STUDENT', `${label}: matrícula não foi ativada`);
  return result;
}

async function downstreamCounts(alunoId: string) {
  const tables = await prisma.$queryRaw<Array<{ tableName: string }>>`
    SELECT DISTINCT table_name AS "tableName"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'alunoId'
      AND table_name ~* '(contract|payment|billing|charge|agenda|booking|schedule|plan)'
      AND table_name !~* '(event|audit|template|catalog|option|lifecycle|invite|onboarding|review)'
    ORDER BY table_name
  `;
  const counts: Record<string, number> = {};
  for (const { tableName } of tables) {
    const escaped = tableName.replace(/"/g, '""');
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "${escaped}" WHERE "alunoId" = $1`,
      alunoId
    );
    counts[tableName] = Number(rows[0]?.count ?? 0n);
  }
  return counts;
}

async function scenarioBasic(actor: PreRegistrationEnrollmentActor) {
  const fixture = await claimAndCompleteBasic({
    actor,
    label: 'basic',
    name: 'Aluno Básico Issue 275',
    phone: '15910000001',
    email: `issue-275-basic-${suffix}@example.test`,
    cpf: '52998224725',
  });
  const before = await prisma.aluno.findUniqueOrThrow({
    where: { id: fixture.alunoId },
    include: { onboarding: true },
  });
  assert(before.onboarding?.healthModuleStatus === 'NOT_STARTED', 'Anamnese não permaneceu opcional');
  assert(before.onboarding?.parqModuleStatus === 'NOT_STARTED', 'PAR-Q não permaneceu opcional');
  await reviewAndConvert(actor, fixture.alunoId, 'basic');
  const active = await prisma.aluno.findUniqueOrThrow({ where: { id: fixture.alunoId } });
  assert(active.id === fixture.alunoId && active.status === 'ACTIVE_STUDENT', 'ID/status básico incorreto');
  const counts = await downstreamCounts(fixture.alunoId);
  assert(Object.values(counts).every((count) => count === 0), `Criação downstream inesperada: ${JSON.stringify(counts)}`);
  return { alunoId: fixture.alunoId, downstreamCounts: counts };
}

async function scenarioCompleteNoAlert(actor: PreRegistrationEnrollmentActor) {
  const fixture = await claimAndCompleteBasic({
    actor,
    label: 'complete-no-alert',
    name: 'Aluno Completo Sem Alerta',
    phone: '15910000002',
    email: `issue-275-no-alert-${suffix}@example.test`,
    cpf: '11144477735',
  });
  const intake = await completeHealthIntake(fixture.student.id, fixture.alunoId);
  const parq = await completeParq(
    fixture.student.id,
    fixture.alunoId,
    negativeParq,
    `issue-275-no-alert-${suffix}`
  );
  assert(parq.status === 'COMPLETED_NO_ALERT', 'PAR-Q negativo gerou alerta');
  const submissionId = parq.latestSubmission?.id;
  await reviewAndConvert(actor, fixture.alunoId, 'complete-no-alert');
  const [intakeAfter, submissionAfter] = await Promise.all([
    prisma.studentHealthIntake.findUnique({ where: { alunoId: fixture.alunoId } }),
    submissionId
      ? prisma.studentParqSubmission.findUnique({ where: { id: submissionId } })
      : Promise.resolve(null),
  ]);
  assert(intakeAfter?.id === intake.id && intakeAfter.status === 'COMPLETED', 'Histórico da Anamnese foi perdido');
  assert(submissionAfter?.id === submissionId, 'Histórico do PAR-Q foi perdido');
  return { alunoId: fixture.alunoId, healthIntakeId: intake.id, parqSubmissionId: submissionId };
}

async function scenarioPositiveParq(actor: PreRegistrationEnrollmentActor) {
  const fixture = await claimAndCompleteBasic({
    actor,
    label: 'positive-parq',
    name: 'Aluno PAR-Q Positivo',
    phone: '15910000003',
    email: `issue-275-positive-${suffix}@example.test`,
    cpf: '12345678909',
  });
  const parq = await completeParq(
    fixture.student.id,
    fixture.alunoId,
    positiveParq,
    `issue-275-positive-${suffix}`
  );
  assert(parq.status === 'COMPLETED_REVIEW_REQUIRED', 'PAR-Q positivo não abriu análise');
  assert(parq.latestSubmission?.positiveCount === 2, 'positiveCount canônico incorreto');
  await reviewAndConvert(actor, fixture.alunoId, 'positive-parq');
  const [active, pending] = await Promise.all([
    prisma.aluno.findUniqueOrThrow({ where: { id: fixture.alunoId } }),
    prisma.studentParqProfessionalReview.count({
      where: { alunoId: fixture.alunoId, status: 'PENDING' },
    }),
  ]);
  assert(active.status === 'ACTIVE_STUDENT', 'PAR-Q positivo bloqueou matrícula comercial');
  assert(active.parqRequiresProfessionalReview && pending === 1, 'Alerta PAR-Q não permaneceu após matrícula');
  return { alunoId: fixture.alunoId, positiveCount: 2, pendingReviews: pending };
}

async function scenarioResume(actor: PreRegistrationEnrollmentActor) {
  const alunoId = await createLead(actor, 'resume', {
    name: 'Aluno Retomada',
    phone: '15910000004',
    email: `issue-275-resume-${suffix}@example.test`,
  });
  const invitation = await preRegistrationInviteAdminService.generateFirstInvite(
    alunoId,
    actor.contractId,
    actor
  );
  const student = await createStudentUser('resume', 'Aluno Retomada', `issue-275-resume-${suffix}@example.test`);
  await preRegistrationPublicService.claim(student.id, { token: invitation.token, role: 'STUDENT' });
  const initial = await preRegistrationPublicService.getSession(student.id, alunoId);
  const saved = await preRegistrationPublicService.saveStep(student.id, alunoId, {
    expectedVersion: initial.version,
    step: 'IDENTIFICATION',
    data: { name: 'Aluno Retomada', birthDate: '1992-03-10', cpf: '39053344705' },
  });
  const resumed = await preRegistrationPublicService.getSession(student.id, alunoId);
  assert(resumed.version === saved.version, 'Retomada não preservou versão');
  assert(resumed.identity.cpf === '39053344705', 'Retomada não preservou dados');
  assert(resumed.currentStep === 'CONTACT', 'Retomada não abriu a última etapa persistida');
  return { alunoId, version: resumed.version, currentStep: resumed.currentStep };
}

async function scenarioInviteRegeneration(actor: PreRegistrationEnrollmentActor) {
  const email = `issue-275-regeneration-${suffix}@example.test`;
  const alunoId = await createLead(actor, 'regeneration', {
    name: 'Aluno Regeneração',
    phone: '15910000005',
    email,
  });
  const student = await createStudentUser('regeneration', 'Aluno Regeneração', email);
  const first = await preRegistrationInviteAdminService.generateFirstInvite(alunoId, actor.contractId, actor);
  const second = await preRegistrationInviteAdminService.regenerateInvite(alunoId, actor.contractId, actor);
  assert(first.token !== second.token, 'Regeneração reutilizou token');
  await expectCode(
    () => preRegistrationPublicService.claim(student.id, { token: first.token, role: 'STUDENT' }),
    'INVALID_INVITE'
  );
  const claimed = await preRegistrationPublicService.claim(student.id, {
    token: second.token,
    role: 'STUDENT',
  });
  assert(claimed.alunoId === alunoId, 'Novo convite não reivindicou o registro correto');
  const summary = await preRegistrationInviteAdminService.getSummary(alunoId, actor.contractId, actor);
  const serialized = JSON.stringify(summary);
  assert(!serialized.includes(second.token), 'Token bruto foi recuperado pela consulta administrativa');
  return { alunoId, oldInvalid: true, newValid: true, rawTokenRecoverable: false };
}

async function scenarioDuplicates(actor: PreRegistrationEnrollmentActor) {
  const canonicalId = await createLead(actor, 'duplicate-canonical', {
    name: 'Pessoa Canônica Duplicidade',
    phone: '15910000006',
    email: `issue-275-canonical-${suffix}@example.test`,
  });
  await upsertStudentIdentity(
    canonicalId,
    actor.contractId,
    { name: 'Pessoa Canônica Duplicidade', cpf: '93541134780', phone: '15910000006' },
    { sourceType: 'professional', sourceReference: 'issue_275_duplicate_fixture' }
  );
  const exactCpf = await preRegistrationEnrollmentService.inspectProposedLead(actor, {
    name: 'Outra Pessoa',
    cpf: '93541134780',
  });
  assert(exactCpf.classification === 'BLOCKING', 'CPF idêntico não bloqueou ativação/criação');
  await expectCode(
    () => createLead(actor, 'duplicate-blocked', {
      name: 'Outra Pessoa',
      phone: '15910000007',
      email: `issue-275-blocked-${suffix}@example.test`,
      cpf: '93541134780',
    }),
    'BLOCKING_DUPLICATE'
  );

  const sharedPhone = await preRegistrationEnrollmentService.inspectProposedLead(actor, {
    name: 'Pessoa Distinta Telefone Compartilhado',
    phone: '(15) 91000-0006',
    email: `issue-275-shared-${suffix}@example.test`,
  });
  assert(sharedPhone.classification === 'REVIEW_REQUIRED', 'Telefone compartilhado não gerou revisão');
  const allowedId = await preRegistrationEnrollmentCreateService.create(actor, {
    name: 'Pessoa Distinta Telefone Compartilhado',
    phone: '(15) 91000-0006',
    email: `issue-275-shared-${suffix}@example.test`,
    origin: 'issue-275-shared-phone',
    responsibleProfessorId: actor.professorId,
    confirmedDuplicateFingerprint: sharedPhone.fingerprint,
    confirmedDuplicateReason: 'Telefone familiar compartilhado; identidades confirmadas como distintas.',
  });
  const allowed = await prisma.aluno.findUniqueOrThrow({ where: { id: allowedId } });
  assert(allowed.status === 'LEAD', 'Falso positivo permitido não preservou novo lead');
  return { canonicalId, blockedExactCpf: true, sharedPhoneAllowedId: allowedId };
}

async function scenarioConcurrency(actor: PreRegistrationEnrollmentActor) {
  const alunoId = await createLead(actor, 'concurrent-claim', {
    name: 'Pessoa Concorrente',
    phone: '15910000008',
  });
  const invitation = await preRegistrationInviteAdminService.generateFirstInvite(alunoId, actor.contractId, actor);
  const [firstUser, secondUser] = await Promise.all([
    createStudentUser('concurrent-a', 'Pessoa Concorrente'),
    createStudentUser('concurrent-b', 'Pessoa Concorrente'),
  ]);
  const claims = await Promise.allSettled([
    preRegistrationPublicService.claim(firstUser.id, { token: invitation.token, role: 'STUDENT' }),
    preRegistrationPublicService.claim(secondUser.id, { token: invitation.token, role: 'STUDENT' }),
  ]);
  assert(claims.filter((result) => result.status === 'fulfilled').length === 1, 'Claims concorrentes não produziram vencedor único');
  const linked = await prisma.aluno.findUniqueOrThrow({ where: { id: alunoId } });
  assert(linked.userId === firstUser.id || linked.userId === secondUser.id, 'Claim concorrente não vinculou conta única');

  const regenLeadId = await createLead(actor, 'concurrent-regenerate', {
    name: 'Regeneração Concorrente',
    phone: '15910000009',
  });
  await preRegistrationInviteAdminService.generateFirstInvite(regenLeadId, actor.contractId, actor);
  const regenerations = await Promise.allSettled([
    preRegistrationInviteAdminService.regenerateInvite(regenLeadId, actor.contractId, actor),
    preRegistrationInviteAdminService.regenerateInvite(regenLeadId, actor.contractId, actor),
  ]);
  assert(regenerations.some((result) => result.status === 'fulfilled'), 'Nenhuma regeneração concorrente foi concluída');
  const activeInviteCount = await prisma.preRegistrationInvite.count({
    where: { alunoId: regenLeadId, status: 'ACTIVE' },
  });
  assert(activeInviteCount === 1, 'Regeneração concorrente deixou mais de um convite ativo');

  const completeFixture = await claimAndCompleteBasic({
    actor,
    label: 'concurrent-finalize',
    name: 'Conclusão Concorrente',
    phone: '15910000010',
    email: `issue-275-concurrent-finalize-${suffix}@example.test`,
    cpf: '16899535009',
  });
  const parqSession = await preRegistrationParqService.getSession(
    completeFixture.student.id,
    completeFixture.alunoId
  );
  const parqInput = {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: parqSession.version,
    responses: negativeParq,
    consent: {
      accepted: true as const,
      privacyNoticeVersion: '2026-07',
      expectedVersion: parqSession.consent.version,
    },
    declarationAccepted: true as const,
    idempotencyKey: `issue-275-concurrent-parq-${suffix}`,
  };
  await Promise.allSettled([
    preRegistrationParqService.complete(completeFixture.student.id, completeFixture.alunoId, parqInput),
    preRegistrationParqService.complete(completeFixture.student.id, completeFixture.alunoId, parqInput),
  ]);
  const submissionCount = await prisma.studentParqSubmission.count({
    where: { alunoId: completeFixture.alunoId, idempotencyKey: parqInput.idempotencyKey },
  });
  assert(submissionCount === 1, 'Finalização concorrente do PAR-Q duplicou submissão');

  const review = await preRegistrationEnrollmentService.inspect(actor, completeFixture.alunoId);
  const ready = await preRegistrationEnrollmentService.markReady(actor, completeFixture.alunoId, {
    expectedVersion: review.recordVersion,
    fingerprint: review.fingerprint,
    reason: 'Revisão para matrícula concorrente',
  });
  const confirmations = await Promise.allSettled([
    preRegistrationEnrollmentService.confirmEnrollment(actor, completeFixture.alunoId, {
      expectedVersion: ready.recordVersion,
      fingerprint: ready.fingerprint,
      confirmationAccepted: true,
    }),
    preRegistrationEnrollmentService.confirmEnrollment(actor, completeFixture.alunoId, {
      expectedVersion: ready.recordVersion,
      fingerprint: ready.fingerprint,
      confirmationAccepted: true,
    }),
  ]);
  assert(confirmations.some((result) => result.status === 'fulfilled'), 'Confirmações concorrentes não ativaram matrícula');
  const final = await prisma.aluno.findUniqueOrThrow({ where: { id: completeFixture.alunoId } });
  assert(final.status === 'ACTIVE_STUDENT', 'Confirmação concorrente deixou estado incoerente');
  const activationRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "StudentLifecycleEvent"
    WHERE "alunoId" = ${completeFixture.alunoId}
      AND "eventType" = 'STATUS_CHANGED'
      AND "metadata"->>'to' = 'ACTIVE_STUDENT'
  `;
  const activationEvents = Number(activationRows[0]?.count ?? 0n);
  assert(activationEvents === 1, 'Confirmação concorrente não preservou evento único de ativação');
  return {
    claimWinnerCount: 1,
    activeInviteCount,
    parqSubmissionCount: submissionCount,
    finalStatus: final.status,
  };
}

async function cleanup() {
  for (const contractId of [...createdContractIds].reverse()) {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
  }
  for (const userId of [...createdUserIds].reverse()) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

async function main() {
  await mkdir(artifactDir, { recursive: true });
  const { actor } = await createTenant('principal');
  const results = {
    schemaVersion: 1,
    kind: 'issue-275-integrated-e2e',
    dataset: `synthetic-${suffix}`,
    scenarios: {
      basic: await scenarioBasic(actor),
      completeNoAlert: await scenarioCompleteNoAlert(actor),
      positiveParq: await scenarioPositiveParq(actor),
      resume: await scenarioResume(actor),
      inviteRegeneration: await scenarioInviteRegeneration(actor),
      duplicates: await scenarioDuplicates(actor),
      concurrency: await scenarioConcurrency(actor),
    },
  };
  const serialized = JSON.stringify(results, null, 2);
  for (const forbidden of [
    'tokenHash',
    'passwordHash',
    'privacyAcceptedIp',
    'responses',
    'positiveItems',
  ]) {
    assert(!serialized.includes(`"${forbidden}"`), `Evidência expôs campo sensível ${forbidden}`);
  }
  await writeFile(path.join(artifactDir, 'integrated-e2e.json'), `${serialized}\n`, 'utf8');
  console.log(serialized);
}

main()
  .then(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
    process.exit(1);
  });
