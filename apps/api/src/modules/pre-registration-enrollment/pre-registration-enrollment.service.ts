import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  PreRegistrationConfirmEnrollmentInputDTO,
  PreRegistrationConsolidationResultDTO,
  PreRegistrationDuplicateCandidateDTO,
  PreRegistrationDuplicateClassification,
  PreRegistrationDuplicateDecisionDTO,
  PreRegistrationDuplicateDecisionInputDTO,
  PreRegistrationDuplicateSignalDTO,
  PreRegistrationEnrollmentResultDTO,
  PreRegistrationEnrollmentReviewDTO,
  PreRegistrationIdentityDifferenceDTO,
  PreRegistrationReadyForEnrollmentInputDTO,
  StudentLifecycleStatus,
} from '@corrida/types';
import {
  discardStudentLeadInTransaction,
  StudentLifecycleError,
} from '../alunos/student-lifecycle.service.js';
import {
  activateStudentEnrollmentInTransaction,
  markStudentReadyForEnrollmentInTransaction,
} from '../alunos/student-lifecycle-enrollment.service.js';
import {
  loadStudentIdentity,
  normalizeStudentCpf,
  normalizeStudentEmail,
  normalizeStudentPhone,
  upsertStudentIdentity,
  type StudentIdentityData,
} from '../alunos/student-identity.service.js';
import { hashInviteToken } from '../pre-registration-invites/pre-registration-invite-token.js';

const prisma = new PrismaClient();
const DECISION_VALIDITY_DAYS = 30;
const MAX_CANDIDATES = 25;

export type PreRegistrationEnrollmentActor = {
  userId?: string;
  professorId: string;
  contractId: string;
};

export class PreRegistrationEnrollmentError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'INVALID_INPUT'
      | 'DUPLICATE_REVIEW_REQUIRED'
      | 'BLOCKING_DUPLICATE'
      | 'REVIEW_STALE'
      | 'HEALTH_REASSOCIATION_REQUIRED'
      | 'PRECONDITION_FAILED'
      | 'CONCURRENT_MODIFICATION'
      | 'ACTIVE_STUDENT',
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PreRegistrationEnrollmentError';
  }
}

type DbClient = PrismaClient | Prisma.TransactionClient;
type DetectionOverrides = Partial<StudentIdentityData> & { userId?: string };

type DetectionCandidate = PreRegistrationDuplicateCandidateDTO & {
  rawIdentity: Record<string, unknown>;
  rawUserId: string | null;
};

type DetectionResult = {
  alunoId?: string;
  recordVersion: number;
  fingerprint: string;
  classification: PreRegistrationDuplicateClassification;
  candidates: DetectionCandidate[];
};

type EventMetadata = Record<string, unknown>;

const CLASSIFICATION_WEIGHT: Record<PreRegistrationDuplicateClassification, number> = {
  NONE: 0,
  INFORMATIONAL: 1,
  REVIEW_REQUIRED: 2,
  BLOCKING: 3,
};

const FIELD_LABELS: Record<PreRegistrationIdentityDifferenceDTO['field'], string> = {
  name: 'Nome',
  cpf: 'CPF',
  birthDate: 'Data de nascimento',
  phone: 'Telefone principal',
  additionalPhone: 'Telefone adicional',
  email: 'E-mail principal',
  additionalEmail: 'E-mail adicional',
  guardianName: 'Nome do responsável',
  guardianCpf: 'CPF do responsável',
  guardianPhone: 'Telefone do responsável',
  guardianEmail: 'E-mail do responsável',
};

const SENSITIVE_FIELDS = new Set<PreRegistrationIdentityDifferenceDTO['field']>([
  'cpf',
  'birthDate',
  'phone',
  'email',
  'guardianName',
  'guardianCpf',
  'guardianPhone',
  'guardianEmail',
]);

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function throwEnrollmentLifecycleError(error: unknown): never {
  if (error instanceof StudentLifecycleError) {
    const code = error.code === 'NOT_FOUND'
      ? 'NOT_FOUND'
      : error.code === 'CONCURRENT_MODIFICATION'
        ? 'CONCURRENT_MODIFICATION'
        : 'PRECONDITION_FAILED';
    throw new PreRegistrationEnrollmentError(error.message, code, error.details);
  }
  throw error;
}

function clean(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function metadataOf(value: Prisma.JsonValue | null): EventMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as EventMetadata;
}

function normalizedName(value: unknown): string | undefined {
  const text = clean(value);
  if (!text) return undefined;
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function civilDate(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = clean(value);
  if (!text) return undefined;
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function valuesOf(identity: Record<string, unknown>, keys: string[]): string[] {
  return keys.map((key) => clean(identity[key])).filter((value): value is string => Boolean(value));
}

function normalizedEmails(identity: Record<string, unknown>): string[] {
  return [...new Set(valuesOf(identity, ['email', 'additionalEmail'])
    .map(normalizeStudentEmail)
    .filter((value): value is string => Boolean(value)))];
}

function normalizedPhones(identity: Record<string, unknown>): string[] {
  return [...new Set(valuesOf(identity, ['phone', 'additionalPhone'])
    .map(normalizeStudentPhone)
    .filter((value): value is string => Boolean(value)))];
}

function maskName(value: unknown): string {
  const text = clean(value) || 'Pessoa sem nome';
  const parts = text.split(/\s+/);
  return parts.map((part) => `${part.slice(0, 1)}${'•'.repeat(Math.max(2, part.length - 1))}`).join(' ');
}

function maskValue(field: PreRegistrationIdentityDifferenceDTO['field'], value: unknown): string | undefined {
  const text = clean(value);
  if (!text) return undefined;
  if (field === 'cpf' || field === 'guardianCpf') {
    const digits = text.replace(/\D/g, '');
    return digits.length >= 2 ? `•••.•••.•••-${digits.slice(-2)}` : '•••.•••.•••-••';
  }
  if (field === 'phone' || field === 'additionalPhone' || field === 'guardianPhone') {
    const digits = text.replace(/\D/g, '');
    return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••';
  }
  if (field === 'email' || field === 'additionalEmail' || field === 'guardianEmail') {
    const [local, domain] = text.split('@');
    return domain ? `${local?.slice(0, 1) || '•'}•••@${domain}` : '••••';
  }
  if (field === 'birthDate') {
    const date = civilDate(text);
    return date ? `••/••/${date.slice(0, 4)}` : '••/••/••••';
  }
  return maskName(text);
}

export function areNamesSimilar(left: unknown, right: unknown): boolean {
  const a = normalizedName(left);
  const b = normalizedName(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const leftTokens = new Set(a.split(' ').filter((token) => token.length > 1));
  const rightTokens = new Set(b.split(' ').filter((token) => token.length > 1));
  if (!leftTokens.size || !rightTokens.size) return false;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size) >= 0.75;
}

export function classifyDuplicateSignals(
  signals: readonly Pick<PreRegistrationDuplicateSignalDTO, 'classification'>[]
): PreRegistrationDuplicateClassification {
  return signals.reduce<PreRegistrationDuplicateClassification>(
    (current, signal) =>
      CLASSIFICATION_WEIGHT[signal.classification] > CLASSIFICATION_WEIGHT[current]
        ? signal.classification
        : current,
    'NONE'
  );
}

function identityFromRow(row: {
  leadName: string | null;
  leadCpf: string | null;
  leadPhone: string | null;
  leadAdditionalPhone: string | null;
  leadEmail: string | null;
  leadAdditionalEmail: string | null;
  birthDate: Date | null;
  studentProfile: { identificationData: Prisma.JsonValue } | null;
}): Record<string, unknown> {
  const profile = row.studentProfile?.identificationData;
  const identity = profile && typeof profile === 'object' && !Array.isArray(profile)
    ? { ...(profile as Record<string, unknown>) }
    : {};
  return {
    name: identity.name ?? row.leadName,
    cpf: identity.cpf ?? row.leadCpf,
    phone: identity.phone ?? row.leadPhone,
    additionalPhone: identity.additionalPhone ?? row.leadAdditionalPhone,
    email: identity.email ?? row.leadEmail,
    additionalEmail: identity.additionalEmail ?? row.leadAdditionalEmail,
    birthDate: identity.birthDate ?? row.birthDate,
    guardianName: identity.guardianName,
    guardianCpf: identity.guardianCpf,
    guardianPhone: identity.guardianPhone,
    guardianEmail: identity.guardianEmail,
  };
}

function sourceIdentityWithOverrides(
  base: Record<string, unknown>,
  overrides: DetectionOverrides
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (key !== 'userId' && value !== undefined) result[key] = value;
  }
  return result;
}

function buildSignals(
  source: Record<string, unknown>,
  sourceUserId: string | undefined,
  candidate: Record<string, unknown>,
  candidateUserId: string | null
): PreRegistrationDuplicateSignalDTO[] {
  const signals: PreRegistrationDuplicateSignalDTO[] = [];
  const sourceCpf = normalizeStudentCpf(clean(source.cpf));
  const candidateCpf = normalizeStudentCpf(clean(candidate.cpf));
  if (sourceCpf && candidateCpf && sourceCpf === candidateCpf) {
    signals.push({ code: 'CPF_EXACT', classification: 'BLOCKING', label: 'Mesmo CPF normalizado' });
  }

  if (sourceUserId && candidateUserId === sourceUserId) {
    signals.push({
      code: 'ACCOUNT_ALREADY_LINKED',
      classification: 'BLOCKING',
      label: 'Conta já vinculada a outro cadastro neste contrato',
    });
  } else if (
    sourceUserId &&
    candidateUserId &&
    sourceUserId !== candidateUserId &&
    signals.some((signal) => signal.code === 'CPF_EXACT')
  ) {
    signals.push({
      code: 'ACCOUNT_INCOMPATIBLE',
      classification: 'BLOCKING',
      label: 'Identidade forte vinculada a contas incompatíveis',
    });
  }

  const sourceEmails = normalizedEmails(source);
  const candidateEmails = normalizedEmails(candidate);
  if (sourceEmails.some((email) => candidateEmails.includes(email))) {
    signals.push({ code: 'EMAIL_EXACT', classification: 'REVIEW_REQUIRED', label: 'Mesmo e-mail normalizado' });
  }

  const sourcePhones = normalizedPhones(source);
  const candidatePhones = normalizedPhones(candidate);
  if (sourcePhones.some((phone) => candidatePhones.includes(phone))) {
    signals.push({ code: 'PHONE_EXACT', classification: 'REVIEW_REQUIRED', label: 'Mesmo telefone normalizado' });
  }

  const sourceName = normalizedName(source.name);
  const candidateName = normalizedName(candidate.name);
  const sourceBirth = civilDate(source.birthDate);
  const candidateBirth = civilDate(candidate.birthDate);
  if (sourceName && candidateName && sourceName === candidateName && sourceBirth && sourceBirth === candidateBirth) {
    signals.push({
      code: 'NAME_AND_BIRTH_DATE',
      classification: 'REVIEW_REQUIRED',
      label: 'Mesmo nome e data civil de nascimento',
    });
  } else if (areNamesSimilar(source.name, candidate.name)) {
    signals.push({ code: 'NAME_SIMILAR', classification: 'INFORMATIONAL', label: 'Nome semelhante' });
  }

  return signals;
}

function buildDifferences(
  source: Record<string, unknown>,
  candidate: Record<string, unknown>
): PreRegistrationIdentityDifferenceDTO[] {
  const fields = Object.keys(FIELD_LABELS) as PreRegistrationIdentityDifferenceDTO['field'][];
  return fields.flatMap((field) => {
    const sourceValue = clean(source[field]);
    const canonicalValue = clean(candidate[field]);
    if (!sourceValue && !canonicalValue) return [];
    const comparableSource = field === 'cpf' || field === 'guardianCpf'
      ? normalizeStudentCpf(sourceValue)
      : field.includes('Phone') || field === 'phone' || field === 'additionalPhone'
        ? normalizeStudentPhone(sourceValue)
        : field.includes('Email') || field === 'email' || field === 'additionalEmail'
          ? normalizeStudentEmail(sourceValue)
          : field === 'birthDate'
            ? civilDate(sourceValue)
            : normalizedName(sourceValue);
    const comparableCanonical = field === 'cpf' || field === 'guardianCpf'
      ? normalizeStudentCpf(canonicalValue)
      : field.includes('Phone') || field === 'phone' || field === 'additionalPhone'
        ? normalizeStudentPhone(canonicalValue)
        : field.includes('Email') || field === 'email' || field === 'additionalEmail'
          ? normalizeStudentEmail(canonicalValue)
          : field === 'birthDate'
            ? civilDate(canonicalValue)
            : normalizedName(canonicalValue);
    if (comparableSource && comparableCanonical && comparableSource === comparableCanonical) return [];
    return [{
      field,
      label: FIELD_LABELS[field],
      sourceValueMasked: maskValue(field, sourceValue),
      canonicalValueMasked: maskValue(field, canonicalValue),
      sourceEmpty: !sourceValue,
      canonicalEmpty: !canonicalValue,
      sensitive: SENSITIVE_FIELDS.has(field),
    }];
  });
}

function fingerprintFor(
  source: Record<string, unknown>,
  sourceUserId: string | undefined,
  candidates: DetectionCandidate[]
): string {
  return createHash('sha256')
    .update(JSON.stringify({
      source: {
        name: normalizedName(source.name),
        cpf: normalizeStudentCpf(clean(source.cpf)),
        birthDate: civilDate(source.birthDate),
        phones: normalizedPhones(source).sort(),
        emails: normalizedEmails(source).sort(),
        userId: sourceUserId,
      },
      candidates: candidates
        .map((candidate) => ({
          id: candidate.candidateAlunoId,
          updatedAt: candidate.updatedAt,
          classification: candidate.classification,
          signals: candidate.signals.map((signal) => signal.code).sort(),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    }))
    .digest('hex');
}

export async function detectPreRegistrationDuplicates(
  client: DbClient,
  input: {
    contractId: string;
    alunoId?: string;
    overrides?: DetectionOverrides;
  }
): Promise<DetectionResult> {
  const source = input.alunoId
    ? await client.aluno.findFirst({
        where: { id: input.alunoId, contractId: input.contractId },
        include: {
          onboarding: true,
          studentProfile: { select: { identificationData: true } },
        },
      })
    : null;
  if (input.alunoId && !source) {
    throw new PreRegistrationEnrollmentError('Pré-matrícula não encontrada.', 'NOT_FOUND');
  }

  const sourceIdentity = sourceIdentityWithOverrides(
    source ? identityFromRow(source) : {},
    input.overrides ?? {}
  );
  const sourceUserId = input.overrides?.userId ?? source?.userId ?? undefined;

  const candidates = await client.aluno.findMany({
    where: {
      contractId: input.contractId,
      ...(input.alunoId ? { id: { not: input.alunoId } } : {}),
    },
    include: {
      studentProfile: { select: { identificationData: true } },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });

  const matched: DetectionCandidate[] = [];
  for (const candidate of candidates) {
    const candidateIdentity = identityFromRow(candidate);
    const signals = buildSignals(sourceIdentity, sourceUserId, candidateIdentity, candidate.userId);
    const classification = classifyDuplicateSignals(signals);
    if (classification === 'NONE') continue;
    matched.push({
      candidateAlunoId: candidate.id,
      maskedName: maskName(candidateIdentity.name),
      status: candidate.status as StudentLifecycleStatus,
      classification: classification as Exclude<PreRegistrationDuplicateClassification, 'NONE'>,
      signals,
      differences: buildDifferences(sourceIdentity, candidateIdentity),
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
      rawIdentity: candidateIdentity,
      rawUserId: candidate.userId,
    });
  }

  matched.sort((left, right) =>
    CLASSIFICATION_WEIGHT[right.classification] - CLASSIFICATION_WEIGHT[left.classification] ||
    right.updatedAt.localeCompare(left.updatedAt)
  );
  const limited = matched.slice(0, MAX_CANDIDATES);
  return {
    alunoId: source?.id,
    recordVersion: source?.onboarding?.version ?? 0,
    fingerprint: fingerprintFor(sourceIdentity, sourceUserId, limited),
    classification: limited.reduce<PreRegistrationDuplicateClassification>(
      (current, candidate) =>
        CLASSIFICATION_WEIGHT[candidate.classification] > CLASSIFICATION_WEIGHT[current]
          ? candidate.classification
          : current,
      'NONE'
    ),
    candidates: limited,
  };
}

async function assertActor(actor: PreRegistrationEnrollmentActor, client: DbClient): Promise<void> {
  const professor = await client.professor.findFirst({
    where: { id: actor.professorId, contractId: actor.contractId },
    select: { id: true },
  });
  if (!professor) throw new PreRegistrationEnrollmentError('Recurso não encontrado.', 'NOT_FOUND');
}

function decisionFromEvent(event: {
  createdAt: Date;
  actorProfessorId: string | null;
  metadata: Prisma.JsonValue | null;
}): PreRegistrationDuplicateDecisionDTO | undefined {
  const metadata = metadataOf(event.metadata);
  if (metadata.kind !== 'DEDUPLICATION_DECISION') return undefined;
  const action = metadata.action;
  if (action !== 'CONFIRM_DIFFERENT' && action !== 'USE_EXISTING_CANONICAL') return undefined;
  const fingerprint = clean(metadata.fingerprint);
  const reason = clean(metadata.reason);
  const validUntil = clean(metadata.validUntil);
  const reviewedRecordVersion = Number(metadata.reviewedRecordVersion);
  if (!fingerprint || !reason || !validUntil || !Number.isInteger(reviewedRecordVersion)) return undefined;
  return {
    action,
    candidateAlunoId: clean(metadata.candidateAlunoId),
    reason,
    fingerprint,
    reviewedRecordVersion,
    decidedAt: event.createdAt.toISOString(),
    validUntil,
    actorProfessorId: event.actorProfessorId ?? undefined,
  };
}

async function latestValidDecision(
  client: DbClient,
  alunoId: string,
  contractId: string,
  detection: DetectionResult
): Promise<PreRegistrationDuplicateDecisionDTO | undefined> {
  const events = await client.studentLifecycleEvent.findMany({
    where: { alunoId, contractId, eventType: 'ADMIN_REVIEWED' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { createdAt: true, actorProfessorId: true, metadata: true },
  });
  const now = Date.now();
  return events
    .map(decisionFromEvent)
    .find((decision) =>
      Boolean(
        decision &&
        decision.fingerprint === detection.fingerprint &&
        decision.reviewedRecordVersion === detection.recordVersion &&
        new Date(decision.validUntil).getTime() > now
      )
    );
}

function decisionResolvesReview(
  detection: DetectionResult,
  decision: PreRegistrationDuplicateDecisionDTO | undefined
): boolean {
  if (detection.classification === 'NONE' || detection.classification === 'INFORMATIONAL') return true;
  if (detection.classification === 'BLOCKING') return false;
  return decision?.action === 'CONFIRM_DIFFERENT';
}

function publicCandidates(detection: DetectionResult): PreRegistrationDuplicateCandidateDTO[] {
  return detection.candidates.map((candidate) => ({
    candidateAlunoId: candidate.candidateAlunoId,
    maskedName: candidate.maskedName,
    status: candidate.status,
    classification: candidate.classification,
    signals: candidate.signals,
    differences: candidate.differences,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  }));
}

export async function getEnrollmentReview(
  actor: PreRegistrationEnrollmentActor,
  alunoId: string,
  client: DbClient = prisma
): Promise<PreRegistrationEnrollmentReviewDTO> {
  await assertActor(actor, client);
  const aluno = await client.aluno.findFirst({
    where: { id: alunoId, contractId: actor.contractId },
    include: { onboarding: true },
  });
  if (!aluno || !aluno.onboarding) {
    throw new PreRegistrationEnrollmentError('Pré-matrícula não encontrada.', 'NOT_FOUND');
  }
  const detection = await detectPreRegistrationDuplicates(client, {
    contractId: actor.contractId,
    alunoId,
  });
  const decision = await latestValidDecision(client, alunoId, actor.contractId, detection);
  const resolved = decisionResolvesReview(detection, decision);
  return {
    alunoId,
    status: aluno.status as StudentLifecycleStatus,
    recordVersion: detection.recordVersion,
    fingerprint: detection.fingerprint,
    classification: detection.classification,
    candidates: publicCandidates(detection),
    currentDecision: decision,
    canConfirmDifferentPeople:
      detection.classification === 'REVIEW_REQUIRED' &&
      !detection.candidates.some((candidate) => candidate.classification === 'BLOCKING'),
    canUseExistingCanonical: detection.candidates.length > 0,
    canMarkReady: aluno.status === 'PRE_REGISTRATION_COMPLETED' && resolved,
    canConfirmEnrollment: aluno.status === 'READY_FOR_ENROLLMENT' && resolved,
    health: {
      healthModuleStatus: aluno.onboarding.healthModuleStatus,
      parqModuleStatus: aluno.onboarding.parqModuleStatus,
      parqRequiresProfessionalReview: aluno.parqRequiresProfessionalReview,
    },
    downstream: {
      contract: 'NOT_CONFIGURED',
      plan: 'NOT_CONFIGURED',
      billing: 'NOT_CONFIGURED',
      responsibleProfessor: 'NOT_CONFIGURED',
      schedule: 'NOT_CONFIGURED',
    },
  };
}

async function lockAluno(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Aluno"
    WHERE "id" = ${alunoId} AND "contractId" = ${contractId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new PreRegistrationEnrollmentError('Pré-matrícula não encontrada.', 'NOT_FOUND');
}

async function revokeActiveInvite(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string,
  actor: PreRegistrationEnrollmentActor,
  reason: string
): Promise<void> {
  const now = new Date();
  const active = await tx.preRegistrationInvite.findFirst({
    where: {
      alunoId,
      contractId,
      purpose: 'PRE_REGISTRATION',
      status: 'ACTIVE',
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (!active) return;
  const updated = await tx.preRegistrationInvite.updateMany({
    where: { id: active.id, alunoId, contractId, status: 'ACTIVE' },
    data: {
      status: 'REVOKED',
      revokedAt: now,
      revokedByProfessorId: actor.professorId,
      revocationReason: reason,
    },
  });
  if (updated.count !== 1) {
    throw new PreRegistrationEnrollmentError(
      'O convite foi alterado por outra operação. Recarregue antes de continuar.',
      'CONCURRENT_MODIFICATION'
    );
  }
}

async function assertNoClinicalDataForConsolidation(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string
): Promise<void> {
  const aluno = await tx.aluno.findFirst({
    where: { id: alunoId, contractId },
    select: {
      intakeForm: { select: { id: true } },
      studentHealthIntake: { select: { id: true } },
      parqDraft: { select: { id: true } },
      parqSubmissions: { select: { id: true }, take: 1 },
      parqProfessionalReviews: { select: { id: true }, take: 1 },
      parqLegacyRecords: { select: { id: true }, take: 1 },
      prontuarioRecords: { select: { id: true }, take: 1 },
    },
  });
  if (!aluno) throw new PreRegistrationEnrollmentError('Pré-matrícula não encontrada.', 'NOT_FOUND');
  const hasClinicalData = Boolean(
    aluno.intakeForm ||
    aluno.studentHealthIntake ||
    aluno.parqDraft ||
    aluno.parqSubmissions.length ||
    aluno.parqProfessionalReviews.length ||
    aluno.parqLegacyRecords.length ||
    aluno.prontuarioRecords.length
  );
  if (hasClinicalData) {
    throw new PreRegistrationEnrollmentError(
      'A consolidação exige reassociação clínica assistida. Nenhum dado foi alterado.',
      'HEALTH_REASSOCIATION_REQUIRED',
      { operationalPending: 'CLINICAL_REASSOCIATION_REQUIRED' }
    );
  }
}

async function consolidateDuplicate(
  actor: PreRegistrationEnrollmentActor,
  alunoId: string,
  input: PreRegistrationDuplicateDecisionInputDTO
): Promise<PreRegistrationConsolidationResultDTO> {
  const targetId = clean(input.candidateAlunoId);
  const reason = clean(input.reason);
  if (!targetId || !reason) {
    throw new PreRegistrationEnrollmentError(
      'Selecione o cadastro canônico e informe o motivo da decisão.',
      'INVALID_INPUT'
    );
  }
  if (targetId === alunoId) {
    throw new PreRegistrationEnrollmentError('O cadastro canônico deve ser diferente do duplicado.', 'INVALID_INPUT');
  }

  return prisma.$transaction(async (tx) => {
    await assertActor(actor, tx);
    for (const id of [alunoId, targetId].sort()) await lockAluno(tx, id, actor.contractId);
    const [source, target] = await Promise.all([
      tx.aluno.findFirst({ where: { id: alunoId, contractId: actor.contractId }, include: { onboarding: true } }),
      tx.aluno.findFirst({ where: { id: targetId, contractId: actor.contractId }, include: { onboarding: true } }),
    ]);
    if (!source || !source.onboarding || !target) {
      throw new PreRegistrationEnrollmentError('Cadastro não encontrado.', 'NOT_FOUND');
    }
    if (source.onboarding.version !== input.expectedVersion) {
      throw new PreRegistrationEnrollmentError(
        'Os dados foram alterados. Refaça a revisão antes de consolidar.',
        'REVIEW_STALE',
        { currentVersion: source.onboarding.version }
      );
    }
    const detection = await detectPreRegistrationDuplicates(tx, {
      contractId: actor.contractId,
      alunoId,
    });
    if (detection.fingerprint !== input.fingerprint) {
      throw new PreRegistrationEnrollmentError(
        'As evidências de duplicidade mudaram. Refaça a revisão.',
        'REVIEW_STALE',
        { currentFingerprint: detection.fingerprint }
      );
    }
    const candidate = detection.candidates.find((item) => item.candidateAlunoId === targetId);
    if (!candidate) {
      throw new PreRegistrationEnrollmentError('O cadastro escolhido não é mais um candidato válido.', 'REVIEW_STALE');
    }
    await assertNoClinicalDataForConsolidation(tx, alunoId, actor.contractId);

    const sourceIdentity = await loadStudentIdentity(alunoId, actor.contractId, tx);
    const patch: StudentIdentityData = {};
    for (const difference of candidate.differences) {
      const decision = input.fieldDecisions?.[difference.field];
      if (!decision) {
        throw new PreRegistrationEnrollmentError(
          `Defina a decisão para ${difference.label}.`,
          'INVALID_INPUT',
          { field: difference.field }
        );
      }
      if (decision === 'USE_SOURCE_IF_EMPTY') {
        if (!difference.canonicalEmpty) {
          throw new PreRegistrationEnrollmentError(
            `${difference.label} do cadastro canônico não está vazio e não pode ser sobrescrito automaticamente.`,
            'INVALID_INPUT',
            { field: difference.field }
          );
        }
        const sourceValue = sourceIdentity[difference.field as keyof StudentIdentityData];
        if (sourceValue !== undefined) {
          (patch as Record<string, unknown>)[difference.field] = sourceValue;
        }
      }
    }
    if (Object.keys(patch).length > 0) {
      await upsertStudentIdentity(targetId, actor.contractId, patch, {
        client: tx,
        actor: { userId: actor.userId, professorId: actor.professorId },
        sourceType: 'professional',
        sourceReference: `pre_registration_consolidation:${alunoId}`,
      });
    }

    if (source.userId && target.userId && source.userId !== target.userId) {
      throw new PreRegistrationEnrollmentError(
        'Os cadastros possuem contas diferentes. A consolidação automática foi bloqueada.',
        'BLOCKING_DUPLICATE'
      );
    }
    if (source.userId && !target.userId) {
      await tx.aluno.update({ where: { id: alunoId }, data: { userId: null } });
      await tx.aluno.update({ where: { id: targetId }, data: { userId: source.userId } });
    }

    await revokeActiveInvite(
      tx,
      alunoId,
      actor.contractId,
      actor,
      `Pré-matrícula consolidada no cadastro ${targetId}`
    );
    try {
      await discardStudentLeadInTransaction(
        tx,
        alunoId,
        actor.contractId,
        `DUPLICATE_OF:${targetId}`,
        actor.professorId
      );
    } catch (error) {
      throwEnrollmentLifecycleError(error);
    }

    const validUntil = new Date(Date.now() + DECISION_VALIDITY_DAYS * 86_400_000).toISOString();
    const commonMetadata = {
      kind: 'DEDUPLICATION_DECISION',
      action: 'USE_EXISTING_CANONICAL',
      candidateAlunoId: targetId,
      reason,
      fingerprint: detection.fingerprint,
      reviewedRecordVersion: detection.recordVersion,
      validUntil,
      fieldDecisions: input.fieldDecisions ?? {},
    };
    await tx.studentLifecycleEvent.createMany({
      data: [
        {
          alunoId,
          contractId: actor.contractId,
          eventType: 'ADMIN_REVIEWED',
          actorUserId: actor.userId,
          actorProfessorId: actor.professorId,
          metadata: asJson({ ...commonMetadata, role: 'DUPLICATE_SOURCE' }),
        },
        {
          alunoId: targetId,
          contractId: actor.contractId,
          eventType: 'ADMIN_REVIEWED',
          actorUserId: actor.userId,
          actorProfessorId: actor.professorId,
          metadata: asJson({ ...commonMetadata, role: 'CANONICAL_TARGET', duplicateAlunoId: alunoId }),
        },
      ],
    });
    return {
      canonicalAlunoId: targetId,
      duplicateAlunoId: alunoId,
      redirectTo:
        target.status === 'ACTIVE_STUDENT'
          ? `/central-do-aluno/${targetId}`
          : `/pre-matriculas/${targetId}`,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export const preRegistrationEnrollmentService = {
  async inspect(actor: PreRegistrationEnrollmentActor, alunoId: string) {
    return getEnrollmentReview(actor, alunoId);
  },

  async inspectByInviteToken(
    token: string,
    overrides: DetectionOverrides
  ): Promise<Pick<DetectionResult, 'classification' | 'fingerprint'>> {
    const tokenHash = hashInviteToken(token);
    const invite = await prisma.preRegistrationInvite.findFirst({
      where: { tokenHash, purpose: 'PRE_REGISTRATION', status: 'ACTIVE' },
      select: { alunoId: true, contractId: true, expiresAt: true },
    });
    if (!invite || invite.expiresAt <= new Date()) {
      return { classification: 'NONE', fingerprint: '' };
    }
    const result = await detectPreRegistrationDuplicates(prisma, {
      contractId: invite.contractId,
      alunoId: invite.alunoId,
      overrides,
    });
    return { classification: result.classification, fingerprint: result.fingerprint };
  },

  async inspectProposedLead(
    actor: PreRegistrationEnrollmentActor,
    overrides: DetectionOverrides
  ): Promise<DetectionResult> {
    await assertActor(actor, prisma);
    return detectPreRegistrationDuplicates(prisma, { contractId: actor.contractId, overrides });
  },

  async inspectProposedUpdate(
    actor: PreRegistrationEnrollmentActor,
    alunoId: string,
    overrides: DetectionOverrides
  ): Promise<DetectionResult> {
    await assertActor(actor, prisma);
    return detectPreRegistrationDuplicates(prisma, {
      contractId: actor.contractId,
      alunoId,
      overrides,
    });
  },

  async decide(
    actor: PreRegistrationEnrollmentActor,
    alunoId: string,
    input: PreRegistrationDuplicateDecisionInputDTO
  ): Promise<PreRegistrationEnrollmentReviewDTO | PreRegistrationConsolidationResultDTO> {
    if (input.action === 'CANCEL') return this.inspect(actor, alunoId);
    if (input.action === 'USE_EXISTING_CANONICAL') {
      return consolidateDuplicate(actor, alunoId, input);
    }
    const reason = clean(input.reason);
    if (!reason) {
      throw new PreRegistrationEnrollmentError('Informe o motivo da decisão.', 'INVALID_INPUT');
    }
    await prisma.$transaction(async (tx) => {
      await assertActor(actor, tx);
      await lockAluno(tx, alunoId, actor.contractId);
      const detection = await detectPreRegistrationDuplicates(tx, {
        contractId: actor.contractId,
        alunoId,
      });
      if (detection.recordVersion !== input.expectedVersion || detection.fingerprint !== input.fingerprint) {
        throw new PreRegistrationEnrollmentError(
          'Os dados ou as evidências mudaram. Refaça a revisão.',
          'REVIEW_STALE',
          { currentVersion: detection.recordVersion, currentFingerprint: detection.fingerprint }
        );
      }
      if (detection.classification === 'BLOCKING') {
        throw new PreRegistrationEnrollmentError(
          'Conflitos de CPF ou conta não podem ser confirmados como pessoas diferentes.',
          'BLOCKING_DUPLICATE'
        );
      }
      if (detection.classification !== 'REVIEW_REQUIRED') {
        throw new PreRegistrationEnrollmentError(
          'Não existe duplicidade que exija esta decisão.',
          'PRECONDITION_FAILED'
        );
      }
      const validUntil = new Date(Date.now() + DECISION_VALIDITY_DAYS * 86_400_000).toISOString();
      await tx.studentLifecycleEvent.create({
        data: {
          alunoId,
          contractId: actor.contractId,
          eventType: 'ADMIN_REVIEWED',
          actorUserId: actor.userId,
          actorProfessorId: actor.professorId,
          metadata: asJson({
            kind: 'DEDUPLICATION_DECISION',
            action: 'CONFIRM_DIFFERENT',
            candidateAlunoId: clean(input.candidateAlunoId),
            reason,
            fingerprint: detection.fingerprint,
            reviewedRecordVersion: detection.recordVersion,
            validUntil,
          }),
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return this.inspect(actor, alunoId);
  },

  async markReady(
    actor: PreRegistrationEnrollmentActor,
    alunoId: string,
    input: PreRegistrationReadyForEnrollmentInputDTO
  ): Promise<PreRegistrationEnrollmentReviewDTO> {
    const reason = clean(input.reason);
    if (!reason) throw new PreRegistrationEnrollmentError('Informe o motivo da revisão.', 'INVALID_INPUT');
    await prisma.$transaction(async (tx) => {
      await assertActor(actor, tx);
      await lockAluno(tx, alunoId, actor.contractId);
      const aluno = await tx.aluno.findFirst({
        where: { id: alunoId, contractId: actor.contractId },
        include: { onboarding: true },
      });
      if (!aluno || !aluno.onboarding) {
        throw new PreRegistrationEnrollmentError('Pré-matrícula não encontrada.', 'NOT_FOUND');
      }
      if (aluno.status !== 'PRE_REGISTRATION_COMPLETED') {
        throw new PreRegistrationEnrollmentError(
          'Somente pré-cadastros concluídos podem seguir para matrícula.',
          'PRECONDITION_FAILED'
        );
      }
      const detection = await detectPreRegistrationDuplicates(tx, {
        contractId: actor.contractId,
        alunoId,
      });
      if (detection.recordVersion !== input.expectedVersion || detection.fingerprint !== input.fingerprint) {
        throw new PreRegistrationEnrollmentError(
          'Os dados ou as evidências mudaram. Refaça a revisão.',
          'REVIEW_STALE',
          { currentVersion: detection.recordVersion, currentFingerprint: detection.fingerprint }
        );
      }
      const decision = await latestValidDecision(tx, alunoId, actor.contractId, detection);
      if (!decisionResolvesReview(detection, decision)) {
        throw new PreRegistrationEnrollmentError(
          'Existe duplicidade sem decisão administrativa vigente.',
          detection.classification === 'BLOCKING' ? 'BLOCKING_DUPLICATE' : 'DUPLICATE_REVIEW_REQUIRED'
        );
      }
      try {
        await markStudentReadyForEnrollmentInTransaction(
          tx,
          alunoId,
          actor.contractId,
          {
            actor: { userId: actor.userId, professorId: actor.professorId },
            metadata: {
              kind: 'ENROLLMENT_REVIEW',
              reason,
              fingerprint: detection.fingerprint,
              reviewedRecordVersion: detection.recordVersion,
              decisionAction: decision?.action ?? 'NO_DUPLICATE',
            },
          }
        );
      } catch (error) {
        throwEnrollmentLifecycleError(error);
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return this.inspect(actor, alunoId);
  },

  async confirmEnrollment(
    actor: PreRegistrationEnrollmentActor,
    alunoId: string,
    input: PreRegistrationConfirmEnrollmentInputDTO
  ): Promise<PreRegistrationEnrollmentResultDTO> {
    if (input.confirmationAccepted !== true) {
      throw new PreRegistrationEnrollmentError('Confirme a ativação da matrícula.', 'INVALID_INPUT');
    }
    return prisma.$transaction(async (tx) => {
      await assertActor(actor, tx);
      await lockAluno(tx, alunoId, actor.contractId);
      const aluno = await tx.aluno.findFirst({
        where: { id: alunoId, contractId: actor.contractId },
        include: { onboarding: true },
      });
      if (!aluno || !aluno.onboarding) {
        throw new PreRegistrationEnrollmentError('Pré-matrícula não encontrada.', 'NOT_FOUND');
      }
      if (aluno.status === 'ACTIVE_STUDENT') {
        return {
          alunoId,
          status: 'ACTIVE_STUDENT',
          redirectTo: `/central-do-aluno/${alunoId}`,
          idempotent: true,
        };
      }
      if (aluno.status !== 'READY_FOR_ENROLLMENT') {
        throw new PreRegistrationEnrollmentError(
          'A pré-matrícula ainda não está pronta para confirmação.',
          'PRECONDITION_FAILED'
        );
      }
      if (!aluno.userId) {
        throw new PreRegistrationEnrollmentError(
          'É necessário vincular uma conta válida antes da ativação.',
          'PRECONDITION_FAILED'
        );
      }
      const detection = await detectPreRegistrationDuplicates(tx, {
        contractId: actor.contractId,
        alunoId,
      });
      if (detection.recordVersion !== input.expectedVersion || detection.fingerprint !== input.fingerprint) {
        throw new PreRegistrationEnrollmentError(
          'Os dados ou as evidências mudaram. Refaça a revisão.',
          'REVIEW_STALE',
          { currentVersion: detection.recordVersion, currentFingerprint: detection.fingerprint }
        );
      }
      const decision = await latestValidDecision(tx, alunoId, actor.contractId, detection);
      if (!decisionResolvesReview(detection, decision)) {
        throw new PreRegistrationEnrollmentError(
          'A verificação final encontrou duplicidade sem resolução vigente.',
          detection.classification === 'BLOCKING' ? 'BLOCKING_DUPLICATE' : 'DUPLICATE_REVIEW_REQUIRED'
        );
      }
      const reviewEvents = await tx.studentLifecycleEvent.findMany({
        where: { alunoId, contractId: actor.contractId, eventType: 'ADMIN_REVIEWED' },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { metadata: true },
      });
      const currentReview = reviewEvents.map((event) => metadataOf(event.metadata)).find((metadata) =>
        metadata.kind === 'ENROLLMENT_REVIEW' &&
        metadata.fingerprint === detection.fingerprint &&
        Number(metadata.reviewedRecordVersion) === detection.recordVersion
      );
      if (!aluno.onboarding.reviewedAt || !currentReview) {
        throw new PreRegistrationEnrollmentError(
          'A revisão administrativa está desatualizada.',
          'REVIEW_STALE'
        );
      }

      await revokeActiveInvite(tx, alunoId, actor.contractId, actor, 'Matrícula confirmada');
      try {
        await activateStudentEnrollmentInTransaction(
          tx,
          alunoId,
          actor.contractId,
          {
            actor: { userId: actor.userId, professorId: actor.professorId },
            metadata: {
              fingerprint: detection.fingerprint,
              reviewedRecordVersion: detection.recordVersion,
              sameCanonicalId: true,
              downstreamCreation: 'NONE',
            },
          }
        );
      } catch (error) {
        throwEnrollmentLifecycleError(error);
      }
      return {
        alunoId,
        status: 'ACTIVE_STUDENT',
        redirectTo: `/central-do-aluno/${alunoId}`,
        idempotent: false,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },
};
