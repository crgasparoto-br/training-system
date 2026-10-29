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
  groupBreakBefore?: boolean;
  groupId?: string | null;
  groupType?: import('@corrida/types').ResistanceExerciseGroupType | null;
  groupPosition?: number | null;
  groupRounds?: number | null;
  exerciseNotes?: string | null;
  exercise: { name: string; videoUrl?: string | null; notes?: string | null };
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

export function approvedGuidedExerciseMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
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
  const legacyGroupingCodes = new Set(['BS', 'BI-SET', 'TS', 'TRI-SET', 'SS', 'SUPER-SET', 'CIR', 'CIRCUITO']);
  if (exercises.some((item) =>
    !item.groupId && !item.groupType
    && (item.groupBreakBefore || legacyGroupingCodes.has((item.system ?? '').trim().toUpperCase())))) {
    return { availability: 'grouping_pending', units: [] };
  }
  if (exercises.some((item) => Boolean(item.groupId) !== Boolean(item.groupType)
    || Boolean(item.groupId) !== Boolean(item.groupPosition)
    || Boolean(item.groupId) !== Boolean(item.groupRounds))) {
    return { availability: 'legacy_read_only', units: [] };
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
  const setsFor = (exercise: GuidedResistancePlannedExercise) =>
    [...exercise.resistanceBlocks].sort((a, b) => a.position - b.position)
      .flatMap((block) => [...block.plannedSets].sort((a, b) => a.position - b.position)
        .map((set) => ({ block, set })));
  const makeUnit = (
    exercise: GuidedResistancePlannedExercise,
    entry: ReturnType<typeof setsFor>[number],
    setNumber: number,
    group: { id: string; type: NonNullable<GuidedResistancePlannedExercise['groupType']>; position: number; size: number; round: number; rounds: number } | null,
  ): GuidedResistanceUnit => ({
    plannedUnitId: exercise.id,
    plannedSetId: entry.set.id,
    setNumber,
    exerciseName: exercise.exercise.name,
    videoUrl: approvedGuidedExerciseMediaUrl(exercise.exercise.videoUrl),
    section: exercise.section,
    blockKind: entry.block.kind,
    blockPosition: entry.block.position,
    setPosition: entry.set.position,
    exerciseSetTotal: setsFor(exercise).length,
    groupId: group?.id ?? null,
    groupType: group?.type ?? null,
    groupPosition: group?.position ?? null,
    groupSize: group?.size ?? null,
    roundNumber: group?.round ?? null,
    roundTotal: group?.rounds ?? null,
    repsMin: entry.set.repsMin,
    repsMax: entry.set.repsMax,
    loadKg: entry.set.loadKg,
    loadPercent: entry.set.loadPercent,
    rir: entry.set.rir,
    rpe: entry.set.rpe,
    tempo: entry.set.tempo,
    restSec: entry.set.restSec,
    notes: entry.set.notes?.trim() || entry.block.notes?.trim()
      || exercise.exerciseNotes?.trim() || exercise.exercise.notes?.trim() || null,
  });

  const units: GuidedResistanceUnit[] = [];
  const handledGroups = new Set<string>();
  for (const exercise of sorted) {
    if (!exercise.groupId) {
      setsFor(exercise).forEach((entry, setIndex) => units.push(makeUnit(exercise, entry, setIndex + 1, null)));
      continue;
    }
    if (handledGroups.has(exercise.groupId)) continue;
    const members = sorted.filter((item) => item.groupId === exercise.groupId)
      .sort((a, b) => (a.groupPosition ?? 0) - (b.groupPosition ?? 0));
    const memberIndexes = members.map((member) => sorted.findIndex((item) => item.id === member.id));
    const rounds = exercise.groupRounds ?? 0;
    if (!exercise.groupType || rounds < 1
      || members.some((member, memberIndex) =>
        member.groupType !== exercise.groupType || member.groupRounds !== rounds
        || member.groupPosition !== memberIndex + 1 || setsFor(member).length !== rounds)
      || Math.max(...memberIndexes) - Math.min(...memberIndexes) + 1 !== members.length) {
      return { availability: 'legacy_read_only', units: [] };
    }
    handledGroups.add(exercise.groupId);
    for (let round = 1; round <= rounds; round += 1) {
      members.forEach((member, memberIndex) => units.push(makeUnit(
        member, setsFor(member)[round - 1], round,
        { id: exercise.groupId!, type: exercise.groupType!, position: memberIndex + 1, size: members.length, round, rounds },
      )));
    }
  }
  if (new Set(units.map((unit) => unit.plannedSetId)).size !== units.length) {
    return { availability: 'legacy_read_only', units: [] };
  }
  return { availability: 'available', units };
}

export function matchesCurrentGuidedUnit(
  view: GuidedResistanceView,
  item: { plannedUnitId: string; plannedSetId?: string | null; setNumber?: number },
): boolean {
  const current = view.availability === 'available' && view.status === 'in_progress' ? view.current : null;
  return Boolean(current && current.plannedUnitId === item.plannedUnitId
    && current.plannedSetId === item.plannedSetId && current.setNumber === item.setNumber);
}

export function projectGuidedResistance(
  sessionId: string,
  execution: TrainingSessionExecutionView,
  plan: ReturnType<typeof deriveGuidedResistancePlan>,
): GuidedResistanceView {
  const identity = (item: { plannedUnitId: string; plannedSetId?: string | null; setNumber?: number }) =>
    [item.plannedUnitId, item.plannedSetId, item.setNumber].join(':');
  const validKeys = new Set(plan.units.map(identity));
  const completedItems = execution.items.filter((item) => Boolean(item.completedAt));
  const completedKeys = new Set(completedItems.map(identity));
  const completed = plan.units.filter((unit) => completedKeys.has(identity(unit))).length;
  const currentIndex = plan.units.findIndex((unit) => !completedKeys.has(identity(unit)));
  // A partial/misaligned execution history is not safe to navigate from.
  const invalidIdentity = completedItems.some((item) => !validKeys.has(identity(item)));
  const invalidOrder = currentIndex >= 0 && plan.units.slice(currentIndex + 1)
    .some((unit) => completedKeys.has(identity(unit)));
  const availability = invalidOrder || invalidIdentity ? 'legacy_read_only' : plan.availability;
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
