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
 * Legacy system labels may only disable unsupported execution, never establish grouping authority.
 */
/** The only grouping authority is #400's persisted parent/member graph. */
export interface GuidedResistancePlannedGroup {
  id: string;
  position: number;
  kind: string;
  rounds: number | null;
  restBetweenExercisesSec: number | null;
  restBetweenRoundsSec: number | null;
  notes: string | null;
  members: ReadonlyArray<{ position: number; workoutExerciseId: string }>;
}

export function deriveGuidedResistancePlan(
  exercises: ReadonlyArray<GuidedResistancePlannedExercise>,
  groups: ReadonlyArray<GuidedResistancePlannedGroup> = [],
): { availability: GuidedResistanceAvailability; units: GuidedResistanceUnit[] } {
  if (!exercises.length) return { availability: 'no_structured_resistance', units: [] };
  const readOnly = () => ({ availability: 'legacy_read_only' as const, units: [] });
  if (exercises.some((exercise) => !exercise.resistanceBlocks.length
    || exercise.resistanceBlocks.some((block) => !block.plannedSets.length))) return readOnly();

  const sorted = [...exercises].sort((left, right) => {
    const a = SECTION_ORDER[left.section.trim().toLowerCase()] ?? 3;
    const b = SECTION_ORDER[right.section.trim().toLowerCase()] ?? 3;
    return a - b || left.section.localeCompare(right.section)
      || left.exerciseOrder - right.exerciseOrder || left.id.localeCompare(right.id);
  });
  const byId = new Map(sorted.map((exercise) => [exercise.id, exercise]));
  const setsFor = (exercise: GuidedResistancePlannedExercise) =>
    [...exercise.resistanceBlocks].sort((a, b) => a.position - b.position)
      .flatMap((block) => [...block.plannedSets].sort((a, b) => a.position - b.position)
        .map((set) => ({ block, set })));
  const memberGroups = new Map<string, GuidedResistancePlannedGroup>();
  const groupMembers = new Map<string, GuidedResistancePlannedExercise[]>();
  const groupRounds = new Map<string, number>();
  const allowed = new Set(['superserie', 'bi_set', 'tri_set', 'circuito', 'bloco_tecnico', 'mobilidade', 'finalizacao']);
  const limits: Record<string, [number, number]> = {
    superserie: [2, 4], bi_set: [2, 2], tri_set: [3, 3], circuito: [2, 20],
    bloco_tecnico: [1, 20], mobilidade: [1, 20], finalizacao: [1, 20],
  };
  const orderedGroups = [...groups].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const knownGroups = new Set<string>();
  for (const [index, group] of orderedGroups.entries()) {
    if (!group.id || knownGroups.has(group.id) || group.position !== index + 1
      || !allowed.has(group.kind)) return readOnly();
    knownGroups.add(group.id);
    const members = [...group.members].sort((a, b) => a.position - b.position);
    const [minSize, maxSize] = limits[group.kind];
    if (members.length < minSize || members.length > maxSize) return readOnly();
    const resolved: GuidedResistancePlannedExercise[] = [];
    for (const [memberIndex, member] of members.entries()) {
      const exercise = byId.get(member.workoutExerciseId);
      if (!exercise || member.position !== memberIndex + 1 || memberGroups.has(exercise.id)) {
        return readOnly();
      }
      memberGroups.set(exercise.id, group);
      resolved.push(exercise);
    }
    const roundCount = group.rounds ?? setsFor(resolved[0]).length;
    if (!Number.isInteger(roundCount) || roundCount < 1
      || resolved.some((exercise) => setsFor(exercise).length !== roundCount)) return readOnly();
    groupMembers.set(group.id, resolved);
    groupRounds.set(group.id, roundCount);
  }

  // Free-text legacy system labels may DISABLE unsupported execution, never
  // grant grouping authority or create a synthetic exercise/round.
  const legacyCodes = new Set(['BS', 'BI-SET', 'TS', 'TRI-SET', 'SS', 'SUPER-SET', 'CIR', 'CIRCUITO']);
  if (sorted.some((item) => !memberGroups.has(item.id)
    && (item.groupBreakBefore || legacyCodes.has((item.system ?? '').trim().toUpperCase())))) {
    return { availability: 'grouping_pending', units: [] };
  }

  const makeUnit = (
    exercise: GuidedResistancePlannedExercise,
    entry: ReturnType<typeof setsFor>[number],
    setNumber: number,
    grouping: { group: GuidedResistancePlannedGroup; position: number; size: number; round: number; rounds: number } | null,
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
    groupId: grouping?.group.id ?? null,
    groupType: grouping ? grouping.group.kind as GuidedResistanceUnit['groupType'] : null,
    groupPosition: grouping?.position ?? null,
    groupSize: grouping?.size ?? null,
    roundNumber: grouping?.round ?? null,
    roundTotal: grouping?.rounds ?? null,
    repsMin: entry.set.repsMin,
    repsMax: entry.set.repsMax,
    loadKg: entry.set.loadKg,
    loadPercent: entry.set.loadPercent,
    rir: entry.set.rir,
    rpe: entry.set.rpe,
    tempo: entry.set.tempo,
    restSec: grouping
      ? grouping.position < grouping.size
        ? grouping.group.restBetweenExercisesSec
        : grouping.group.restBetweenRoundsSec ?? entry.set.restSec
      : entry.set.restSec,
    notes: entry.set.notes?.trim() || entry.block.notes?.trim()
      || exercise.exerciseNotes?.trim() || exercise.exercise.notes?.trim()
      || grouping?.group.notes?.trim() || null,
  });
  const units: GuidedResistanceUnit[] = [];
  const emittedGroups = new Set<string>();
  const executionSlots: Array<{
    exercise: GuidedResistancePlannedExercise;
    group: GuidedResistancePlannedGroup | null;
  }> = [];
  for (const exercise of sorted) {
    const group = memberGroups.get(exercise.id) ?? null;
    if (group && emittedGroups.has(group.id)) continue;
    if (group) emittedGroups.add(group.id);
    executionSlots.push({ exercise, group });
  }

  // A group position belongs to #400's persisted arrangement, not the first
  // member's visual/exercise order. Preserve the standalone exercise slots.
  const orderedGroupSlots = executionSlots.filter((slot) => slot.group)
    .sort((left, right) => left.group!.position - right.group!.position);
  let groupSlotIndex = 0;
  for (const slot of executionSlots) {
    const { exercise, group } = slot.group ? orderedGroupSlots[groupSlotIndex++] : slot;
    if (!group) {
      setsFor(exercise).forEach((entry, index) => units.push(makeUnit(exercise, entry, index + 1, null)));
      continue;
    }
    const members = groupMembers.get(group.id)!;
    const rounds = groupRounds.get(group.id)!;
    for (let round = 1; round <= rounds; round += 1) {
      members.forEach((member, index) => units.push(makeUnit(
        member, setsFor(member)[round - 1], round,
        { group, position: index + 1, size: members.length, round, rounds },
      )));
    }
  }
  if (new Set(units.map((unit) => unit.plannedSetId)).size !== units.length) return readOnly();
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
