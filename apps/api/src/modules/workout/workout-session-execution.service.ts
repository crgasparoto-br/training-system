import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  TrainingSessionExecutionItemValue,
  TrainingSessionExecutionSessionValues,
  TrainingSessionExecutionStatus,
  TrainingSessionExecutionTransitionPayload,
  TrainingSessionExecutionValuesPayload,
  TrainingSessionExecutionView,
  GuidedResistanceCompletePayload,
  GuidedResistanceView,
} from '@corrida/types';
import { deriveGuidedResistancePlan, matchesCurrentGuidedUnit, projectGuidedResistance } from './guided-resistance.domain.js';
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
      exercise: { select: { name: true, videoUrl: true, notes: true } },
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

function normalizeSubstitution(outcome: string | undefined, note: string | null | undefined) {
  const normalized = normalizeText(note, 500);
  if (outcome === 'substituted' && !normalized) {
    throw new WorkoutSessionExecutionInputError('Informe qual substituição foi realizada.');
  }
  if (outcome !== 'substituted' && normalized) {
    throw new WorkoutSessionExecutionInputError('Substituição só pode ser informada quando a unidade foi substituída.');
  }
  return normalized;
}

function checkNumber(value: number | null | undefined, label: string, options: { integer?: boolean; max?: number } = {}) {
  if (value !== undefined && value !== null
      && (!Number.isFinite(value) || value < 0 || (options.integer && !Number.isInteger(value))
        || (options.max !== undefined && value > options.max))) {
    throw new WorkoutSessionExecutionInputError(`${label} inválido.`);
  }
  return value;
}

function normalizeSessionValues(values: TrainingSessionExecutionSessionValues | undefined): TrainingSessionExecutionSessionValues | undefined {
  if (!values) return undefined;
  const normalized: TrainingSessionExecutionSessionValues = {};
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
    if (!Array.isArray(values.cyclicStages) || values.cyclicStages.length > 500) {
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
      const substitutionNote = normalizeSubstitution(outcome, entry.substitutionNote);
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
      return {
        plannedGroupId, outcome, substitutionNote: normalizeSubstitution(outcome, entry.substitutionNote),
        roundsCompleted: checkNumber(entry.roundsCompleted, 'Rodadas realizadas', { integer: true }),
        restBetweenExercisesSec: checkNumber(entry.restBetweenExercisesSec, 'Descanso entre exercícios', { integer: true, max: 86400 }),
        restBetweenRoundsSec: checkNumber(entry.restBetweenRoundsSec, 'Descanso entre rodadas', { integer: true, max: 86400 }),
      };
    });
  }
  return normalized;
}

function normalizeItems(items: TrainingSessionExecutionItemValue[] | undefined): TrainingSessionExecutionItemValue[] {
  if (!items) return [];
  const seen = new Set<string>();
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
    const key = `${plannedUnitId}:${setNumber}`;
    if (seen.has(key)) throw new WorkoutSessionExecutionInputError('A mesma unidade planejada/série foi informada mais de uma vez.');
    seen.add(key);
    const outcome = normalizeOutcome(item.outcome);
    const substitutionNote = normalizeSubstitution(outcome, item.substitutionNote);
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
    sessionValues?: TrainingSessionExecutionSessionValues;
    items?: TrainingSessionExecutionItemValue[];
    guidedCompletion?: boolean;
  }): Promise<TrainingSessionExecutionView> {
    const operationKey = ensureOperationKey(input.operationKey);
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) throw new WorkoutSessionExecutionInputError('Versão esperada inválida.');
    const reason = normalizeText(input.reason, 500);
    const sessionValues = normalizeSessionValues(input.sessionValues);
    const items = normalizeItems(input.items);
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
        const plan = await loadGuidedResistancePlan(tx, input.sessionId);
        const persisted = await readExecution(tx, input.sessionId);
        if (!persisted) throw new WorkoutSessionExecutionNotFoundError('Execução de treino não encontrada.');
        const guided = projectGuidedResistance(input.sessionId, projectWorkoutSessionExecution(persisted), plan);
        if (!matchesCurrentGuidedUnit(guided, items[0])) {
          throw new WorkoutSessionExecutionConflictError(
            'Esta série não é a próxima do planejamento. Atualize o treino antes de continuar.',
            'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT'
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
          if (pauseStarted) pausedDurationMs += BigInt(Math.max(0, now.getTime() - pauseStarted.getTime()));
          await tx.workoutSessionPauseInterval.updateMany({
            where: { executionId: execution.id, endedAt: null },
            data: { endedAt: now },
          });
          currentPauseStartedAt = null;
        }
        if (TERMINAL_EXECUTION_STATUSES.has(nextStatus) && !finishedAt) finishedAt = now;
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

  async function getGuidedForSession(input: { sessionId: string; alunoId: string; contractId: string }): Promise<GuidedResistanceView> {
    return client.$transaction(async (tx) => {
      const locked = await lockReleasedSession(tx, input.sessionId, input.alunoId, input.contractId);
      if (!locked) throw new WorkoutSessionExecutionNotFoundError('Sessão de treino não encontrada.');
      const execution = await readExecution(tx, input.sessionId);
      const view = execution ? projectWorkoutSessionExecution(execution) : defaultView(locked);
      const plan = await loadGuidedResistancePlan(tx, input.sessionId);
      return projectGuidedResistance(input.sessionId, view, plan);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  return {
    getGuidedForSession,
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
