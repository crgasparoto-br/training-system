import { Prisma } from '@prisma/client';
import type { TrainingSessionExecutionItemValue, TrainingSessionExecutionSessionValues } from '@corrida/types';

export class WorkoutSessionExecutionInputError extends Error {
  readonly statusCode = 400;
  readonly code = 'WORKOUT_SESSION_EXECUTION_INVALID';
}

/**
 * Keep every value-entry path aligned with the canonical #399/#487 planned-set order.
 * Zero is the legacy omitted ordinal. No confirmed history can be renumbered.
 */
async function validatePlannedUnits(
  tx: Prisma.TransactionClient,
  executionId: string,
  sessionId: string,
  items: TrainingSessionExecutionItemValue[]
): Promise<TrainingSessionExecutionItemValue[]> {
  if (!items.length) return items;
  const ids = [...new Set(items.map((item) => item.plannedUnitId))];
  const found = await tx.workoutExercise.findMany({
    where: { id: { in: ids }, workoutDayId: sessionId },
    select: { id: true, _count: { select: { resistanceBlocks: true } } },
  });
  if (found.length !== ids.length) {
    throw new WorkoutSessionExecutionInputError('Uma ou mais unidades executadas não pertencem ao treino planejado.');
  }
  const unitsById = new Map(found.map((unit) => [unit.id, unit]));
  // Set positions are relative to blocks. Rank every set over all blocks of its exercise.
  const plannedSets = await tx.workoutExercisePlannedSet.findMany({
    where: { block: { workoutExerciseId: { in: ids } } },
    select: { id: true, position: true, block: { select: { position: true, workoutExerciseId: true } } },
  });
  const orderedSets = [...plannedSets].sort((left, right) =>
    left.block.workoutExerciseId.localeCompare(right.block.workoutExerciseId)
    || left.block.position - right.block.position || left.position - right.position
    || left.id.localeCompare(right.id));
  const ordinalBySet = new Map<string, { unitId: string; ordinal: number }>();
  const countByUnit = new Map<string, number>();
  for (const set of orderedSets) {
    const unitId = set.block.workoutExerciseId;
    const ordinal = (countByUnit.get(unitId) ?? 0) + 1;
    countByUnit.set(unitId, ordinal);
    ordinalBySet.set(set.id, { unitId, ordinal });
  }
  const existingItems = await tx.workoutSessionExecutionItem.findMany({
    where: { executionId, plannedUnitId: { in: ids } },
    select: { id: true, plannedUnitId: true, setNumber: true, plannedSetId: true, completedAt: true },
  });
  const byKey = new Map(existingItems.map((row) => [row.plannedUnitId + ':' + row.setNumber, row]));

  const normalized = items.map((item) => {
    const unit = unitsById.get(item.plannedUnitId)!;
    const existingAtKey = byKey.get(item.plannedUnitId + ':' + (item.setNumber ?? 0));
    const matches = existingItems.filter((row) => row.plannedUnitId === item.plannedUnitId && row.plannedSetId);
    const inherited = existingAtKey?.plannedSetId
      ?? ((item.setNumber ?? 0) === 0 && matches.length === 1 ? matches[0].plannedSetId : null);
    if (unit._count.resistanceBlocks > 0 && item.plannedSetId === null) {
      throw new WorkoutSessionExecutionInputError('A série planejada não pode ser removida de uma unidade estruturada.');
    }
    const plannedSetId = item.plannedSetId === undefined ? inherited : item.plannedSetId;
    if (unit._count.resistanceBlocks > 0 && !plannedSetId) {
      throw new WorkoutSessionExecutionInputError('A série planejada é obrigatória para unidades estruturadas.');
    }
    if (!plannedSetId) return item;
    const plannedSet = ordinalBySet.get(plannedSetId);
    if (!plannedSet || plannedSet.unitId !== item.plannedUnitId) {
      throw new WorkoutSessionExecutionInputError('Uma ou mais séries planejadas não pertencem à unidade executada.');
    }
    if ((item.setNumber ?? 0) !== 0 && item.setNumber !== plannedSet.ordinal) {
      throw new WorkoutSessionExecutionInputError('O número da série não corresponde à ordem do planejamento liberado.');
    }
    return { ...item, plannedSetId, setNumber: plannedSet.ordinal };
  });
  const uniqueKeys = new Set<string>();
  for (const item of normalized) {
    const key = item.plannedUnitId + ':' + (item.setNumber ?? 0);
    if (uniqueKeys.has(key)) throw new WorkoutSessionExecutionInputError('A mesma série planejada foi informada mais de uma vez.');
    uniqueKeys.add(key);
  }

  // Reconcile historic poisoned drafts only when no collision or confirmation exists.
  // A collision is an explicit error: never overwrite recorded repetitions/load.
  for (const row of existingItems) {
    if (!row.plannedSetId) continue;
    const expected = ordinalBySet.get(row.plannedSetId);
    if (!expected || expected.unitId !== row.plannedUnitId || expected.ordinal === row.setNumber) continue;
    const destination = row.plannedUnitId + ':' + expected.ordinal;
    if (row.completedAt || (byKey.has(destination) && byKey.get(destination)?.id !== row.id)) {
      throw new WorkoutSessionExecutionInputError('Existe um registro de série incompatível que requer reconciliação supervisionada.');
    }
    await tx.workoutSessionExecutionItem.update({ where: { id: row.id }, data: { setNumber: expected.ordinal } });
    byKey.delete(row.plannedUnitId + ':' + row.setNumber);
    byKey.set(destination, { ...row, setNumber: expected.ordinal });
  }
  return normalized;
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
  items: TrainingSessionExecutionItemValue[],
  completedAt?: Date,
  completionOperationId?: string
): Promise<Prisma.InputJsonValue | undefined> {
  if (completedAt && !completionOperationId) {
    throw new WorkoutSessionExecutionInputError('A conclusão guiada exige uma operação canônica vinculada.');
  }
  const validItems = await validatePlannedUnits(tx, executionId, sessionId, items);
  await validateStructuredValues(tx, sessionId, sessionValues);
  let mergedSessionValues: Prisma.InputJsonValue | undefined;
  if (sessionValues) {
    const existing = await tx.workoutSessionExecution.findUnique({ where: { id: executionId }, select: { sessionValues: true } });
    mergedSessionValues = {
      ...((existing?.sessionValues ?? {}) as Record<string, unknown>),
      ...sessionValues,
    } as Prisma.InputJsonValue;
  }
  for (const item of validItems) {
    const setNumber = item.setNumber ?? 0;
    const existingItem = await tx.workoutSessionExecutionItem.findUnique({
      where: { executionId_plannedUnitId_setNumber: { executionId, plannedUnitId: item.plannedUnitId, setNumber } },
      select: { plannedSetId: true, completedAt: true, outcome: true, substitutionNote: true },
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
    const outcome = item.outcome ?? existingItem?.outcome ?? null;
    const substitutionNote = outcome === 'substituted'
      ? item.substitutionNote === undefined
        ? existingItem?.substitutionNote ?? null
        : item.substitutionNote
      : null;
    if (outcome === 'substituted' && !substitutionNote?.trim()) {
      throw new WorkoutSessionExecutionInputError('Substituição exige uma descrição.');
    }
    if (persistedPlannedSetId && await tx.workoutSessionExecutionItem.findFirst({
      where: { executionId, plannedSetId: persistedPlannedSetId, completedAt: { not: null } },
      select: { id: true },
    })) {
      throw new WorkoutSessionExecutionInputError('Esta série planejada já foi concluída.');
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
        ...(completedAt ? { completedAt, completedByOperationId: completionOperationId } : {}),
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
        ...(completedAt ? { completedAt, completedByOperationId: completionOperationId } : {}),
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
