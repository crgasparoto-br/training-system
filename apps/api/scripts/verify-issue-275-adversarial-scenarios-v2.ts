import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import type {
  PreRegistrationIdentityFieldDecision,
  PreRegistrationIdentityDifferenceDTO,
} from '@corrida/types';
import { preRegistrationEnrollmentCreateService } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.js';
import {
  preRegistrationEnrollmentService,
  type PreRegistrationEnrollmentActor,
} from '../src/modules/pre-registration-enrollment/pre-registration-enrollment.service.js';
import { preRegistrationInviteAdminService } from '../src/modules/pre-registration-invites/pre-registration-invite-admin.service.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { preRegistrationAdminService } from '../src/modules/pre-registration-admin/pre-registration-admin.service.js';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
let contractId = '';
const userIds: string[] = [];

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

async function setup() {
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `275-adversarial-v2-${suffix}`,
      name: 'Academia Adversarial Issue 275',
    },
  });
  contractId = contract.id;
  const option = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Administrador Adversarial',
      code: `issue-275-adversarial-v2-${suffix}`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `admin-adversarial-${suffix}@example.test`,
      passwordHash: 'not-used',
      type: 'professor',
      profile: { create: { name: 'Administrador Adversarial' } },
    },
  });
  userIds.push(user.id);
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId,
      collaboratorFunctionId: option.id,
      role: 'master',
    },
  });
  return {
    userId: user.id,
    professorId: professor.id,
    contractId,
  } satisfies PreRegistrationEnrollmentActor;
}

async function createStudent(label: string, name: string, email: string) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'not-used',
      type: 'aluno',
      profile: { create: { name } },
    },
  });
  userIds.push(user.id);
  return user;
}

async function createLead(
  actor: PreRegistrationEnrollmentActor,
  label: string,
  input: {
    name: string;
    phone: string;
    email: string;
    confirmedDuplicateFingerprint?: string;
  }
) {
  return preRegistrationEnrollmentCreateService.create(actor, {
    ...input,
    origin: `issue-275-adversarial-v2-${label}`,
    responsibleProfessorId: actor.professorId,
    ...(input.confirmedDuplicateFingerprint
      ? {
          confirmedDuplicateReason: 'Contato compartilhado confirmado no cenário adversarial.',
        }
      : {}),
  });
}

function keepCanonical(
  differences: PreRegistrationIdentityDifferenceDTO[]
): Partial<Record<PreRegistrationIdentityDifferenceDTO['field'], PreRegistrationIdentityFieldDecision>> {
  return Object.fromEntries(differences.map(({ field }) => [field, 'KEEP_CANONICAL']));
}

async function candidateSource(
  actor: PreRegistrationEnrollmentActor,
  label: string,
  canonicalId: string,
  phone: string
) {
  const proposed = await preRegistrationEnrollmentService.inspectProposedLead(actor, {
    name: `Origem ${label}`,
    phone,
    email: `source-${label}-${suffix}@example.test`,
  });
  assert(proposed.classification === 'REVIEW_REQUIRED', `${label}: revisão não foi aberta`);
  const sourceId = await createLead(actor, label, {
    name: `Origem ${label}`,
    phone,
    email: `source-${label}-${suffix}@example.test`,
    confirmedDuplicateFingerprint: proposed.fingerprint,
  });
  const review = await preRegistrationEnrollmentService.inspect(actor, sourceId);
  const candidate = review.candidates.find((item) => item.candidateAlunoId === canonicalId);
  assert(candidate, `${label}: destino canônico não apareceu`);
  return { sourceId, review, candidate };
}

async function canonicalConsolidation(actor: PreRegistrationEnrollmentActor) {
  const phone = '15961000001';
  const canonicalId = await createLead(actor, 'canonical-target', {
    name: 'Pessoa Canônica Principal',
    phone,
    email: `canonical-${suffix}@example.test`,
  });
  await upsertStudentIdentity(
    canonicalId,
    actor.contractId,
    { name: 'Pessoa Canônica Principal', phone, email: `canonical-${suffix}@example.test` },
    { sourceType: 'professional', sourceReference: 'issue_275_canonical_target_v2' }
  );
  const { sourceId, review, candidate } = await candidateSource(
    actor,
    'canonical-source',
    canonicalId,
    phone
  );
  const invite = await preRegistrationInviteAdminService.generateFirstInvite(
    sourceId,
    actor.contractId,
    actor
  );
  const before = await prisma.aluno.findUniqueOrThrow({
    where: { id: sourceId },
    include: { onboarding: true },
  });
  const result = await preRegistrationEnrollmentService.decide(actor, sourceId, {
    action: 'USE_EXISTING_CANONICAL',
    candidateAlunoId: canonicalId,
    reason: 'Mesma pessoa confirmada pela equipe responsável.',
    expectedVersion: review.recordVersion,
    fingerprint: review.fingerprint,
    fieldDecisions: keepCanonical(candidate.differences),
  });
  assert('canonicalAlunoId' in result, 'Consolidação não retornou destino');
  const [source, inviteAfter, sourceEvents, targetEvents] = await Promise.all([
    prisma.aluno.findUniqueOrThrow({ where: { id: sourceId }, include: { onboarding: true } }),
    prisma.preRegistrationInvite.findUniqueOrThrow({ where: { id: invite.summary.id } }),
    prisma.studentLifecycleEvent.findMany({ where: { alunoId: sourceId } }),
    prisma.studentLifecycleEvent.findMany({ where: { alunoId: canonicalId } }),
  ]);
  assert(source.status === 'DISCARDED' && source.canonicalAlunoId === canonicalId, 'Origem não foi consolidada');
  assert(source.onboarding?.id === before.onboarding?.id, 'Onboarding histórico foi substituído');
  assert(inviteAfter.status === 'REVOKED', 'Convite da origem permaneceu ativo');
  assert(sourceEvents.some((event) => event.eventType === 'DISCARDED'), 'Descarte sem auditoria');
  assert(
    targetEvents.some((event) => JSON.stringify(event.metadata).includes('DEDUPLICATION_CONSOLIDATION')),
    'Destino sem auditoria de consolidação'
  );
  return { canonicalId, sourceId, sourceHistoryPreserved: true, inviteRevoked: true };
}

async function clinicalConsolidationBlocked(actor: PreRegistrationEnrollmentActor) {
  const phone = '15962000001';
  const canonicalId = await createLead(actor, 'clinical-target', {
    name: 'Canônico Clínico',
    phone,
    email: `clinical-target-${suffix}@example.test`,
  });
  const { sourceId, review, candidate } = await candidateSource(
    actor,
    'clinical-source',
    canonicalId,
    phone
  );
  await prisma.studentHealthIntake.create({
    data: { alunoId: sourceId, contractId: actor.contractId, status: 'IN_PROGRESS' },
  });
  await expectCode(
    () =>
      preRegistrationEnrollmentService.decide(actor, sourceId, {
        action: 'USE_EXISTING_CANONICAL',
        candidateAlunoId: canonicalId,
        reason: 'Tentativa controlada com dado clínico.',
        expectedVersion: review.recordVersion,
        fingerprint: review.fingerprint,
        fieldDecisions: keepCanonical(candidate.differences),
      }),
    'HEALTH_REASSOCIATION_REQUIRED'
  );
  const [source, intake] = await Promise.all([
    prisma.aluno.findUniqueOrThrow({ where: { id: sourceId } }),
    prisma.studentHealthIntake.findUniqueOrThrow({ where: { alunoId: sourceId } }),
  ]);
  assert(source.canonicalAlunoId === null && source.status !== 'DISCARDED', 'Bloqueio clínico alterou a origem');
  assert(intake.status === 'IN_PROGRESS', 'Bloqueio clínico alterou a Anamnese');
  return { canonicalId, sourceId, blockedWithoutMutation: true };
}

async function basicFixture(
  actor: PreRegistrationEnrollmentActor,
  label: string,
  phone: string,
  cpf: string
) {
  const email = `${label}-${suffix}@example.test`;
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
  const student = await createStudent(label, `Aluno ${label}`, email);
  await preRegistrationPublicService.claim(student.id, { token: invite.token, role: 'STUDENT' });
  let session = await preRegistrationPublicService.getSession(student.id, alunoId);
  for (const step of [
    {
      step: 'IDENTIFICATION' as const,
      data: { name: `Aluno ${label}`, birthDate: '1990-05-10', cpf },
    },
    { step: 'CONTACT' as const, data: { phone, email } },
    { step: 'ADDRESS' as const, data: {} },
  ]) {
    session = await preRegistrationPublicService.saveStep(student.id, alunoId, {
      expectedVersion: session.version,
      ...step,
    });
  }
  return { alunoId, student, session };
}

async function concurrentBasicCompletion(actor: PreRegistrationEnrollmentActor) {
  const fixture = await basicFixture(actor, 'conclusao-concorrente', '15963000001', '52998224725');
  const results = await Promise.allSettled([
    preRegistrationPublicService.complete(fixture.student.id, fixture.alunoId, {
      expectedVersion: fixture.session.version,
      privacyAccepted: true,
    }),
    preRegistrationPublicService.complete(fixture.student.id, fixture.alunoId, {
      expectedVersion: fixture.session.version,
      privacyAccepted: true,
    }),
  ]);
  const [aluno, onboarding, completionEvents, statusEvents] = await Promise.all([
    prisma.aluno.findUniqueOrThrow({ where: { id: fixture.alunoId } }),
    prisma.studentOnboardingProcess.findUniqueOrThrow({ where: { alunoId: fixture.alunoId } }),
    prisma.studentLifecycleEvent.count({
      where: { alunoId: fixture.alunoId, eventType: 'PRE_REGISTRATION_COMPLETED' },
    }),
    prisma.studentLifecycleEvent.count({
      where: {
        alunoId: fixture.alunoId,
        eventType: 'STATUS_CHANGED',
        metadata: { path: ['to'], equals: 'PRE_REGISTRATION_COMPLETED' },
      },
    }),
  ]);
  assert(results.some((result) => result.status === 'fulfilled'), 'Nenhuma conclusão foi aceita');
  assert(aluno.status === 'PRE_REGISTRATION_COMPLETED', 'Estado terminal incorreto');
  assert(completionEvents === 1 && statusEvents === 1, 'Retry concorrente duplicou eventos');
  assert(onboarding.version === fixture.session.version + 1, 'Retry concorrente incrementou a versão mais de uma vez');
  return {
    alunoId: fixture.alunoId,
    fulfilledResponses: results.filter((result) => result.status === 'fulfilled').length,
    terminalMutations: 1,
    completionEvents,
    statusEvents,
  };
}

async function administrativePublicRace(actor: PreRegistrationEnrollmentActor) {
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
  const student = await createStudent('race', 'Pessoa Corrida Administrativa', email);
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
  assert(operations.some((operation) => operation.status === 'fulfilled'), 'Nenhuma operação concorrente concluiu');
  const [profile, onboarding, events] = await Promise.all([
    prisma.studentProfile.findUniqueOrThrow({ where: { alunoId } }),
    prisma.studentOnboardingProcess.findUniqueOrThrow({ where: { alunoId } }),
    prisma.studentLifecycleEvent.findMany({ where: { alunoId } }),
  ]);
  const identity = profile.identificationData as {
    cpf?: string;
    _leadCommercial?: { notes?: string };
  };
  if (operations[0]?.status === 'fulfilled') {
    assert(identity.cpf === '39053344705', 'Identificação pública vencedora foi perdida');
  }
  if (operations[1]?.status === 'fulfilled') {
    assert(
      identity._leadCommercial?.notes === 'Atualização administrativa concorrente preservada',
      'Atualização administrativa vencedora foi perdida'
    );
  }
  assert(onboarding.version >= session.version, 'Versão regrediu');
  assert(events.some((event) => event.eventType === 'IDENTIFIER_NORMALIZED_CHANGED'), 'Corrida sem auditoria');
  return {
    alunoId,
    publicSucceeded: operations[0]?.status === 'fulfilled',
    adminSucceeded: operations[1]?.status === 'fulfilled',
    coherentIdentity: true,
    finalVersion: onboarding.version,
  };
}

async function cleanup() {
  if (contractId) {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
  }
  for (const userId of userIds.reverse()) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

async function main() {
  await mkdir(artifactDir, { recursive: true });
  const actor = await setup();
  const report = {
    schemaVersion: 2,
    kind: 'issue-275-adversarial-scenarios',
    scenarios: {
      canonicalConsolidation: await canonicalConsolidation(actor),
      clinicalConsolidationBlocked: await clinicalConsolidationBlocked(actor),
      concurrentBasicCompletion: await concurrentBasicCompletion(actor),
      administrativePublicRace: await administrativePublicRace(actor),
    },
  };
  const serialized = JSON.stringify(report, null, 2);
  for (const forbidden of ['passwordHash', 'tokenHash', 'responses', 'privacyAcceptedIp']) {
    assert(!serialized.includes(`"${forbidden}"`), `Evidência expôs ${forbidden}`);
  }
  await writeFile(path.join(artifactDir, 'adversarial-scenarios.json'), `${serialized}\n`, 'utf8');
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
