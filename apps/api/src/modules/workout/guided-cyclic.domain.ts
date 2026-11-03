import type {
  GuidedCyclicCursor, GuidedCyclicUnit, GuidedCyclicView,
  TrainingSessionCyclicStageExecutionValue, TrainingSessionExecutionView,
} from '@corrida/types';
import { MAX_CYCLIC_STAGE_OCCURRENCES } from './cyclic-stages.domain.js';
import { TERMINAL_EXECUTION_STATUSES } from './workout-session-execution.domain.js';

/** Read the #398 prescription by stable ID, never by free text or a UI cursor index. */
export type GuidedCyclicPlannedStage = {
  id: string;
  position: number;
  kind: string;
  durationUnit: string | null;
  durationValue: number | null;
  targetKind: string | null;
  targetValue: number | null;
  targetMin: number | null;
  targetMax: number | null;
  inclinePercent: number | null;
  cadenceSpm: number | null;
  repeatCount: number | null;
  notes: string | null;
  children: GuidedCyclicPlannedStage[];
};

type Plan = { availability: 'available' | 'legacy_read_only' | 'invalid_plan'; units: GuidedCyclicUnit[];
  /** #401 may record a repeat parent's aggregate independently of its child executions. */
  repeatParentIds?: string[];
};
const KINDS = new Set(['warmup', 'work', 'recovery', 'cooldown']);
const TARGETS = new Set(['pace_min_per_km', 'speed_kmh', 'heart_rate_bpm', 'zone', 'pse']);

function plannedUnit(stage: GuidedCyclicPlannedStage, iteration: number, roundTotal: number | null): GuidedCyclicUnit | null {
  if (!stage.id || !KINDS.has(stage.kind) || !Number.isInteger(stage.position) || stage.position < 1
    || !['seconds', 'meters'].includes(stage.durationUnit ?? '')
    || stage.durationValue === null || !Number.isFinite(stage.durationValue) || stage.durationValue <= 0
    || (stage.targetKind && !TARGETS.has(stage.targetKind))
    || stage.children.length > 0 || stage.repeatCount !== null) return null;
  return {
    plannedStageId: stage.id, iteration, order: 0,
    kind: stage.kind as GuidedCyclicUnit['kind'],
    roundNumber: roundTotal === null ? null : iteration,
    roundTotal,
    durationUnit: stage.durationUnit as GuidedCyclicUnit['durationUnit'],
    durationValue: stage.durationValue,
    targetKind: stage.targetKind as GuidedCyclicUnit['targetKind'],
    targetValue: stage.targetValue, targetMin: stage.targetMin, targetMax: stage.targetMax,
    inclinePercent: stage.inclinePercent, cadenceSpm: stage.cadenceSpm, notes: stage.notes,
  };
}

export function deriveGuidedCyclicPlan(stages: readonly GuidedCyclicPlannedStage[]): Plan {
  if (stages.length === 0) return { availability: 'legacy_read_only', units: [] };
  const units: GuidedCyclicUnit[] = [];
  const repeatParentIds: string[] = [];
  const append = (stage: GuidedCyclicPlannedStage, iteration: number, total: number | null) => {
    const item = plannedUnit(stage, iteration, total);
    if (!item || units.length >= MAX_CYCLIC_STAGE_OCCURRENCES) return false;
    units.push({ ...item, order: units.length + 1 });
    return true;
  };
  const ids = new Set<string>();
  const ordered = [...stages].sort((a, b) => a.position - b.position);
  for (const [index, stage] of ordered.entries()) {
    if (stage.position !== index + 1 || ids.has(stage.id)) return { availability: 'invalid_plan', units: [] };
    ids.add(stage.id);
    if (stage.kind !== 'repeat') {
      if (!append(stage, 1, null)) return { availability: 'invalid_plan', units: [] };
      continue;
    }
    if (!Number.isInteger(stage.repeatCount) || (stage.repeatCount ?? 0) < 2 || (stage.repeatCount ?? 0) > 100
      || stage.children.length < 2 || stage.children.length > 20
      || stage.durationUnit !== null || stage.durationValue !== null || stage.targetKind !== null) {
      return { availability: 'invalid_plan', units: [] };
    }
    repeatParentIds.push(stage.id);
    const children = [...stage.children].sort((a, b) => a.position - b.position);
    for (const [childIndex, child] of children.entries()) {
      if (child.position !== childIndex + 1 || ids.has(child.id)) return { availability: 'invalid_plan', units: [] };
      ids.add(child.id);
    }
    if (!children.some((child) => child.kind === 'work') || !children.some((child) => child.kind === 'recovery')) {
      return { availability: 'invalid_plan', units: [] };
    }
    for (let round = 1; round <= stage.repeatCount!; round++) {
      for (const child of children) {
        if (!append(child, round, stage.repeatCount)) return { availability: 'invalid_plan', units: [] };
      }
    }
  }
  return { availability: 'available', units, repeatParentIds };
}

/**
 * #389 terminality must accept a fully recorded historical #401 session as well as
 * a guided #489 cursor. The read-only guided projection deliberately requires a
 * cursor, but that is not a prerequisite for a complete manual #401 execution.
 * Never treat a repeat-parent aggregate record as a missing/extra child stage.
 */
export function canCompleteGuidedCyclic(
  sessionId: string,
  execution: TrainingSessionExecutionView,
  plan: Plan,
  now: Date,
): boolean {
  if (plan.availability !== 'available' || plan.units.length === 0) return false;
  const projected = projectGuidedCyclic(sessionId, execution, plan, now);
  if (projected.availability === 'available') {
    return projected.completed === projected.total && projected.current === null;
  }
  // No synthetic cursor may be accepted, including one inconsistent with history.
  // The #401 manual-values path has no guided cursor by design.
  if (execution.sessionValues.guidedCyclic !== undefined) return false;
  return hasCompleteManualCyclicCoverage(plan, execution.sessionValues.cyclicStages);
}

function hasCompleteManualCyclicCoverage(
  plan: Plan,
  recorded: readonly TrainingSessionCyclicStageExecutionValue[] | undefined,
): boolean {
  const completedLeaves = recordedLeafOccurrences(plan, recorded);
  return completedLeaves !== null && completedLeaves.size === plan.units.length;
}

/** #401 permits one optional aggregate per #398 repeat parent, but it is never a timed leaf. */
function recordedLeafOccurrences(
  plan: Plan,
  recorded: readonly TrainingSessionCyclicStageExecutionValue[] | undefined,
): Set<string> | null {
  if (!Array.isArray(recorded)) return null;
  const expected = new Set(plan.units.map((unit) => JSON.stringify([unit.plannedStageId, unit.iteration])));
  const parents = new Set(plan.repeatParentIds ?? []);
  const leaves = new Set<string>();
  const parentFound = new Set<string>();
  for (const row of recorded) {
    if (!row || typeof row.plannedStageId !== 'string' || !row.plannedStageId
      || !Number.isInteger(row.iteration ?? 1) || (row.iteration ?? 1) < 1) return null;
    const iteration = row.iteration ?? 1;
    const key = JSON.stringify([row.plannedStageId, iteration]);
    if (expected.has(key)) {
      if (leaves.has(key)) return null;
      leaves.add(key);
    } else if (iteration === 1 && parents.has(row.plannedStageId)) {
      if (parentFound.has(row.plannedStageId)) return null;
      parentFound.add(row.plannedStageId);
    } else {
      return null;
    }
  }
  return leaves;
}

function isCursor(value: unknown): value is GuidedCyclicCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const cursor = value as Record<string, unknown>;
  return (cursor.plannedStageId === null || typeof cursor.plannedStageId === 'string')
    && (cursor.iteration === null || (typeof cursor.iteration === 'number' && Number.isInteger(cursor.iteration) && cursor.iteration > 0))
    && (cursor.startedAt === null || (typeof cursor.startedAt === 'string' && Number.isFinite(Date.parse(cursor.startedAt))))
    && (cursor.pausedDurationAtStartMs === null || (typeof cursor.pausedDurationAtStartMs === 'number'
      && Number.isFinite(cursor.pausedDurationAtStartMs) && cursor.pausedDurationAtStartMs >= 0));
}

/** #389 persists pause intervals; only the server's clock/intervals establish elapsed time. */
export function elapsedGuidedCyclicMs(
  cursor: GuidedCyclicCursor,
  execution: TrainingSessionExecutionView,
  now: Date,
): number | null {
  if (!cursor.startedAt || cursor.pausedDurationAtStartMs === null
    || cursor.pausedDurationAtStartMs > execution.pausedDurationMs) return null;
  // A terminal session has no active clock: repeated reads must show the
  // elapsed time as of the persisted finish, not as of the GET request.
  // #389 already includes the whole explicit pause in pausedDurationMs when
  // transitioning paused -> partial, so subtract it exactly once here.
  const stopAt = execution.status === 'paused'
    ? (execution.currentPauseStartedAt ? Date.parse(execution.currentPauseStartedAt) : NaN)
    : TERMINAL_EXECUTION_STATUSES.has(execution.status)
      ? (execution.finishedAt ? Date.parse(execution.finishedAt) : NaN)
      : now.getTime();
  const elapsed = stopAt - Date.parse(cursor.startedAt)
    - (execution.pausedDurationMs - cursor.pausedDurationAtStartMs);
  if (!Number.isFinite(elapsed) || elapsed < -500) return null;
  return Math.max(0, elapsed);
}

/** A completed prefix and its next planned ID/iteration must agree with the durable cursor. */
export function projectGuidedCyclic(
  sessionId: string,
  execution: TrainingSessionExecutionView,
  plan: Plan,
  now: Date,
): GuidedCyclicView {
  const base: GuidedCyclicView = {
    sessionId, status: execution.status, version: execution.version, serverNow: now.toISOString(),
    availability: plan.availability, completed: 0, total: plan.units.length,
    current: null, next: null, currentStartedAt: null, elapsedMs: null, remainingMs: null,
  };
  if (plan.availability !== 'available') return base;
  const occurrences = recordedLeafOccurrences(plan, execution.sessionValues.cyclicStages ?? []);
  if (!occurrences) return { ...base, availability: 'reconciliation_required' };
  let completed = 0;
  for (const unit of plan.units) {
    if (!occurrences.has(JSON.stringify([unit.plannedStageId, unit.iteration]))) break;
    completed += 1;
  }
  if (completed !== occurrences.size) return { ...base, availability: 'reconciliation_required' };
  const current = plan.units[completed] ?? null;
  const next = plan.units[completed + 1] ?? null;
  const cursor = execution.sessionValues.guidedCyclic;
  if (cursor === undefined && completed > 0) return { ...base, completed, availability: 'reconciliation_required' };
  if (cursor !== undefined) {
    if (!isCursor(cursor) || cursor.plannedStageId !== (current?.plannedStageId ?? null)
      || cursor.iteration !== (current?.iteration ?? null)
      || (!current && (cursor.startedAt !== null || cursor.pausedDurationAtStartMs !== null))
      || (cursor.startedAt === null) !== (cursor.pausedDurationAtStartMs === null)) {
      return { ...base, completed, availability: 'reconciliation_required' };
    }
  }
  const startedAt = cursor?.startedAt ?? null;
  const elapsedMs = startedAt && cursor ? elapsedGuidedCyclicMs(cursor, execution, now) : null;
  if (startedAt && elapsedMs === null) return { ...base, completed, availability: 'reconciliation_required' };
  const remainingMs = current?.durationUnit === 'seconds' && elapsedMs !== null
    ? Math.max(0, Math.ceil(current.durationValue * 1000 - elapsedMs)) : null;
  return { ...base, completed, current, next, currentStartedAt: startedAt, elapsedMs, remainingMs };
}
