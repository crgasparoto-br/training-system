import type {
  TrainingEvolutionMetric,
  TrainingEvolutionMetricKey,
  TrainingEvolutionRuleEvidence,
  TrainingEvolutionSeries,
  TrainingRoutineAudience,
  TrainingRoutineExecutionProjectionStatus,
  TrainingRoutineWeeklyEvolution,
  TrainingSessionExecutionItemValue,
  TrainingSessionExecutionSessionValues,
} from '@corrida/types';

/** All sources are scoped to an authenticated student, contract and consolidated release upstream. */
export type WeeklyEvolutionSessionSource = {
  sessionId: string;
  status: TrainingRoutineExecutionProjectionStatus;
  sourceUpdatedAt: string | null;
  date?: string;
  modality?: string;
  /** Explicit training method and cyclic structure captured with the execution plan. */
  method?: string | null;
  cyclicStructure?: string | null;
  releaseId?: string;
  execution?: {
    sessionValues: TrainingSessionExecutionSessionValues;
    items: TrainingSessionExecutionItemValue[];
    /** Captured #401 plan only. Current mutable WorkoutDay cannot identify a historic exercise. */
    plannedExercises: Array<{
      plannedUnitId: string;
      catalogExerciseId: string | null;
      name: string;
      /** Stable semantic slot from the captured plan, not the current WorkoutDay. */
      section?: string | null;
      exerciseOrder?: number | null;
      system?: string | null;
      blockSignature?: string;
      groupSignature?: string | null;
    }>;
  };
  /** Only latest, authorized #390 revisions; no clinical fields reach this aggregation. */
  feedback?: Array<{
    id: string;
    scopeKey: string;
    createdAt: string;
    pse: number | null;
    psr: number | null;
  }>;
};

type Observation = {
  key: TrainingEvolutionMetricKey;
  value: number;
  modality: string;
  scope: string;
  scopeLabel: string;
  date: string;
  sessionId: string;
  releaseId: string;
  sourceId: string;
  updatedAt: string | null;
};

type IndicatorDefinition = {
  key: TrainingEvolutionMetricKey;
  label: string;
  unit: string;
  aggregation: 'sum' | 'mean' | 'last';
  formula: string;
  source: string;
};

const DEFINITIONS: readonly IndicatorDefinition[] = [
  { key: 'duration', label: 'Tempo executado', unit: 'min', aggregation: 'sum',
    formula: 'sum(executed_duration_seconds) / 60', source: 'canonical_session_execution' },
  { key: 'distance', label: 'Distância executada', unit: 'km', aggregation: 'sum',
    formula: 'sum(executed_distance_km)', source: 'canonical_session_execution' },
  { key: 'pace', label: 'Ritmo registrado', unit: 'min/km', aggregation: 'mean',
    formula: 'mean(canonical_session_pace_min_per_km) within same captured session method and cyclic structure',
    source: 'captured_plan_and_canonical_session_execution' },
  { key: 'tonnage', label: 'Volume resistido registrado', unit: 'kg × rep', aggregation: 'sum',
    formula: 'sum(executed_load_kg * executed_repetitions)', source: 'canonical_execution_items' },
  { key: 'load', label: 'Carga por exercício e série', unit: 'kg', aggregation: 'last',
    formula: 'latest(executed_load_kg) within same catalog, captured section, slot, system, blocks, group and set',
    source: 'captured_plan_and_canonical_execution_items' },
  { key: 'repetitions', label: 'Repetições por exercício e série', unit: 'rep', aggregation: 'last',
    formula: 'latest(executed_repetitions) within same catalog, captured section, slot, system, blocks, group and set',
    source: 'captured_plan_and_canonical_execution_items' },
  { key: 'pse', label: 'PSE registrada', unit: '0–10', aggregation: 'mean',
    formula: 'mean(latest_revision_pse) within same feedback_scope',
    source: 'canonical_post_workout_feedback_current_revision' },
  { key: 'psr', label: 'PSR registrada', unit: '0–10', aggregation: 'mean',
    formula: 'mean(latest_revision_psr) within same feedback_scope',
    source: 'canonical_post_workout_feedback_current_revision' },
  { key: 'substitutions', label: 'Substituições executadas', unit: 'ocorrências', aggregation: 'sum',
    formula: 'sum(explicit_substituted_items_and_cyclic_stage_occurrences)',
    source: 'canonical_session_execution' },
];

const PUBLIC_SOURCES: Record<TrainingEvolutionMetricKey, string> = {
  duration: 'Execução registrada da sessão',
  distance: 'Execução cíclica registrada',
  pace: 'Ritmo cíclico registrado',
  tonnage: 'Séries resistidas executadas',
  load: 'Séries resistidas e planejamento histórico',
  repetitions: 'Séries resistidas e planejamento histórico',
  pse: 'Revisão vigente do feedback pós-treino',
  psr: 'Revisão vigente do feedback pós-treino',
  substitutions: 'Unidades efetivamente substituídas na execução',
};

const RULE_VERSION = 'training-evolution-v1' as const;
const round = (n: number) => Math.round(n * 100) / 100;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const maxIso = (left: string | null, right: string | null) =>
  right !== null && (left === null || right > left) ? right : left;
const isTerminalPerformed = (status: TrainingRoutineExecutionProjectionStatus) =>
  status === 'completed' || status === 'partial';
const KNOWN_MODALITIES = new Set(['cyclic', 'resistance', 'flexibility', 'balance']);

function comparableText(value: string | null | undefined): string | null {
  const normalized = value?.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
  return normalized && !['unknown', 'n/a', 'não informado', 'nao informado'].includes(normalized)
    ? normalized : null;
}

function knownModality(value: string | undefined): boolean {
  const parts = value?.split('+') ?? [];
  return parts.length > 0 && parts.every((part) => KNOWN_MODALITIES.has(part))
    && new Set(parts).size === parts.length;
}

type PlannedExercise = NonNullable<WeeklyEvolutionSessionSource['execution']>['plannedExercises'][number];

/** A catalog ID identifies a movement, not a workout slot or resistance method. */
function exerciseContext(plan: PlannedExercise): string | null {
  const section = comparableText(plan.section);
  if (!plan.catalogExerciseId || !section || !Number.isInteger(plan.exerciseOrder)
    || (plan.exerciseOrder ?? -1) < 0 || plan.system === undefined
    || typeof plan.blockSignature !== 'string' || plan.groupSignature === undefined) return null;
  return JSON.stringify([
    plan.catalogExerciseId, section, plan.exerciseOrder, comparableText(plan.system),
    plan.blockSignature, plan.groupSignature,
  ]);
}

/** Reject untyped/ambiguous pace instead of silently mixing text, speed and seconds. */
function paceMinutes(value: string): number | null {
  const match = /^([0-9]{1,3}):([0-5][0-9])$/.exec(value.trim());
  return match ? Number(match[1]) + Number(match[2]) / 60 : null;
}

function measure(definition: IndicatorDefinition, values: Observation[]): number {
  const ordered = [...values].sort((a, b) =>
    a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId) || a.sourceId.localeCompare(b.sourceId));
  if (definition.aggregation === 'last') return ordered[ordered.length - 1].value;
  const total = ordered.reduce((sum, entry) => sum + entry.value, 0);
  return definition.aggregation === 'mean' ? total / ordered.length : total;
}

/**
 * Read-only #405 projection. Never infers absent measurements, clinical findings,
 * a consistency score, or a positive/negative judgement from trend direction.
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
    ? null : round(completedSessions / prescribedSessions * 100);
  const latestSource = sessions.reduce<string | null>(
    (latest, session) => maxIso(latest, session.sourceUpdatedAt), null);

  const observations: Observation[] = [];
  const incompatible = new Set<TrainingEvolutionMetricKey>();
  const recordedSources = new Set<string>();
  const add = (
    session: WeeklyEvolutionSessionSource, key: TrainingEvolutionMetricKey,
    value: unknown, scope: string, scopeLabel: string, sourceId: string,
    updatedAt: string | null = session.sourceUpdatedAt,
  ) => {
    if (value === undefined || value === null) return;
    if (!finite(value)) { incompatible.add(key); return; }
    if (!session.date || !session.releaseId) return;
    const identity = key + ':' + session.sessionId + ':' + sourceId;
    if (recordedSources.has(identity)) return;
    recordedSources.add(identity);
    // A missing/unrecognized modality is not evidence of compatibility.
    const hasModality = knownModality(session.modality);
    if (!hasModality) incompatible.add(key);
    observations.push({
      key, value,
      scope: hasModality ? scope : JSON.stringify([scope, 'unclassified', session.sessionId]),
      scopeLabel: hasModality ? scopeLabel : scopeLabel + ' · modalidade não identificada',
      modality: hasModality ? session.modality! : 'unknown', date: session.date,
      sessionId: session.sessionId, releaseId: session.releaseId, sourceId, updatedAt,
    });
  };

  for (const session of sessions) {
    if (!isTerminalPerformed(session.status) || !session.execution) continue;
    const { sessionValues, items, plannedExercises } = session.execution;
    const stages = sessionValues.cyclicStages ?? [];
    const eligibleStages = stages.filter((stage) => stage.outcome !== 'not_performed');
    const stageDuration = eligibleStages.filter((stage) => stage.durationSec !== undefined && stage.durationSec !== null);
    const duration = sessionValues.durationSec ??
      (stageDuration.length ? stageDuration.reduce((sum, stage) => sum + (stage.durationSec ?? 0), 0) : null);
    if (duration !== null && duration !== undefined) {
      add(session, 'duration', finite(duration) ? duration / 60 : duration, 'session', 'Sessão', session.sessionId);
    }
    const stageDistance = eligibleStages.filter((stage) => stage.distanceMeters !== undefined && stage.distanceMeters !== null);
    const distance = sessionValues.distanceKm ??
      (stageDistance.length ? stageDistance.reduce((sum, stage) => sum + (stage.distanceMeters ?? 0), 0) / 1000 : null);
    if (session.modality?.split('+').includes('cyclic')) {
      add(session, 'distance', distance, 'session', 'Sessão', session.sessionId);
    }

    if (session.modality?.split('+').includes('cyclic')
      && sessionValues.pace !== undefined && sessionValues.pace !== null) {
      const converted = paceMinutes(sessionValues.pace);
      if (converted === null) incompatible.add('pace');
      else {
        const method = comparableText(session.method);
        const structure = comparableText(session.cyclicStructure);
        // A recorded pace without a captured session type is an isolated reading,
        // not a comparable progression (including when two types are both unknown).
        const typeKnown = Boolean(method || structure);
        if (!typeKnown) incompatible.add('pace');
        add(session, 'pace', converted,
          typeKnown ? JSON.stringify(['session-type', method, structure])
            : JSON.stringify(['session-type-unknown', session.sessionId]),
          typeKnown ? 'Sessão · ' + (session.method?.trim() || 'etapas cíclicas capturadas')
            : 'Sessão · tipo de treino não identificado', session.sessionId);
      }
    }

    const planByUnit = new Map(plannedExercises.map((item) => [item.plannedUnitId, item]));
    const contextUnits = new Map<string, Set<string>>();
    for (const plan of plannedExercises) {
      const context = exerciseContext(plan);
      if (!context) continue;
      const units = contextUnits.get(context) ?? new Set<string>();
      units.add(plan.plannedUnitId);
      contextUnits.set(context, units);
    }
    let tonnage = 0;
    let tonnageSamples = 0;
    const executedItems = session.modality?.split('+').includes('resistance')
      ? items.filter((item) => item.outcome !== 'not_performed') : [];
    for (const item of executedItems) {
      if (item.loadKg !== null && item.loadKg !== undefined
        && item.repetitions !== null && item.repetitions !== undefined) {
        if (finite(item.loadKg) && finite(item.repetitions)) {
          tonnage += item.loadKg * item.repetitions;
          tonnageSamples += 1;
        } else incompatible.add('tonnage');
      }
      // The original exercise is not the identity of an explicitly substituted item.
      if (item.outcome === 'substituted') continue;
      const plan = planByUnit.get(item.plannedUnitId);
      if (!plan?.catalogExerciseId || !Number.isInteger(item.setNumber) || (item.setNumber ?? 0) < 1) continue;
      const context = exerciseContext(plan);
      const hasCollision = context !== null && (contextUnits.get(context)?.size ?? 0) > 1;
      const comparable = context !== null && !hasCollision;
      if (!comparable) {
        if (item.loadKg !== null && item.loadKg !== undefined) incompatible.add('load');
        if (item.repetitions !== null && item.repetitions !== undefined) incompatible.add('repetitions');
      }
      const scope = comparable
        ? JSON.stringify([context, item.setNumber])
        : JSON.stringify(['unclassified-unit', session.sessionId, item.plannedUnitId, item.setNumber]);
      const label = comparable
        ? plan.name + ' · ' + plan.section + ' · posição ' + plan.exerciseOrder
          + ' · série ' + String(item.setNumber)
        : plan.name + ' · unidade histórica não comparável · série ' + String(item.setNumber);
      const sourceId = item.plannedSetId ?? item.plannedUnitId + ':set:' + String(item.setNumber);
      add(session, 'load', item.loadKg, scope, label, sourceId);
      add(session, 'repetitions', item.repetitions, scope, label, sourceId);
    }
    if (tonnageSamples > 0) {
      add(session, 'tonnage', tonnage, 'session', 'Sessão', session.sessionId);
    }

    const substitutedUnits = items.filter((item) => item.outcome === 'substituted').length;
    const substitutedStages = stages.filter((stage) => stage.outcome === 'substituted').length;
    add(session, 'substitutions', substitutedUnits + substitutedStages, 'session', 'Sessão', session.sessionId);

    for (const feedback of session.feedback ?? []) {
      const scopeLabel = feedback.scopeKey === 'session' ? 'Sessão' : 'Feedback: ' + feedback.scopeKey;
      const scope = 'feedback:' + feedback.scopeKey;
      for (const key of ['pse', 'psr'] as const) {
        const value = feedback[key];
        if (value !== null && value !== undefined
          && (!Number.isInteger(value) || value > 10)) {
          incompatible.add(key);
        } else {
          add(session, key, value, scope, scopeLabel, feedback.id, feedback.createdAt);
        }
      }
    }
  }

  const metrics: TrainingEvolutionMetric[] = [];
  const series: TrainingEvolutionSeries[] = [];
  const indicators: TrainingEvolutionRuleEvidence[] = [];

  for (const definition of DEFINITIONS) {
    const relevant = observations.filter((entry) => entry.key === definition.key);
    const groups = new Map<string, Observation[]>();
    for (const observation of relevant) {
      const signature = observation.modality + '|' + observation.scope;
      groups.set(signature, [...(groups.get(signature) ?? []), observation]);
    }
    const comparable = groups.size === 1 && !incompatible.has(definition.key);
    metrics.push({
      key: definition.key, label: definition.label, unit: definition.unit,
      status: incompatible.has(definition.key) || groups.size > 1
        ? 'incomparable' : relevant.length ? 'available' : 'insufficient_data',
      value: comparable ? round(measure(definition, relevant)) : null,
      sampleCount: relevant.length,
      lastSourceUpdateAt: relevant.reduce<string | null>(
        (latest, item) => maxIso(latest, item.updatedAt), null),
      sourceLabel: PUBLIC_SOURCES[definition.key],
    });
    for (const [, values] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
      const sorted = [...values].sort((left, right) =>
        left.date.localeCompare(right.date) || left.sessionId.localeCompare(right.sessionId)
        || left.sourceId.localeCompare(right.sourceId));
      series.push({
        key: definition.key,
        label: definition.label,
        unit: definition.unit,
        modality: sorted[0].modality,
        scopeLabel: sorted[0].scopeLabel,
        points: sorted.map(({ date, value }) => ({ date, value: round(value) })),
        ...(input.audience === 'professor' ? {
          technical: {
            ruleVersion: RULE_VERSION,
            sources: sorted.map(({ sessionId, releaseId, sourceId, updatedAt }) => ({
              sessionId, releaseId, sourceId, updatedAt,
            })),
          },
        } : {}),
      });
    }
    indicators.push({
      key: definition.key,
      ruleVersion: RULE_VERSION,
      formula: definition.formula,
      source: definition.source,
      observations: relevant.map(({ sessionId, releaseId, sourceId, updatedAt }) => ({
        sessionId, releaseId, sourceId, updatedAt,
      })),
    });
  }

  return {
    period: { ...input.period },
    sourceLabel: 'Montagem Consolidada e execução das sessões',
    counts: { prescribedSessions, completedSessions, partialSessions, notPerformedSessions, pendingSessions },
    adherence: {
      status: adherencePct === null ? 'insufficient_data' : 'available',
      value: adherencePct, unit: '%',
    },
    lastSourceUpdateAt: latestSource,
    metrics,
    series,
    ...(input.audience === 'professor'
      ? { technical: {
          ruleVersion: 'weekly-adherence-v1' as const,
          source: 'consolidated_release_and_session_execution' as const,
          formula: 'completedSessions / prescribedSessions * 100' as const,
          sessions: sessions.map(({ sessionId, status }) => ({ sessionId, status })),
          indicators,
        } }
      : {}),
  };
}
