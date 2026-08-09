import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  CAPACITY_PRESCRIPTION_STATUSES,
  CONSOLIDATED_PRESCRIPTION_STATUSES,
  PHYSICAL_CAPACITY_TYPES,
  type BlockConsolidatedPrescriptionCommand,
  type CapacityPrescriptionSourceRef,
  type CapacityPrescriptionStatus,
  type ConsolidatedCapacityBlock,
  type ConsolidatedPrescriptionAssembly,
  type ConsolidatedPrescriptionConflict,
  type ConsolidatedPrescriptionDataRef,
  type ConsolidatedPrescriptionDataRefInput,
  type ConsolidatedPrescriptionHistory,
  type ConsolidatedPrescriptionStatus,
  type ConsolidatedPrescriptionVersionCommand,
  type ConsolidatedPrescriptionVersionDetail,
  type CreateConsolidatedPrescriptionDraftPayload,
  type PhysicalCapacityType,
  type UpdateConsolidatedPrescriptionCompositionPayload,
} from '@corrida/types';

const prisma = new PrismaClient();
const statusSet = new Set<string>(CONSOLIDATED_PRESCRIPTION_STATUSES);
const capacitySet = new Set<string>(PHYSICAL_CAPACITY_TYPES);
const capacityStatusSet = new Set<string>(CAPACITY_PRESCRIPTION_STATUSES);
const genericAssessmentCategories: Partial<
  Record<ConsolidatedPrescriptionDataRef['sourceType'], string[]>
> = {
  adipometry: ['adipometry', 'adipometria', 'adpt'],
  bioimpedance: ['bioimpedance', 'bioimpedanciometry', 'bioimpedanciometria'],
  ultrasound: ['ultrasound', 'ultrassonografia', 'ultrassom'],
  ventilometry: ['ventilometry', 'ventilometria', 'metabolic'],
  flexibility_assessment: ['flexibility', 'flexibilidade', 'flexibility_assessment'],
};

type DbClient = Prisma.TransactionClient | PrismaClient;

export type ConsolidatedPrescriptionErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_INPUT'
  | 'INVALID_CAPACITY_VERSION'
  | 'INVALID_DATA_REFERENCE'
  | 'INVALID_TRANSITION';

export class ConsolidatedPrescriptionDomainError extends Error {
  constructor(
    public readonly code: ConsolidatedPrescriptionErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ConsolidatedPrescriptionDomainError';
  }
}

export interface ConsolidatedPrescriptionContext {
  contractId: string;
  alunoId: string;
  actorProfessorId: string;
}

interface AssemblyRow {
  id: string;
  contractId: string;
  alunoId: string;
  currentVersion: number;
  currentStatus: string;
  createdByProfessorId: string;
  updatedByProfessorId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface VersionRow {
  id: string;
  assemblyId: string;
  contractId: string;
  alunoId: string;
  version: number;
  previousVersionId: string | null;
  status: string;
  responsibleProfessorId: string;
  technicalObservation: string | null;
  professorJustification: string;
  studentInstruction: string | null;
  reviewedByProfessorId: string | null;
  reviewedAt: Date | null;
  approvedByProfessorId: string | null;
  approvedAt: Date | null;
  blockedByProfessorId: string | null;
  blockedAt: Date | null;
  blockReason: string | null;
  createdByProfessorId: string;
  conflicts: unknown;
  createdAt: Date;
}

interface CapacityBlockRow {
  id: string;
  capacityPrescriptionVersionId: string;
  capacity: string;
  capacityVersion: number;
  capacityStatus: string;
  position: number;
}

interface DataRefRow {
  id: string;
  role: ConsolidatedPrescriptionDataRef['role'];
  sourceType: ConsolidatedPrescriptionDataRef['sourceType'];
  sourceId: string;
  label: string | null;
  assessedAt: Date | null;
  origin: string | null;
  sourceVersion: string | null;
  responsibleProfessorId: string | null;
  context: unknown;
}

interface ResolvedCapacityVersion {
  id: string;
  capacity: PhysicalCapacityType;
  version: number;
  status: CapacityPrescriptionStatus;
  position: number;
  technicalJustification: string;
  professorSummary: string;
  studentMessage: string | null;
  sources: Array<{
    sourceType: string;
    sourceId: string;
    label: string;
    assessedAt: Date | null;
    origin: string | null;
    sourceVersion: string | null;
    responsibleProfessorId: string | null;
  }>;
  alerts: Array<{ code: string; message: string; severity: string }>;
}

function domainError(
  code: ConsolidatedPrescriptionErrorCode,
  message: string,
  details?: Record<string, unknown>
): never {
  throw new ConsolidatedPrescriptionDomainError(code, message, details);
}

function assertNonEmpty(value: string | undefined | null, field: string) {
  if (!value?.trim()) domainError('INVALID_INPUT', `${field} é obrigatório`);
}

function assertExpectedVersion(value: number) {
  if (!Number.isInteger(value) || value < 0) {
    domainError('INVALID_INPUT', 'Versão atual esperada deve ser um inteiro não negativo');
  }
}

function asConsolidatedStatus(value: string): ConsolidatedPrescriptionStatus {
  if (!statusSet.has(value)) domainError('INVALID_INPUT', 'Estado persistido da montagem é inválido');
  return value as ConsolidatedPrescriptionStatus;
}

function asCapacity(value: string): PhysicalCapacityType {
  if (!capacitySet.has(value)) domainError('INVALID_CAPACITY_VERSION', 'Capacidade persistida inválida');
  return value as PhysicalCapacityType;
}

function asCapacityStatus(value: string): CapacityPrescriptionStatus {
  if (!capacityStatusSet.has(value)) {
    domainError('INVALID_CAPACITY_VERSION', 'Estado persistido da capacidade é inválido');
  }
  return value as CapacityPrescriptionStatus;
}

function normalizeOptional(value: string | null | undefined) {
  return value?.trim() || null;
}

function normalizeDataRef(input: ConsolidatedPrescriptionDataRefInput): ConsolidatedPrescriptionDataRef {
  assertNonEmpty(input.sourceId, 'Identificador da origem');
  return {
    id: randomUUID(),
    role: input.role,
    sourceType: input.sourceType,
    sourceId: input.sourceId.trim(),
    label: normalizeOptional(input.label),
    assessedAt: input.assessedAt ?? null,
    origin: normalizeOptional(input.origin),
    sourceVersion: input.sourceVersion ?? null,
    responsibleProfessorId: normalizeOptional(input.responsibleProfessorId),
    context: input.context ?? null,
  };
}

function parseDate(value: string | null | undefined, field: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) domainError('INVALID_INPUT', `${field} possui data inválida`);
  return parsed;
}

async function assertScope(client: DbClient, context: ConsolidatedPrescriptionContext) {
  assertNonEmpty(context.contractId, 'Contrato');
  assertNonEmpty(context.alunoId, 'Aluno');
  assertNonEmpty(context.actorProfessorId, 'Professor autor');

  const [aluno, professor] = await Promise.all([
    client.aluno.findFirst({
      where: { id: context.alunoId, contractId: context.contractId },
      select: { id: true },
    }),
    client.professor.findFirst({
      where: { id: context.actorProfessorId, contractId: context.contractId },
      select: { id: true },
    }),
  ]);

  if (!aluno || !professor) domainError('NOT_FOUND', 'Recurso não encontrado');
}

async function assertProfessorInContract(client: DbClient, contractId: string, professorId: string) {
  const professor = await client.professor.findFirst({
    where: { id: professorId, contractId },
    select: { id: true },
  });
  if (!professor) domainError('NOT_FOUND', 'Recurso não encontrado');
}

async function validateProntuarioAlert(
  client: DbClient,
  context: ConsolidatedPrescriptionContext,
  sourceId: string
) {
  const [painCase, followUp, medication, discomfort] = await Promise.all([
    client.prontuarioPainCase.findFirst({
      where: { id: sourceId, record: { contractId: context.contractId, alunoId: context.alunoId } },
      select: { id: true },
    }),
    client.prontuarioAnamnesisFollowUp.findFirst({
      where: { id: sourceId, record: { contractId: context.contractId, alunoId: context.alunoId } },
      select: { id: true },
    }),
    client.prontuarioMedicationProcedure.findFirst({
      where: { id: sourceId, record: { contractId: context.contractId, alunoId: context.alunoId } },
      select: { id: true },
    }),
    client.prontuarioDiscomfortSnapshot.findFirst({
      where: { id: sourceId, contractId: context.contractId, alunoId: context.alunoId },
      select: { id: true },
    }),
  ]);
  return Boolean(painCase || followUp || medication || discomfort);
}

async function validateAdditionalDataRef(
  client: DbClient,
  context: ConsolidatedPrescriptionContext,
  ref: ConsolidatedPrescriptionDataRef
) {
  // capacity_source is intentionally left to the database guard because it is
  // backend-owned in the typed contract and the trigger also protects untyped callers.
  if (ref.role === 'capacity_source') return;

  if (ref.sourceType === 'manual_observation') {
    if (ref.role !== 'manual_observation') {
      domainError('INVALID_DATA_REFERENCE', 'Observação manual possui papel de origem inválido');
    }
    ref.sourceId = ref.id;
    ref.responsibleProfessorId = context.actorProfessorId;
    ref.origin = ref.origin ?? 'consolidated_prescription';
    return;
  }

  if (ref.responsibleProfessorId) {
    await assertProfessorInContract(client, context.contractId, ref.responsibleProfessorId);
  }

  let exists = false;
  switch (ref.sourceType) {
    case 'prontuario_goal':
      exists = Boolean(
        await client.prontuarioGoal.findFirst({
          where: {
            id: ref.sourceId,
            record: { contractId: context.contractId, alunoId: context.alunoId },
          },
          select: { id: true },
        })
      );
      break;
    case 'prontuario_alert':
      exists = await validateProntuarioAlert(client, context, ref.sourceId);
      break;
    case 'anthropometry':
      exists = Boolean(
        await client.anthropometryAssessment.findFirst({
          where: { id: ref.sourceId, contractId: context.contractId, alunoId: context.alunoId },
          select: { id: true },
        })
      );
      break;
    case 'physical_assessment':
      exists = Boolean(
        await client.studentAssessmentRecord.findFirst({
          where: { id: ref.sourceId, contractId: context.contractId, alunoId: context.alunoId },
          select: { id: true },
        })
      );
      break;
    case 'adipometry':
    case 'bioimpedance':
    case 'ultrasound':
    case 'ventilometry':
    case 'flexibility_assessment':
      exists = Boolean(
        await client.studentAssessmentRecord.findFirst({
          where: {
            id: ref.sourceId,
            contractId: context.contractId,
            alunoId: context.alunoId,
            assessmentCategory: { in: genericAssessmentCategories[ref.sourceType] ?? [] },
          },
          select: { id: true },
        })
      );
      break;
    case 'student_preference':
      exists = Boolean(
        await client.studentProfile.findFirst({
          where: { id: ref.sourceId, contractId: context.contractId, alunoId: context.alunoId },
          select: { id: true },
        })
      );
      break;
    case 'professor_note':
    case 'routine':
    case 'exercise_substitution':
      // These source types do not have a canonical persisted object that can be
      // revalidated for tenant/student scope in this module. They remain valid
      // as backend-derived capacity_source values, but are rejected as client
      // references until a canonical source exists.
      exists = false;
      break;
    default:
      exists = false;
  }

  if (!exists) {
    domainError(
      'INVALID_DATA_REFERENCE',
      'Origem adicional inválida ou fora do contrato do aluno'
    );
  }
}

async function resolveAdditionalDataRefs(
  client: DbClient,
  context: ConsolidatedPrescriptionContext,
  inputs: ConsolidatedPrescriptionDataRefInput[]
) {
  const refs = inputs.map(normalizeDataRef);
  for (const ref of refs) {
    await validateAdditionalDataRef(client, context, ref);
  }
  return refs;
}

async function resolveCapacityVersions(
  client: DbClient,
  context: ConsolidatedPrescriptionContext,
  inputs: CreateConsolidatedPrescriptionDraftPayload['capacityBlocks']
): Promise<ResolvedCapacityVersion[]> {
  if (!inputs.length) domainError('INVALID_INPUT', 'Ao menos uma capacidade deve compor a montagem');

  const ids = inputs.map((entry) => entry.capacityPrescriptionVersionId?.trim()).filter(Boolean);
  if (ids.length !== inputs.length || new Set(ids).size !== ids.length) {
    domainError('INVALID_INPUT', 'As referências de versões de capacidade devem ser únicas e válidas');
  }

  const versions = await client.capacityPrescriptionVersion.findMany({
    where: {
      id: { in: ids },
      contractId: context.contractId,
      alunoId: context.alunoId,
    },
    include: {
      sources: { orderBy: { createdAt: 'asc' } },
      alerts: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (versions.length !== ids.length) {
    domainError(
      'INVALID_CAPACITY_VERSION',
      'Uma ou mais versões de capacidade não existem para este aluno e contrato'
    );
  }

  const byId = new Map(versions.map((version) => [version.id, version]));
  const usedCapacities = new Set<string>();

  const resolved = inputs.map((input, index) => {
    const version = byId.get(input.capacityPrescriptionVersionId.trim());
    if (!version) domainError('INVALID_CAPACITY_VERSION', 'Versão de capacidade inválida');

    const capacity = asCapacity(version.capacity);
    const status = asCapacityStatus(version.status);
    if (usedCapacities.has(capacity)) {
      domainError('INVALID_INPUT', `A capacidade ${capacity} foi informada mais de uma vez`);
    }
    usedCapacities.add(capacity);

    if (status !== 'active') {
      domainError('INVALID_CAPACITY_VERSION', 'Montagem consolidada recebe apenas capacidades ativas');
    }

    const position = input.position ?? index;
    if (!Number.isInteger(position) || position < 0) {
      domainError('INVALID_INPUT', 'Posição do bloco deve ser um inteiro não negativo');
    }

    return {
      id: version.id,
      capacity,
      version: version.version,
      status,
      position,
      technicalJustification: version.technicalJustification,
      professorSummary: version.professorSummary,
      studentMessage: version.studentMessage,
      sources: version.sources,
      alerts: version.alerts,
    };
  });

  const missingCapacities = PHYSICAL_CAPACITY_TYPES.filter(
    (capacity) => !usedCapacities.has(capacity)
  );
  if (resolved.length !== PHYSICAL_CAPACITY_TYPES.length || missingCapacities.length) {
    domainError(
      'INVALID_INPUT',
      `A montagem consolidada exige exatamente as quatro capacidades: ${PHYSICAL_CAPACITY_TYPES.join(', ')}`,
      { missingCapacities }
    );
  }

  return resolved;
}

function capacitySourceRefs(versions: ResolvedCapacityVersion[]): ConsolidatedPrescriptionDataRef[] {
  const unique = new Map<string, ConsolidatedPrescriptionDataRef>();
  for (const version of versions) {
    for (const source of version.sources) {
      const key = `${source.sourceType}:${source.sourceId}:${source.sourceVersion ?? ''}`;
      if (unique.has(key)) continue;
      unique.set(key, {
        id: randomUUID(),
        role: 'capacity_source',
        sourceType: source.sourceType as CapacityPrescriptionSourceRef['type'],
        sourceId: source.sourceId,
        label: source.label,
        assessedAt: source.assessedAt?.toISOString() ?? null,
        origin: source.origin,
        sourceVersion: source.sourceVersion,
        responsibleProfessorId: source.responsibleProfessorId,
        context: null,
      });
    }
  }
  return Array.from(unique.values());
}

function blockText(block: ResolvedCapacityVersion) {
  return [
    block.technicalJustification,
    block.professorSummary,
    block.studentMessage,
    ...block.alerts.map((alert) => alert.message),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('pt-BR');
}

function detectBasicConflicts(blocks: ResolvedCapacityVersion[]): ConsolidatedPrescriptionConflict[] {
  const resisted = blocks.find((block) => block.capacity === 'resisted');
  const cyclic = blocks.find((block) => block.capacity === 'cyclic');
  if (!resisted || !cyclic) return [];

  const allText = blocks.map(blockText).join(' ');
  const hasKneePain = ['joelho', 'dor relevante', 'dor intensa'].some((term) => allText.includes(term));
  const hasLowerLimbIntensity = ['perna', 'membro inferior', 'agachamento'].some((term) =>
    blockText(resisted).includes(term)
  );
  const hasStrongInterval = ['intervalado', 'forte', 'alta intensidade'].some((term) =>
    blockText(cyclic).includes(term)
  );

  if (!hasKneePain || !hasLowerLimbIntensity || !hasStrongInterval) return [];

  return [
    {
      code: 'lower-limb-intensity-knee-pain',
      message:
        'Conflito possível: estímulo intenso de membros inferiores, sessão cíclica forte e dor no joelho exigem revisão antes da liberação.',
      severity: 'critical',
      affectedCapacities: ['resisted', 'cyclic'],
      sourceRefIds: blocks.flatMap((block) => block.sources.map((source) => source.sourceId)),
    },
  ];
}

function toCapacityBlocks(resolved: ResolvedCapacityVersion[]): ConsolidatedCapacityBlock[] {
  return resolved.map((entry) => ({
    id: randomUUID(),
    capacityPrescriptionVersionId: entry.id,
    capacity: entry.capacity,
    capacityVersion: entry.version,
    capacityStatus: entry.status,
    position: entry.position,
  }));
}

function buildTraceability(
  capacityBlocks: ConsolidatedCapacityBlock[],
  dataRefs: ConsolidatedPrescriptionDataRef[]
) {
  return {
    capacityCount: capacityBlocks.length,
    sourceRefIds: Array.from(new Set(dataRefs.map((ref) => ref.sourceId))),
    capacityVersions: capacityBlocks.map((block) => ({
      capacityPrescriptionVersionId: block.capacityPrescriptionVersionId,
      capacity: block.capacity,
      version: block.capacityVersion,
      status: block.capacityStatus,
    })),
  };
}

function canRelease(status: ConsolidatedPrescriptionStatus, conflicts: ConsolidatedPrescriptionConflict[]) {
  return status === 'approved' && !conflicts.some((conflict) => conflict.severity === 'critical');
}

function mapAssembly(row: AssemblyRow) {
  return {
    id: row.id,
    contractId: row.contractId,
    alunoId: row.alunoId,
    currentVersion: row.currentVersion,
    currentStatus: asConsolidatedStatus(row.currentStatus),
    createdByProfessorId: row.createdByProfessorId,
    updatedByProfessorId: row.updatedByProfessorId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapConflictJson(value: unknown): ConsolidatedPrescriptionConflict[] {
  if (!Array.isArray(value)) return [];
  return value as ConsolidatedPrescriptionConflict[];
}

async function findAssemblyForUpdate(client: DbClient, context: ConsolidatedPrescriptionContext) {
  const rows = await client.$queryRaw<AssemblyRow[]>`
    SELECT *
    FROM "ConsolidatedPrescription"
    WHERE "contractId" = ${context.contractId}
      AND "alunoId" = ${context.alunoId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function loadVersionRows(client: DbClient, assemblyId: string, version?: number) {
  if (version === undefined) {
    return client.$queryRaw<VersionRow[]>`
      SELECT * FROM "ConsolidatedPrescriptionVersion"
      WHERE "assemblyId" = ${assemblyId}
      ORDER BY "version" DESC
    `;
  }
  return client.$queryRaw<VersionRow[]>`
    SELECT * FROM "ConsolidatedPrescriptionVersion"
    WHERE "assemblyId" = ${assemblyId} AND "version" = ${version}
    LIMIT 1
  `;
}

async function loadCapacityBlocks(client: DbClient, assemblyVersionId: string) {
  return client.$queryRaw<CapacityBlockRow[]>`
    SELECT "id", "capacityPrescriptionVersionId", "capacity", "capacityVersion", "capacityStatus", "position"
    FROM "ConsolidatedPrescriptionCapacityBlock"
    WHERE "assemblyVersionId" = ${assemblyVersionId}
    ORDER BY "position" ASC, "id" ASC
  `;
}

async function loadDataRefs(client: DbClient, assemblyVersionId: string) {
  return client.$queryRaw<DataRefRow[]>`
    SELECT "id", "role", "sourceType", "sourceId", "label", "assessedAt", "origin",
           "sourceVersion", "responsibleProfessorId", "context"
    FROM "ConsolidatedPrescriptionDataRef"
    WHERE "assemblyVersionId" = ${assemblyVersionId}
    ORDER BY "createdAt" ASC, "id" ASC
  `;
}

async function mapVersionDetail(client: DbClient, row: VersionRow): Promise<ConsolidatedPrescriptionVersionDetail> {
  const [blockRows, refRows] = await Promise.all([
    loadCapacityBlocks(client, row.id),
    loadDataRefs(client, row.id),
  ]);

  const capacityBlocks: ConsolidatedCapacityBlock[] = blockRows.map((block) => ({
    id: block.id,
    capacityPrescriptionVersionId: block.capacityPrescriptionVersionId,
    capacity: asCapacity(block.capacity),
    capacityVersion: block.capacityVersion,
    capacityStatus: asCapacityStatus(block.capacityStatus),
    position: block.position,
  }));

  const dataRefs: ConsolidatedPrescriptionDataRef[] = refRows.map((ref) => ({
    id: ref.id,
    role: ref.role,
    sourceType: ref.sourceType,
    sourceId: ref.sourceId,
    label: ref.label,
    assessedAt: ref.assessedAt?.toISOString() ?? null,
    origin: ref.origin,
    sourceVersion: ref.sourceVersion,
    responsibleProfessorId: ref.responsibleProfessorId,
    context: (ref.context as Record<string, unknown> | null) ?? null,
  }));
  const conflicts = mapConflictJson(row.conflicts);
  const status = asConsolidatedStatus(row.status);

  return {
    id: row.id,
    assemblyId: row.assemblyId,
    contractId: row.contractId,
    alunoId: row.alunoId,
    version: row.version,
    previousVersionId: row.previousVersionId,
    status,
    responsibleProfessorId: row.responsibleProfessorId,
    technicalObservation: row.technicalObservation,
    professorJustification: row.professorJustification,
    studentInstruction: row.studentInstruction,
    reviewedByProfessorId: row.reviewedByProfessorId,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    approvedByProfessorId: row.approvedByProfessorId,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    blockedByProfessorId: row.blockedByProfessorId,
    blockedAt: row.blockedAt?.toISOString() ?? null,
    blockReason: row.blockReason,
    createdByProfessorId: row.createdByProfessorId,
    createdAt: row.createdAt.toISOString(),
    capacityBlocks,
    dataRefs,
    conflicts,
    traceability: buildTraceability(capacityBlocks, dataRefs),
    canReleaseOperationalWorkout: canRelease(status, conflicts),
    createsTodayWorkoutDirectly: false,
  };
}

async function persistVersion(
  client: DbClient,
  input: {
    assembly: AssemblyRow;
    previousVersionId: string | null;
    status: ConsolidatedPrescriptionStatus;
    responsibleProfessorId: string;
    technicalObservation: string | null;
    professorJustification: string;
    studentInstruction: string | null;
    reviewedByProfessorId?: string | null;
    reviewedAt?: Date | null;
    approvedByProfessorId?: string | null;
    approvedAt?: Date | null;
    blockedByProfessorId?: string | null;
    blockedAt?: Date | null;
    blockReason?: string | null;
    createdByProfessorId: string;
    createdAt: Date;
    capacityBlocks: ConsolidatedCapacityBlock[];
    dataRefs: ConsolidatedPrescriptionDataRef[];
    conflicts: ConsolidatedPrescriptionConflict[];
  }
) {
  const versionId = randomUUID();
  const conflictsJson = JSON.stringify(input.conflicts);
  const inserted = await client.$queryRaw<VersionRow[]>`
    INSERT INTO "ConsolidatedPrescriptionVersion" (
      "id", "assemblyId", "contractId", "alunoId", "version", "previousVersionId", "status",
      "responsibleProfessorId", "technicalObservation", "professorJustification", "studentInstruction",
      "reviewedByProfessorId", "reviewedAt", "approvedByProfessorId", "approvedAt",
      "blockedByProfessorId", "blockedAt", "blockReason", "createdByProfessorId", "conflicts", "createdAt"
    ) VALUES (
      ${versionId}, ${input.assembly.id}, ${input.assembly.contractId}, ${input.assembly.alunoId},
      ${input.assembly.currentVersion}, ${input.previousVersionId}, ${input.status},
      ${input.responsibleProfessorId}, ${input.technicalObservation}, ${input.professorJustification},
      ${input.studentInstruction}, ${input.reviewedByProfessorId ?? null}, ${input.reviewedAt ?? null},
      ${input.approvedByProfessorId ?? null}, ${input.approvedAt ?? null}, ${input.blockedByProfessorId ?? null},
      ${input.blockedAt ?? null}, ${input.blockReason ?? null}, ${input.createdByProfessorId},
      CAST(${conflictsJson} AS jsonb), ${input.createdAt}
    )
    RETURNING *
  `;

  for (const block of input.capacityBlocks) {
    await client.$executeRaw`
      INSERT INTO "ConsolidatedPrescriptionCapacityBlock" (
        "id", "assemblyVersionId", "contractId", "alunoId", "capacityPrescriptionVersionId",
        "capacity", "capacityVersion", "capacityStatus", "position", "createdAt"
      ) VALUES (
        ${block.id}, ${versionId}, ${input.assembly.contractId}, ${input.assembly.alunoId},
        ${block.capacityPrescriptionVersionId}, ${block.capacity}, ${block.capacityVersion},
        ${block.capacityStatus}, ${block.position}, ${input.createdAt}
      )
    `;
  }

  for (const ref of input.dataRefs) {
    await client.$executeRaw`
      INSERT INTO "ConsolidatedPrescriptionDataRef" (
        "id", "assemblyVersionId", "role", "sourceType", "sourceId", "label", "assessedAt",
        "origin", "sourceVersion", "responsibleProfessorId", "context", "createdAt"
      ) VALUES (
        ${ref.id}, ${versionId}, ${ref.role}, ${ref.sourceType}, ${ref.sourceId}, ${ref.label ?? null},
        ${parseDate(ref.assessedAt, 'Data da origem')}, ${ref.origin ?? null},
        ${ref.sourceVersion === null || ref.sourceVersion === undefined ? null : String(ref.sourceVersion)},
        ${ref.responsibleProfessorId ?? null}, CAST(${JSON.stringify(ref.context ?? null)} AS jsonb), ${input.createdAt}
      )
    `;
  }

  return inserted[0];
}

async function advanceAggregate(
  client: DbClient,
  assembly: AssemblyRow,
  expectedCurrentVersion: number,
  nextStatus: ConsolidatedPrescriptionStatus,
  actorProfessorId: string,
  now: Date
) {
  if (assembly.currentVersion !== expectedCurrentVersion) {
    domainError('CONFLICT', 'A montagem foi alterada por outro usuário', {
      expectedCurrentVersion,
      actualCurrentVersion: assembly.currentVersion,
    });
  }

  const rows = await client.$queryRaw<AssemblyRow[]>`
    UPDATE "ConsolidatedPrescription"
    SET "currentVersion" = "currentVersion" + 1,
        "currentStatus" = ${nextStatus},
        "updatedByProfessorId" = ${actorProfessorId},
        "updatedAt" = ${now}
    WHERE "id" = ${assembly.id}
      AND "currentVersion" = ${expectedCurrentVersion}
    RETURNING *
  `;

  if (rows.length !== 1) {
    domainError('CONFLICT', 'A montagem foi alterada por outro usuário', {
      expectedCurrentVersion,
    });
  }
  return rows[0];
}

function assertTransition(from: ConsolidatedPrescriptionStatus, to: ConsolidatedPrescriptionStatus) {
  const allowed: Record<ConsolidatedPrescriptionStatus, ConsolidatedPrescriptionStatus[]> = {
    draft: ['ready_for_review'],
    ready_for_review: ['approved', 'blocked'],
    approved: [],
    released: [],
    blocked: [],
    archived: [],
  };
  if (!allowed[from].includes(to)) {
    domainError('INVALID_TRANSITION', `Transição ${from} -> ${to} não é permitida`);
  }
}

async function currentVersionDetail(client: DbClient, assembly: AssemblyRow) {
  const rows = await loadVersionRows(client, assembly.id, assembly.currentVersion);
  if (!rows[0]) domainError('NOT_FOUND', 'Versão atual da montagem não encontrada');
  return mapVersionDetail(client, rows[0]);
}

function cloneDataRefs(refs: ConsolidatedPrescriptionDataRef[]) {
  return refs.map((ref) => ({ ...ref, id: randomUUID() }));
}

function cloneBlocks(blocks: ConsolidatedCapacityBlock[]) {
  return blocks.map((block) => ({ ...block, id: randomUUID() }));
}

export function createConsolidatedPrescriptionService(client: PrismaClient = prisma) {
  return {
    async createDraft(
      context: ConsolidatedPrescriptionContext,
      payload: CreateConsolidatedPrescriptionDraftPayload,
      now = new Date()
    ): Promise<ConsolidatedPrescriptionAssembly> {
      assertNonEmpty(payload.professorJustification, 'Justificativa do professor');

      return client.$transaction(async (tx) => {
        await assertScope(tx, context);
        const responsibleProfessorId = payload.responsibleProfessorId?.trim() || context.actorProfessorId;
        await assertProfessorInContract(tx, context.contractId, responsibleProfessorId);

        const existing = await findAssemblyForUpdate(tx, context);
        if (existing) {
          domainError('CONFLICT', 'Já existe uma montagem consolidada para este aluno e contrato', {
            actualCurrentVersion: existing.currentVersion,
          });
        }

        const resolved = await resolveCapacityVersions(tx, context, payload.capacityBlocks);
        const additionalDataRefs = await resolveAdditionalDataRefs(tx, context, payload.dataRefs ?? []);
        const capacityBlocks = toCapacityBlocks(resolved);
        const dataRefs = [
          ...capacitySourceRefs(resolved),
          ...additionalDataRefs,
        ];
        const conflicts = detectBasicConflicts(resolved);
        const assemblyId = randomUUID();

        const createdRows = await tx.$queryRaw<AssemblyRow[]>`
          INSERT INTO "ConsolidatedPrescription" (
            "id", "contractId", "alunoId", "currentVersion", "currentStatus",
            "createdByProfessorId", "updatedByProfessorId", "createdAt", "updatedAt"
          ) VALUES (
            ${assemblyId}, ${context.contractId}, ${context.alunoId}, 1, 'draft',
            ${context.actorProfessorId}, ${context.actorProfessorId}, ${now}, ${now}
          )
          RETURNING *
        `;
        const assembly = createdRows[0];
        if (!assembly) domainError('CONFLICT', 'Não foi possível criar a montagem consolidada');

        const versionRow = await persistVersion(tx, {
          assembly,
          previousVersionId: null,
          status: 'draft',
          responsibleProfessorId,
          technicalObservation: normalizeOptional(payload.technicalObservation),
          professorJustification: payload.professorJustification.trim(),
          studentInstruction: normalizeOptional(payload.studentInstruction),
          createdByProfessorId: context.actorProfessorId,
          createdAt: now,
          capacityBlocks,
          dataRefs,
          conflicts,
        });

        return {
          ...mapAssembly(assembly),
          latestVersion: await mapVersionDetail(tx, versionRow),
        };
      });
    },

    async updateComposition(
      context: ConsolidatedPrescriptionContext,
      payload: UpdateConsolidatedPrescriptionCompositionPayload,
      now = new Date()
    ): Promise<ConsolidatedPrescriptionAssembly> {
      assertExpectedVersion(payload.expectedCurrentVersion);
      assertNonEmpty(payload.professorJustification, 'Justificativa do professor');

      return client.$transaction(async (tx) => {
        await assertScope(tx, context);
        const current = await findAssemblyForUpdate(tx, context);
        if (!current) domainError('NOT_FOUND', 'Montagem consolidada não encontrada');
        const currentStatus = asConsolidatedStatus(current.currentStatus);
        if (currentStatus === 'archived') {
          domainError('INVALID_TRANSITION', 'Montagem arquivada não pode receber nova revisão');
        }

        const previous = await currentVersionDetail(tx, current);
        const responsibleProfessorId = payload.responsibleProfessorId?.trim() || context.actorProfessorId;
        await assertProfessorInContract(tx, context.contractId, responsibleProfessorId);
        const resolved = await resolveCapacityVersions(tx, context, payload.capacityBlocks);
        const additionalDataRefs = await resolveAdditionalDataRefs(tx, context, payload.dataRefs ?? []);
        const nextAssembly = await advanceAggregate(
          tx,
          current,
          payload.expectedCurrentVersion,
          'draft',
          context.actorProfessorId,
          now
        );
        const capacityBlocks = toCapacityBlocks(resolved);
        const dataRefs = [
          ...capacitySourceRefs(resolved),
          ...additionalDataRefs,
        ];
        const conflicts = detectBasicConflicts(resolved);
        const versionRow = await persistVersion(tx, {
          assembly: nextAssembly,
          previousVersionId: previous.id,
          status: 'draft',
          responsibleProfessorId,
          technicalObservation: normalizeOptional(payload.technicalObservation),
          professorJustification: payload.professorJustification.trim(),
          studentInstruction: normalizeOptional(payload.studentInstruction),
          createdByProfessorId: context.actorProfessorId,
          createdAt: now,
          capacityBlocks,
          dataRefs,
          conflicts,
        });

        return {
          ...mapAssembly(nextAssembly),
          latestVersion: await mapVersionDetail(tx, versionRow),
        };
      });
    },

    async sendForReview(
      context: ConsolidatedPrescriptionContext,
      command: ConsolidatedPrescriptionVersionCommand,
      now = new Date()
    ) {
      return transition(context, command, 'ready_for_review', now);
    },

    async approve(
      context: ConsolidatedPrescriptionContext,
      command: ConsolidatedPrescriptionVersionCommand,
      now = new Date()
    ) {
      return transition(context, command, 'approved', now);
    },

    async block(
      context: ConsolidatedPrescriptionContext,
      command: BlockConsolidatedPrescriptionCommand,
      now = new Date()
    ) {
      assertNonEmpty(command.reason, 'Motivo do bloqueio');
      return transition(context, command, 'blocked', now, command.reason.trim());
    },

    async getCurrent(context: ConsolidatedPrescriptionContext): Promise<ConsolidatedPrescriptionAssembly | null> {
      await assertScope(client, context);
      const rows = await client.$queryRaw<AssemblyRow[]>`
        SELECT * FROM "ConsolidatedPrescription"
        WHERE "contractId" = ${context.contractId} AND "alunoId" = ${context.alunoId}
        LIMIT 1
      `;
      const assembly = rows[0];
      if (!assembly) return null;
      return {
        ...mapAssembly(assembly),
        latestVersion: await currentVersionDetail(client, assembly),
      };
    },

    async getHistory(context: ConsolidatedPrescriptionContext): Promise<ConsolidatedPrescriptionHistory | null> {
      await assertScope(client, context);
      const rows = await client.$queryRaw<AssemblyRow[]>`
        SELECT * FROM "ConsolidatedPrescription"
        WHERE "contractId" = ${context.contractId} AND "alunoId" = ${context.alunoId}
        LIMIT 1
      `;
      const assembly = rows[0];
      if (!assembly) return null;
      const versions = await loadVersionRows(client, assembly.id);
      return {
        assembly: mapAssembly(assembly),
        versions: await Promise.all(versions.map((version) => mapVersionDetail(client, version))),
      };
    },
  };

  async function transition(
    context: ConsolidatedPrescriptionContext,
    command: ConsolidatedPrescriptionVersionCommand,
    nextStatus: 'ready_for_review' | 'approved' | 'blocked',
    now: Date,
    blockReason?: string
  ): Promise<ConsolidatedPrescriptionAssembly> {
    assertExpectedVersion(command.expectedCurrentVersion);

    return client.$transaction(async (tx) => {
      await assertScope(tx, context);
      const current = await findAssemblyForUpdate(tx, context);
      if (!current) domainError('NOT_FOUND', 'Montagem consolidada não encontrada');
      const previous = await currentVersionDetail(tx, current);
      assertTransition(previous.status, nextStatus);

      if (nextStatus === 'approved' && previous.conflicts.some((conflict) => conflict.severity === 'critical')) {
        domainError('INVALID_TRANSITION', 'Montagem com conflito crítico não pode ser aprovada');
      }

      const nextAssembly = await advanceAggregate(
        tx,
        current,
        command.expectedCurrentVersion,
        nextStatus,
        context.actorProfessorId,
        now
      );
      const versionRow = await persistVersion(tx, {
        assembly: nextAssembly,
        previousVersionId: previous.id,
        status: nextStatus,
        responsibleProfessorId: previous.responsibleProfessorId,
        technicalObservation: previous.technicalObservation ?? null,
        professorJustification: previous.professorJustification,
        studentInstruction: previous.studentInstruction ?? null,
        reviewedByProfessorId:
          nextStatus === 'ready_for_review' ? context.actorProfessorId : previous.reviewedByProfessorId,
        reviewedAt: nextStatus === 'ready_for_review' ? now : parseDate(previous.reviewedAt, 'Data de revisão'),
        approvedByProfessorId:
          nextStatus === 'approved' ? context.actorProfessorId : previous.approvedByProfessorId,
        approvedAt: nextStatus === 'approved' ? now : parseDate(previous.approvedAt, 'Data de aprovação'),
        blockedByProfessorId:
          nextStatus === 'blocked' ? context.actorProfessorId : previous.blockedByProfessorId,
        blockedAt: nextStatus === 'blocked' ? now : parseDate(previous.blockedAt, 'Data de bloqueio'),
        blockReason: nextStatus === 'blocked' ? blockReason ?? null : previous.blockReason ?? null,
        createdByProfessorId: context.actorProfessorId,
        createdAt: now,
        capacityBlocks: cloneBlocks(previous.capacityBlocks),
        dataRefs: cloneDataRefs(previous.dataRefs),
        conflicts: previous.conflicts,
      });

      return {
        ...mapAssembly(nextAssembly),
        latestVersion: await mapVersionDetail(tx, versionRow),
      };
    });
  }
}

export const consolidatedPrescriptionService = createConsolidatedPrescriptionService();