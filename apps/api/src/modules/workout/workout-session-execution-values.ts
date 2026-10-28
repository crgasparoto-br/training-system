import { Prisma } from '@prisma/client';
import type { TrainingSessionExecutionItemValue, TrainingSessionExecutionSessionValues } from '@corrida/types';

export class WorkoutSessionExecutionInputError extends Error {
  readonly statusCode = 400;
  readonly code = 'WORKOUT_SESSION_EXECUTION_INVALID';
}

async function validatePlannedUnits(
  tx: Prisma.TransactionClient,
  executionId: string,
  sessionId: string,
  items: TrainingSessionExecutionItemValue[]
) {
  if (!items.length) return;
  const ids = [...new Set(items.map((item) => item.plannedUnitId))];
  const found = await tx.workoutExercise.findMany({
    where: { id: { in: ids }, workoutDayId: sessionId },
    select: { id: true, _count: { select: { resistanceBlocks: true } } },
  });
  if (found.length !== ids.length) throw new WorkoutSessionExecutionInputError('Uma ou mais unidades executadas não pertencem ao treino planejado.');

  const unitsById = new Map(found.map((unit) => [unit.id, unit]));
  const existingItems = await tx.workoutSessionExecutionItem.findMany({
    where: { executionId, plannedUnitId: { in: ids } },
    select: { plannedUnitId: true, setNumber: true, plannedSetId: true },
  });
  const existingByKey = new Map(existingItems.map((item) => [`${item.plannedUnitId}:${item.setNumber}`, item]));
  for (const item of items) {
    const unit = unitsById.get(item.plannedUnitId);
    const existing = existingByKey.get(`${item.plannedUnitId}:${item.setNumber ?? 0}`);
    const omittedExistingReference = item.plannedSetId === undefined && Boolean(existing?.plannedSetId);
    if (unit && unit._count.resistanceBlocks > 0 && !item.plannedSetId && !omittedExistingReference) {
      throw new WorkoutSessionExecutionInputError('A série planejada é obrigatória para unidades estruturadas.');
    }
  }

  const setIds = [...new Set(items.flatMap((item) => item.plannedSetId ? [item.plannedSetId] : []))];
  if (!setIds.length) return;
  const plannedSets = await tx.workoutExercisePlannedSet.findMany({
    where: { id: { in: setIds } },
    select: { id: true, block: { select: { workoutExerciseId: true } } },
  });
  const setsById = new Map(plannedSets.map((set) => [set.id, set]));
  for (const item of items) {
    if (!item.plannedSetId) continue;
    const plannedSet = setsById.get(item.plannedSetId);
    if (!plannedSet || plannedSet.block.workoutExerciseId !== item.plannedUnitId) {
      throw new WorkoutSessionExecutionInputError('Uma ou mais séries planejadas não pertencem à unidade executada.');
    }
  }
}

export async function persistWorkoutSessionValues(
  tx: Prisma.TransactionClient,
  executionId: string,
  sessionId: string,
  sessionValues: TrainingSessionExecutionSessionValues | undefined,
  items: TrainingSessionExecutionItemValue[],
  completedAt?: Date
): Promise<Prisma.InputJsonValue | undefined> {
  await validatePlannedUnits(tx, executionId, sessionId, items);
  let mergedSessionValues: Prisma.InputJsonValue | undefined;
  if (sessionValues) {
    const existing = await tx.workoutSessionExecution.findUnique({ where: { id: executionId }, select: { sessionValues: true } });
    mergedSessionValues = {
      ...((existing?.sessionValues ?? {}) as Record<string, unknown>),
      ...sessionValues,
    } as Prisma.InputJsonValue;
  }
  for (const item of items) {
    const setNumber = item.setNumber ?? 0;
    const existingItem = await tx.workoutSessionExecutionItem.findUnique({
      where: { executionId_plannedUnitId_setNumber: { executionId, plannedUnitId: item.plannedUnitId, setNumber } },
      select: { plannedSetId: true, completedAt: true },
    });
    if (existingItem?.completedAt) {
      throw new WorkoutSessionExecutionInputError('Esta série já foi concluída e não pode ser reescrita.');
    }
    if (existingItem?.plannedSetId && item.plannedSetId && existingItem.plannedSetId !== item.plannedSetId) {
      throw new WorkoutSessionExecutionInputError('A série planejada não corresponde ao registro existente.');
    }
    const persistedPlannedSetId = item.plannedSetId === undefined
      ? existingItem?.plannedSetId ?? null
      : item.plannedSetId;
    await tx.workoutSessionExecutionItem.upsert({
      where: { executionId_plannedUnitId_setNumber: { executionId, plannedUnitId: item.plannedUnitId, setNumber } },
      create: {
        executionId,
        plannedUnitId: item.plannedUnitId,
        plannedSetId: persistedPlannedSetId,
        setNumber,
        ...(completedAt ? { completedAt } : {}),
        loadKg: item.loadKg,
        repetitions: item.repetitions,
        durationSec: item.durationSec,
        distanceKm: item.distanceKm,
        pace: item.pace,
        heartRateBpm: item.heartRateBpm,
        heartRateZone: item.heartRateZone,
      },
      update: {
        plannedSetId: persistedPlannedSetId,
        ...(completedAt ? { completedAt } : {}),
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
  return mergedSessionValues;
}
