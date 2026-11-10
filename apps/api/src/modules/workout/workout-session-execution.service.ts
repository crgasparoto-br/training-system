import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  TrainingSessionExecutionItemValue,
  TrainingSessionExecutionSessionValues,
  TrainingSessionExecutionSessionValuesPatch,
  TrainingSessionExecutionStatus,
  TrainingSessionExecutionTransitionPayload,
  TrainingSessionExecutionValuesPayload,
  TrainingSessionExecutionView,
  GuidedResistanceCompletePayload,
  GuidedResistanceView,
  GuidedResistanceRestActionPayload,
  GuidedCyclicActionPayload,
  GuidedCyclicView,
  GuidedCyclicCursor,
  TrainingSessionCyclicStageExecutionValue,
} from '@corrida/types';
import { deriveGuidedResistancePlan, matchesCurrentGuidedUnit, projectGuidedResistance } from './guided-resistance.domain.js';
import { canCompleteGuidedCyclic, deriveGuidedCyclicPlan, projectGuidedCyclic } from './guided-cyclic.domain.js';
import { MAX_CYCLIC_STAGE_EXECUTION_RECORDS } from './cyclic-stages.domain.js';
import { prescribedRestAfter, projectResistanceRest, measuredRestMs } from './resistance-rest.domain.js';
import { projectReleasedExerciseCatalog } from './workout-release-catalog.js';
import { persistWorkoutSessionValues, WorkoutSessionExecutionInputError } from './workout-session-execution-values.js';
import { captureWorkoutComparisonPlan, workoutComparisonPlanSelect } from './workout-session-comparison.domain.js';
export { WorkoutSessionExecutionInputError } from './workout-session-execution-values.js';
import {
  assertWorkoutSessionTransition,
  TERMINAL_EXECUTION_STATUSES,
  WorkoutSessionExecutionTransitionError,
} from './workout-session-execution.domain.js';

const prisma = new PrismaClient();

/** The read/write boundary always takes its exercise and set identities from this query. */
async function loadGuidedResistancePlan(tx: Prisma.TransactionClient, sessionId: string) {
  const exercises = await tx.workoutExercise.findMany({
    where: { workoutDayId: sessionId },
    select: {
      id: true, section: true, exerciseOrder: true, system: true, groupBreakBefore: true,
      exerciseNotes: true,
      exercise: { select: { name: true, videoUrl: true, notes: true,
        mediaOrigin: true, mediaLicense: true, legacyGrandfathered: true } },
      releasedCatalog: { select: { catalog: true } },
      resistanceBlocks: {
        orderBy: { position: 'asc' },
        select: {
          position: true, kind: true, notes: true,
          plannedSets: {
            orderBy: { position: 'asc' },
            select: {
              id: true, position: true, repsMin: true, repsMax: true,
              loadKg: true, loadPercent: true, rir: true, rpe: true,
              tempo: true, restSec: true, notes: true,
            },
          },
        },
      },
    },
  });
  const groups = await tx.workoutResistanceGroup.findMany({
    where: { workoutDayId: sessionId },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: {
      id: true, position: true, kind: true, rounds: true,
      restBetweenExercisesSec: true, restBetweenRoundsSec: true, notes: true,
      members: {
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { position: true, workoutExerciseId: true },
      },
    },
  });
  // #400 freezes catalog presentation at release; guided execution must read
  // that same snapshot instead of a mutable ExerciseLibrary row.
  return deriveGuidedResistancePlan(exercises.map(({ releasedCatalog, ...item }) => ({
    ...item,
    exercise: projectReleasedExerciseCatalog(item.exercise, releasedCatalog),
  })), groups);
}

/** Read #398's immutable released plan directly, including stable child IDs. */
async function loadGuidedCyclicPlan(tx: Prisma.TransactionClient, sessionId: string) {
  const stages = await tx.workoutCyclicStage.findMany({
    where: { workoutDayId: sessionId, parentStageId: null },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    include: { children: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
  });
  return deriveGuidedCyclicPlan(stages.map((stage) => ({
    ...stage,
    children: stage.children.map((child) => ({ ...child, children: [] })),
  })));
}

type LockedReleasedSession = {
  id: string;
  legacyStatus: 'planned' | 'in_progress' | 'completed';
  workoutTemplateId: string;
  trainingPlanId: string;
  releaseId: string;
};


export class WorkoutSessionExecutionNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'WORKOUT_SESSION_EXECUTION_SESSION_NOT_FOUND';
}

export class WorkoutSessionExecutionConflictError extends Error {
  readonly statusCode = 409;
  constructor(
    message: string,
    readonly code:
      | 'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT'
      | 'WORKOUT_SESSION_EXECUTION_IDEMPOTENCY_CONFLICT'
      | 'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION'
      | 'WORKOUT_SESSION_EXECUTION_INCOMPATIBLE_OUTCOME'
  ) {
    super(message);
  }
}

function normalizeText(value: string | null | undefined, max: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new WorkoutSessionExecutionInputError(`Texto excede o limite de ${max} caracteres.`);
  return normalized;
}


const COMPARABLE_OUTCOMES = new Set(['full', 'partial', 'substituted', 'not_performed']);

function normalizeOutcome(value: string | undefined): 'full' | 'partial' | 'substituted' | 'not_performed' | undefined {
  if (value === undefined) return undefined;
  if (!COMPARABLE_OUTCOMES.has(value)) throw new WorkoutSessionExecutionInputError('Situação da unidade executada inválida.');
  return value as 'full' | 'partial' | 'substituted' | 'not_performed';
}

function checkNumber(value: number | null | undefined, label: string, options: { integer?: boolean; max?: number } = {}) {
  if (value !== undefined && value !== null
      && (!Number.isFinite(value) || value < 0 || (options.integer && !Number.isInteger(value))
        || (options.max !== undefined && value > options.max))) {
    throw new WorkoutSessionExecutionInputError(`${label} inválido.`);
  }
  return value;
}

function normalizeSessionValues(values: TrainingSessionExecutionSessionValuesPatch | undefined): TrainingSessionExecutionSessionValuesPatch | undefined {
  if (!values) return undefined;
  const normalized: TrainingSessionExecutionSessionValuesPatch = {};
  if (values.durationSec !== undefined) {
    if (values.durationSec !== null && (!Number.isInteger(values.durationSec) || values.durationSec < 0)) throw new WorkoutSessionExecutionInputError('Tempo executado deve ser informado em segundos inteiros não negativos.');
    normalized.durationSec = values.durationSec;
  }
  if (values.distanceKm !== undefined) {
    if (values.distanceKm !== null && (!Number.isFinite(values.distanceKm) || values.distanceKm < 0)) throw new WorkoutSessionExecutionInputError('Distância executada inválida.');
    normalized.distanceKm = values.distanceKm;
  }
  if (values.pace !== undefined) normalized.pace = normalizeText(values.pace, 32);
  if (values.speedKmh !== undefined) {
    normalized.speedKmh = checkNumber(values.speedKmh, 'Velocidade executada');
  }
  if (values.heartRateBpm !== undefined) {
    if (values.heartRateBpm !== null && (!Number.isInteger(values.heartRateBpm) || values.heartRateBpm < 0 || values.heartRateBpm > 260)) throw new WorkoutSessionExecutionInputError('Frequência cardíaca executada inválida.');
    normalized.heartRateBpm = values.heartRateBpm;
  }
  if (values.heartRateZone !== undefined) normalized.heartRateZone = normalizeText(values.heartRateZone, 32);
  if (values.cyclicStages !== undefined) {
    if (!Array.isArray(values.cyclicStages) || values.cyclicStages.length > MAX_CYCLIC_STAGE_EXECUTION_RECORDS) {
      throw new WorkoutSessionExecutionInputError('Quantidade de etapas executadas inválida.');
    }
    const keys = new Set<string>();
    normalized.cyclicStages = values.cyclicStages.map((entry) => {
      const plannedStageId = entry.plannedStageId?.trim();
      const iteration = entry.iteration ?? 1;
      if (!plannedStageId || !Number.isInteger(iteration) || iteration < 1 || iteration > 100) {
        throw new WorkoutSessionExecutionInputError('Etapa planejada ou repetição inválida.');
      }
      const key = `${plannedStageId}:${iteration}`;
      if (keys.has(key)) throw new WorkoutSessionExecutionInputError('Etapa/repetição executada duplicada.');
      keys.add(key);
      const outcome = normalizeOutcome(entry.outcome);
      if (!outcome) throw new WorkoutSessionExecutionInputError('Situação da etapa obrigatória.');
      // A patch can omit the original substitution text; the merged record is
      // validated after reading durable state in the same transaction.
      const substitutionNote = normalizeText(entry.substitutionNote, 500);
      if (outcome !== 'substituted' && substitutionNote) {
        throw new WorkoutSessionExecutionInputError('Substituição só pode ser informada quando a unidade foi substituída.');
      }
      return {
        plannedStageId, iteration, outcome, substitutionNote,
        durationSec: checkNumber(entry.durationSec, 'Duração da etapa', { integer: true }),
        distanceMeters: checkNumber(entry.distanceMeters, 'Distância da etapa'),
        paceMinPerKm: checkNumber(entry.paceMinPerKm, 'Ritmo da etapa'),
        speedKmh: checkNumber(entry.speedKmh, 'Velocidade da etapa'),
        heartRateBpm: checkNumber(entry.heartRateBpm, 'Frequência cardíaca da etapa', { integer: true, max: 260 }),
        heartRateZone: normalizeText(entry.heartRateZone, 32),
        pse: checkNumber(entry.pse, 'PSE da etapa', { max: 10 }),
      };
    });
  }
  if (values.removeCyclicStages !== undefined) {
    if (!Array.isArray(values.removeCyclicStages) || values.removeCyclicStages.length > MAX_CYCLIC_STAGE_EXECUTION_RECORDS) {
      throw new WorkoutSessionExecutionInputError('Quantidade de etapas removidas inválida.');
    }
    const keys = new Set<string>();
    const upsertedKeys = new Set((normalized.cyclicStages ?? []).map(
      (item) => `${item.plannedStageId}:${item.iteration ?? 1}`,
    ));
    normalized.removeCyclicStages = values.removeCyclicStages.map((entry) => {
      const plannedStageId = typeof entry?.plannedStageId === 'string' ? entry.plannedStageId.trim() : '';
      const iteration = entry?.iteration ?? 1;
      if (!plannedStageId || !Number.isInteger(iteration) || iteration < 1 || iteration > 100) {
        throw new WorkoutSessionExecutionInputError('Etapa ou repetição para remoção inválida.');
      }
      const key = `${plannedStageId}:${iteration}`;
      if (keys.has(key) || upsertedKeys.has(key)) {
        throw new WorkoutSessionExecutionInputError('Etapa/repetição duplicada ou enviada simultaneamente para registro e remoção.');
      }
      keys.add(key);
      return { plannedStageId, iteration };
    });
  }
  if (values.resistanceGroups !== undefined) {
    if (!Array.isArray(values.resistanceGroups) || values.resistanceGroups.length > 100) {
      throw new WorkoutSessionExecutionInputError('Quantidade de agrupamentos executados inválida.');
    }
    const ids = new Set<string>();
    normalized.resistanceGroups = values.resistanceGroups.map((entry) => {
      const plannedGroupId = entry.plannedGroupId?.trim();
      if (!plannedGroupId || ids.has(plannedGroupId)) {
        throw new WorkoutSessionExecutionInputError('Agrupamento planejado inválido ou duplicado.');
      }
      ids.add(plannedGroupId);
      const outcome = normalizeOutcome(entry.outcome);
      if (!outcome) throw new WorkoutSessionExecutionInputError('Situação do agrupamento obrigatória.');
      const substitutionNote = normalizeText(entry.substitutionNote, 500);
      if (outcome !== 'substituted' && substitutionNote) {
        throw new WorkoutSessionExecutionInputError('Substituição só pode ser informada quando a unidade foi substituída.');
      }
      return {
        plannedGroupId, outcome, substitutionNote,
        roundsCompleted: checkNumber(entry.roundsCompleted, 'Rodadas realizadas', { integer: true }),
        restBetweenExercisesSec: checkNumber(entry.restBetweenExercisesSec, 'Descanso entre exercícios', { integer: true, max: 86400 }),
        restBetweenRoundsSec: checkNumber(entry.restBetweenRoundsSec, 'Descanso entre rodadas', { integer: true, max: 86400 }),
      };
    });
  }
  if (values.removeResistanceGroups !== undefined) {
    if (!Array.isArray(values.removeResistanceGroups) || values.removeResistanceGroups.length > 100) {
      throw new WorkoutSessionExecutionInputError('Quantidade de agrupamentos removidos inválida.');
    }
    const ids = new Set<string>();
    normalized.removeResistanceGroups = values.removeResistanceGroups.map((rawId) => {
      const id = typeof rawId === 'string' ? rawId.trim() : '';
      if (!id || ids.has(id) || normalized.resistanceGroups?.some((item) => item.plannedGroupId === id)) {
        throw new WorkoutSessionExecutionInputError('Agrupamento duplicado ou enviado simultaneamente para registro e remoção.');
      }
      ids.add(id);
      return id;
    });
  }
  return normalized;
}

function normalizeItems(items: TrainingSessionExecutionItemValue[] | undefined): TrainingSessionExecutionItemValue[] {
  if (!items) return [];
  return items.map((item) => {
    const plannedUnitId = item.plannedUnitId.trim();
    if (!plannedUnitId) throw new WorkoutSessionExecutionInputError('Identificador da unidade planejada é obrigatório.');
    const hasPlannedSetId = item.plannedSetId !== undefined;
    const plannedSetId = item.plannedSetId === undefined
      ? undefined
      : item.plannedSetId === null
        ? null
        : item.plannedSetId.trim();
    if (item.plannedSetId !== undefined && item.plannedSetId !== null && !plannedSetId) {
      throw new WorkoutSessionExecutionInputError('Identificador da série planejada inválido.');
    }
    const setNumber = item.setNumber ?? 0;
    if (!Number.isInteger(setNumber) || setNumber < 0) throw new WorkoutSessionExecutionInputError('Número da série executada inválido.');
    // Duplicate validation runs after the transaction resolves planned-set IDs to canonical ordinals.
    const outcome = normalizeOutcome(item.outcome);
    // Only the persisted outcome can decide whether an omitted substitution note is valid.
    const substitutionNote = normalizeText(item.substitutionNote, 500);
    const nonNegative = (value: number | null | undefined, label: string, integer = false) => {
      if (value !== undefined && value !== null && (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value)))) throw new WorkoutSessionExecutionInputError(`${label} inválido.`);
      return value;
    };
    const normalized: TrainingSessionExecutionItemValue = {
      plannedUnitId,
      ...(hasPlannedSetId ? { plannedSetId } : {}),
      setNumber,
      ...(outcome !== undefined ? { outcome } : {}),
      ...(item.substitutionNote !== undefined ? { substitutionNote } : {}),
      rir: checkNumber(item.rir, 'RIR executado', { max: 30 }),
      rpe: checkNumber(item.rpe, 'RPE executado', { max: 10 }),
      tempo: normalizeText(item.tempo, 80),
      restSec: checkNumber(item.restSec, 'Descanso executado', { integer: true, max: 86400 }),
      loadKg: nonNegative(item.loadKg, 'Carga executada'),
      repetitions: nonNegative(item.repetitions, 'Repetições executadas', true),
      durationSec: nonNegative(item.durationSec, 'Tempo executado', true),
      distanceKm: nonNegative(item.distanceKm, 'Distância executada'),
      pace: normalizeText(item.pace, 32),
      heartRateBpm: nonNegative(item.heartRateBpm, 'Frequência cardíaca executada', true),
      heartRateZone: normalizeText(item.heartRateZone, 32),
    };
    if (normalized.heartRateBpm != null && normalized.heartRateBpm > 260) throw new WorkoutSessionExecutionInputError('Frequência cardíaca executada inválida.');
    return normalized;
  });
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isSerializableTransactionConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010') return false;

  const meta = error.meta as { code?: unknown; message?: unknown } | undefined;
  return meta?.code === '40001'
    || (typeof meta?.message === 'string'
      && /could not serialize access|serialization failure/i.test(meta.message));
}

function legacyProjection(status: TrainingSessionExecutionStatus): 'planned' | 'in_progress' | 'completed' {
  if (status === 'not_started') return 'planned';
  if (status === 'in_progress' || status === 'paused') return 'in_progress';
  return 'completed';
}

async function lockReleasedSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
  alunoId: string,
  contractId: string
): Promise<LockedReleasedSession | null> {
  const rows = await tx.$queryRaw<LockedReleasedSession[]>(Prisma.sql`
    SELECT
      wd."id",
      wd."status"::text AS "legacyStatus",
      wt."id" AS "workoutTemplateId",
      tp."id" AS "trainingPlanId",
      rel."id" AS "releaseId"
    FROM "WorkoutDay" wd
    INNER JOIN "WorkoutTemplate" wt ON wt."id" = wd."templateId"
    INNER JOIN "TrainingPlan" tp ON tp."id" = wt."planId"
    INNER JOIN "Aluno" a ON a."id" = tp."alunoId"
    INNER JOIN "ConsolidatedPrescriptionOperationalRelease" rel
      ON rel."workoutTemplateId" = wt."id"
      AND rel."alunoId" = tp."alunoId"
      AND rel."contractId" = a."contractId"
    WHERE wd."id" = ${sessionId}
      AND wt."released" = TRUE
      AND tp."alunoId" = ${alunoId}
      AND a."contractId" = ${contractId}
    ORDER BY rel."id" DESC
    LIMIT 1
    FOR UPDATE OF wd
  `);
  return rows[0] ?? null;
}

async function readExecution(client: Prisma.TransactionClient | PrismaClient, workoutDayId: string) {
  return client.workoutSessionExecution.findUnique({
    where: { workoutDayId },
    include: {
      pauseIntervals: { orderBy: [{ startedAt: 'asc' }, { id: 'asc' }] },
      items: { orderBy: [{ plannedUnitId: 'asc' }, { setNumber: 'asc' }, { id: 'asc' }] },
    },
  });
}

function defaultView(session: LockedReleasedSession): TrainingSessionExecutionView {
  return {
    sessionId: session.id,
    status: session.legacyStatus === 'planned' ? 'not_started' : session.legacyStatus === 'in_progress' ? 'in_progress' : 'completed',
    version: 0,
    startedAt: null,
    finishedAt: null,
    currentPauseStartedAt: null,
    pausedDurationMs: 0,
    interruptionReason: null,
    origin: {
      releaseId: session.releaseId,
      workoutTemplateId: session.workoutTemplateId,
      trainingPlanId: session.trainingPlanId,
    },
    sessionValues: {},
    items: [],
  };
}

type ExecutionProjectionRow = {
  workoutDayId: string;
  status: TrainingSessionExecutionStatus;
  version: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  currentPauseStartedAt: Date | null;
  pausedDurationMs: bigint;
  interruptionReason: string | null;
  originReleaseId: string;
  originWorkoutTemplateId: string;
  originTrainingPlanId: string;
  sessionValues: Prisma.JsonValue;
  items: Array<{
    plannedUnitId: string;
    plannedSetId: string | null;
    setNumber: number;
    completedAt?: Date | null;
    loadKg: number | null;
    repetitions: number | null;
    durationSec: number | null;
    distanceKm: number | null;
    pace: string | null;
    heartRateBpm: number | null;
    heartRateZone: string | null;
    outcome?: string | null;
    substitutionNote?: string | null;
    rir?: number | null;
    rpe?: number | null;
    tempo?: string | null;
    restSec?: number | null;
  }>;
};

export function projectWorkoutSessionExecution(
  row: ExecutionProjectionRow,
  sessionId = row.workoutDayId
): TrainingSessionExecutionView {
  return {
    sessionId,
    status: row.status,
    version: row.version,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    currentPauseStartedAt: row.currentPauseStartedAt?.toISOString() ?? null,
    pausedDurationMs: Number(row.pausedDurationMs),
    interruptionReason: row.interruptionReason,
    origin: {
      releaseId: row.originReleaseId,
      workoutTemplateId: row.originWorkoutTemplateId,
      trainingPlanId: row.originTrainingPlanId,
    },
    sessionValues: (row.sessionValues ?? {}) as TrainingSessionExecutionSessionValues,
    items: row.items.map((item) => ({
      plannedUnitId: item.plannedUnitId,
      plannedSetId: item.plannedSetId,
      setNumber: item.setNumber,
      outcome: (item.outcome ?? undefined) as TrainingSessionExecutionItemValue['outcome'],
      substitutionNote: item.substitutionNote ?? null,
      rir: item.rir ?? null,
      rpe: item.rpe ?? null,
      tempo: item.tempo ?? null,
      restSec: item.restSec ?? null,
      completedAt: item.completedAt?.toISOString() ?? null,
      loadKg: item.loadKg,
      repetitions: item.repetitions,
      durationSec: item.durationSec,
      distanceKm: item.distanceKm,
      pace: item.pace,
      heartRateBpm: item.heartRateBpm,
      heartRateZone: item.heartRateZone,
    })),
  };
}

function ensureOperationKey(value: string) {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128) throw new WorkoutSessionExecutionInputError('Chave da operação inválida.');
  return normalized;
}

export function createWorkoutSessionExecutionService(client: PrismaClient = prisma) {
  async function runOperation(input: {
    sessionId: string;
    alunoId: string;
    contractId: string;
    actorUserId: string;
    operationKey: string;
    expectedVersion: number;
    targetStatus?: TrainingSessionExecutionStatus;
    reason?: string | null;
    sessionValues?: TrainingSessionExecutionSessionValuesPatch;
    items?: TrainingSessionExecutionItemValue[];
    guidedCompletion?: boolean;
  }): Promise<TrainingSessionExecutionView> {
    const operationKey = ensureOperationKey(input.operationKey);
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) throw new WorkoutSessionExecutionInputError('Versão esperada inválida.');
    const reason = normalizeText(input.reason, 500);
    const sessionValues = normalizeSessionValues(input.sessionValues);
    const items = normalizeItems(input.items);
    // A non-performed session is an explicit negative lifecycle decision.
    // It cannot atomically carry positive or synthetic execution evidence.
    if (input.targetStatus === 'not_performed' && (sessionValues !== undefined || items.length > 0)) {
      throw new WorkoutSessionExecutionInputError('Sessão não realizada não aceita valores ou unidades executadas.');
    }
    const action = input.guidedCompletion ? 'complete_resistance_set' : input.targetStatus ? 'transition' : 'record_values';
    if (input.guidedCompletion && (input.targetStatus || sessionValues || items.length !== 1 || !items[0].plannedSetId)) {
      throw new WorkoutSessionExecutionInputError('Informe exatamente uma série planejada para concluir.');
    }
    if (!input.targetStatus && !sessionValues && items.length === 0) throw new WorkoutSessionExecutionInputError('Informe pelo menos um valor executado.');

    const normalizedOperation = {
      action,
      targetStatus: input.targetStatus ?? null,
      expectedVersion: input.expectedVersion,
      reason: reason ?? null,
      sessionValues: sessionValues ?? null,
      items,
    };
    const payloadFingerprint = fingerprint(normalizedOperation);

    try {
      return await client.$transaction(async (tx) => {
      const locked = await lockReleasedSession(tx, input.sessionId, input.alunoId, input.contractId);
      if (!locked) throw new WorkoutSessionExecutionNotFoundError('Sessão de treino não encontrada.');

      let execution = await tx.workoutSessionExecution.findUnique({ where: { workoutDayId: input.sessionId } });
      const currentStatus: TrainingSessionExecutionStatus = execution
        ? execution.status
        : locked.legacyStatus === 'planned'
          ? 'not_started'
          : locked.legacyStatus === 'in_progress'
            ? 'in_progress'
            : 'completed';
      const currentVersion = execution?.version ?? 0;

      if (execution) {
        const prior = await tx.workoutSessionExecutionOperation.findUnique({
          where: { executionId_operationKey: { executionId: execution.id, operationKey } },
        });
        if (prior) {
          if (prior.payloadFingerprint !== payloadFingerprint) {
            throw new WorkoutSessionExecutionConflictError('A mesma chave de operação já foi usada com dados diferentes.', 'WORKOUT_SESSION_EXECUTION_IDEMPOTENCY_CONFLICT');
          }
          const replay = await readExecution(tx, input.sessionId);
          if (!replay) throw new WorkoutSessionExecutionNotFoundError('Execução de treino não encontrada.');
          return projectWorkoutSessionExecution(replay);
        }
      }

      if (input.expectedVersion !== currentVersion) {
        throw new WorkoutSessionExecutionConflictError(
          `A sessão mudou em outro cliente. Versão atual: ${currentVersion}.`,
          'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT'
        );
      }

      if (input.targetStatus === 'not_performed' && execution) {
        // A pre-existing not_started shell may contain legacy/bypassed values.
        // Do not convert recorded history into a negative session outcome.
        const storedValues = execution.sessionValues;
        const hasStoredValues = storedValues !== null && typeof storedValues === 'object'
          && !Array.isArray(storedValues) && Object.keys(storedValues).length > 0;
        const hasStoredItems = await tx.workoutSessionExecutionItem.count({ where: { executionId: execution.id } }) > 0;
        if (hasStoredValues || hasStoredItems) {
          throw new WorkoutSessionExecutionInputError('Sessão com histórico executado não pode ser marcada como não realizada.');
        }
      }

      if (input.targetStatus) {
        try {
          assertWorkoutSessionTransition(currentStatus, input.targetStatus);
        } catch (error) {
          if (error instanceof WorkoutSessionExecutionTransitionError) {
            throw new WorkoutSessionExecutionConflictError(error.message, 'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION');
          }
          throw error;
        }
        if ((input.targetStatus === 'partial' || input.targetStatus === 'not_performed') && !reason) {
          throw new WorkoutSessionExecutionInputError('Informe o motivo para encerrar o treino dessa forma.');
        }
      } else if (currentStatus !== 'in_progress') {
        throw new WorkoutSessionExecutionConflictError('Valores executados só podem ser registrados enquanto o treino está em andamento.', 'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION');
      }

      // #489: a direct public lifecycle request must not bypass the UI's
      // guided-stage completion guard. Keep this INSIDE the serializable #389
      // transaction and behind the version/idempotency check. Legacy sessions
      // without #398 stages still use the ordinary #389 lifecycle.
      if (input.targetStatus === 'completed') {
        const plan = await loadGuidedCyclicPlan(tx, input.sessionId);
        if (plan.availability === 'invalid_plan') {
          throw new WorkoutSessionExecutionConflictError(
            'A estrutura das etapas cíclicas requer revisão antes da conclusão.',
            'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION',
          );
        }
        if (plan.availability === 'available') {
          const persisted = await readExecution(tx, input.sessionId);
          if (!persisted) throw new WorkoutSessionExecutionNotFoundError('Execução não encontrada.');
          if (!canCompleteGuidedCyclic(
            input.sessionId, projectWorkoutSessionExecution(persisted), plan, new Date(),
          )) {
            throw new WorkoutSessionExecutionConflictError(
              'Existem etapas cíclicas pendentes ou inconsistentes. Confirme cada etapa antes de concluir o treino.',
              'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION',
            );
          }
        }
      }

      // The same transaction owns completion, its rest and the operation ledger.
      let restAfterGuidedSet: { plannedSetId: string; seconds: number } | null = null;
      // Guide confirmation is checked against the authoritative plan and current
      // durable progress INSIDE the same serializable transaction as the write.
      // It cannot jump a set, reuse another exercise, or progress while paused.
      if (input.guidedCompletion) {
        if (currentStatus !== 'in_progress' || !execution) {
          throw new WorkoutSessionExecutionConflictError(
            'A sessão não está em andamento. Atualize o treino para continuar.',
            'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION'
          );
        }
        const activeRest = await tx.workoutSessionResistanceRest.findFirst({
          where: { executionId: execution.id, status: 'active' },
        });
        if (activeRest) {
          throw new WorkoutSessionExecutionConflictError(
            'Finalize ou pule o descanso atual antes de concluir outra série.',
            'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION'
          );
        }
        const plan = await loadGuidedResistancePlan(tx, input.sessionId);
        const persisted = await readExecution(tx, input.sessionId);
        if (!persisted) throw new WorkoutSessionExecutionNotFoundError('Execução de treino não encontrada.');
        const guided = projectGuidedResistance(input.sessionId, projectWorkoutSessionExecution(persisted), plan);
        const plannedSeconds = prescribedRestAfter(guided.current, guided.next);
        if (plannedSeconds !== null && guided.current) {
          restAfterGuidedSet = { plannedSetId: guided.current.plannedSetId, seconds: plannedSeconds };
        }
        if (!matchesCurrentGuidedUnit(guided, items[0])) {
          throw new WorkoutSessionExecutionConflictError(
            'Esta série não é a próxima do planejamento. Atualize o treino antes de continuar.',
            'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT'
          );
        }
        const previous = persisted.items.find((record) =>
          record.plannedUnitId === items[0].plannedUnitId
          && record.plannedSetId === items[0].plannedSetId
          && record.setNumber === items[0].setNumber
        );
        // A guided completion must never leave a persisted "not performed"
        // outcome on a completed set. Keep partial/substituted outcomes intact.
        if (previous?.outcome === 'not_performed') {
          throw new WorkoutSessionExecutionConflictError(
            'Esta série está marcada como não realizada. Corrija o resultado registrado antes de confirmá-la.',
            'WORKOUT_SESSION_EXECUTION_INCOMPATIBLE_OUTCOME'
          );
        }
      }

      const now = new Date();
      if (!execution) {
        const dayPlan = await tx.workoutDay.findUnique({
          where: { id: input.sessionId },
          select: workoutComparisonPlanSelect,
        });
        if (!dayPlan) throw new WorkoutSessionExecutionNotFoundError('Treino planejado não encontrado.');
        execution = await tx.workoutSessionExecution.create({
          data: {
            workoutDayId: input.sessionId,
            alunoId: input.alunoId,
            contractId: input.contractId,
            originReleaseId: locked.releaseId,
            originWorkoutTemplateId: locked.workoutTemplateId,
            originTrainingPlanId: locked.trainingPlanId,
            plannedSnapshot: captureWorkoutComparisonPlan(dayPlan) as unknown as Prisma.InputJsonValue,
            status: currentStatus,
            version: currentVersion,
          },
        });
      }

      // Guided completion belongs to one operation; create its intent first.
      // The database verifies this identity after the event and version commit.
      const resultingVersion = currentVersion + 1;
      const guidedOperation = input.guidedCompletion
        ? await tx.workoutSessionExecutionOperation.create({
            data: { executionId: execution.id, operationKey, payloadFingerprint,
              action, targetStatus: input.targetStatus, expectedVersion: currentVersion,
              resultingVersion },
          })
        : null;
      const mergedSessionValues = await persistWorkoutSessionValues(
        tx, execution.id, input.sessionId, sessionValues, items,
        input.guidedCompletion ? now : undefined, guidedOperation?.id,
      );
      if (restAfterGuidedSet) {
        // Unique completed-set identity and partial unique active index guard retries
        // and race conditions. Prescribed values are read, never updated.
        await tx.workoutSessionResistanceRest.create({ data: {
          executionId: execution.id,
          afterPlannedSetId: restAfterGuidedSet.plannedSetId,
          plannedSeconds: restAfterGuidedSet.seconds,
          startedAt: now,
          targetEndsAt: new Date(now.getTime() + restAfterGuidedSet.seconds * 1000),
        } });
      }

      let nextStatus = currentStatus;
      let startedAt = execution.startedAt;
      let finishedAt = execution.finishedAt;
      let currentPauseStartedAt = execution.currentPauseStartedAt;
      let pausedDurationMs = execution.pausedDurationMs;
      let interruptionReason = execution.interruptionReason;

      if (input.targetStatus) {
        nextStatus = input.targetStatus;
        if (currentStatus === 'not_started' && nextStatus === 'in_progress' && !startedAt) startedAt = now;
        if (nextStatus === 'paused') {
          currentPauseStartedAt = now;
          await tx.workoutSessionPauseInterval.create({ data: { executionId: execution.id, startedAt: now } });
        }
        if (currentStatus === 'paused' && (nextStatus === 'in_progress' || nextStatus === 'partial')) {
          const pauseStarted = currentPauseStartedAt;
          const pauseMs = pauseStarted ? Math.max(0, now.getTime() - pauseStarted.getTime()) : 0;
          pausedDurationMs += BigInt(pauseMs);
          const resting = await tx.workoutSessionResistanceRest.findFirst({
            where: { executionId: execution.id, status: 'active' },
          });
          if (resting) {
            await tx.workoutSessionResistanceRest.update({
              where: { id: resting.id },
              data: {
                pausedDurationMs: resting.pausedDurationMs + BigInt(pauseMs),
                targetEndsAt: new Date(resting.targetEndsAt.getTime() + pauseMs),
              },
            });
          }
          await tx.workoutSessionPauseInterval.updateMany({
            where: { executionId: execution.id, endedAt: null },
            data: { endedAt: now },
          });
          currentPauseStartedAt = null;
        }
        if (TERMINAL_EXECUTION_STATUSES.has(nextStatus)) {
          if (!finishedAt) finishedAt = now;
          const activeRest = await tx.workoutSessionResistanceRest.findFirst({
            where: { executionId: execution.id, status: 'active' },
          });
          if (activeRest) {
            await tx.workoutSessionResistanceRest.update({
              where: { id: activeRest.id },
              data: { status: 'interrupted', endedAt: now, elapsedMs: BigInt(measuredRestMs(activeRest, now)) },
            });
          }
        }
        if (nextStatus === 'partial' || nextStatus === 'not_performed') interruptionReason = reason ?? null;
      }

      const nextVersion = resultingVersion;
      // Insert the intent ledger while the execution is still non-terminal.
      // The operation, state transition and lifecycle link remain atomic, but
      // the database can now reject every direct INSERT into terminal history.
      const operation = guidedOperation ?? await tx.workoutSessionExecutionOperation.create({
        data: {
          executionId: execution.id,
          operationKey,
          payloadFingerprint,
          action,
          targetStatus: input.targetStatus,
          expectedVersion: currentVersion,
          resultingVersion: nextVersion,
        },
      });

      await tx.workoutSessionExecution.update({
        where: { id: execution.id },
        data: {
          status: nextStatus,
          version: nextVersion,
          startedAt,
          finishedAt,
          currentPauseStartedAt,
          pausedDurationMs,
          interruptionReason,
          ...(mergedSessionValues !== undefined ? { sessionValues: mergedSessionValues } : {}),
        },
      });

      await tx.workoutDay.update({
        where: { id: input.sessionId },
        data: {
          status: legacyProjection(nextStatus),
          ...(startedAt ? { startedAt } : {}),
          ...(finishedAt ? { finishedAt } : {}),
        },
      });

      const lifecycleEvent = await tx.studentLifecycleEvent.create({
        data: {
          alunoId: input.alunoId,
          contractId: input.contractId,
          eventType: 'STATUS_CHANGED',
          actorUserId: input.actorUserId,
          metadata: {
            eventKey: `workout-session-execution:${execution.id}:${operation.id}`,
            domain: 'workout_session_execution',
            action,
            workoutDayId: input.sessionId,
            executionId: execution.id,
            operationId: operation.id,
            previousStatus: currentStatus,
            status: nextStatus,
            previousVersion: currentVersion,
            version: nextVersion,
            ...(reason ? { reason } : {}),
          },
        },
        select: { id: true },
      });
      await tx.workoutSessionExecutionOperation.update({
        where: { id: operation.id },
        data: { lifecycleEventId: lifecycleEvent.id },
      });

      const updated = await readExecution(tx, input.sessionId);
      if (!updated) throw new WorkoutSessionExecutionNotFoundError('Execução de treino não encontrada.');
      return projectWorkoutSessionExecution(updated);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializableTransactionConflict(error)) {
        throw new WorkoutSessionExecutionConflictError(
          'A sessão mudou em outro cliente. Atualize o estado antes de tentar novamente.',
          'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT'
        );
      }
      throw error;
    }
  }

  async function getGuidedCyclicForSession(input: {
    sessionId: string; alunoId: string; contractId: string;
  }): Promise<GuidedCyclicView> {
    return client.$transaction(async (tx) => {
      const released = await lockReleasedSession(tx, input.sessionId, input.alunoId, input.contractId);
      if (!released) throw new WorkoutSessionExecutionNotFoundError('Sessão de treino não encontrada.');
      const persisted = await readExecution(tx, input.sessionId);
      const view = persisted ? projectWorkoutSessionExecution(persisted) : defaultView(released);
      const plan = await loadGuidedCyclicPlan(tx, input.sessionId);
      return projectGuidedCyclic(input.sessionId, view, plan, new Date());
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * #489: the same canonical execution, operation ledger and event transaction
   * used by #389/#487 owns every stage start and completion. No UI cursor index
   * is accepted as identity, and no browser timer advances the database.
   */
  async function actOnGuidedCyclic(input: {
    sessionId: string; alunoId: string; contractId: string; actorUserId: string;
    payload: GuidedCyclicActionPayload;
  }): Promise<GuidedCyclicView> {
    const { operationKey: rawKey, expectedVersion, plannedStageId, iteration, action, outcome, values } = input.payload;
    const operationKey = ensureOperationKey(rawKey);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0
      || typeof plannedStageId !== 'string' || !plannedStageId.trim()
      || !Number.isInteger(iteration) || iteration < 1 || iteration > 100
      || (action !== 'start' && action !== 'complete')) {
      throw new WorkoutSessionExecutionInputError('Comando de etapa cíclica inválido.');
    }
    if (action === 'start' ? outcome !== undefined || values !== undefined
      : !outcome || !COMPARABLE_OUTCOMES.has(outcome)) {
      throw new WorkoutSessionExecutionInputError('Informe uma ação e situação compatíveis com a etapa.');
    }
    const allowedMetrics = new Set([
      'substitutionNote', 'durationSec', 'distanceMeters', 'paceMinPerKm', 'speedKmh',
      'heartRateBpm', 'heartRateZone', 'pse',
    ]);
    if (values !== undefined && (typeof values !== 'object' || Array.isArray(values)
      || Object.keys(values).some((key) => !allowedMetrics.has(key)))) {
      throw new WorkoutSessionExecutionInputError('Valores executados da etapa inválidos.');
    }
    const normalized = action === 'complete'
      ? normalizeSessionValues({ cyclicStages: [{
          plannedStageId: plannedStageId.trim(), iteration,
          outcome: outcome!, ...values,
        }] })?.cyclicStages?.[0] : null;
    const operationFingerprint = fingerprint({
      action: 'guided_cyclic_' + action, expectedVersion,
      plannedStageId: plannedStageId.trim(), iteration, outcome: outcome ?? null,
      values: normalized ?? null,
    });
    try {
      await client.$transaction(async (tx) => {
        const released = await lockReleasedSession(tx, input.sessionId, input.alunoId, input.contractId);
        if (!released) throw new WorkoutSessionExecutionNotFoundError('Sessão de treino não encontrada.');
        const execution = await tx.workoutSessionExecution.findUnique({ where: { workoutDayId: input.sessionId } });
        if (!execution) throw new WorkoutSessionExecutionConflictError(
          'Inicie a sessão antes de executar uma etapa.', 'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION',
        );
        const prior = await tx.workoutSessionExecutionOperation.findUnique({
          where: { executionId_operationKey: { executionId: execution.id, operationKey } },
        });
        if (prior) {
          if (prior.payloadFingerprint !== operationFingerprint) throw new WorkoutSessionExecutionConflictError(
            'Esta chave já foi usada em uma ação diferente.', 'WORKOUT_SESSION_EXECUTION_IDEMPOTENCY_CONFLICT',
          );
          return;
        }
        if (execution.version !== expectedVersion) throw new WorkoutSessionExecutionConflictError(
          'A etapa mudou em outro dispositivo. Atualize o treino.', 'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT',
        );
        if (execution.status !== 'in_progress') throw new WorkoutSessionExecutionConflictError(
          'Retome a sessão antes de executar uma etapa.', 'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION',
        );
        const persisted = await readExecution(tx, input.sessionId);
        if (!persisted) throw new WorkoutSessionExecutionNotFoundError('Execução não encontrada.');
        const plan = await loadGuidedCyclicPlan(tx, input.sessionId);
        const now = new Date();
        const projected = projectGuidedCyclic(input.sessionId, projectWorkoutSessionExecution(persisted), plan, now);
        const stage = projected.current;
        if (projected.availability !== 'available' || !stage) {
          throw new WorkoutSessionExecutionConflictError(
            'Não é possível avançar: confira a estrutura e o progresso salvo.', 'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT',
          );
        }
        if (stage.plannedStageId !== plannedStageId.trim() || stage.iteration !== iteration) {
          throw new WorkoutSessionExecutionConflictError(
            'A etapa informada não é a próxima etapa planejada.', 'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT',
          );
        }
        let cursor: GuidedCyclicCursor;
        let sessionValues: TrainingSessionExecutionSessionValues;
        if (action === 'start') {
          if (projected.currentStartedAt) throw new WorkoutSessionExecutionConflictError(
            'A etapa já foi iniciada.', 'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION',
          );
          cursor = {
            plannedStageId: stage.plannedStageId, iteration: stage.iteration,
            startedAt: now.toISOString(), pausedDurationAtStartMs: Number(execution.pausedDurationMs),
          };
          sessionValues = { ...projectWorkoutSessionExecution(persisted).sessionValues, guidedCyclic: cursor };
        } else {
          if (!projected.currentStartedAt || projected.elapsedMs === null || !normalized) {
            throw new WorkoutSessionExecutionConflictError(
              'Inicie a etapa antes de confirmá-la.', 'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION',
            );
          }
          if (stage.durationUnit === 'seconds' && outcome === 'full' && (projected.remainingMs ?? 1) > 0) {
            throw new WorkoutSessionExecutionConflictError(
              'O tempo previsto ainda não terminou. Aguarde ou registre execução parcial.',
              'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION',
            );
          }
          if (stage.durationUnit === 'meters' && (outcome === 'full' || outcome === 'partial')
            && normalized.distanceMeters == null) {
            throw new WorkoutSessionExecutionInputError('Confirme a distância realizada em metros.');
          }
          const completed: TrainingSessionCyclicStageExecutionValue = {
            ...normalized,
            plannedStageId: stage.plannedStageId, iteration: stage.iteration,
            outcome: normalized.outcome,
            ...(outcome !== 'not_performed' && stage.durationUnit === 'seconds'
              && normalized.durationSec === undefined
              ? { durationSec: Math.floor(projected.elapsedMs / 1000) } : {}),
          };
          const persistedValues = await persistWorkoutSessionValues(
            tx, execution.id, input.sessionId, { cyclicStages: [completed] }, [],
          );
          const following = plan.units[projected.completed + 1] ?? null;
          cursor = {
            plannedStageId: following?.plannedStageId ?? null, iteration: following?.iteration ?? null,
            startedAt: null, pausedDurationAtStartMs: null,
          };
          sessionValues = { ...(persistedValues as TrainingSessionExecutionSessionValues), guidedCyclic: cursor };
        }
        const version = execution.version + 1;
        const operation = await tx.workoutSessionExecutionOperation.create({ data: {
          executionId: execution.id, operationKey, payloadFingerprint: operationFingerprint,
          action: 'guided_cyclic_' + action, expectedVersion, resultingVersion: version,
        } });
        await tx.workoutSessionExecution.update({
          where: { id: execution.id },
          data: { sessionValues: sessionValues as unknown as Prisma.InputJsonValue, version },
        });
        const event = await tx.studentLifecycleEvent.create({ data: {
          alunoId: input.alunoId, contractId: input.contractId,
          actorUserId: input.actorUserId, eventType: 'STATUS_CHANGED',
          metadata: {
            eventKey: 'workout-session-execution:' + execution.id + ':' + operation.id,
            domain: 'workout_session_execution', action: 'guided_cyclic_' + action,
            workoutDayId: input.sessionId, executionId: execution.id, operationId: operation.id,
            plannedStageId: stage.plannedStageId, iteration: stage.iteration,
            previousStatus: execution.status, status: execution.status,
            previousVersion: execution.version, version,
          },
        }, select: { id: true } });
        await tx.workoutSessionExecutionOperation.update({
          where: { id: operation.id }, data: { lifecycleEventId: event.id },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializableTransactionConflict(error)) throw new WorkoutSessionExecutionConflictError(
        'O treino foi alterado em outro dispositivo. Atualize a etapa.',
        'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT',
      );
      throw error;
    }
    return getGuidedCyclicForSession(input);
  }

  async function getGuidedForSession(input: { sessionId: string; alunoId: string; contractId: string }): Promise<GuidedResistanceView> {
    return client.$transaction(async (tx) => {
      const locked = await lockReleasedSession(tx, input.sessionId, input.alunoId, input.contractId);
      if (!locked) throw new WorkoutSessionExecutionNotFoundError('Sessão de treino não encontrada.');
      const execution = await readExecution(tx, input.sessionId);
      const view = execution ? projectWorkoutSessionExecution(execution) : defaultView(locked);
      const plan = await loadGuidedResistancePlan(tx, input.sessionId);
      const activeRest = execution ? await tx.workoutSessionResistanceRest.findFirst({
        where: { executionId: execution.id, status: 'active' },
      }) : null;
      const snapshotAt = new Date();
      return {
        ...projectGuidedResistance(input.sessionId, view, plan),
        // A trusted server clock sample must be available before the first rest starts.
        // It is only used by the UI to bound response age, never to authorize finish.
        serverNow: snapshotAt.toISOString(),
        rest: projectResistanceRest(activeRest, {
          status: view.status, currentPauseStartedAt: execution?.currentPauseStartedAt ?? null,
        }, snapshotAt),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** REST operations reuse #389 versioning, ownership, idempotency and event ledger. */
  async function actOnGuidedRest(input: {
    sessionId: string; alunoId: string; contractId: string; actorUserId: string;
    payload: GuidedResistanceRestActionPayload;
  }): Promise<GuidedResistanceView> {
    const { operationKey, expectedVersion, restId, action } = input.payload;
    ensureOperationKey(operationKey);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0 || !restId?.trim()
      || !['extend_15', 'skip', 'finish'].includes(action)) {
      throw new WorkoutSessionExecutionInputError('Comando de descanso inválido.');
    }
    const operationFingerprint = fingerprint({ action: 'guided_rest', restId, expectedVersion, command: action });
    try {
      await client.$transaction(async (tx) => {
        const locked = await lockReleasedSession(tx, input.sessionId, input.alunoId, input.contractId);
        if (!locked) throw new WorkoutSessionExecutionNotFoundError('Sessão de treino não encontrada.');
        const execution = await tx.workoutSessionExecution.findUnique({ where: { workoutDayId: input.sessionId } });
        if (!execution) throw new WorkoutSessionExecutionConflictError(
          'Inicie a sessão antes de controlar o descanso.', 'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION'
        );
        const prior = await tx.workoutSessionExecutionOperation.findUnique({
          where: { executionId_operationKey: { executionId: execution.id, operationKey } },
        });
        if (prior) {
          if (prior.payloadFingerprint !== operationFingerprint) throw new WorkoutSessionExecutionConflictError(
            'Chave de operação já utilizada com outro comando.', 'WORKOUT_SESSION_EXECUTION_IDEMPOTENCY_CONFLICT'
          );
          return;
        }
        if (execution.version !== expectedVersion) throw new WorkoutSessionExecutionConflictError(
          'A sessão mudou em outro cliente. Atualize o estado salvo.', 'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT'
        );
        if (execution.status !== 'in_progress') throw new WorkoutSessionExecutionConflictError(
          'Retome a sessão antes de continuar o descanso.', 'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION'
        );
        const rest = await tx.workoutSessionResistanceRest.findFirst({
          where: { id: restId, executionId: execution.id, status: 'active' },
        });
        if (!rest) throw new WorkoutSessionExecutionConflictError(
          'Este descanso não está mais ativo. Atualize a sessão.', 'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT'
        );
        const now = new Date();
        let actualElapsedMs: number | null = null;
        if (action === 'extend_15') {
          if (rest.extensionSeconds > 2147483632) throw new WorkoutSessionExecutionInputError(
            'O limite de acréscimos deste descanso foi atingido.'
          );
          await tx.workoutSessionResistanceRest.update({ where: { id: rest.id }, data: {
            extensionSeconds: { increment: 15 },
            targetEndsAt: new Date(rest.targetEndsAt.getTime() + 15000),
          } });
        } else {
          if (action === 'finish' && now.getTime() < rest.targetEndsAt.getTime()) {
            throw new WorkoutSessionExecutionConflictError(
              'O descanso ainda não terminou. Aguarde ou escolha Pular descanso.',
              'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION'
            );
          }
          actualElapsedMs = measuredRestMs(rest, now);
          await tx.workoutSessionResistanceRest.update({ where: { id: rest.id }, data: {
            status: action === 'skip' ? 'skipped' : 'completed',
            endedAt: now, elapsedMs: BigInt(actualElapsedMs),
          } });
        }
        const nextVersion = execution.version + 1;
        const operation = await tx.workoutSessionExecutionOperation.create({ data: {
          executionId: execution.id, operationKey, payloadFingerprint: operationFingerprint,
          action: 'rest_' + action, expectedVersion, resultingVersion: nextVersion,
        } });
        await tx.workoutSessionExecution.update({
          where: { id: execution.id }, data: { version: nextVersion },
        });
        const event = await tx.studentLifecycleEvent.create({ data: {
          alunoId: input.alunoId, contractId: input.contractId,
          eventType: 'STATUS_CHANGED', actorUserId: input.actorUserId,
          metadata: {
            eventKey: 'workout-session-execution:' + execution.id + ':' + operation.id,
            domain: 'workout_session_execution', action: 'rest_' + action,
            workoutDayId: input.sessionId, executionId: execution.id, operationId: operation.id,
            restId: rest.id, afterPlannedSetId: rest.afterPlannedSetId,
            plannedSeconds: rest.plannedSeconds, actualElapsedMs,
            previousStatus: execution.status, status: execution.status,
            previousVersion: expectedVersion, version: nextVersion,
          },
        }, select: { id: true } });
        await tx.workoutSessionExecutionOperation.update({
          where: { id: operation.id }, data: { lifecycleEventId: event.id },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializableTransactionConflict(error)) throw new WorkoutSessionExecutionConflictError(
        'O descanso foi alterado em outro cliente. Atualize a sessão.',
        'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT'
      );
      throw error;
    }
    return getGuidedForSession(input);
  }

  return {
    getGuidedCyclicForSession,
    actOnGuidedCyclic,
    getGuidedForSession,
    actOnGuidedRest,
    async getForSession(input: { sessionId: string; alunoId: string; contractId: string }): Promise<TrainingSessionExecutionView> {
      const released = await client.$transaction((tx) => lockReleasedSession(tx, input.sessionId, input.alunoId, input.contractId));
      if (!released) throw new WorkoutSessionExecutionNotFoundError('Sessão de treino não encontrada.');
      const execution = await readExecution(client, input.sessionId);
      return execution ? projectWorkoutSessionExecution(execution) : defaultView(released);
    },

    async transition(input: {
      sessionId: string;
      alunoId: string;
      contractId: string;
      actorUserId: string;
      payload: TrainingSessionExecutionTransitionPayload;
    }) {
      return runOperation({ ...input, ...input.payload });
    },

    async saveValues(input: {
      sessionId: string;
      alunoId: string;
      contractId: string;
      actorUserId: string;
      payload: TrainingSessionExecutionValuesPayload;
    }) {
      return runOperation({ ...input, ...input.payload });
    },
    async completeGuided(input: {
      sessionId: string;
      alunoId: string;
      contractId: string;
      actorUserId: string;
      payload: GuidedResistanceCompletePayload;
    }): Promise<GuidedResistanceView> {
      const { operationKey, expectedVersion, plannedUnitId, plannedSetId, setNumber, repetitions, loadKg } = input.payload;
      await runOperation({
        sessionId: input.sessionId,
        alunoId: input.alunoId,
        contractId: input.contractId,
        actorUserId: input.actorUserId,
        operationKey,
        expectedVersion,
        items: [{ plannedUnitId, plannedSetId, setNumber, repetitions, loadKg }],
        guidedCompletion: true,
      });
      return getGuidedForSession(input);
    },
  };
}

export const workoutSessionExecutionService = createWorkoutSessionExecutionService();
