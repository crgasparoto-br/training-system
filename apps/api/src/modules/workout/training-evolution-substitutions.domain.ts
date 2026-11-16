import type {
  TrainingSessionExecutionItemValue,
  TrainingSessionExecutionSessionValues,
} from '@corrida/types';

type CyclicStage = { id: string; kind: string; parentStageId: string | null };
type ResistanceGroup = { id: string; memberUnitIds: string[] };
type SubstitutionCount = number | 'incomparable';

/** Count confirmed replacement units, not the extra aggregate records of their parents. */
export function countDistinctExecutedSubstitutions(
  items: TrainingSessionExecutionItemValue[],
  values: TrainingSessionExecutionSessionValues,
  plannedStages?: CyclicStage[],
  plannedGroups?: ResistanceGroup[],
): SubstitutionCount {
  const replacedItems = items.filter((item) => item.outcome === 'substituted');
  const itemKeys = replacedItems.map((item) => JSON.stringify([item.plannedUnitId, item.setNumber ?? 0]));
  if (new Set(itemKeys).size !== itemKeys.length) return 'incomparable';
  let count = replacedItems.length;

  const replacedStages = (values.cyclicStages ?? []).filter((stage) => stage.outcome === 'substituted');
  if (replacedStages.length) {
    const occurrences = replacedStages.map((stage) =>
      JSON.stringify([stage.plannedStageId, stage.iteration ?? 1]));
    if (new Set(occurrences).size !== occurrences.length
      || replacedStages.some((stage) => !stage.plannedStageId
        || !Number.isInteger(stage.iteration ?? 1) || (stage.iteration ?? 1) < 1)) return 'incomparable';

    if (plannedStages === undefined) {
      // A historical snapshot without topology cannot distinguish a repeat
      // aggregate from its descendants when more than one stage ID is present.
      if (new Set(replacedStages.map((stage) => stage.plannedStageId)).size > 1) return 'incomparable';
      count += replacedStages.length;
    } else {
      const byId = new Map(plannedStages.map((stage) => [stage.id, stage]));
      if (byId.size !== plannedStages.length || plannedStages.some((stage) =>
        !stage.id || (stage.parentStageId !== null && (
          byId.get(stage.parentStageId)?.kind !== 'repeat' || stage.kind === 'repeat')))
        || replacedStages.some((stage) => !byId.has(stage.plannedStageId)
          || (byId.get(stage.plannedStageId)?.kind === 'repeat' && (stage.iteration ?? 1) !== 1))) {
        return 'incomparable';
      }
      const replacedChildParents = new Set(replacedStages
        .map((stage) => byId.get(stage.plannedStageId)!.parentStageId)
        .filter((parentId): parentId is string => parentId !== null));
      count += replacedStages.filter((stage) =>
        byId.get(stage.plannedStageId)!.kind !== 'repeat'
        || !replacedChildParents.has(stage.plannedStageId)).length;
    }
  }

  const replacedGroups = (values.resistanceGroups ?? []).filter((group) => group.outcome === 'substituted');
  if (replacedGroups.length) {
    const ids = replacedGroups.map((group) => group.plannedGroupId);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return 'incomparable';
    if (plannedGroups === undefined) {
      // Do not count an unlinked group and its possible member-set twice.
      if (replacedItems.length) return 'incomparable';
      count += replacedGroups.length;
    } else {
      const byId = new Map(plannedGroups.map((group) => [group.id, group.memberUnitIds]));
      if (byId.size !== plannedGroups.length || plannedGroups.some((group) =>
        !group.id || !Array.isArray(group.memberUnitIds)
          || group.memberUnitIds.some((id) => !id)
          || new Set(group.memberUnitIds).size !== group.memberUnitIds.length)) return 'incomparable';
      for (const group of replacedGroups) {
        const members = byId.get(group.plannedGroupId);
        if (!members) return 'incomparable';
        // A group declaration is one aggregate replacement when no member
        // has its own executed substitution; otherwise count each member set.
        if (!replacedItems.some((item) => members.includes(item.plannedUnitId))) count++;
      }
    }
  }
  return count;
}
