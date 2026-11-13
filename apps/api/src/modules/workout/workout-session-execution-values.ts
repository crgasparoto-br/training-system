import { Prisma } from '@prisma/client';
import { MAX_CYCLIC_STAGE_EXECUTION_RECORDS } from './cyclic-stages.domain.js';
import { assertApprovedWorkoutExerciseIds } from './workout-planning.helpers.js';
import type {
  TrainingSessionExecutionItemValue,
  TrainingSessionExecutionSessionValues,
  TrainingSessionExecutionSessionValuesPatch,
  TrainingSessionCyclicStageExecutionValue,
  TrainingSessionResistanceGroupExecutionValue,
} from '@corrida/types';

export class WorkoutSessionExecutionInputError extends Error {
  readonly statusCode = 400;
  readonly code = 'WORKOUT_SESSION_EXECUTION_INVALID';
}

// A negative outcome is a declaration that the unit was not executed. Numeric
// zero is an actual recorded measurement and must not be treated as missing.
const CYCLIC_STAGE_MEASUREMENTS = [
  'durationSec', 'distanceMeters', 'paceMinPerKm', 'speedKmh',
  'heartRateBpm', 'heartRateZone', 'pse',
] as const;
const RESISTANCE_GROUP_MEASUREMENTS = [
  'roundsCompleted', 'restBetweenExercisesSec', 'restBetweenRoundsSec',
] as const;
const EXECUTION_ITEM_MEASUREMENTS = [
  'rir', 'rpe', 'tempo', 'restSec', 'loadKg', 'repetitions',
  'durationSec', 'distanceKm', 'pace', 'heartRateBpm', 'heartRateZone',
] as const;

function assertNoMeasurementsForNotPerformed(
  outcome: string | null | undefined,
  effectiveValues: Record<string, unknown>,
  measurementKeys: readonly string[],
  label: string,
) {
  if (outcome === 'not_performed' && measurementKeys.some((key) =>
    effectiveValues[key] !== undefined && effectiveValues[key] !== null)) {
    throw new WorkoutSessionExecutionInputError(
      `${label} não realizado(a) não pode conter valores executados. Corrija a situação ou limpe explicitamente as medidas.`,
    );
  }
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
  values: TrainingSessionExecutionSessionValuesPatch | undefined,
) {
  const stages = [...(values?.cyclicStages ?? []), ...(values?.removeCyclicStages ?? [])];
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

  const groups = [...(values?.resistanceGroups ?? []).map((item) => item.plannedGroupId),
    ...(values?.removeResistanceGroups ?? [])];
  if (groups.length > 0) {
    const ids = [...new Set(groups)];
    const found = await tx.workoutResistanceGroup.findMany({
      where: { id: { in: ids }, workoutDayId: sessionId },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new WorkoutSessionExecutionInputError('Um ou mais agrupamentos não pertencem ao treino planejado.');
    }
  }
}

/** Combine the latest incremental entries with durable history by their released-plan identities.
 * A missing field means unchanged; only an explicit JSON null clears its metric. */
function mergeRecordedUnits<T extends { outcome: string; substitutionNote?: string | null }>(
  stored: T[] | undefined,
  incoming: T[] | undefined,
  removedKeys: string[],
  keyOf: (item: T) => string,
  limit: number,
  measurementKeys: readonly string[],
  label: string,
): T[] {
  const byKey = new Map<string, T>();
  for (const item of stored ?? []) {
    const key = keyOf(item);
    if (!key || byKey.has(key)) {
      throw new WorkoutSessionExecutionInputError('Histórico executado inconsistente; reconciliação supervisionada necessária.');
    }
    byKey.set(key, item);
  }
  for (const key of removedKeys) {
    if (!byKey.delete(key)) {
      throw new WorkoutSessionExecutionInputError('A unidade informada para remoção não possui registro executado.');
    }
  }
  for (const patch of incoming ?? []) {
    const key = keyOf(patch);
    // Normalization may contain undefined keys. Never overwrite a recorded value with omission.
    const provided = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    const merged = { ...byKey.get(key), ...provided } as T;
    if (merged.outcome !== 'substituted') merged.substitutionNote = null;
    else if (!merged.substitutionNote?.trim()) {
      throw new WorkoutSessionExecutionInputError('Substituição exige uma descrição.');
    }
    assertNoMeasurementsForNotPerformed(merged.outcome, merged as Record<string, unknown>,
      measurementKeys, label);
    byKey.set(key, merged);
  }
  if (byKey.size > limit) {
    throw new WorkoutSessionExecutionInputError('O histórico executado excede o limite de unidades permitido.');
  }
  return [...byKey.values()];
}

export async function persistWorkoutSessionValues(
  tx: Prisma.TransactionClient,
  executionId: string,
  sessionId: string,
  sessionValues: TrainingSessionExecutionSessionValuesPatch | undefined,
  items: TrainingSessionExecutionItemValue[],
  completedAt?: Date,
  completionOperationId?: string,
  actorScope?: { alunoId: string; contractId: string },
): Promise<Prisma.InputJsonValue | undefined> {
  if (completedAt && !completionOperationId) {
    throw new WorkoutSessionExecutionInputError('A conclusão guiada exige uma operação canônica vinculada.');
  }
  const validItems = await validatePlannedUnits(tx, executionId, sessionId, items);
  await validateStructuredValues(tx, sessionId, sessionValues);
  let mergedSessionValues: Prisma.InputJsonValue | undefined;
  if (sessionValues) {
    const existing = await tx.workoutSessionExecution.findUnique({
      where: { id: executionId }, select: { sessionValues: true },
    });
    const stored = (existing?.sessionValues ?? {}) as unknown as TrainingSessionExecutionSessionValues;
    const { removeCyclicStages, removeResistanceGroups, ...updates } = sessionValues;
    const merged: TrainingSessionExecutionSessionValues = { ...stored, ...updates };
    if (updates.cyclicStages !== undefined || removeCyclicStages?.length) {
      merged.cyclicStages = mergeRecordedUnits<TrainingSessionCyclicStageExecutionValue>(
        stored.cyclicStages, updates.cyclicStages,
        (removeCyclicStages ?? []).map((entry) => `${entry.plannedStageId}:${entry.iteration ?? 1}`),
        (entry) => `${entry.plannedStageId}:${entry.iteration ?? 1}`, MAX_CYCLIC_STAGE_EXECUTION_RECORDS,
        CYCLIC_STAGE_MEASUREMENTS, 'Etapa cíclica',
      );
    }
    if (updates.resistanceGroups !== undefined || removeResistanceGroups?.length) {
      merged.resistanceGroups = mergeRecordedUnits<TrainingSessionResistanceGroupExecutionValue>(
        stored.resistanceGroups, updates.resistanceGroups,
        removeResistanceGroups ?? [], (entry) => entry.plannedGroupId, 100,
        RESISTANCE_GROUP_MEASUREMENTS, 'Agrupamento',
      );
    }
    // Removal intents are only in the operation fingerprint/ledger, never in the read model.
    mergedSessionValues = merged as unknown as Prisma.InputJsonValue;
  }
  for (const item of validItems) {
    const setNumber = item.setNumber ?? 0;
    const existingItem = await tx.workoutSessionExecutionItem.findUnique({
      where: { executionId_plannedUnitId_setNumber: { executionId, plannedUnitId: item.plannedUnitId, setNumber } },
      select: {
        plannedSetId: true, completedAt: true, outcome: true, substitutionNote: true,
        substitutionId: true, rir: true, rpe: true, tempo: true, restSec: true, loadKg: true,
        repetitions: true, durationSec: true, distanceKm: true, pace: true,
        heartRateBpm: true, heartRateZone: true,
      },
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
    // Never derive a replacement identity from a textual note or the current catalog.
    // Existing pre-#404 rows remain readable but cannot become new unlinked writes.
    const substitutionId = outcome === 'substituted'
      ? item.substitutionId === undefined ? existingItem?.substitutionId ?? null : item.substitutionId
      : null;
    if (outcome === 'substituted' && !substitutionId) {
      throw new WorkoutSessionExecutionInputError('Registre uma alternativa do catálogo antes de executar a substituição.');
    }
    if (outcome !== 'substituted' && item.substitutionId) {
      throw new WorkoutSessionExecutionInputError('O vínculo exige uma unidade executada como substituída.');
    }
    if (substitutionId) {
      if (!actorScope) {
        throw new WorkoutSessionExecutionInputError('Escopo do vínculo de substituição indisponível.');
      }
      const linked = await tx.workoutSubstitution.findFirst({
        where: {
          id: substitutionId, workoutDayId: sessionId, kind: 'exercise',
          contractId: actorScope.contractId, alunoId: actorScope.alunoId,
          originalUnitId: item.plannedUnitId,
          OR: [
            { status: 'approved' },
            { status: 'pending_review', context: 'execution' },
            // A reviewed/rejected change still happened; allow non-terminal
            // edits of the already linked outcome, never a new rejected link.
            ...(existingItem?.substitutionId === substitutionId
              ? [{ status: 'rejected' as const, context: 'execution' as const }] : []),
          ],
        },
        select: { id: true, replacementUnitId: true, replacementVersion: true },
      });
      if (!linked) {
        throw new WorkoutSessionExecutionInputError('Vínculo da substituição inválido, rejeitado ou fora da sessão.');
      }
      if (existingItem?.substitutionId !== substitutionId) {
        // A preapproval is not an unconditional future authorization: before a
        // first executed link, check the same catalog revision under a lock.
        // Historical linked measurements survive later curatorial changes.
        try {
          await assertApprovedWorkoutExerciseIds(tx, [linked.replacementUnitId], actorScope.contractId);
        } catch {
          throw new WorkoutSessionExecutionInputError('A alternativa foi desativada ou perdeu a aprovação.');
        }
        const catalog = await tx.exerciseLibrary.findFirst({
          where: { id: linked.replacementUnitId, contractId: actorScope.contractId },
          select: { version: true },
        });
        if (!catalog || linked.replacementVersion !== `exercicio:${catalog.version}`) {
          throw new WorkoutSessionExecutionInputError('A versão da alternativa mudou após a aprovação.');
        }
      }
    }
    // An omitted outcome inherits the durable state, but cannot add a note to a non-substitution.
    if (outcome !== 'substituted' && item.substitutionNote) {
      throw new WorkoutSessionExecutionInputError('Substituição só pode ser informada quando a unidade foi substituída.');
    }
    // Prisma skips undefined update keys: validate the effective durable row,
    // not only this sparse patch. Explicit null clears a prior measurement.
    const effectiveItem = {
      ...(existingItem ?? {}),
      ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)),
    };
    assertNoMeasurementsForNotPerformed(outcome, effectiveItem,
      EXECUTION_ITEM_MEASUREMENTS, 'Série/exercício');
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
        substitutionId,
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
        substitutionId,
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
