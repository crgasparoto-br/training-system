import { Prisma, type PrismaClient } from '@prisma/client';
import { projectWorkoutDayExerciseCatalog } from './workout-release-catalog.js';

import { ResistanceStructureNotFoundError, ResistanceStructureValidationError, type ResistanceBlockInput, type ResistancePlannedSetInput } from './resistance-structure.domain.js';

import type { CreateWorkoutTemplateDTO } from './workout.service.js';



export function normalizeWorkoutTemplateUpdateData(
  data: Partial<CreateWorkoutTemplateDTO>
): Prisma.WorkoutTemplateUncheckedUpdateInput {
  const { alunoGoal, ...rest } = data;

  return {
    ...rest,
    ...(alunoGoal !== undefined ? { studentGoal: alunoGoal } : {}),
  };
}

export function serializeWorkoutTemplate<T extends { studentGoal?: string | null } | null>(template: T) {
  if (!template) {
    return template;
  }

  const withCatalog = 'workoutDays' in template && Array.isArray(template.workoutDays)
    ? { ...template, workoutDays: template.workoutDays.map((day) =>
        projectWorkoutDayExerciseCatalog(day, 'released' in template && template.released === true)) }
    : template;
  return {
    ...withCatalog,
    alunoGoal: template.studentGoal,
  };
}


export function isWorkoutTemplateUniqueConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  const target = error.meta?.target;
  if (!Array.isArray(target)) return false;

  return ['planId', 'mesocycleNumber', 'weekNumber'].every((field) =>
    target.includes(field)
  );
}


export class WorkoutPlanningLockedError extends Error {
  readonly statusCode = 409;
  readonly code = 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START';

  constructor() {
    super('O planejamento desta sessão não pode ser alterado depois que a execução foi iniciada.');
  }
}


export async function assertDayContract(
  tx: Prisma.TransactionClient,
  workoutDayId: string,
  contractId: string,
  exerciseId?: string,
) {
  const day = await tx.workoutDay.findFirst({
    where: { id: workoutDayId, template: { plan: { aluno: { contractId } } } },
    select: { id: true },
  });
  if (!day) throw new ResistanceStructureNotFoundError();
  if (exerciseId !== undefined) {
    const libraryExercise = await tx.exerciseLibrary.findFirst({
      where: { id: exerciseId, contractId }, select: { id: true },
    });
    if (!libraryExercise) throw new ResistanceStructureValidationError('Exercício fora do contrato.');
  }
}

/** Preserve the released version as an immutable source of truth. */
async function rejectFrozenPlanning(tx: Prisma.TransactionClient, workoutDayId: string) {
  const day = await tx.workoutDay.findUnique({
    where: { id: workoutDayId },
    select: { template: { select: { released: true } } },
  });
  if (!day) throw new Error('Workout day not found');
  if (day.template.released) throw new WorkoutPlanningLockedError();
}

export function nestedResistanceBlocks(blocks: Array<Omit<ResistanceBlockInput, 'kind'> & { kind: string }>) {
  return {
    create: blocks.map((block) => ({
      position: block.position,
      kind: block.kind,
      notes: block.notes,
      plannedSets: {
        create: block.plannedSets.map((set) => ({
          position: set.position,
          repsMin: set.repsMin,
          repsMax: set.repsMax,
          loadKg: set.loadKg,
          loadPercent: set.loadPercent,
          rir: set.rir,
          rpe: set.rpe,
          tempo: set.tempo,
          restSec: set.restSec,
          notes: set.notes,
        })),
      },
    })),
  };
}
export function comparableResistanceBlocks(blocks: ReadonlyArray<{
  position: number;
  kind: string;
  notes?: string | null;
  plannedSets: ReadonlyArray<ResistancePlannedSetInput>;
}>) {
  return JSON.stringify(blocks.map((block) => ({
    position: block.position,
    kind: block.kind,
    notes: block.notes ?? null,
    plannedSets: block.plannedSets.map((set) => ({
      position: set.position,
      repsMin: set.repsMin ?? null,
      repsMax: set.repsMax ?? null,
      loadKg: set.loadKg ?? null,
      loadPercent: set.loadPercent ?? null,
      rir: set.rir ?? null,
      rpe: set.rpe ?? null,
      tempo: set.tempo ?? null,
      restSec: set.restSec ?? null,
      notes: set.notes ?? null,
    })),
  })));
}

export const resistanceBlockInclude = {
  orderBy: { position: 'asc' as const },
  include: { plannedSets: { orderBy: { position: 'asc' as const } } },
};


export function isSerializableTransactionConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010') return false;

  const meta = error.meta as { code?: unknown; message?: unknown } | undefined;
  return meta?.code === '40001'
    || (typeof meta?.message === 'string'
      && /could not serialize access|serialization failure/i.test(meta.message));
}

export async function lockWorkoutDayPlanningMutable(
  tx: Prisma.TransactionClient,
  workoutDayId: string
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT wd."id"
    FROM "WorkoutDay" wd
    WHERE wd."id" = ${workoutDayId}
    FOR UPDATE
  `);

  await rejectFrozenPlanning(tx, workoutDayId);
  const execution = await tx.workoutSessionExecution.findUnique({
    where: { workoutDayId },
    select: { status: true },
  });
  if (execution && execution.status !== 'not_started') throw new WorkoutPlanningLockedError();
  // Legacy workout executions also represent history: never cascade-delete them.
  const legacy = await tx.workoutExecution.findFirst({
    where: { workoutExercise: { workoutDayId } },
    select: { id: true },
  });
  if (legacy) throw new WorkoutPlanningLockedError();
}

export async function lockWorkoutTemplatePlanningMutable(
  tx: Prisma.TransactionClient,
  templateId: string
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT t."id"
    FROM "WorkoutTemplate" t
    WHERE t."id" = ${templateId}
    FOR UPDATE
  `);

  await tx.$queryRaw(Prisma.sql`
    SELECT wd."id"
    FROM "WorkoutDay" wd
    WHERE wd."templateId" = ${templateId}
    ORDER BY wd."id"
    FOR UPDATE
  `);

  const template = await tx.workoutTemplate.findUnique({ where: { id: templateId }, select: { released: true } });
  if (template?.released) throw new WorkoutPlanningLockedError();
  const started = await tx.workoutSessionExecution.findFirst({
    where: {
      workoutDay: { templateId },
      status: { not: 'not_started' },
    },
    select: { id: true },
  });
  if (started) throw new WorkoutPlanningLockedError();
  const legacy = await tx.workoutExecution.findFirst({
    where: { workoutExercise: { workoutDay: { templateId } } },
    select: { id: true },
  });
  if (legacy) throw new WorkoutPlanningLockedError();
}

export async function touchWorkoutTemplateRevision(
  tx: Prisma.TransactionClient,
  templateId: string,
) {
  await tx.$executeRaw(Prisma.sql`
    UPDATE "WorkoutTemplate"
    SET "updatedAt" = GREATEST("updatedAt" + INTERVAL '1 millisecond', clock_timestamp() AT TIME ZONE 'UTC')
    WHERE "id" = ${templateId}
  `);
}

export async function withWorkoutDayPlanningMutation<T>(
  client: PrismaClient,
  workoutDayId: string,
  mutation: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { touchRevision?: (result: T) => boolean } = {},
) {
  let retries = 0;
  while (true) {
    try {
      return await client.$transaction(async (tx) => {
        await lockWorkoutDayPlanningMutable(tx, workoutDayId);
        const parent = await tx.workoutDay.findUnique({
          where: { id: workoutDayId },
          select: { templateId: true },
        });
        if (!parent) throw new ResistanceStructureNotFoundError();
        const result = await mutation(tx);
        if (options.touchRevision?.(result) ?? true) {
          await touchWorkoutTemplateRevision(tx, parent.templateId);
        }
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isSerializableTransactionConflict(error)) throw error;
      const execution = await client.workoutSessionExecution.findUnique({
        where: { workoutDayId },
        select: { status: true },
      });
      if (execution && execution.status !== 'not_started') throw new WorkoutPlanningLockedError();
      if (retries < 4) {
        retries += 1;
        await new Promise((resolve) => setTimeout(resolve, retries * 25));
        continue;
      }
      throw error;
    }
  }
}

export async function withWorkoutTemplatePlanningMutation<T>(
  client: PrismaClient,
  templateId: string,
  mutation: (tx: Prisma.TransactionClient) => Promise<T>
) {
  let retries = 0;
  while (true) {
    try {
      return await client.$transaction(async (tx) => {
        await lockWorkoutTemplatePlanningMutable(tx, templateId);
        return mutation(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isSerializableTransactionConflict(error)) {
        throw error;
      }
      if (retries < 4) {
        retries += 1;
        await new Promise((resolve) => setTimeout(resolve, retries * 25));
        continue;
      }

      const started = await client.workoutSessionExecution.findFirst({
        where: {
          workoutDay: { templateId },
          status: { not: 'not_started' },
        },
        select: { id: true },
      });
      if (started) throw new WorkoutPlanningLockedError();
      throw error;
    }
  }
}

export async function withTemplateCopyRetry<T>(operation: () => Promise<T>) {
  let retries = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isSerializableTransactionConflict(error) && !isWorkoutTemplateUniqueConflict(error)) {
        throw error;
      }
      if (retries >= 4) throw error;
      retries += 1;
      await new Promise((resolve) => setTimeout(resolve, retries * 25));
    }
  }
}

/** Rebase each canonical weekday onto the target week, retaining the target anchor's UTC clock. */
export function workoutDateInTargetWeek(targetWeekStartDate: Date, dayOfWeek: number): Date {
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    throw new Error('Invalid source workout weekday');
  }
  const targetWeekday = targetWeekStartDate.getUTCDay() || 7;
  const result = new Date(targetWeekStartDate);
  result.setUTCDate(result.getUTCDate() + dayOfWeek - targetWeekday);
  return result;
}

/**
 * Service de Montagem e ExecuÃ§Ã£o de Treinos
 */