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


/** Reject cross-session or synthetic identifiers before any executed values are persisted. */
async function validateStructuredValues(
  tx: Prisma.TransactionClient,
  sessionId: string,
  values: TrainingSessionExecutionSessionValues | undefined,
) {
  const stages = values?.cyclicStages ?? [];
  if (stages.length > 0) {
    const ids = [...new Set(stages.map((item) => item.plannedStageId))];
    const found = await tx.workoutCyclicStage.findMany({
      where: { id: { in: ids }, workoutDayId: sessionId },
      select: { id: true, parent: { select: { kind: true, repeatCount: true } } },
    });
    if (found.length !== ids.length) {
      throw new WorkoutSessionExecutionInputError('Uma ou mais etapas não pertencem ao treino planejado.');
    }
    const allowed = new Map(found.map((item) => [item.id, item.parent]));
    for (const item of stages) {
      const parent = allowed.get(item.plannedStageId);
      const repetitions = parent?.kind === 'repeat' ? parent.repeatCount ?? 1 : 1;
      if ((item.iteration ?? 1) > repetitions) {
        throw new WorkoutSessionExecutionInputError('Repetição de etapa fora do planejamento.');
      }
    }
  }

  const groups = values?.resistanceGroups ?? [];
  if (groups.length > 0) {
    const ids = [...new Set(groups.map((item) => item.plannedGroupId))];
    const found = await tx.workoutResistanceGroup.findMany({
      where: { id: { in: ids }, workoutDayId: sessionId },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new WorkoutSessionExecutionInputError('Um ou mais agrupamentos não pertencem ao treino planejado.');
    }
  }
}

export async function persistWorkoutSessionValues(
  tx: Prisma.TransactionClient,
  executionId: string,
  sessionId: string,
  sessionValues: TrainingSessionExecutionSessionValues | undefined,
  items: TrainingSessionExecutionItemValue[]
): Promise<Prisma.InputJsonValue | undefined> {
  await validatePlannedUnits(tx, executionId, sessionId, items);
  await validateStructuredValues(tx, sessionId, sessionValues);
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
      select: { plannedSetId: true, outcome: true, substitutionNote: true },
    });
    const persistedPlannedSetId = item.plannedSetId === undefined
      ? existingItem?.plannedSetId ?? null
      : item.plannedSetId;
    const outcome = item.outcome ?? existingItem?.outcome ?? null;
    const substitutionNote = outcome === 'substituted'
      ? item.substitutionNote === undefined
        ? existingItem?.substitutionNote ?? null
        : item.substitutionNote
      : null;
    if (outcome === 'substituted' && !substitutionNote?.trim()) {
      throw new WorkoutSessionExecutionInputError('Substituição exige uma descrição.');
    }
    await tx.workoutSessionExecutionItem.upsert({
      where: { executionId_plannedUnitId_setNumber: { executionId, plannedUnitId: item.plannedUnitId, setNumber } },
      create: {
        executionId,
        plannedUnitId: item.plannedUnitId,
        plannedSetId: persistedPlannedSetId,
        setNumber,
        outcome,
        substitutionNote,
        rir: item.rir,
        rpe: item.rpe,
        tempo: item.tempo,
        restSec: item.restSec,
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
        outcome,
        substitutionNote,
        rir: item.rir,
        rpe: item.rpe,
        tempo: item.tempo,
        restSec: item.restSec,
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
