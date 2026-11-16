import type { TrainingSessionCyclicStageExecutionValue } from '@corrida/types';

export type CapturedEvolutionStage = {
  id: string;
  kind: string;
  parentStageId: string | null;
  /** Captured sibling order; an ID is not a stable semantic position across sessions. */
  position?: number | null;
};

export type ConfirmedStagePace = {
  value: number;
  sourceId: string;
  scope: string;
  scopeLabel: string;
};

/**
 * Return recorded pace observations, never an invented session average.
 * Repeat parents represent their descendants when a parent pace exists.
 * Corrupt or untyped history is preserved as isolated, incomparable readings.
 */
export function capturedStagePaces(input: {
  sessionId: string;
  stages: TrainingSessionCyclicStageExecutionValue[];
  plan: CapturedEvolutionStage[] | undefined;
  cyclicScope: string;
  cyclicLabel: string;
  knownCyclicType: boolean;
}): { readings: ConfirmedStagePace[]; incomparable: boolean } {
  const recorded = input.stages.filter((stage) => stage.outcome !== 'not_performed'
    && stage.paceMinPerKm !== null && stage.paceMinPerKm !== undefined);
  if (!recorded.length) return { readings: [], incomparable: false };

  const plan = input.plan ?? [];
  const byId = new Map(plan.map((stage) => [stage.id, stage]));
  const allowed = new Set(['warmup', 'work', 'recovery', 'cooldown', 'repeat']);
  const siblingSlots = new Set<string>();
  let validGraph = plan.length > 0 && byId.size === plan.length;
  for (const stage of plan) {
    const location = JSON.stringify([stage.parentStageId, stage.position]);
    if (!stage.id || !allowed.has(stage.kind)
      || !Number.isInteger(stage.position) || (stage.position ?? 0) < 1
      || (stage.parentStageId !== null && (
        stage.kind === 'repeat' || byId.get(stage.parentStageId)?.kind !== 'repeat'))
      || siblingSlots.has(location)) validGraph = false;
    siblingSlots.add(location);
  }

  const identities = new Set<string>();
  let incomparable = !input.knownCyclicType || !validGraph;
  const paceByParent = new Set(recorded.filter((stage) => byId.get(stage.plannedStageId)?.kind === 'repeat')
    .map((stage) => stage.plannedStageId));
  const readings: ConfirmedStagePace[] = [];
  for (const stage of recorded) {
    const iteration = stage.iteration ?? 1;
    const occurrence = JSON.stringify([stage.plannedStageId, iteration]);
    if (!stage.plannedStageId || !Number.isInteger(iteration) || iteration < 1
      || identities.has(occurrence)) incomparable = true;
    identities.add(occurrence);
    if (typeof stage.paceMinPerKm !== 'number' || !Number.isFinite(stage.paceMinPerKm)
      || stage.paceMinPerKm < 0) { incomparable = true; continue; }

    const path: Array<[string, number | null]> = [];
    const visited = new Set<string>();
    let parentId: string | null = stage.plannedStageId;
    let coveredByParent = false;
    while (parentId !== null) {
      if (visited.has(parentId) || !byId.has(parentId)) {
        incomparable = true;
        break;
      }
      visited.add(parentId);
      const parent: CapturedEvolutionStage = byId.get(parentId)!;
      path.unshift([parent.kind, parent.position ?? null]);
      if (parentId !== stage.plannedStageId && paceByParent.has(parentId)) coveredByParent = true;
      parentId = parent.parentStageId;
    }
    // The explicit repeat aggregate takes precedence over all child iterations.
    if (coveredByParent) continue;
    if (stage.outcome === 'substituted') incomparable = true;
    const comparable = validGraph && input.knownCyclicType
      && path.length > 0 && parentId === null && stage.outcome !== 'substituted'
      && Number.isInteger(iteration) && iteration >= 1;
    if (!comparable) incomparable = true;
    readings.push({
      value: stage.paceMinPerKm,
      sourceId: `cyclic-stage:${stage.plannedStageId}:iteration:${iteration}`,
      scope: comparable
        ? JSON.stringify(['captured-stage-pace', input.cyclicScope, path, iteration])
        : JSON.stringify(['unclassified-stage-pace', input.sessionId, occurrence]),
      scopeLabel: comparable
        ? `Etapa ${path.map(([kind, position]) => `${kind} ${position}`).join(' / ')} · repetição ${iteration} · ${input.cyclicLabel}`
        : 'Etapa · contexto histórico não comparável',
    });
  }
  return { readings, incomparable };
}
