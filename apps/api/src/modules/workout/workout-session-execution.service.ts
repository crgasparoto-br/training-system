import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  TrainingSessionExecutionItemValue,
  TrainingSessionExecutionSessionValues,
  TrainingSessionExecutionStatus,
  TrainingSessionExecutionTransitionPayload,
  TrainingSessionExecutionValuesPayload,
  TrainingSessionExecutionView,
} from '@corrida/types';
import {
  assertWorkoutSessionTransition,
  TERMINAL_EXECUTION_STATUSES,
  WorkoutSessionExecutionTransitionError,
} from './workout-session-execution.domain.js';

const prisma = new PrismaClient();

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

export class WorkoutSessionExecutionInputError extends Error {
  readonly statusCode = 400;
  readonly code = 'WORKOUT_SESSION_EXECUTION_INVALID';
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
  if (values.heartRateBpm !== undefined) {
    if (values.heartRateBpm !== null && (!Number.isInteger(values.heartRateBpm) || values.heartRateBpm < 0 || values.heartRateBpm > 260)) throw new WorkoutSessionExecutionInputError('Frequência cardíaca executada inválida.');
    normalized.heartRateBpm = values.heartRateBpm;
  }
  if (values.heartRateZone !== undefined) normalized.heartRateZone = normalizeText(values.heartRateZone, 32);
  return normalized;
}

function normalizeItems(items: TrainingSessionExecutionItemValue[] | undefined): TrainingSessionExecutionItemValue[] {
  if (!items) return [];
  const seen = new Set<string>();
  return items.map((item) => {
    const plannedUnitId = item.plannedUnitId.trim();
    if (!plannedUnitId) throw new WorkoutSessionExecutionInputError('Identificador da unidade planejada é obrigatório.');
    const setNumber = item.setNumber ?? 0;
    if (!Number.isInteger(setNumber) || setNumber < 0) throw new WorkoutSessionExecutionInputError('Número da série executada inválido.');
    const key = `${plannedUnitId}:${setNumber}`;
    if (seen.has(key)) throw new WorkoutSessionExecutionInputError('A mesma unidade planejada/série foi informada mais de uma vez.');
    seen.add(key);
    const nonNegative = (value: number | null | undefined, label: string, integer = false) => {
      if (value !== undefined && value !== null && (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value)))) throw new WorkoutSessionExecutionInputError(`${label} inválido.`);
      return value;
    };
    const normalized: TrainingSessionExecutionItemValue = {
      plannedUnitId,
      setNumber,
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
    setNumber: number;
    loadKg: number | null;
    repetitions: number | null;
    durationSec: number | null;
    distanceKm: number | null;
    pace: string | null;
    heartRateBpm: number | null;
    heartRateZone: string | null;
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
      setNumber: item.setNumber,
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

async function validatePlannedUnits(
  tx: Prisma.TransactionClient,
  sessionId: string,
  items: TrainingSessionExecutionItemValue[]
) {
  if (!items.length) return;
  const ids = [...new Set(items.map((item) => item.plannedUnitId))];
  const found = await tx.workoutExercise.findMany({
    where: { id: { in: ids }, workoutDayId: sessionId },
    select: { id: true },
  });
  if (found.length !== ids.length) throw new WorkoutSessionExecutionInputError('Uma ou mais unidades executadas não pertencem ao treino planejado.');
}

async function persistValues(
  tx: Prisma.TransactionClient,
  executionId: string,
  sessionId: string,
  sessionValues: TrainingSessionExecutionSessionValues | undefined,
  items: TrainingSessionExecutionItemValue[]
) {
  await validatePlannedUnits(tx, sessionId, items);
  if (sessionValues) {
    const existing = await tx.workoutSessionExecution.findUnique({ where: { id: executionId }, select: { sessionValues: true } });
    await tx.workoutSessionExecution.update({
      where: { id: executionId },
      data: {
        sessionValues: {
          ...((existing?.sessionValues ?? {}) as Record<string, unknown>),
          ...sessionValues,
        } as Prisma.InputJsonValue,
      },
    });
  }
  for (const item of items) {
    const setNumber = item.setNumber ?? 0;
    await tx.workoutSessionExecutionItem.upsert({
      where: { executionId_plannedUnitId_setNumber: { executionId, plannedUnitId: item.plannedUnitId, setNumber } },
      create: {
        executionId,
        plannedUnitId: item.plannedUnitId,
        setNumber,
        loadKg: item.loadKg,
        repetitions: item.repetitions,
        durationSec: item.durationSec,
        distanceKm: item.distanceKm,
        pace: item.pace,
        heartRateBpm: item.heartRateBpm,
        heartRateZone: item.heartRateZone,
      },
      update: {
        loadKg: item.loadKg,
        repetitions: item.repetitions,
        durationSec: item.durationSec,
        distanceKm: item.distanceKm,
        pace: item.pace,
        heartRateBpm: item.heartRateBpm,
        heartRateZone: item.heartRateZone,
      },
    });
  }
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
  }): Promise<TrainingSessionExecutionView> {
    const operationKey = ensureOperationKey(input.operationKey);
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) throw new WorkoutSessionExecutionInputError('Versão esperada inválida.');
    const reason = normalizeText(input.reason, 500);
    const sessionValues = normalizeSessionValues(input.sessionValues);
    const items = normalizeItems(input.items);
    const action = input.targetStatus ? 'transition' : 'record_values';
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

      const now = new Date();
      if (!execution) {
        execution = await tx.workoutSessionExecution.create({
          data: {
            workoutDayId: input.sessionId,
            alunoId: input.alunoId,
            contractId: input.contractId,
            originReleaseId: locked.releaseId,
            originWorkoutTemplateId: locked.workoutTemplateId,
            originTrainingPlanId: locked.trainingPlanId,
            status: currentStatus,
            version: currentVersion,
          },
        });
      }

      await persistValues(tx, execution.id, input.sessionId, sessionValues, items);

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

      const nextVersion = currentVersion + 1;
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

      const operation = await tx.workoutSessionExecutionOperation.create({
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new WorkoutSessionExecutionConflictError(
          'A sessão mudou em outro cliente. Atualize o estado antes de tentar novamente.',
          'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT'
        );
      }
      throw error;
    }
  }

  return {
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
  };
}

export const workoutSessionExecutionService = createWorkoutSessionExecutionService();
