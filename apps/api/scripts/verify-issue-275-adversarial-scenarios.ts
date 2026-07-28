import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import type { PreRegistrationIdentityFieldDecision } from '@corrida/types';
import { preRegistrationEnrollmentCreateService } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.js';
import {
  PreRegistrationEnrollmentError,
  preRegistrationEnrollmentService,
  type PreRegistrationEnrollmentActor,
} from '../src/modules/pre-registration-enrollment/pre-registration-enrollment.service.js';
import { preRegistrationInviteAdminService } from '../src/modules/pre-registration-invites/pre-registration-invite-admin.service.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { preRegistrationAdminService } from '../src/modules/pre-registration-admin/pre-registration-admin.service.js';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const createdContractIds: string[] = [];
const createdUserIds: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectCode(action: () => Promise<unknown>, expected: string) {
  try {
    await action();
  } catch (error) {
    const code = (error as { code?: string })?.code;
    assert(code === expected, `Esperado ${expected}, recebido ${code || String(error)}`);
    return;
  }
  throw new Error(`Esperado ${expected}, mas a operação foi concluída`);
}

async function createTenant(): Promise<{
  actor: PreRegistrationEnrollmentActor;
  contractId: string;
  professorId: string;
}> {
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `275-adversarial-${suffix}`,
      name: 'Academia Adversarial Issue 275',
    },
  });
  createdContractIds.push(contract.id);
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: contract.id,
      name: 'Administrador Adversarial',
      code: `issue-275-adversarial-${suffix}`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `issue-275-adversarial-${suffix}@example.test`,
      passwordHash: 'not-used',
      type: 'professor',
      profile: { create: { name: 'Administrador Adversarial' } },
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
  return {
    actor: { userId: user.id, professorId: professor.id, contractId: contract.id },
    contractId: contract.id,
    professorId: professor.id,
  };
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
  input: { name: string; phone?: string; email?: string; confirmedFingerprint?: string }
) {
  return preRegistrationEnrollmentCreateService.create(actor, {
    name: input.name,
    phone: input.phone,
    email: input.email,
    origin: `issue-275-adversarial-${label}`,
    responsibleProfessorId: actor.professorId,
    ...(input.confirmedFingerprint
      ? {
          confirmedDuplicateFingerprint: input.confirmedFingerprint,
          confirmedDuplicateReason: 'Contato compartilhado confirmado para o cenário adversarial.',
        }
      : {}),
  });
}

async function claimAndFillBasic(
  actor: PreRegistrationEnrollmentActor,
  label: string,
  phone: string,
  cpf: string
) {
  const email = `issue-275-${label}-${suffix}@example.test`;
  const alunoId = await createLead(actor, label, {
    name: `Aluno ${label}`,
    phone,
    email,
  });
  const invite = await preRegistrationInviteAdminService.generateFirstInvite(
    alunoId,
    actor.contractId,
    actor
  );
  const student = await createStudentUser(label, `Aluno ${label}`, email);
  await preRegistrationPublicService.claim(student.id, {
    token: invite.token,
    role: 'STUDENT',
  });
  let session = await preRegistrationPublicService.getSession(student.id, alunoId);
  session = await preRegistrationPublicService.saveStep(student.id, alunoId, {
    expectedVersion: session.version,
    step: 'IDENTIFICATION',
    data: { name: `Aluno ${label}`, birthDate: '1990-05-10', cpf },
  });
  session = await preRegistrationPublicService.saveStep(student.id, alunoId, {
    expectedVersion: session.version,
    step: 'CONTACT',
    data: { phone, email },
  });
  session = await preRegistrationPublicService.saveStep(student.id, alunoId, {
    expectedVersion: session.version,
    step: 'ADDRESS',
    data: {},
  });
  return { alunoId, student, session };
}

function canonicalDecisions(
  differences: Array<{ field: string }>
): Record<string, PreRegistrationIdentityFieldDecision> {
  return Object.fromEntries(
    differences.map(({ field }) => [field, 'KEEP_CANONICAL' as const])
  );
}

async function scenarioCanonicalConsolidation(actor: PreRegistrationEnrollmentActor) {
  const sharedPhone = '15961000001';
  const canonicalId = await createLead(actor, 'canonical-target', {
    name: 'Pessoa Canônica Principal',
    phone: sharedPhone,
    email: `canonical-${suffix}@example.test`,
  });
  await upsertStudentIdentity(
    canonicalId,
    actor.contractId,
    {
      name: 'Pessoa Canônica Principal',
      phone: sharedPhone,
      email: `canonical-${suffix}@example.test`,
    },
    { sourceType: 'professional', sourceReference: 'issue_275_canonical_target' }
  );

  const proposed = await preRegistrationEnrollmentService.inspectProposedLead(actor, {
    name: 'Pessoa Duplicada Operacional',
    phone: sharedPhone,
    email: `duplicate-${suffix}@example.test`,
  });
  assert(proposed.classification === 'REVIEW_REQUIRED', 'Contato compartilhado não abriu revisão');
  const duplicateId = await createLead(actor, 'canonical-source', {
    name: 'Pessoa Duplicada Operacional',
    phone: sharedPhone,
    email: `duplicate-${suffix}@example.test`,
    confirmedFingerprint: proposed.fingerprint,
  });
  const invite = await preRegistrationInviteAdminService.generateFirstInvite(
    duplicateId,
    actor.contractId,
    actor
  );
  const before = await prisma.aluno.findUniqueOrThrow({
    where: { id: duplicateId },
    include: { onboarding: true },
  });
  const review = await preRegistrationEnrollmentService.inspect(actor, duplicateId);
  const candidate = review.candidates.find((item) => item.candidateAlunoId === canonicalId);
  assert(candidate, 'Cadastro canônico não apareceu como candidato');

  const result = await preRegistrationEnrollmentService.decide(actor, duplicateId, {
    action: 'USE_EXISTING_CANONICAL',
    candidateAlunoId: canonicalId,
    reason: 'Mesma pessoa confirmada pela equipe responsável.',
    expectedVersion: review.recordVersion,
    fingerprint: review.fingerprint,
    fieldDecisions: canonicalDecisions(candidate.differences),
  });
  assert('canonicalAlunoId' in result, 'Consolidação não retornou o destino canônico');
  assert(result.canonicalAlunoId === canonicalId, 'Consolidação alterou o destino escolhido');

  const [sourceAfter, targetAfter, inviteAfter, sourceEvents, targetEvents] = await Promise.all([
    prisma.aluno.findUniqueOrThrow({ where: { id: duplicateId }, include: { onboarding: true } }),
    prisma.aluno.findUniqueOrThrow({ where: { id: canonicalId } }),
    prisma.preRegistrationInvite.findUniqueOrThrow({ where: { id: invite.summary.id } }),
    prisma.studentLifecycleEvent.findMany({ where: { alunoId: duplicateId } }),
    prisma.studentLifecycleEvent.findMany({ where: { alunoId: canonicalId } }),
  ]);
  assert(sourceAfter.status === 'DISCARDED', 'Origem consolidada não foi descartada');
  assert(sourceAfter.canonicalAlunoId === canonicalId, 'Origem não aponta para o canônico');
  assert(sourceAfter.onboarding?.id === before.onboarding?.id, 'Onboarding histórico foi substituído');
  assert(targetAfter.id === canonicalId, 'Identificador do canônico mudou');
  assert(inviteAfter.status === 'REVOKED', 'Convite da origem permaneceu utilizável');
  assert(sourceEvents.some((event) => event.eventType === 'DISCARDED'), 'Descarte não foi auditado');
  assert(
    targetEvents.some(
      (event) =>
        event.eventType === 'ADMIN_REVIEWED' &&
        JSON.stringify(event.metadata).includes('DEDUPLICATION_CONSOLIDATION')
    ),
    'Destino não recebeu auditoria da consolidação'
  );
  return {
    canonicalId,
    duplicateId,
    redirectTo: result.redirectTo,
    sourceHistoryPreserved: true,
    inviteRevoked: true,
  };
}

async function scenarioClinicalConsolidationBlocked(actor: PreRegistrationEnrollmentActor) {
  const sharedPhone = '15962000001';
  const canonicalId = await createLead(actor, 'clinical-target', {
    name: 'Canônico Clínico',
    phone: sharedPhone,
    email: `clinical-target-${suffix}@example.test`,
  });
  const proposed = await preRegistrationEnrollmentService.inspectProposedLead(actor, {
    name: 'Origem Clínica',
    phone: sharedPhone,
    email: `clinical-source-${suffix}@example.test`,
  });
  const sourceId = await createLead(actor, 'clinical-source', {
    name: 'Origem Clínica',
    phone: sharedPhone,
    email: `clinical-source-${suffix}@example.test`,
    confirmedFingerprint: proposed.fingerprint,
  });
  await prisma.studentHealthIntake.create({
    data: {
      alunoId: sourceId,
      contractId: actor.contractId,
      status: 'IN_PROGRESS',
      currentStep: 'HEALTH_HISTORY',
    },
  });
  const review = await preRegistrationEnrollmentService.inspect(actor, sourceId);
  const candidate = review.candidates.find((item) => item.candidateAlunoId === canonicalId);
  assert(candidate, 'Destino clínico não apareceu como candidato');
  await expectCode(
    () =>
      preRegistrationEnrollmentService.decide(actor, sourceId, {
        action: 'USE_EXISTING_CANONICAL',
        candidateAlunoId: canonicalId,
        reason: 'Tentativa controlada de consolidação clínica.',
        expectedVersion: review.recordVersion,
        fingerprint: review.fingerprint,
        fieldDecisions: canonicalDecisions(candidate.differences),
      }),
    'HEALTH_REASSOCIATION_REQUIRED'
  );
  const [sourceAfter, intakeAfter] = await Promise.all([
    prisma.aluno.findUniqueOrThrow({ where: { id: sourceId } }),
    prisma.studentHealthIntake.findUniqueOrThrow({ where: { alunoId: sourceId } }),
  ]);
  assert(sourceAfter.canonicalAlunoId === null, 'Bloqueio clínico vinculou canônico parcialmente');
  assert(sourceAfter.status !== 'DISCARDED', 'Bloqueio clínico descartou a origem');
  assert(intakeAfter.status === 'IN_PROGRESS', 'Bloqueio clínico alterou a Anamnese');
  return { sourceId, canonicalId, blockedWithoutMutation: true };
}

async function scenarioConcurrentBasicCompletion(actor: PreRegistrationEnrollmentActor) {
  const fixture = await claimAndFillBasic(
    actor,
    'conclusao-concorrente',
    '15963000001',
    '52998224725'
  );
  const input = { expectedVersion: fixture.session.version, privacyAccepted: true as const };
  const attempts = await Promise.allSettled([
    preRegistrationPublicService.complete(fixture.student.id, fixture.alunoId, input),
    preRegistrationPublicService.complete(fixture.student.id, fixture.alunoId, input),
  ]);
  assert(
    attempts.filter((attempt) => attempt.status === 'fulfilled').length === 1,
    'Duas conclusões concorrentes foram aceitas'
  );
  const [aluno, eventCount] = await Promise.all([
    prisma.aluno.findUniqueOrThrow({ where: { id: fixture.alunoId } }),
    prisma.studentLifecycleEvent.count({
      where: { alunoId: fixture.alunoId, eventType: 'PRE_REGISTRATION_COMPLETED' },
    }),
  ]);
  assert(aluno.status === 'PRE_REGISTRATION_COMPLETED', 'Conclusão concorrente deixou estado inválido');
  assert(eventCount === 1, 'Conclusão concorrente duplicou auditoria');
  return { alunoId: fixture.alunoId, winnerCount: 1, completionEvents: eventCount };
}

async function scenarioAdministrativePublicRace(actor: PreRegistrationEnrollmentActor) {
  const email = `race-${suffix}@example.test`;
  const alunoId = await createLead(actor, 'admin-public-race', {
    name: 'Pessoa Corrida Administrativa',
    phone: '15964000001',
    email,
  });
  const invite = await preRegistrationInviteAdminService.generateFirstInvite(
    alunoId,
    actor.contractId,
    actor
  );
  const student = await createStudentUser('admin-public-race', 'Pessoa Corrida Administrativa', email);
  await preRegistrationPublicService.claim(student.id, { token: invite.token, role: 'STUDENT' });
  const session = await preRegistrationPublicService.getSession(student.id, alunoId);
  const operations = await Promise.allSettled([
    preRegistrationPublicService.saveStep(student.id, alunoId, {
      expectedVersion: session.version,
      step: 'IDENTIFICATION',
      data: {
        name: 'Pessoa Corrida Administrativa',
        birthDate: '1991-06-11',
        cpf: '39053344705',
      },
    }),
    preRegistrationAdminService.updateCommercial(actor, alunoId, {
      commercialNotes: 'Atualização administrativa concorrente preservada',
    }),
  ]);
  assert(
    operations.some((operation) => operation.status === 'fulfilled'),
    'Nenhuma operação concorrente foi concluída'
  );
  const [identity, onboarding, events] = await Promise.all([
    prisma.studentProfile.findUniqueOrThrow({ where: { alunoId } }),
    prisma.studentOnboardingProcess.findUniqueOrThrow({ where: { alunoId } }),
    prisma.studentLifecycleEvent.findMany({ where: { alunoId } }),
  ]);
  const data = identity.identificationData as {
    name?: string;
    birthDate?: string;
    cpf?: string;
    _leadCommercial?: { notes?: string };
  };
  const publicSucceeded = operations[0]?.status === 'fulfilled';
  const adminSucceeded = operations[1]?.status === 'fulfilled';
  if (publicSucceeded) {
    assert(data.cpf === '39053344705', 'Salvamento público vencedor perdeu a identificação');
  }
  if (adminSucceeded) {
    assert(
      data._leadCommercial?.notes === 'Atualização administrativa concorrente preservada',
      'Atualização administrativa vencedora foi perdida'
    );
  }
  assert(onboarding.version >= session.version, 'Versão do onboarding regrediu');
  assert(
    events.some((event) => event.eventType === 'IDENTIFIER_NORMALIZED_CHANGED'),
    'Corrida não produziu trilha de identidade'
  );
  return {
    alunoId,
    publicSucceeded,
    adminSucceeded,
    finalVersion: onboarding.version,
    coherentIdentity: true,
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
  const { actor } = await createTenant();
  const report = {
    schemaVersion: 1,
    kind: 'issue-275-adversarial-scenarios',
    scenarios: {
      canonicalConsolidation: await scenarioCanonicalConsolidation(actor),
      clinicalConsolidationBlocked: await scenarioClinicalConsolidationBlocked(actor),
      concurrentBasicCompletion: await scenarioConcurrentBasicCompletion(actor),
      administrativePublicRace: await scenarioAdministrativePublicRace(actor),
    },
  };
  const serialized = JSON.stringify(report, null, 2);
  for (const forbidden of ['passwordHash', 'tokenHash', 'responses', 'privacyAcceptedIp']) {
    assert(!serialized.includes(`"${forbidden}"`), `Evidência expôs ${forbidden}`);
  }
  await writeFile(
    path.join(artifactDir, 'adversarial-scenarios.json'),
    `${serialized}\n`,
    'utf8'
  );
  console.log(serialized);
}

main()
  .then(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    if (error instanceof PreRegistrationEnrollmentError) {
      console.error(error.code, error.message, error.details);
    } else {
      console.error(error);
    }
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
    process.exit(1);
  });
