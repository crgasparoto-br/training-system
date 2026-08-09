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
  type ConsolidatedPrescriptionAuditAction,
  type ConsolidatedPrescriptionAuditEvent,
  type ConsolidatedPrescriptionConflict,
  type ConsolidatedPrescriptionConflictReport,
  type ConsolidatedPrescriptionDataRef,
  type ConsolidatedPrescriptionDataRefInput,
  type ConsolidatedPrescriptionHistory,
  type ConsolidatedPrescriptionStatus,
  type ConsolidatedPrescriptionVersionCommand,
  type ConsolidatedPrescriptionVersionDetail,
  type CreateConsolidatedPrescriptionDraftPayload,
  type CreateConsolidatedPrescriptionRevisionCommand,
  type PhysicalCapacityType,
  type UnblockConsolidatedPrescriptionCommand,
  type UpdateConsolidatedPrescriptionCompositionPayload,
} from '@corrida/types';

const prisma = new PrismaClient();
const statusSet = new Set<string>(CONSOLIDATED_PRESCRIPTION_STATUSES);
const capacitySet = new Set<string>(PHYSICAL_CAPACITY_TYPES);
const capacityStatusSet = new Set<string>(CAPACITY_PRESCRIPTION_STATUSES);
const conflictSeveritySet = new Set(['info', 'warning', 'critical']);
const genericAssessmentCategories: Partial<
  Record<ConsolidatedPrescriptionDataRef['sourceType'], string[]>
> = {
  adipometry: ['adipometry', 'adipometria', 'adpt'],
  bioimpedance: ['bioimpedance', 'bioimpedanciometry', 'bioimpedanciometria'],
  ultrasound: ['ultrasound', 'ultrassonografia', 'ultrassom'],
  ventilometry: ['ventilometry', 'ventilometria', 'metabolic'],
  flexibility_assessment: ['flexibility', 'flexibilidade', 'flexibility_assessment'],
};

const unavailableChecks = [
  {
    code: 'canonical-clinical-correlation-unavailable',
    message:
      'Correlações adicionais de carga, intensidade e restrições clínicas exigem regra canônica parametrizada; nenhum bloqueio é inferido por texto livre.',
  },
] as const;

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

interface AuditRow {
  id: string;
  assemblyId: string;
  assemblyVersionId: string;
  contractId: string;
  alunoId: string;
  actorProfessorId: string;
  action: string;
  previousVersion: number | null;
  newVersion: number;
  previousStatus: string | null;
  newStatus: string;
  reason: string | null;
  details: unknown;
  createdAt: Date;
}

interface ResolvedCapacityVersion {
  id: string;
  prescriptionId: string;
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
  alerts: Array<{
    code: string;
    message: string;
    severity: string;
    sourceRefId: string | null;
  }>;
}

interface CapacityRootState {
  id: string;
  currentVersion: number;
  status: string;
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

function asAuditAction(value: string): ConsolidatedPrescriptionAuditAction {
  const allowed = new Set<ConsolidatedPrescriptionAuditAction>([
    'created',
    'composition_updated',
    'sent_for_review',
    'approved',
    'blocked',
    'blocked_by_conflict',
    'unblocked',
    'revision_created',
  ]);
  if (!allowed.has(value as ConsolidatedPrescriptionAuditAction)) {
    domainError('INVALID_INPUT', 'Ação de auditoria persistida é inválida');
  }
  return value as ConsolidatedPrescriptionAuditAction;
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
      exists = false;
      break;
    default:
      exists = false;
  }

  if (!exists) {
    domainError('INVALID_DATA_REFERENCE', 'Origem adicional inválida ou fora do contrato do aluno');
  }
}

async function resolveAdditionalDataRefs(
  client: DbClient,
  context: ConsolidatedPrescriptionContext,
  inputs: ConsolidatedPrescriptionDataRefInput[]
) {
  const refs = inputs.map(normalizeDataRef);
  for (const ref of refs) await validateAdditionalDataRef(client, context, ref);
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
    where: { id: { in: ids }, contractId: context.contractId, alunoId: context.alunoId },
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

  const roots = await client.capacityPrescription.findMany({
    where: {
      id: { in: versions.map((version) => version.prescriptionId) },
      contractId: context.contractId,
      alunoId: context.alunoId,
    },
    select: { id: true, currentVersion: true, status: true },
  });
  const rootById = new Map(roots.map((root) => [root.id, root]));
  const byId = new Map(versions.map((version) => [version.id, version]));
  const usedCapacities = new Set<string>();

  const resolved = inputs.map((input, index) => {
    const version = byId.get(input.capacityPrescriptionVersionId.trim());
    if (!version) domainError('INVALID_CAPACITY_VERSION', 'Versão de capacidade inválida');
    const root = rootById.get(version.prescriptionId);
    const capacity = asCapacity(version.capacity);
    const capacityStatus = asCapacityStatus(version.status);

    if (usedCapacities.has(capacity)) {
      domainError('INVALID_INPUT', `A capacidade ${capacity} foi informada mais de uma vez`);
    }
    usedCapacities.add(capacity);

    if (
      capacityStatus !== 'active' ||
      !root ||
      root.status !== 'active' ||
      root.currentVersion !== version.version
    ) {
      domainError(
        'INVALID_CAPACITY_VERSION',
        'A montagem consolidada recebe somente a versão vigente e ativa de cada capacidade'
      );
    }

    const position = input.position ?? index;
    if (!Number.isInteger(position) || position < 0) {
      domainError('INVALID_INPUT', 'Posição do bloco deve ser um inteiro não negativo');
    }

    return {
      id: version.id,
      prescriptionId: version.prescriptionId,
      capacity,
      version: version.version,
      status: capacityStatus,
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

function alertConflict(
  capacity: PhysicalCapacityType,
  alert: { code: string; message: string; severity: string; sourceRefId: string | null }
): ConsolidatedPrescriptionConflict | null {
  if (!conflictSeveritySet.has(alert.severity)) return null;
  return {
    code: `capacity-alert:${capacity}:${alert.code}`,
    message: alert.message,
    severity: alert.severity as ConsolidatedPrescriptionConflict['severity'],
    affectedCapacities: [capacity],
    sourceRefIds: alert.sourceRefId ? [alert.sourceRefId] : [],
  };
}

export function deriveStructuredConflicts(
  blocks: Array<
    Pick<ResolvedCapacityVersion, 'capacity' | 'alerts'> & {
      isCurrent?: boolean;
      rootStatus?: string | null;
    }
  >,
  professorJustification?: string | null
): ConsolidatedPrescriptionConflict[] {
  const conflicts: ConsolidatedPrescriptionConflict[] = [];
  const capacities = new Set(blocks.map((block) => block.capacity));
  const missing = PHYSICAL_CAPACITY_TYPES.filter((capacity) => !capacities.has(capacity));
  if (blocks.length !== PHYSICAL_CAPACITY_TYPES.length || missing.length) {
    conflicts.push({
      code: 'composition-incomplete',
      message: `A montagem exige as quatro capacidades: ${PHYSICAL_CAPACITY_TYPES.join(', ')}.`,
      severity: 'critical',
      affectedCapacities: missing,
      sourceRefIds: [],
    });
  }

  if (!professorJustification?.trim()) {
    conflicts.push({
      code: 'professor-justification-missing',
      message: 'A justificativa do professor é obrigatória antes da aprovação.',
      severity: 'critical',
      affectedCapacities: [],
      sourceRefIds: [],
    });
  }

  for (const block of blocks) {
    if (block.isCurrent === false || (block.rootStatus !== undefined && block.rootStatus !== 'active')) {
      conflicts.push({
        code: `capacity-version-ineligible:${block.capacity}`,
        message: `A versão selecionada da capacidade ${block.capacity} não é mais a versão vigente e ativa.`,
        severity: 'critical',
        affectedCapacities: [block.capacity],
        sourceRefIds: [],
      });
    }
    for (const alert of block.alerts) {
      const conflict = alertConflict(block.capacity, alert);
      if (conflict) conflicts.push(conflict);
    }
  }

  const unique = new Map<string, ConsolidatedPrescriptionConflict>();
  for (const conflict of conflicts) {
    const key = `${conflict.code}:${conflict.affectedCapacities.join(',')}:${conflict.sourceRefIds.join(',')}`;
    unique.set(key, conflict);
  }
  return Array.from(unique.values());
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
    SELECT * FROM "ConsolidatedPrescription"
    WHERE "contractId" = ${context.contractId} AND "alunoId" = ${context.alunoId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function findAssembly(client: DbClient, context: ConsolidatedPrescriptionContext) {
  const rows = await client.$queryRaw<AssemblyRow[]>`
    SELECT * FROM "ConsolidatedPrescription"
    WHERE "contractId" = ${context.contractId} AND "alunoId" = ${context.alunoId}
    LIMIT 1
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

async function loadAuditRows(client: DbClient, assemblyId: string) {
  return client.$queryRaw<AuditRow[]>`
    SELECT * FROM "ConsolidatedPrescriptionAuditEvent"
    WHERE "assemblyId" = ${assemblyId}
    ORDER BY "createdAt" DESC, "id" DESC
  `;
}

async function mapVersionDetail(
  client: DbClient,
  row: VersionRow
): Promise<ConsolidatedPrescriptionVersionDetail> {
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

function mapAuditRow(row: AuditRow): ConsolidatedPrescriptionAuditEvent {
  return {
    id: row.id,
    assemblyId: row.assemblyId,
    assemblyVersionId: row.assemblyVersionId,
    contractId: row.contractId,
    alunoId: row.alunoId,
    actorProfessorId: row.actorProfessorId,
    action: asAuditAction(row.action),
    previousVersion: row.previousVersion,
    newVersion: row.newVersion,
    previousStatus: row.previousStatus ? asConsolidatedStatus(row.previousStatus) : null,
    newStatus: asConsolidatedStatus(row.newStatus),
    reason: row.reason,
    details: (row.details as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
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
    ) RETURNING *
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

async function recordAudit(
  client: DbClient,
  input: {
    context: ConsolidatedPrescriptionContext;
    assembly: AssemblyRow;
    version: VersionRow;
    action: ConsolidatedPrescriptionAuditAction;
    previousVersion: number | null;
    previousStatus: ConsolidatedPrescriptionStatus | null;
    reason?: string | null;
    details?: Record<string, unknown> | null;
    createdAt: Date;
  }
) {
  const detailsJson = JSON.stringify(input.details ?? null);
  await client.$executeRaw`
    INSERT INTO "ConsolidatedPrescriptionAuditEvent" (
      "id", "assemblyId", "assemblyVersionId", "contractId", "alunoId", "actorProfessorId",
      "action", "previousVersion", "newVersion", "previousStatus", "newStatus", "reason", "details", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${input.assembly.id}, ${input.version.id}, ${input.context.contractId}, ${input.context.alunoId},
      ${input.context.actorProfessorId}, ${input.action}, ${input.previousVersion}, ${input.version.version},
      ${input.previousStatus}, ${input.version.status}, ${input.reason ?? null}, CAST(${detailsJson} AS jsonb), ${input.createdAt}
    )
  `;
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
    WHERE "id" = ${assembly.id} AND "currentVersion" = ${expectedCurrentVersion}
    RETURNING *
  `;
  if (rows.length !== 1) {
    domainError('CONFLICT', 'A montagem foi alterada por outro usuário', { expectedCurrentVersion });
  }
  return rows[0];
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

async function evaluatePersistedComposition(
  client: DbClient,
  context: ConsolidatedPrescriptionContext,
  detail: ConsolidatedPrescriptionVersionDetail
) {
  const ids = detail.capacityBlocks.map((block) => block.capacityPrescriptionVersionId);
  const versions = await client.capacityPrescriptionVersion.findMany({
    where: { id: { in: ids }, contractId: context.contractId, alunoId: context.alunoId },
    include: { alerts: { orderBy: { createdAt: 'asc' } } },
  });
  const roots = await client.capacityPrescription.findMany({
    where: {
      id: { in: versions.map((version) => version.prescriptionId) },
      contractId: context.contractId,
      alunoId: context.alunoId,
    },
    select: { id: true, currentVersion: true, status: true },
  });
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const rootById = new Map<string, CapacityRootState>(roots.map((root) => [root.id, root]));

  const states = detail.capacityBlocks.map((block) => {
    const version = versionById.get(block.capacityPrescriptionVersionId);
    if (!version) {
      return {
        capacity: block.capacity,
        alerts: [],
        isCurrent: false,
        rootStatus: null,
      };
    }
    const root = rootById.get(version.prescriptionId);
    return {
      capacity: block.capacity,
      alerts: version.alerts,
      isCurrent:
        version.status === 'active' &&
        root?.status === 'active' &&
        root.currentVersion === version.version,
      rootStatus: root?.status ?? null,
    };
  });
  return deriveStructuredConflicts(states, detail.professorJustification);
}

function buildConflictReport(
  detail: ConsolidatedPrescriptionVersionDetail,
  conflicts: ConsolidatedPrescriptionConflict[]
): ConsolidatedPrescriptionConflictReport {
  const hasCritical = conflicts.some((conflict) => conflict.severity === 'critical');
  return {
    version: detail.version,
    status: detail.status,
    conflicts,
    hasCritical,
    canUnblock: detail.status === 'blocked' && !hasCritical,
    unavailableChecks: unavailableChecks.map((check) => ({ ...check })),
  };
}

export function createConsolidatedPrescriptionService(client: PrismaClient = prisma) {
  async function persistFromPrevious(input: {
    tx: Prisma.TransactionClient;
    context: ConsolidatedPrescriptionContext;
    current: AssemblyRow;
    previous: ConsolidatedPrescriptionVersionDetail;
    expectedCurrentVersion: number;
    nextStatus: ConsolidatedPrescriptionStatus;
    action: ConsolidatedPrescriptionAuditAction;
    now: Date;
    reason?: string | null;
    conflicts?: ConsolidatedPrescriptionConflict[];
    reviewed?: boolean;
    approved?: boolean;
    clearDecisionMetadata?: boolean;
  }): Promise<ConsolidatedPrescriptionAssembly> {
    const nextAssembly = await advanceAggregate(
      input.tx,
      input.current,
      input.expectedCurrentVersion,
      input.nextStatus,
      input.context.actorProfessorId,
      input.now
    );
    const clear = input.clearDecisionMetadata ?? false;
    const versionRow = await persistVersion(input.tx, {
      assembly: nextAssembly,
      previousVersionId: input.previous.id,
      status: input.nextStatus,
      responsibleProfessorId: input.previous.responsibleProfessorId,
      technicalObservation: input.previous.technicalObservation ?? null,
      professorJustification: input.previous.professorJustification,
      studentInstruction: input.previous.studentInstruction ?? null,
      reviewedByProfessorId: input.reviewed
        ? input.context.actorProfessorId
        : clear
          ? null
          : input.previous.reviewedByProfessorId,
      reviewedAt: input.reviewed
        ? input.now
        : clear
          ? null
          : parseDate(input.previous.reviewedAt, 'Data de revisão'),
      approvedByProfessorId: input.approved
        ? input.context.actorProfessorId
        : clear
          ? null
          : input.previous.approvedByProfessorId,
      approvedAt: input.approved
        ? input.now
        : clear
          ? null
          : parseDate(input.previous.approvedAt, 'Data de aprovação'),
      blockedByProfessorId:
        input.nextStatus === 'blocked'
          ? input.context.actorProfessorId
          : clear
            ? null
            : input.previous.blockedByProfessorId,
      blockedAt:
        input.nextStatus === 'blocked'
          ? input.now
          : clear
            ? null
            : parseDate(input.previous.blockedAt, 'Data de bloqueio'),
      blockReason:
        input.nextStatus === 'blocked'
          ? input.reason ?? 'Bloqueio da montagem consolidada.'
          : clear
            ? null
            : input.previous.blockReason ?? null,
      createdByProfessorId: input.context.actorProfessorId,
      createdAt: input.now,
      capacityBlocks: cloneBlocks(input.previous.capacityBlocks),
      dataRefs: cloneDataRefs(input.previous.dataRefs),
      conflicts: input.conflicts ?? input.previous.conflicts,
    });
    await recordAudit(input.tx, {
      context: input.context,
      assembly: nextAssembly,
      version: versionRow,
      action: input.action,
      previousVersion: input.previous.version,
      previousStatus: input.previous.status,
      reason: input.reason,
      details: {
        criticalConflictCount: (input.conflicts ?? input.previous.conflicts).filter(
          (conflict) => conflict.severity === 'critical'
        ).length,
      },
      createdAt: input.now,
    });
    return {
      ...mapAssembly(nextAssembly),
      latestVersion: await mapVersionDetail(input.tx, versionRow),
    };
  }

  async function blockFromCriticalConflicts(
    tx: Prisma.TransactionClient,
    context: ConsolidatedPrescriptionContext,
    current: AssemblyRow,
    previous: ConsolidatedPrescriptionVersionDetail,
    expectedCurrentVersion: number,
    conflicts: ConsolidatedPrescriptionConflict[],
    now: Date
  ) {
    return persistFromPrevious({
      tx,
      context,
      current,
      previous,
      expectedCurrentVersion,
      nextStatus: 'blocked',
      action: 'blocked_by_conflict',
      reason: 'Bloqueado por impedimento crítico estruturado.',
      conflicts,
      now,
    });
  }

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
        const dataRefs = [...capacitySourceRefs(resolved), ...additionalDataRefs];
        const conflicts = deriveStructuredConflicts(resolved, payload.professorJustification);
        const assemblyId = randomUUID();
        const createdRows = await tx.$queryRaw<AssemblyRow[]>`
          INSERT INTO "ConsolidatedPrescription" (
            "id", "contractId", "alunoId", "currentVersion", "currentStatus",
            "createdByProfessorId", "updatedByProfessorId", "createdAt", "updatedAt"
          ) VALUES (
            ${assemblyId}, ${context.contractId}, ${context.alunoId}, 1, 'draft',
            ${context.actorProfessorId}, ${context.actorProfessorId}, ${now}, ${now}
          ) RETURNING *
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
        await recordAudit(tx, {
          context,
          assembly,
          version: versionRow,
          action: 'created',
          previousVersion: null,
          previousStatus: null,
          details: { criticalConflictCount: conflicts.filter((item) => item.severity === 'critical').length },
          createdAt: now,
        });
        return { ...mapAssembly(assembly), latestVersion: await mapVersionDetail(tx, versionRow) };
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
        const previous = await currentVersionDetail(tx, current);
        if (previous.status === 'approved') {
          domainError('INVALID_TRANSITION', 'Crie uma nova revisão explícita antes de editar uma montagem aprovada');
        }
        if (previous.status === 'released' || previous.status === 'archived') {
          domainError('INVALID_TRANSITION', 'Montagem neste estado não pode receber nova composição');
        }
        const responsibleProfessorId = payload.responsibleProfessorId?.trim() || context.actorProfessorId;
        await assertProfessorInContract(tx, context.contractId, responsibleProfessorId);
        const resolved = await resolveCapacityVersions(tx, context, payload.capacityBlocks);
        const additionalDataRefs = await resolveAdditionalDataRefs(tx, context, payload.dataRefs ?? []);
        const nextStatus: ConsolidatedPrescriptionStatus = previous.status === 'blocked' ? 'blocked' : 'draft';
        const nextAssembly = await advanceAggregate(
          tx,
          current,
          payload.expectedCurrentVersion,
          nextStatus,
          context.actorProfessorId,
          now
        );
        const capacityBlocks = toCapacityBlocks(resolved);
        const dataRefs = [...capacitySourceRefs(resolved), ...additionalDataRefs];
        const conflicts = deriveStructuredConflicts(resolved, payload.professorJustification);
        const versionRow = await persistVersion(tx, {
          assembly: nextAssembly,
          previousVersionId: previous.id,
          status: nextStatus,
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
        await recordAudit(tx, {
          context,
          assembly: nextAssembly,
          version: versionRow,
          action: 'composition_updated',
          previousVersion: previous.version,
          previousStatus: previous.status,
          details: { criticalConflictCount: conflicts.filter((item) => item.severity === 'critical').length },
          createdAt: now,
        });
        return { ...mapAssembly(nextAssembly), latestVersion: await mapVersionDetail(tx, versionRow) };
      });
    },

    async getConflictReport(
      context: ConsolidatedPrescriptionContext
    ): Promise<ConsolidatedPrescriptionConflictReport | null> {
      await assertScope(client, context);
      const assembly = await findAssembly(client, context);
      if (!assembly) return null;
      const detail = await currentVersionDetail(client, assembly);
      const conflicts = await evaluatePersistedComposition(client, context, detail);
      return buildConflictReport(detail, conflicts);
    },

    async recalculateConflicts(
      context: ConsolidatedPrescriptionContext,
      command: ConsolidatedPrescriptionVersionCommand,
      now = new Date()
    ): Promise<{ assembly: ConsolidatedPrescriptionAssembly; report: ConsolidatedPrescriptionConflictReport }> {
      assertExpectedVersion(command.expectedCurrentVersion);
      return client.$transaction(async (tx) => {
        await assertScope(tx, context);
        const current = await findAssemblyForUpdate(tx, context);
        if (!current) domainError('NOT_FOUND', 'Montagem consolidada não encontrada');
        if (current.currentVersion !== command.expectedCurrentVersion) {
          domainError('CONFLICT', 'A montagem foi alterada por outro usuário', {
            expectedCurrentVersion: command.expectedCurrentVersion,
            actualCurrentVersion: current.currentVersion,
          });
        }
        const previous = await currentVersionDetail(tx, current);
        const conflicts = await evaluatePersistedComposition(tx, context, previous);
        const hasCritical = conflicts.some((conflict) => conflict.severity === 'critical');
        if (hasCritical && previous.status !== 'blocked') {
          if (!['draft', 'ready_for_review', 'approved'].includes(previous.status)) {
            domainError('INVALID_TRANSITION', 'O estado atual não permite bloqueio por revalidação');
          }
          const blocked = await blockFromCriticalConflicts(
            tx,
            context,
            current,
            previous,
            command.expectedCurrentVersion,
            conflicts,
            now
          );
          return { assembly: blocked, report: buildConflictReport(blocked.latestVersion, conflicts) };
        }
        const assembly = { ...mapAssembly(current), latestVersion: previous };
        return { assembly, report: buildConflictReport(previous, conflicts) };
      });
    },

    async sendForReview(
      context: ConsolidatedPrescriptionContext,
      command: ConsolidatedPrescriptionVersionCommand,
      now = new Date()
    ) {
      assertExpectedVersion(command.expectedCurrentVersion);
      return client.$transaction(async (tx) => {
        await assertScope(tx, context);
        const current = await findAssemblyForUpdate(tx, context);
        if (!current) domainError('NOT_FOUND', 'Montagem consolidada não encontrada');
        const previous = await currentVersionDetail(tx, current);
        if (previous.status !== 'draft') {
          domainError('INVALID_TRANSITION', 'Somente rascunho pode ser enviado para revisão');
        }
        const conflicts = await evaluatePersistedComposition(tx, context, previous);
        if (conflicts.some((conflict) => conflict.severity === 'critical')) {
          return blockFromCriticalConflicts(
            tx,
            context,
            current,
            previous,
            command.expectedCurrentVersion,
            conflicts,
            now
          );
        }
        return persistFromPrevious({
          tx,
          context,
          current,
          previous,
          expectedCurrentVersion: command.expectedCurrentVersion,
          nextStatus: 'ready_for_review',
          action: 'sent_for_review',
          conflicts,
          reviewed: true,
          now,
        });
      });
    },

    async approve(
      context: ConsolidatedPrescriptionContext,
      command: ConsolidatedPrescriptionVersionCommand,
      now = new Date()
    ) {
      assertExpectedVersion(command.expectedCurrentVersion);
      return client.$transaction(async (tx) => {
        await assertScope(tx, context);
        const current = await findAssemblyForUpdate(tx, context);
        if (!current) domainError('NOT_FOUND', 'Montagem consolidada não encontrada');
        const previous = await currentVersionDetail(tx, current);
        if (previous.status !== 'ready_for_review') {
          domainError('INVALID_TRANSITION', 'Somente montagem pronta para revisão pode ser aprovada');
        }
        const conflicts = await evaluatePersistedComposition(tx, context, previous);
        if (conflicts.some((conflict) => conflict.severity === 'critical')) {
          return blockFromCriticalConflicts(
            tx,
            context,
            current,
            previous,
            command.expectedCurrentVersion,
            conflicts,
            now
          );
        }
        return persistFromPrevious({
          tx,
          context,
          current,
          previous,
          expectedCurrentVersion: command.expectedCurrentVersion,
          nextStatus: 'approved',
          action: 'approved',
          conflicts,
          approved: true,
          now,
        });
      });
    },

    async block(
      context: ConsolidatedPrescriptionContext,
      command: BlockConsolidatedPrescriptionCommand,
      now = new Date()
    ) {
      assertExpectedVersion(command.expectedCurrentVersion);
      assertNonEmpty(command.reason, 'Motivo do bloqueio');
      return client.$transaction(async (tx) => {
        await assertScope(tx, context);
        const current = await findAssemblyForUpdate(tx, context);
        if (!current) domainError('NOT_FOUND', 'Montagem consolidada não encontrada');
        const previous = await currentVersionDetail(tx, current);
        if (!['draft', 'ready_for_review', 'approved'].includes(previous.status)) {
          domainError('INVALID_TRANSITION', 'O estado atual não permite bloqueio');
        }
        const conflicts = await evaluatePersistedComposition(tx, context, previous);
        return persistFromPrevious({
          tx,
          context,
          current,
          previous,
          expectedCurrentVersion: command.expectedCurrentVersion,
          nextStatus: 'blocked',
          action: 'blocked',
          reason: command.reason.trim(),
          conflicts,
          now,
        });
      });
    },

    async unblock(
      context: ConsolidatedPrescriptionContext,
      command: UnblockConsolidatedPrescriptionCommand,
      now = new Date()
    ) {
      assertExpectedVersion(command.expectedCurrentVersion);
      if (!['draft', 'ready_for_review'].includes(command.targetStatus)) {
        domainError('INVALID_INPUT', 'Destino de desbloqueio inválido');
      }
      return client.$transaction(async (tx) => {
        await assertScope(tx, context);
        const current = await findAssemblyForUpdate(tx, context);
        if (!current) domainError('NOT_FOUND', 'Montagem consolidada não encontrada');
        const previous = await currentVersionDetail(tx, current);
        if (previous.status !== 'blocked') {
          domainError('INVALID_TRANSITION', 'Somente montagem bloqueada pode ser desbloqueada');
        }
        const conflicts = await evaluatePersistedComposition(tx, context, previous);
        if (conflicts.some((conflict) => conflict.severity === 'critical')) {
          domainError('INVALID_TRANSITION', 'O impedimento crítico permanece ativo; desbloqueio não permitido');
        }
        return persistFromPrevious({
          tx,
          context,
          current,
          previous,
          expectedCurrentVersion: command.expectedCurrentVersion,
          nextStatus: command.targetStatus,
          action: 'unblocked',
          reason: normalizeOptional(command.reason),
          conflicts,
          reviewed: command.targetStatus === 'ready_for_review',
          clearDecisionMetadata: true,
          now,
        });
      });
    },

    async createRevision(
      context: ConsolidatedPrescriptionContext,
      command: CreateConsolidatedPrescriptionRevisionCommand,
      now = new Date()
    ) {
      assertExpectedVersion(command.expectedCurrentVersion);
      return client.$transaction(async (tx) => {
        await assertScope(tx, context);
        const current = await findAssemblyForUpdate(tx, context);
        if (!current) domainError('NOT_FOUND', 'Montagem consolidada não encontrada');
        const previous = await currentVersionDetail(tx, current);
        if (previous.status !== 'approved') {
          domainError('INVALID_TRANSITION', 'Nova revisão explícita só pode ser criada após aprovação');
        }
        const conflicts = await evaluatePersistedComposition(tx, context, previous);
        return persistFromPrevious({
          tx,
          context,
          current,
          previous,
          expectedCurrentVersion: command.expectedCurrentVersion,
          nextStatus: 'draft',
          action: 'revision_created',
          reason: normalizeOptional(command.reason),
          conflicts,
          clearDecisionMetadata: true,
          now,
        });
      });
    },

    async getCurrent(context: ConsolidatedPrescriptionContext): Promise<ConsolidatedPrescriptionAssembly | null> {
      await assertScope(client, context);
      const assembly = await findAssembly(client, context);
      if (!assembly) return null;
      return { ...mapAssembly(assembly), latestVersion: await currentVersionDetail(client, assembly) };
    },

    async getHistory(context: ConsolidatedPrescriptionContext): Promise<ConsolidatedPrescriptionHistory | null> {
      await assertScope(client, context);
      const assembly = await findAssembly(client, context);
      if (!assembly) return null;
      const [versions, auditRows] = await Promise.all([
        loadVersionRows(client, assembly.id),
        loadAuditRows(client, assembly.id),
      ]);
      return {
        assembly: mapAssembly(assembly),
        versions: await Promise.all(versions.map((version) => mapVersionDetail(client, version))),
        auditEvents: auditRows.map(mapAuditRow),
      };
    },
  };
}

export const consolidatedPrescriptionService = createConsolidatedPrescriptionService();
