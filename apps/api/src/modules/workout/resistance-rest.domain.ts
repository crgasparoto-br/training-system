import type {
  GuidedResistanceRestView, GuidedResistanceUnit, TrainingSessionExecutionStatus,
} from '@corrida/types';

export type PersistedResistanceRest = {
  id: string;
  afterPlannedSetId: string;
  plannedSeconds: number;
  extensionSeconds: number;
  startedAt: Date;
  targetEndsAt: Date;
  pausedDurationMs: bigint | number;
};

/** The #487 canonical plan resolves both intermediate and final group rests. */
export function prescribedRestAfter(
  unit: GuidedResistanceUnit | null, next: GuidedResistanceUnit | null,
): number | null {
  const seconds = unit?.restSec;
  return next && seconds != null && Number.isSafeInteger(seconds) && seconds > 0
    ? seconds : null;
}

/** Server-anchored projection; browser ticks are never execution authority. */
export function projectResistanceRest(
  rest: PersistedResistanceRest | null,
  session: { status: TrainingSessionExecutionStatus; currentPauseStartedAt: Date | null },
  now: Date,
): GuidedResistanceRestView | null {
  if (!rest) return null;
  const effectiveNow = session.status === 'paused' && session.currentPauseStartedAt
    ? session.currentPauseStartedAt.getTime() : now.getTime();
  return {
    id: rest.id,
    afterPlannedSetId: rest.afterPlannedSetId,
    plannedSeconds: rest.plannedSeconds,
    extensionSeconds: rest.extensionSeconds,
    startedAt: rest.startedAt.toISOString(),
    targetEndsAt: rest.targetEndsAt.toISOString(),
    serverNow: now.toISOString(),
    elapsedMs: Math.max(0, effectiveNow - rest.startedAt.getTime() - Number(rest.pausedDurationMs)),
    remainingMs: Math.max(0, rest.targetEndsAt.getTime() - effectiveNow),
  };
}

export function measuredRestMs(rest: PersistedResistanceRest, now: Date): number {
  return Math.max(0, now.getTime() - rest.startedAt.getTime() - Number(rest.pausedDurationMs));
}
