import type {
  GuidedResistanceAvailability, GuidedResistanceUnit, GuidedResistanceView,
  TrainingSessionExecutionView,
} from '@corrida/types';

/** Project only persisted planned set identities. Never derive a set from a UI index or free text. */
export interface GuidedResistancePlannedExercise {
  id: string;
  section: string;
  exerciseOrder: number;
  system: string | null;
  exercise: { name: string };
  resistanceBlocks: ReadonlyArray<{
    position: number;
    kind: string;
    notes: string | null;
    plannedSets: ReadonlyArray<{
      id: string;
      position: number;
      repsMin: number | null;
      repsMax: number | null;
      loadKg: number | null;
      loadPercent: number | null;
      rir: number | null;
      rpe: number | null;
      tempo: string | null;
      restSec: number | null;
      notes: string | null;
    }>;
  }>;
}

const SECTION_ORDER: Record<string, number> = {
  mobilidade: 0, aquecimento: 0, sessao: 1, principal: 1,
  resfriamento: 2, finalizacao: 2,
};

/**
 * #400 has not yet established a persisted grouping contract. A legacy system
 * label may only DISABLE the guide, never be interpreted as grouping authority.
 */
export function deriveGuidedResistancePlan(
  exercises: ReadonlyArray<GuidedResistancePlannedExercise>,
): { availability: GuidedResistanceAvailability; units: GuidedResistanceUnit[] } {
  if (!exercises.length) return { availability: 'no_structured_resistance', units: [] };
  if (exercises.some((item) => /super\s*-?\s*s[eé]rie|bi[\s-]*set|tri[\s-]*set|circuito/i.test(item.system ?? ''))) {
    return { availability: 'grouping_pending', units: [] };
  }
  if (exercises.some((item) => !item.resistanceBlocks.length
    || item.resistanceBlocks.some((block) => !block.plannedSets.length))) {
    return { availability: 'legacy_read_only', units: [] };
  }

  const sorted = [...exercises].sort((left, right) => {
    const a = SECTION_ORDER[left.section.trim().toLowerCase()] ?? 3;
    const b = SECTION_ORDER[right.section.trim().toLowerCase()] ?? 3;
    return a - b || left.section.localeCompare(right.section)
      || left.exerciseOrder - right.exerciseOrder || left.id.localeCompare(right.id);
  });
  const units: GuidedResistanceUnit[] = [];
  for (const exercise of sorted) {
    let setNumber = 0;
    const blocks = [...exercise.resistanceBlocks].sort((a, b) => a.position - b.position);
    const exerciseSetTotal = blocks.reduce((sum, block) => sum + block.plannedSets.length, 0);
    for (const block of blocks) {
      const sets = [...block.plannedSets].sort((a, b) => a.position - b.position);
      for (const set of sets) {
        setNumber += 1;
        units.push({
          plannedUnitId: exercise.id,
          plannedSetId: set.id,
          setNumber,
          exerciseName: exercise.exercise.name,
          section: exercise.section,
          blockKind: block.kind,
          blockPosition: block.position,
          setPosition: set.position,
          exerciseSetTotal,
          repsMin: set.repsMin,
          repsMax: set.repsMax,
          loadKg: set.loadKg,
          loadPercent: set.loadPercent,
          rir: set.rir,
          rpe: set.rpe,
          tempo: set.tempo,
          restSec: set.restSec,
          notes: set.notes?.trim() || block.notes?.trim() || null,
        });
      }
    }
  }
  // Never present an ambiguous or duplicated planned identity as an executable step.
  if (new Set(units.map((unit) => unit.plannedSetId)).size !== units.length) {
    return { availability: 'legacy_read_only', units: [] };
  }
  return { availability: 'available', units };
}

export function projectGuidedResistance(
  sessionId: string,
  execution: TrainingSessionExecutionView,
  plan: ReturnType<typeof deriveGuidedResistancePlan>,
): GuidedResistanceView {
  const completedIds = new Set(execution.items
    .filter((item) => item.completedAt && item.plannedSetId)
    .map((item) => item.plannedSetId));
  const completed = plan.units.filter((unit) => completedIds.has(unit.plannedSetId)).length;
  const currentIndex = plan.units.findIndex((unit) => !completedIds.has(unit.plannedSetId));
  // Out-of-order data is not interpreted as an executable position.
  const invalidOrder = currentIndex >= 0 && plan.units.slice(currentIndex + 1)
    .some((unit) => completedIds.has(unit.plannedSetId));
  const availability = invalidOrder ? 'legacy_read_only' : plan.availability;
  const current = availability === 'available' && currentIndex >= 0
    ? plan.units[currentIndex] : null;
  const next = current ? plan.units[currentIndex + 1] ?? null : null;
  return {
    sessionId,
    status: execution.status,
    version: execution.version,
    availability,
    completed,
    total: plan.units.length,
    current,
    next,
  };
}
