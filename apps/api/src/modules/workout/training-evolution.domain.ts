import type {
  TrainingRoutineAudience,
  TrainingRoutineExecutionProjectionStatus,
  TrainingRoutineWeeklyEvolution,
} from '@corrida/types';

export type WeeklyEvolutionSessionSource = {
  sessionId: string;
  status: TrainingRoutineExecutionProjectionStatus;
  sourceUpdatedAt: string | null;
};

/**
 * #405 first canonical indicator: no stored counter or parallel lifecycle.
 * Callers MUST pass only sessions released by the consolidated prescription
 * for the authenticated student and contract inside the requested week.
 */
export function calculateWeeklyTrainingEvolution(input: {
  period: { startDate: string; endDate: string };
  sessions: WeeklyEvolutionSessionSource[];
  audience: TrainingRoutineAudience;
}): TrainingRoutineWeeklyEvolution {
  const seen = new Set<string>();
  const sessions = [...input.sessions].sort((left, right) => left.sessionId.localeCompare(right.sessionId));
  for (const session of sessions) {
    if (!session.sessionId || seen.has(session.sessionId)) {
      throw new Error('Uma sessão liberada deve ter ID único e não vazio.');
    }
    seen.add(session.sessionId);
  }

  const completedSessions = sessions.filter((row) => row.status === 'completed').length;
  const partialSessions = sessions.filter((row) => row.status === 'partial').length;
  const notPerformedSessions = sessions.filter((row) => row.status === 'not_performed').length;
  const prescribedSessions = sessions.length;
  const pendingSessions = prescribedSessions - completedSessions - partialSessions - notPerformedSessions;
  const adherencePct = prescribedSessions === 0
    ? null : Math.round((completedSessions / prescribedSessions) * 10000) / 100;
  const latestSource = sessions.reduce<string | null>((latest, session) => {
    const next = session.sourceUpdatedAt;
    return next !== null && (latest === null || next > latest) ? next : latest;
  }, null);

  return {
    ruleVersion: 'weekly-adherence-v1',
    source: 'consolidated_release_and_session_execution',
    period: { ...input.period },
    counts: { prescribedSessions, completedSessions, partialSessions, notPerformedSessions, pendingSessions },
    adherence: {
      status: adherencePct === null ? 'insufficient_data' : 'available',
      value: adherencePct,
      unit: '%',
      formula: 'completedSessions / prescribedSessions * 100',
    },
    lastSourceUpdateAt: latestSource,
    ...(input.audience === 'professor'
      ? { technical: { sessions: sessions.map(({ sessionId, status }) => ({ sessionId, status })) } }
      : {}),
  };
}
