import type { TrainingComparisonSnapshot } from './workout-session-comparison.domain.js';

/** Stable, identity-free description of a captured cyclic session's stage topology. */
export function capturedCyclicStructure(plan: TrainingComparisonSnapshot | null): string | null {
  if (!plan) return null;
  const stages = plan.cyclicStages;
  // Empty is a valid captured topology, unlike a corrupt or orphaned graph.
  if (!stages.length) return '[]';
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  if (byId.size !== stages.length) return null;
  const positions = new Set<string>();
  const allowedKinds = new Set(['warmup', 'work', 'recovery', 'cooldown', 'repeat']);
  for (const stage of stages) {
    if (!stage.id || !Number.isInteger(stage.position) || stage.position < 1
      || !allowedKinds.has(stage.kind)
      || (stage.parentStageId !== null
        && (byId.get(stage.parentStageId)?.kind !== 'repeat' || stage.kind === 'repeat'))) return null;
    const location = JSON.stringify([stage.parentStageId, stage.position]);
    if (positions.has(location)) return null;
    positions.add(location);
  }
  const visited = new Set<string>();
  const children = (parentId: string | null): unknown[] => stages
    .filter((stage) => stage.parentStageId === parentId && typeof stage.kind === 'string')
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .flatMap((stage) => {
      // Corrupt/legacy cyclic snapshots must not trigger recursion or invent a type.
      if (visited.has(stage.id)) return [];
      visited.add(stage.id);
      return [[stage.kind, stage.targetKind, stage.repeatCount, children(stage.id)]];
    });
  const structure = children(null);
  return structure.length && visited.size === stages.length ? JSON.stringify(structure) : null;
}
