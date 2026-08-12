import { createHash, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  AccessDataScope,
  ConsolidatedOperationalProjectionItem,
  ConsolidatedOperationalReleaseResult,
  ConsolidatedReleasePlacement,
  PhysicalCapacityType,
  ReleaseConsolidatedOperationalWorkoutCommand,
} from '@corrida/types';
import {
  canProfessorAccessBlock,
  getEffectiveDataScopeForProfessor,
} from '../access-control/access-control.service.js';
import { readPersistedExerciseMapping } from '../capacity-prescriptions/capacity-exercise-mapping.service.js';
import {
  FLEX_BALANCE_OPERATIONAL_CONTRACT_VERSION,
  type WorkoutDayCapacityOperationalBlock,
} from './consolidated-prescription-flex-balance-operational.js';
import {
  CONSOLIDATED_EXERCISE_SUBSTITUTION_ORIGIN,
  CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN,
} from './consolidated-prescription-operational-integrity.js';
import { deriveStructuredConflicts } from './consolidated-prescription.service.js';

const prisma = new PrismaClient();
export const CONSOLIDATED_RELEASE_BLOCK = 'plans.consolidatedPrescriptions.release';

export type ConsolidatedReleaseErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'INVALID_INPUT';

export class ConsolidatedReleaseDomainError extends Error {
  constructor(
    public readonly code: ConsolidatedReleaseErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ConsolidatedReleaseDomainError';
  }
}

type ReleaseContext = {
  contractId: string;
  alunoId: string;
  actorProfessorId: string;
};

type AssemblyRow = {
  id: string;
  currentVersion: number;
  currentStatus: string;
};

type VersionRow = {
  id: string;
  assemblyId: string;
  contractId: string;
  alunoId: string;
  version: number;
  status: string;
  responsibleProfessorId: string;
  technicalObservation: string | null;
  professorJustification: string;
  studentInstruction: string | null;
  reviewedByProfessorId: string | null;
  reviewedAt: Date | null;
  approvedByProfessorId: string | null;
  approvedAt: Date | null;
  createdByProfessorId: string;
  conflicts: unknown;
};

type CapacityBlockRow = {
  capacityPrescriptionVersionId: string;
  capacity: PhysicalCapacityType;
  capacityVersion: number;
  capacityStatus: string;
  position: number;
};

type DataRefRow = {
  role: string;
  sourceType: string;
  sourceId: string;
  label: string | null;
  assessedAt: Date | null;
  origin: string | null;
  sourceVersion: string | null;
  responsibleProfessorId: string | null;
  context: unknown;
};

type ReleaseRow = {
  id: string;
  assemblyId: string;
  sourceAssemblyVersionId: string;
  sourceAssemblyVersion: number;
  releasedAssemblyVersionId: string;
  releasedAssemblyVersion: number;
  trainingPlanId: string;
  workoutTemplateId: string;
  requestFingerprint: string;
  releasedByProfessorId: string;
  releasedAt: Date;
};

type PreparedProjectionItem = ConsolidatedOperationalProjectionItem & {
  preparedForAssemblyVersion?: number;
};

function fail(code: ConsolidatedReleaseErrorCode, message: string, details?: Record<string, unknown>): never {
  throw new ConsolidatedReleaseDomainError(code, message, details);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseDate(value: string, field: string) {
  const parsed = new Date(value);
  if (!value.trim() || Number.isNaN(parsed.getTime())) fail('INVALID_INPUT', `${field} possui data inválida`);
  return parsed;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)])
  );
}

function stableJsonEquals(left: unknown, right: unknown) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function preparedWorkoutDayCapacityBlock(
  item: PreparedProjectionItem
): WorkoutDayCapacityOperationalBlock | null {
  if (item.capacity !== 'flexibility' && item.capacity !== 'balance') return null;
  const candidate = record(record(item.proposedFields).WorkoutDayCapacityOperationalBlock);
  const parameters = record(candidate.parameters);
  if (
    candidate.contractVersion !== FLEX_BALANCE_OPERATIONAL_CONTRACT_VERSION ||
    candidate.capacity !== item.capacity ||
    candidate.capacityPrescriptionVersionId !== item.capacityPrescriptionVersionId ||
    !Object.keys(parameters).length ||
    !stableJsonEquals(parameters, item.sourceParameters)
  ) {
    fail(
      'CONFLICT',
      `A capacidade ${item.capacity} não possui snapshot operacional estruturado, versionado e íntegro`
    );
  }
  return {
    contractVersion: FLEX_BALANCE_OPERATIONAL_CONTRACT_VERSION,
    capacity: item.capacity,
    capacityPrescriptionVersionId: item.capacityPrescriptionVersionId,
    parameters,
  };
}

export function releaseRequestFingerprint(command: ReleaseConsolidatedOperationalWorkoutCommand) {
  const normalized = {
    expectedCurrentVersion: command.expectedCurrentVersion,
    target: {
      trainingPlanId: command.target.trainingPlanId.trim(),
      mesocycleNumber: command.target.mesocycleNumber,
      weekNumber: command.target.weekNumber,
      weekStartDate: parseDate(command.target.weekStartDate, 'Início da semana').toISOString(),
      placements: command.target.placements
        .map((placement) => ({
          projectionKey: placement.projectionKey.trim(),
          dayOfWeek: placement.dayOfWeek,
          workoutDate: parseDate(placement.workoutDate, 'Data do treino').toISOString(),
          section: placement.section?.trim() || 'principal',
          exerciseOrder: placement.exerciseOrder ?? null,
        }))
        .sort((left, right) =>
          `${left.projectionKey}:${left.dayOfWeek}:${left.section}:${left.exerciseOrder ?? ''}`.localeCompare(
            `${right.projectionKey}:${right.dayOfWeek}:${right.section}:${right.exerciseOrder ?? ''}`
          )
        ),
    },
  };
  return createHash('sha256').update(JSON.stringify(stableValue(normalized))).digest('hex');
}

function projectionItemFromRef(ref: DataRefRow): PreparedProjectionItem | null {
  if (ref.origin !== CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN) return null;
  const context = record(ref.context);
  if (context.kind !== 'operational_projection_v1') return null;
  if (
    typeof context.key !== 'string' ||
    typeof context.capacity !== 'string' ||
    typeof context.capacityPrescriptionVersionId !== 'string' ||
    typeof context.target !== 'string' ||
    typeof context.compatibility !== 'string'
  ) {
    return null;
  }
  return context as unknown as PreparedProjectionItem;
}

function validateCommand(command: ReleaseConsolidatedOperationalWorkoutCommand) {
  if (!Number.isInteger(command.expectedCurrentVersion) || command.expectedCurrentVersion < 1) {
    fail('INVALID_INPUT', 'Versão esperada deve ser um inteiro positivo');
  }
  if (!command.target.trainingPlanId.trim()) fail('INVALID_INPUT', 'Plano de treino alvo é obrigatório');
  if (!Number.isInteger(command.target.mesocycleNumber) || command.target.mesocycleNumber < 1) {
    fail('INVALID_INPUT', 'Mesociclo alvo deve ser um inteiro positivo');
  }
  if (!Number.isInteger(command.target.weekNumber) || command.target.weekNumber < 1) {
    fail('INVALID_INPUT', 'Semana alvo deve ser um inteiro positivo');
  }
  parseDate(command.target.weekStartDate, 'Início da semana');

  const keys = new Set<string>();
  const slots = new Set<string>();
  const dayDates = new Map<number, string>();
  for (const placement of command.target.placements) {
    const key = placement.projectionKey.trim();
    if (!key) fail('INVALID_INPUT', 'Item de projeção é obrigatório em cada posicionamento');
    if (keys.has(key)) fail('INVALID_INPUT', `O item ${key} foi posicionado mais de uma vez`);
    keys.add(key);
    if (!Number.isInteger(placement.dayOfWeek) || placement.dayOfWeek < 1 || placement.dayOfWeek > 7) {
      fail('INVALID_INPUT', 'Dia da semana deve estar entre 1 e 7');
    }
    const workoutDate = parseDate(placement.workoutDate, 'Data do treino').toISOString();
    const knownDate = dayDates.get(placement.dayOfWeek);
    if (knownDate && knownDate !== workoutDate) {
      fail('INVALID_INPUT', `O dia ${placement.dayOfWeek} recebeu datas de treino diferentes`);
    }
    dayDates.set(placement.dayOfWeek, workoutDate);
    if (placement.exerciseOrder !== undefined) {
      if (!Number.isInteger(placement.exerciseOrder) || placement.exerciseOrder < 1) {
        fail('INVALID_INPUT', 'Ordem do exercício deve ser um inteiro positivo');
      }
      const section = placement.section?.trim() || 'principal';
      const slot = `${placement.dayOfWeek}:${section}:${placement.exerciseOrder}`;
      if (slots.has(slot)) fail('INVALID_INPUT', `Mais de um exercício foi posicionado em ${slot}`);
      slots.add(slot);
    }
  }
}

function mergeFields(
  destination: Record<string, unknown>,
  incoming: unknown,
  scope: string,
  allowedKeys: readonly string[]
) {
  const fields = record(incoming);
  const allowed = new Set(allowedKeys);
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.has(key)) {
      fail('INVALID_INPUT', `A projeção operacional contém campo não autorizado em ${scope}.${key}`);
    }
    if (key in destination && JSON.stringify(destination[key]) !== JSON.stringify(value)) {
      fail('CONFLICT', `A projeção operacional propõe valores conflitantes para ${scope}.${key}`);
    }
    destination[key] = value;
  }
}

function hasCritical(conflicts: unknown) {
  return Array.isArray(conflicts) && conflicts.some((item) => record(item).severity === 'critical');
}

async function assertAlunoScope(
  tx: Prisma.TransactionClient,
  context: ReleaseContext,
  scope: AccessDataScope
) {
  const aluno = await tx.aluno.findFirst({
    where: { id: context.alunoId, contractId: context.contractId },
    select: { id: true, professorId: true },
  });
  if (!aluno) fail('NOT_FOUND', 'Recurso não encontrado');
  if (scope === 'contract' || aluno.professorId === context.actorProfessorId) return;
  if (scope !== 'managed' || !aluno.professorId) fail('NOT_FOUND', 'Recurso não encontrado');
  const responsible = await tx.professor.findFirst({
    where: { id: aluno.professorId, contractId: context.contractId },
    select: { responsibleManagerId: true },
  });
  if (responsible?.responsibleManagerId !== context.actorProfessorId) fail('NOT_FOUND', 'Recurso não encontrado');
}

async function assertReleaseAuthority(tx: Prisma.TransactionClient, context: ReleaseContext) {
  const professor = await tx.professor.findFirst({
    where: { id: context.actorProfessorId, contractId: context.contractId },
    include: { collaboratorFunction: true },
  });
  if (!professor) fail('FORBIDDEN', 'Perfil sem permissão para liberar esta montagem');
  if (!(await canProfessorAccessBlock(professor, CONSOLIDATED_RELEASE_BLOCK, tx))) {
    fail('FORBIDDEN', 'Perfil sem permissão para liberar esta montagem');
  }
  const scope = await getEffectiveDataScopeForProfessor(professor, 'plans', tx);
  if (!scope) fail('FORBIDDEN', 'Perfil sem permissão para liberar esta montagem');
  await assertAlunoScope(tx, context, scope);
}

function releaseResult(row: ReleaseRow, idempotent: boolean): ConsolidatedOperationalReleaseResult {
  return {
    releaseId: row.id,
    assemblyId: row.assemblyId,
    sourceAssemblyVersionId: row.sourceAssemblyVersionId,
    sourceAssemblyVersion: row.sourceAssemblyVersion,
    releasedAssemblyVersionId: row.releasedAssemblyVersionId,
    releasedAssemblyVersion: row.releasedAssemblyVersion,
    trainingPlanId: row.trainingPlanId,
    workoutTemplateId: row.workoutTemplateId,
    releasedByProfessorId: row.releasedByProfessorId,
    releasedAt: row.releasedAt.toISOString(),
    idempotent,
  };
}

async function loadExistingRelease(tx: Prisma.TransactionClient, sourceVersionId: string) {
  const rows = await tx.$queryRaw<ReleaseRow[]>`
    SELECT * FROM "ConsolidatedPrescriptionOperationalRelease"
    WHERE "sourceAssemblyVersionId" = ${sourceVersionId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function revalidatePreparedProjection(
  tx: Prisma.TransactionClient,
  context: ReleaseContext,
  blocks: CapacityBlockRow[],
  refs: DataRefRow[]
) {
  const items = refs.map(projectionItemFromRef).filter(Boolean) as PreparedProjectionItem[];
  if (!items.length) fail('CONFLICT', 'A versão aprovada não possui projeção operacional preparada');

  const capacityIds = new Set(blocks.map((block) => block.capacityPrescriptionVersionId));
  for (const block of blocks) {
    if (!items.some((item) => item.capacityPrescriptionVersionId === block.capacityPrescriptionVersionId)) {
      fail('CONFLICT', `A capacidade ${block.capacity} não possui projeção operacional preparada`);
    }
  }
  if (items.some((item) => !capacityIds.has(item.capacityPrescriptionVersionId))) {
    fail('CONFLICT', 'A projeção preparada referencia uma versão de capacidade fora da composição aprovada');
  }
  const incompatible = items.find((item) => item.compatibility !== 'mapped');
  if (incompatible) {
    fail('CONFLICT', incompatible.incompatibilityMessage || 'Existe bloco sem tradução operacional resolvida', {
      projectionKey: incompatible.key,
      incompatibilityCode: incompatible.incompatibilityCode ?? null,
    });
  }

  const substitutions = refs
    .filter((ref) => ref.origin === CONSOLIDATED_EXERCISE_SUBSTITUTION_ORIGIN)
    .map((ref) => record(ref.context))
    .filter((item) => item.kind === 'exercise_substitution_v1');

  for (const item of items) {
    preparedWorkoutDayCapacityBlock(item);
    if (!item.technicalCatalogItemId) continue;
    const technical = await tx.capacityTechnicalCatalogItem.findFirst({
      where: {
        id: item.technicalCatalogItemId,
        contractId: context.contractId,
        category: 'exercise',
        isCurrent: true,
      },
      select: { metadata: true },
    });
    if (!technical) fail('CONFLICT', 'Uma referência técnica de exercício deixou de ser válida');
    const mapping = readPersistedExerciseMapping(technical.metadata);
    if (
      !mapping ||
      mapping.mappingRevision !== item.mappingRevision ||
      mapping.exerciseLibraryId !== item.mappedExerciseLibraryId
    ) {
      fail('CONFLICT', 'O vínculo técnico-operacional foi alterado após a preparação');
    }
    const originalExercise = await tx.exerciseLibrary.findFirst({
      where: { id: mapping.exerciseLibraryId, contractId: context.contractId },
      select: { id: true, updatedAt: true },
    });
    if (
      !originalExercise ||
      originalExercise.updatedAt.toISOString() !== mapping.exerciseSnapshot.updatedAt
    ) {
      fail('CONFLICT', 'O exercício operacional original mudou ou ficou indisponível após o mapeamento');
    }
    const effectiveId = item.effectiveExerciseLibraryId;
    if (!effectiveId) fail('CONFLICT', 'A projeção de exercício não possui ID operacional efetivo');
    if (effectiveId !== mapping.exerciseLibraryId) {
      const substitution = substitutions.find(
        (candidate) =>
          candidate.originalTechnicalCatalogItemId === item.technicalCatalogItemId &&
          candidate.originalExerciseLibraryId === mapping.exerciseLibraryId &&
          candidate.originalMappingRevision === mapping.mappingRevision &&
          candidate.substituteExerciseLibraryId === effectiveId
      );
      if (!substitution) fail('CONFLICT', 'A substituição operacional preparada não pertence à versão aprovada');
    }
    const exercise = await tx.exerciseLibrary.findFirst({
      where: { id: effectiveId, contractId: context.contractId },
      select: { id: true, updatedAt: true },
    });
    if (!exercise || exercise.updatedAt.toISOString() !== item.operationalExerciseUpdatedAt) {
      fail('CONFLICT', 'Um exercício operacional mudou ou ficou indisponível após a preparação');
    }
  }
  return items;
}

async function revalidateCapacityBlocks(
  tx: Prisma.TransactionClient,
  context: ReleaseContext,
  source: VersionRow,
  blocks: CapacityBlockRow[]
) {
  const ids = blocks.map((block) => block.capacityPrescriptionVersionId);
  const versions = await tx.capacityPrescriptionVersion.findMany({
    where: { id: { in: ids }, contractId: context.contractId, alunoId: context.alunoId },
    include: { alerts: { orderBy: { createdAt: 'asc' } } },
  });
  if (versions.length !== ids.length) fail('CONFLICT', 'Uma versão de capacidade deixou de pertencer ao aluno e contrato');
  const roots = await tx.capacityPrescription.findMany({
    where: {
      id: { in: versions.map((version) => version.prescriptionId) },
      contractId: context.contractId,
      alunoId: context.alunoId,
    },
    select: { id: true, currentVersion: true, status: true },
  });
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const rootById = new Map(roots.map((root) => [root.id, root]));
  const states = blocks.map((block) => {
    const version = versionById.get(block.capacityPrescriptionVersionId);
    if (!version) fail('CONFLICT', 'Versão de capacidade não encontrada');
    const root = rootById.get(version.prescriptionId);
    if (
      version.capacity !== block.capacity ||
      version.version !== block.capacityVersion ||
      version.status !== block.capacityStatus
    ) {
      fail('CONFLICT', 'A referência da capacidade não corresponde mais ao snapshot aprovado');
    }
    return {
      capacity: block.capacity,
      alerts: version.alerts,
      isCurrent: version.status === 'active' && root?.status === 'active' && root.currentVersion === version.version,
      rootStatus: root?.status ?? null,
    };
  });
  const conflicts = deriveStructuredConflicts(states, source.professorJustification);
  if (conflicts.some((conflict) => conflict.severity === 'critical')) {
    fail('CONFLICT', 'A montagem possui impedimento crítico ativo e precisa ser revisada antes da liberação', {
      conflicts,
    });
  }
  return conflicts;
}

async function createReleasedVersion(
  tx: Prisma.TransactionClient,
  context: ReleaseContext,
  assembly: AssemblyRow,
  source: VersionRow,
  blocks: CapacityBlockRow[],
  refs: DataRefRow[],
  conflicts: unknown,
  now: Date
) {
  const releasedVersion = source.version + 1;
  const updated = await tx.$executeRaw`
    UPDATE "ConsolidatedPrescription"
    SET "currentVersion" = ${releasedVersion},
        "currentStatus" = 'released',
        "updatedByProfessorId" = ${context.actorProfessorId},
        "updatedAt" = ${now}
    WHERE "id" = ${assembly.id} AND "currentVersion" = ${source.version} AND "currentStatus" = 'approved'
  `;
  if (updated !== 1) fail('CONFLICT', 'A montagem foi alterada por outra operação');

  const releasedVersionId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "ConsolidatedPrescriptionVersion" (
      "id", "assemblyId", "contractId", "alunoId", "version", "previousVersionId", "status",
      "responsibleProfessorId", "technicalObservation", "professorJustification", "studentInstruction",
      "reviewedByProfessorId", "reviewedAt", "approvedByProfessorId", "approvedAt",
      "blockedByProfessorId", "blockedAt", "blockReason", "createdByProfessorId", "conflicts", "createdAt"
    ) VALUES (
      ${releasedVersionId}, ${assembly.id}, ${context.contractId}, ${context.alunoId}, ${releasedVersion}, ${source.id}, 'released',
      ${source.responsibleProfessorId}, ${source.technicalObservation}, ${source.professorJustification}, ${source.studentInstruction},
      ${source.reviewedByProfessorId}, ${source.reviewedAt}, ${source.approvedByProfessorId}, ${source.approvedAt},
      NULL, NULL, NULL, ${context.actorProfessorId}, CAST(${JSON.stringify(conflicts)} AS jsonb), ${now}
    )
  `;

  for (const block of blocks) {
    await tx.$executeRaw`
      INSERT INTO "ConsolidatedPrescriptionCapacityBlock" (
        "id", "assemblyVersionId", "contractId", "alunoId", "capacityPrescriptionVersionId",
        "capacity", "capacityVersion", "capacityStatus", "position", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${releasedVersionId}, ${context.contractId}, ${context.alunoId},
        ${block.capacityPrescriptionVersionId}, ${block.capacity}, ${block.capacityVersion}, ${block.capacityStatus},
        ${block.position}, ${now}
      )
    `;
  }

  for (const ref of refs) {
    await tx.$executeRaw`
      INSERT INTO "ConsolidatedPrescriptionDataRef" (
        "id", "assemblyVersionId", "role", "sourceType", "sourceId", "label", "assessedAt",
        "origin", "sourceVersion", "responsibleProfessorId", "context", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${releasedVersionId}, ${ref.role}, ${ref.sourceType}, ${ref.sourceId}, ${ref.label}, ${ref.assessedAt},
        ${ref.origin}, ${ref.sourceVersion}, ${ref.responsibleProfessorId},
        CAST(${JSON.stringify(ref.context ?? null)} AS jsonb), ${now}
      )
    `;
  }
  return { releasedVersionId, releasedVersion };
}

async function applyOperationalProjection(
  tx: Prisma.TransactionClient,
  context: ReleaseContext,
  command: ReleaseConsolidatedOperationalWorkoutCommand,
  items: PreparedProjectionItem[]
) {
  const plan = await tx.trainingPlan.findFirst({
    where: {
      id: command.target.trainingPlanId,
      alunoId: context.alunoId,
      aluno: { contractId: context.contractId },
      professor: { contractId: context.contractId },
    },
    select: { id: true },
  });
  if (!plan) fail('NOT_FOUND', 'Recurso não encontrado');

  const templateFields: Record<string, unknown> = {};
  const dayFields = new Map<number, Record<string, unknown>>();
  const capacityBlocksByDay = new Map<number, WorkoutDayCapacityOperationalBlock[]>();
  const placementByKey = new Map(command.target.placements.map((placement) => [placement.projectionKey.trim(), placement]));
  const placementsByDay = new Map<number, ConsolidatedReleasePlacement[]>();
  for (const placement of command.target.placements) {
    const entries = placementsByDay.get(placement.dayOfWeek) ?? [];
    entries.push(placement);
    placementsByDay.set(placement.dayOfWeek, entries);
  }

  const desiredExerciseSlotsByDay = new Map<number, Set<string>>();
  for (const item of items) {
    mergeFields(
      templateFields,
      record(item.proposedFields).WorkoutTemplate,
      'WorkoutTemplate',
      ['trainingMethod', 'trainingDivision', 'repReserve', 'totalVolumeKm']
    );
    if (item.target === 'WorkoutDay' || item.target === 'WorkoutExercise') {
      const placement = placementByKey.get(item.key);
      if (!placement) fail('INVALID_INPUT', `Defina o posicionamento operacional do item ${item.key}`);
      if (item.target === 'WorkoutDay') {
        const target = dayFields.get(placement.dayOfWeek) ?? {};
        mergeFields(
          target,
          record(item.proposedFields).WorkoutDay,
          `WorkoutDay(${placement.dayOfWeek})`,
          ['method', 'vo2maxPct', 'stimulusDurationMin', 'detailNotes', 'complementNotes']
        );
        dayFields.set(placement.dayOfWeek, target);
        const operationalBlock = preparedWorkoutDayCapacityBlock(item);
        if (operationalBlock) {
          const blocks = capacityBlocksByDay.get(placement.dayOfWeek) ?? [];
          if (blocks.some((block) => block.capacity === operationalBlock.capacity)) {
            fail('CONFLICT', `A capacidade ${operationalBlock.capacity} foi posicionada mais de uma vez no mesmo dia`);
          }
          blocks.push(operationalBlock);
          capacityBlocksByDay.set(placement.dayOfWeek, blocks);
        }
      }
      if (item.target === 'WorkoutExercise') {
        if (placement.exerciseOrder === undefined) {
          fail('INVALID_INPUT', `Defina seção e ordem para o exercício ${item.key}`);
        }
        const section = placement.section?.trim() || 'principal';
        const slots = desiredExerciseSlotsByDay.get(placement.dayOfWeek) ?? new Set<string>();
        slots.add(`${section}:${placement.exerciseOrder}`);
        desiredExerciseSlotsByDay.set(placement.dayOfWeek, slots);
      }
    }
  }
  const extraPlacement = command.target.placements.find((placement) => !items.some((item) => item.key === placement.projectionKey.trim()));
  if (extraPlacement) fail('INVALID_INPUT', `O posicionamento ${extraPlacement.projectionKey} não pertence à projeção aprovada`);

  const existing = await tx.workoutTemplate.findUnique({
    where: {
      planId_mesocycleNumber_weekNumber: {
        planId: plan.id,
        mesocycleNumber: command.target.mesocycleNumber,
        weekNumber: command.target.weekNumber,
      },
    },
    include: {
      workoutDays: {
        include: { exercises: { include: { executions: { select: { id: true }, take: 1 } } } },
      },
    },
  });
  if (existing) {
    const started = existing.workoutDays.some(
      (day) =>
        day.status !== 'planned' ||
        Boolean(day.startedAt || day.finishedAt) ||
        day.exercises.some((exercise) => exercise.executions.length > 0)
    );
    if (started) fail('CONFLICT', 'O treino alvo já foi iniciado ou executado e não pode ser reescrito');
    if (existing.released) fail('CONFLICT', 'O treino alvo já está liberado por outra origem e não pode ser substituído silenciosamente');
    const linked = await tx.$queryRaw<Array<{ sourceAssemblyVersionId: string }>>`
      SELECT "sourceAssemblyVersionId" FROM "ConsolidatedPrescriptionOperationalRelease"
      WHERE "workoutTemplateId" = ${existing.id}
      LIMIT 1
    `;
    if (linked.length) fail('CONFLICT', 'O treino alvo já está vinculado a outra versão consolidada');

    const desiredDays = new Set(placementsByDay.keys());
    for (const day of existing.workoutDays) {
      if (!desiredDays.has(day.dayOfWeek)) {
        if (day.exercises.length) {
          await tx.workoutExercise.deleteMany({ where: { workoutDayId: day.id } });
        }
        await tx.workoutDay.delete({ where: { id: day.id } });
        continue;
      }
      const desiredSlots = desiredExerciseSlotsByDay.get(day.dayOfWeek) ?? new Set<string>();
      const staleExerciseIds = day.exercises
        .filter((exercise) => !desiredSlots.has(`${exercise.section}:${exercise.exerciseOrder}`))
        .map((exercise) => exercise.id);
      if (staleExerciseIds.length) {
        await tx.workoutExercise.deleteMany({ where: { id: { in: staleExerciseIds } } });
      }
    }
  }

  const weekStartDate = parseDate(command.target.weekStartDate, 'Início da semana');
  const template = existing
    ? await tx.workoutTemplate.update({
        where: { id: existing.id },
        data: {
          weekStartDate,
          trainingMethod: (templateFields.trainingMethod as string | undefined) ?? null,
          trainingDivision: (templateFields.trainingDivision as string | undefined) ?? null,
          repReserve: (templateFields.repReserve as number | undefined) ?? null,
          totalVolumeKm: (templateFields.totalVolumeKm as number | undefined) ?? null,
        },
      })
    : await tx.workoutTemplate.create({
        data: {
          planId: plan.id,
          mesocycleNumber: command.target.mesocycleNumber,
          weekNumber: command.target.weekNumber,
          weekStartDate,
          trainingMethod: templateFields.trainingMethod as string | undefined,
          trainingDivision: templateFields.trainingDivision as string | undefined,
          repReserve: templateFields.repReserve as number | undefined,
          totalVolumeKm: templateFields.totalVolumeKm as number | undefined,
          released: false,
          releasedAt: null,
        },
      });

  const dayIds = new Map<number, string>();
  for (const [dayOfWeek, placements] of placementsByDay) {
    const workoutDate = parseDate(placements[0].workoutDate, 'Data do treino');
    const existingDay = existing?.workoutDays.find((day) => day.dayOfWeek === dayOfWeek) ?? null;
    const fields = dayFields.get(dayOfWeek) ?? {};
    const day = existingDay
      ? await tx.workoutDay.update({
          where: { id: existingDay.id },
          data: {
            workoutDate,
            method: (fields.method as string | undefined) ?? null,
            vo2maxPct: (fields.vo2maxPct as number | undefined) ?? null,
            stimulusDurationMin: (fields.stimulusDurationMin as number | undefined) ?? null,
            detailNotes: (fields.detailNotes as string | undefined) ?? null,
            complementNotes: (fields.complementNotes as string | undefined) ?? null,
          },
        })
      : await tx.workoutDay.create({
          data: {
            templateId: template.id,
            dayOfWeek,
            workoutDate,
            method: fields.method as string | undefined,
            vo2maxPct: fields.vo2maxPct as number | undefined,
            stimulusDurationMin: fields.stimulusDurationMin as number | undefined,
            detailNotes: fields.detailNotes as string | undefined,
            complementNotes: fields.complementNotes as string | undefined,
          },
        });
    dayIds.set(dayOfWeek, day.id);

    for (const block of capacityBlocksByDay.get(dayOfWeek) ?? []) {
      await tx.$executeRaw`
        INSERT INTO "WorkoutDayCapacityOperationalBlock" (
          "id", "workoutDayId", "capacityPrescriptionVersionId", "capacity",
          "contractVersion", "parameters", "createdAt"
        ) VALUES (
          ${randomUUID()}, ${day.id}, ${block.capacityPrescriptionVersionId}, ${block.capacity},
          ${block.contractVersion}, CAST(${JSON.stringify(block.parameters)} AS jsonb), CURRENT_TIMESTAMP
        )
      `;
    }
  }

  for (const item of items.filter((candidate) => candidate.target === 'WorkoutExercise')) {
    const placement = placementByKey.get(item.key)!;
    const workoutDayId = dayIds.get(placement.dayOfWeek)!;
    const section = placement.section?.trim() || 'principal';
    const exerciseOrder = placement.exerciseOrder!;
    const exerciseId = item.effectiveExerciseLibraryId;
    if (!exerciseId) fail('CONFLICT', `O item ${item.key} não possui exercício operacional efetivo`);
    const matches = await tx.workoutExercise.findMany({
      where: { workoutDayId, section, exerciseOrder },
      select: { id: true },
      take: 2,
    });
    if (matches.length > 1) fail('CONFLICT', `O treino alvo possui posição ambígua em ${section}/${exerciseOrder}`);
    const fields: Record<string, unknown> = {};
    mergeFields(fields, record(item.proposedFields).WorkoutExercise, 'WorkoutExercise', ['sets', 'reps']);
    const exerciseData = {
      exerciseId,
      sets: (fields.sets as number | undefined) ?? null,
      reps: (fields.reps as number | undefined) ?? null,
    };
    if (matches[0]) {
      await tx.workoutExercise.update({
        where: { id: matches[0].id },
        data: exerciseData,
      });
    } else {
      await tx.workoutExercise.create({
        data: {
          workoutDayId,
          ...exerciseData,
          section,
          exerciseOrder,
        },
      });
    }
  }
  return template.id;
}

export function createConsolidatedPrescriptionReleaseService(client: PrismaClient = prisma) {
  return {
    async release(
      context: ReleaseContext,
      command: ReleaseConsolidatedOperationalWorkoutCommand,
      now = new Date()
    ): Promise<ConsolidatedOperationalReleaseResult> {
      validateCommand(command);
      const requestFingerprint = releaseRequestFingerprint(command);
      try {
        return await client.$transaction(
          async (tx) => {
            await assertReleaseAuthority(tx, context);
            const assemblies = await tx.$queryRaw<AssemblyRow[]>`
              SELECT "id", "currentVersion", "currentStatus"
              FROM "ConsolidatedPrescription"
              WHERE "contractId" = ${context.contractId} AND "alunoId" = ${context.alunoId}
              FOR UPDATE
            `;
            const assembly = assemblies[0];
            if (!assembly) fail('NOT_FOUND', 'Recurso não encontrado');

            const sourceRows = await tx.$queryRaw<VersionRow[]>`
              SELECT * FROM "ConsolidatedPrescriptionVersion"
              WHERE "assemblyId" = ${assembly.id} AND "version" = ${command.expectedCurrentVersion}
              LIMIT 1
            `;
            const source = sourceRows[0];
            if (!source) fail('CONFLICT', 'A versão informada não existe nesta montagem');

            const priorRelease = await loadExistingRelease(tx, source.id);
            if (priorRelease) {
              if (priorRelease.requestFingerprint !== requestFingerprint) {
                fail('CONFLICT', 'Esta versão já foi liberada para outro alvo operacional');
              }
              return releaseResult(priorRelease, true);
            }

            if (assembly.currentVersion !== command.expectedCurrentVersion || assembly.currentStatus !== 'approved' || source.status !== 'approved') {
              fail('CONFLICT', 'Somente a versão aprovada e atualmente vigente pode ser liberada', {
                expectedCurrentVersion: command.expectedCurrentVersion,
                actualCurrentVersion: assembly.currentVersion,
                actualStatus: assembly.currentStatus,
              });
            }
            if (!source.approvedByProfessorId || !source.approvedAt) {
              fail('CONFLICT', 'A versão não possui evidência persistida de aprovação');
            }
            const approver = await tx.professor.findFirst({
              where: { id: source.approvedByProfessorId, contractId: context.contractId },
              select: { id: true },
            });
            if (!approver) {
              fail('CONFLICT', 'A aprovação persistida não corresponde a um ator do contrato');
            }
            if (hasCritical(source.conflicts)) {
              fail('CONFLICT', 'A versão aprovada registra impedimento crítico e não pode ser liberada');
            }

            const blocks = await tx.$queryRaw<CapacityBlockRow[]>`
              SELECT "capacityPrescriptionVersionId", "capacity", "capacityVersion", "capacityStatus", "position"
              FROM "ConsolidatedPrescriptionCapacityBlock"
              WHERE "assemblyVersionId" = ${source.id}
              ORDER BY "position" ASC
            `;
            const refs = await tx.$queryRaw<DataRefRow[]>`
              SELECT "role", "sourceType", "sourceId", "label", "assessedAt", "origin",
                     "sourceVersion", "responsibleProfessorId", "context"
              FROM "ConsolidatedPrescriptionDataRef"
              WHERE "assemblyVersionId" = ${source.id}
              ORDER BY "createdAt" ASC, "id" ASC
            `;
            const conflicts = await revalidateCapacityBlocks(tx, context, source, blocks);
            const items = await revalidatePreparedProjection(tx, context, blocks, refs);
            const workoutTemplateId = await applyOperationalProjection(tx, context, command, items);
            const released = await createReleasedVersion(tx, context, assembly, source, blocks, refs, conflicts, now);
            const releaseId = randomUUID();
            await tx.$executeRaw`
              INSERT INTO "ConsolidatedPrescriptionOperationalRelease" (
                "id", "assemblyId", "sourceAssemblyVersionId", "sourceAssemblyVersion",
                "releasedAssemblyVersionId", "releasedAssemblyVersion", "contractId", "alunoId",
                "trainingPlanId", "workoutTemplateId", "requestFingerprint",
                "releasedByProfessorId", "releasedAt", "createdAt"
              ) VALUES (
                ${releaseId}, ${assembly.id}, ${source.id}, ${source.version},
                ${released.releasedVersionId}, ${released.releasedVersion}, ${context.contractId}, ${context.alunoId},
                ${command.target.trainingPlanId}, ${workoutTemplateId}, ${requestFingerprint},
                ${context.actorProfessorId}, ${now}, ${now}
              )
            `;
            await tx.workoutTemplate.update({
              where: { id: workoutTemplateId },
              data: { released: true, releasedAt: now },
            });
            const row: ReleaseRow = {
              id: releaseId,
              assemblyId: assembly.id,
              sourceAssemblyVersionId: source.id,
              sourceAssemblyVersion: source.version,
              releasedAssemblyVersionId: released.releasedVersionId,
              releasedAssemblyVersion: released.releasedVersion,
              trainingPlanId: command.target.trainingPlanId,
              workoutTemplateId,
              requestFingerprint,
              releasedByProfessorId: context.actorProfessorId,
              releasedAt: now,
            };
            return releaseResult(row, false);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        if (error instanceof ConsolidatedReleaseDomainError) throw error;
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2034' || error.code === 'P2002') {
            fail('CONFLICT', 'A liberação concorreu com outra operação; recarregue o estado atual');
          }
        }
        throw error;
      }
    },
  };
}

export const consolidatedPrescriptionReleaseService = createConsolidatedPrescriptionReleaseService();
