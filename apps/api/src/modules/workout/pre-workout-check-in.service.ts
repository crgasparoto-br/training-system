import { createHash } from 'node:crypto';
import { Prisma, PrismaClient, type PreWorkoutCheckIn } from '@prisma/client';
import {
  PRE_WORKOUT_CHECK_IN_RULE_SET_VERSION,
  type PreWorkoutCheckInRuleSnapshot,
  type PreWorkoutCheckInValues,
  type PreWorkoutCheckInView,
  type TrainingRoutineAudience,
  type TrainingRoutineExecutionProjectionStatus,
  type UpsertPreWorkoutCheckInPayload,
} from '@corrida/types';

const prisma = new PrismaClient();
type LockedSession = { id: string; status: 'planned' | 'in_progress' | 'completed' };

export class PreWorkoutCheckInInputError extends Error {
  readonly statusCode = 400;
  readonly code = 'PRE_WORKOUT_CHECK_IN_INVALID';
}
export class PreWorkoutCheckInNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'PRE_WORKOUT_CHECK_IN_SESSION_NOT_FOUND';
}
export class PreWorkoutCheckInConflictError extends Error {
  readonly statusCode = 409;
  constructor(
    message: string,
    readonly code: 'PRE_WORKOUT_CHECK_IN_LOCKED' | 'PRE_WORKOUT_CHECK_IN_IDEMPOTENCY_CONFLICT'
  ) {
    super(message);
  }
}

export function evaluatePreWorkoutCheckInRules(painLevel: number | null): PreWorkoutCheckInRuleSnapshot {
  if (painLevel === null) {
    return {
      version: PRE_WORKOUT_CHECK_IN_RULE_SET_VERSION,
      painTriage: null,
      studentMessage: null,
      technicalMessage: null,
      blocksWorkout: false,
      changesWorkoutAutomatically: false,
    };
  }
  if (painLevel <= 2) {
    return {
      version: PRE_WORKOUT_CHECK_IN_RULE_SET_VERSION,
      painTriage: 'green',
      studentMessage: 'Dor ou desconforto registrado na faixa verde da regra atual.',
      technicalMessage: 'Dor/desconforto 0–2: faixa verde do contrato canônico do check-in.',
      blocksWorkout: false,
      changesWorkoutAutomatically: false,
    };
  }
  if (painLevel <= 4) {
    return {
      version: PRE_WORKOUT_CHECK_IN_RULE_SET_VERSION,
      painTriage: 'attention',
      studentMessage: 'Atenção ao desconforto informado. Se ele piorar ou limitar o movimento, converse com seu professor.',
      technicalMessage: 'Dor/desconforto 3–4: faixa de atenção do contrato canônico do check-in.',
      blocksWorkout: false,
      changesWorkoutAutomatically: false,
    };
  }
  return {
    version: PRE_WORKOUT_CHECK_IN_RULE_SET_VERSION,
    painTriage: 'alert',
    studentMessage: 'O desconforto informado merece acompanhamento. Converse com seu professor antes de decidir como seguir.',
    technicalMessage: 'Dor/desconforto >4: alerta para acompanhamento. A regra não altera nem bloqueia o treino automaticamente.',
    blocksWorkout: false,
    changesWorkoutAutomatically: false,
  };
}

function normalizePayload(payload: UpsertPreWorkoutCheckInPayload) {
  const scale = (value: number | null | undefined, field: string) => {
    if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 0 || value > 10)) {
      throw new PreWorkoutCheckInInputError(`${field} deve ser um inteiro de 0 a 10`);
    }
  };
  scale(payload.psr, 'PSR');
  scale(payload.sleepQuality, 'Qualidade do sono');
  scale(payload.fatigue, 'Fadiga');
  scale(payload.motivation, 'Motivação');
  if (payload.painLevel !== undefined && payload.painLevel !== null && (!Number.isInteger(payload.painLevel) || payload.painLevel < 0)) {
    throw new PreWorkoutCheckInInputError('Dor/desconforto deve ser um inteiro maior ou igual a zero');
  }
  if (payload.availableMinutes !== undefined && payload.availableMinutes !== null && (!Number.isInteger(payload.availableMinutes) || payload.availableMinutes < 0)) {
    throw new PreWorkoutCheckInInputError('Disponibilidade de tempo deve ser informada em minutos inteiros');
  }
  const notes = payload.notes === undefined ? undefined : payload.notes === null ? null : payload.notes.trim() || null;
  if (notes && notes.length > 500) throw new PreWorkoutCheckInInputError('Observação deve ter no máximo 500 caracteres');
  return { psr: payload.psr, sleepQuality: payload.sleepQuality, fatigue: payload.fatigue, painLevel: payload.painLevel, motivation: payload.motivation, availableMinutes: payload.availableMinutes, notes };
}

function toValues(row: PreWorkoutCheckIn): PreWorkoutCheckInValues {
  return {
    psr: row.psr,
    sleepQuality: row.sleepQuality,
    fatigue: row.fatigue,
    painLevel: row.painLevel,
    motivation: row.motivation,
    availableMinutes: row.availableMinutes,
    notes: row.notes,
  };
}

function mergeValues(current: PreWorkoutCheckInValues | null, patch: ReturnType<typeof normalizePayload>): PreWorkoutCheckInValues {
  const base = current ?? { psr: null, sleepQuality: null, fatigue: null, painLevel: null, motivation: null, availableMinutes: null, notes: null };
  return {
    psr: patch.psr === undefined ? base.psr : patch.psr,
    sleepQuality: patch.sleepQuality === undefined ? base.sleepQuality : patch.sleepQuality,
    fatigue: patch.fatigue === undefined ? base.fatigue : patch.fatigue,
    painLevel: patch.painLevel === undefined ? base.painLevel : patch.painLevel,
    motivation: patch.motivation === undefined ? base.motivation : patch.motivation,
    availableMinutes: patch.availableMinutes === undefined ? base.availableMinutes : patch.availableMinutes,
    notes: patch.notes === undefined ? base.notes : patch.notes,
  };
}

function publicStatus(status: LockedSession['status']): TrainingRoutineExecutionProjectionStatus {
  return status === 'planned' ? 'not_started' : status === 'in_progress' ? 'in_progress' : 'completed';
}

export function projectPreWorkoutCheckIn(
  row: PreWorkoutCheckIn,
  audience: TrainingRoutineAudience,
  status: TrainingRoutineExecutionProjectionStatus
): PreWorkoutCheckInView {
  const snapshot = row.ruleSnapshot as unknown as PreWorkoutCheckInRuleSnapshot;
  return {
    id: row.id,
    sessionId: row.workoutDayId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editable: status === 'not_started',
    values: toValues(row),
    guidance: {
      painTriage: snapshot.painTriage ?? null,
      studentMessage: snapshot.studentMessage ?? null,
      blocksWorkout: false,
      changesWorkoutAutomatically: false,
    },
    ...(audience === 'professor'
      ? { technical: { ruleSetVersion: row.ruleSetVersion, technicalMessage: snapshot.technicalMessage ?? null } }
      : {}),
  };
}

async function lockReleasedSession(tx: Prisma.TransactionClient, sessionId: string, alunoId: string, contractId: string) {
  const rows = await tx.$queryRaw<LockedSession[]>(Prisma.sql`
    SELECT wd."id", wd."status"
    FROM "WorkoutDay" wd
    INNER JOIN "WorkoutTemplate" wt ON wt."id" = wd."templateId"
    INNER JOIN "TrainingPlan" tp ON tp."id" = wt."planId"
    INNER JOIN "Aluno" a ON a."id" = tp."alunoId"
    WHERE wd."id" = ${sessionId}
      AND wt."released" = TRUE
      AND tp."alunoId" = ${alunoId}
      AND a."contractId" = ${contractId}
      AND EXISTS (
        SELECT 1 FROM "ConsolidatedPrescriptionOperationalRelease" rel
        WHERE rel."workoutTemplateId" = wt."id"
          AND rel."alunoId" = ${alunoId}
          AND rel."contractId" = ${contractId}
      )
    LIMIT 1
    FOR UPDATE OF wd
  `);
  return rows[0] ?? null;
}

export function createPreWorkoutCheckInService(client: PrismaClient = prisma) {
  return {
    async getForSession(input: { sessionId: string; alunoId: string; contractId: string; audience: TrainingRoutineAudience }) {
      const session = await client.workoutDay.findFirst({
        where: { id: input.sessionId, template: { released: true, plan: { alunoId: input.alunoId, aluno: { contractId: input.contractId } } } },
        select: { id: true, status: true, templateId: true },
      });
      if (!session) throw new PreWorkoutCheckInNotFoundError('Sessão de treino não encontrada');
      const release = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT rel."id"
        FROM "ConsolidatedPrescriptionOperationalRelease" rel
        WHERE rel."workoutTemplateId" = ${session.templateId}
          AND rel."alunoId" = ${input.alunoId}
          AND rel."contractId" = ${input.contractId}
        LIMIT 1
      `);
      if (!release[0]) throw new PreWorkoutCheckInNotFoundError('Sessão de treino não encontrada');
      const checkIn = await client.preWorkoutCheckIn.findFirst({
        where: { workoutDayId: input.sessionId, alunoId: input.alunoId, contractId: input.contractId },
      });
      return checkIn ? projectPreWorkoutCheckIn(checkIn, input.audience, publicStatus(session.status)) : null;
    },

    async saveForStudent(input: { sessionId: string; alunoId: string; contractId: string; actorUserId: string; payload: UpsertPreWorkoutCheckInPayload }) {
      const operationKey = input.payload.operationKey.trim();
      if (operationKey.length < 8 || operationKey.length > 128) throw new PreWorkoutCheckInInputError('Chave da operação inválida');
      const patch = normalizePayload(input.payload);

      return client.$transaction(async (tx) => {
        const session = await lockReleasedSession(tx, input.sessionId, input.alunoId, input.contractId);
        if (!session) throw new PreWorkoutCheckInNotFoundError('Sessão de treino não encontrada');
        if (session.status !== 'planned') {
          throw new PreWorkoutCheckInConflictError('O check-in fica somente leitura depois que o treino é iniciado.', 'PRE_WORKOUT_CHECK_IN_LOCKED');
        }

        const existing = await tx.preWorkoutCheckIn.findFirst({
          where: { workoutDayId: input.sessionId, alunoId: input.alunoId, contractId: input.contractId },
        });
        const values = mergeValues(existing ? toValues(existing) : null, patch);
        if (!Object.values(values).some((value) => value !== null)) throw new PreWorkoutCheckInInputError('Informe pelo menos um dado do check-in');
        const payloadFingerprint = createHash('sha256').update(JSON.stringify(patch)).digest('hex');

        if (existing) {
          const priorOperation = await tx.preWorkoutCheckInOperation.findUnique({
            where: { checkInId_operationKey: { checkInId: existing.id, operationKey } },
          });
          if (priorOperation) {
            if (priorOperation.payloadFingerprint !== payloadFingerprint) {
              throw new PreWorkoutCheckInConflictError('A mesma chave de operação já foi usada com dados diferentes.', 'PRE_WORKOUT_CHECK_IN_IDEMPOTENCY_CONFLICT');
            }
            return projectPreWorkoutCheckIn(existing, 'student', 'not_started');
          }
        }

        const ruleSnapshot = evaluatePreWorkoutCheckInRules(values.painLevel);
        const checkIn = existing
          ? await tx.preWorkoutCheckIn.update({
              where: { id: existing.id },
              data: { ...values, ruleSetVersion: ruleSnapshot.version, ruleSnapshot: ruleSnapshot as unknown as Prisma.InputJsonValue },
            })
          : await tx.preWorkoutCheckIn.create({
              data: {
                workoutDayId: input.sessionId,
                alunoId: input.alunoId,
                contractId: input.contractId,
                ...values,
                ruleSetVersion: ruleSnapshot.version,
                ruleSnapshot: ruleSnapshot as unknown as Prisma.InputJsonValue,
                createdByUserId: input.actorUserId,
              },
            });

        const operation = await tx.preWorkoutCheckInOperation.create({
          data: { checkInId: checkIn.id, operationKey, payloadFingerprint, action: existing ? 'updated' : 'created' },
        });
        const lifecycleEvent = await tx.studentLifecycleEvent.create({
          data: {
            alunoId: input.alunoId,
            contractId: input.contractId,
            eventType: 'STATUS_CHANGED',
            actorUserId: input.actorUserId,
            metadata: {
              eventKey: `pre-workout-check-in:${checkIn.id}:${operation.id}`,
              domain: 'pre_workout_check_in',
              action: existing ? 'updated' : 'created',
              checkInId: checkIn.id,
              workoutDayId: input.sessionId,
              operationId: operation.id,
              ruleSetVersion: ruleSnapshot.version,
            },
          },
          select: { id: true },
        });
        await tx.preWorkoutCheckInOperation.update({ where: { id: operation.id }, data: { lifecycleEventId: lifecycleEvent.id } });
        return projectPreWorkoutCheckIn(checkIn, 'student', 'not_started');
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    },
  };
}

export const preWorkoutCheckInService = createPreWorkoutCheckInService();
