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
import { ambiguousLatestOrder, observationOrder, measure } from './training-evolution-aggregation.domain.js';
import { countDistinctExecutedSubstitutions } from './training-evolution-substitutions.domain.js';
import { capturedStagePaces, type CapturedEvolutionStage } from './training-evolution-stage-pace.domain.js';

/** All sources are scoped to an authenticated student, contract and consolidated release upstream. */
export type WeeklyEvolutionSessionSource = {
  sessionId: string;
  status: TrainingRoutineExecutionProjectionStatus;
  sourceUpdatedAt: string | null;
  /** Canonical execution finish time, unaffected by later feedback revisions. */
  executionFinishedAt?: string | null;
  date?: string;
  modality?: string;
  /** Explicit training method and cyclic structure captured with the execution plan. */
  method?: string | null;
  cyclicStructure?: string | null;
  releaseId?: string;
  execution?: {
    sessionValues: TrainingSessionExecutionSessionValues;
    items: TrainingSessionExecutionItemValue[];
    /** Historical stage graph from the execution snapshot, never the mutable WorkoutDay. */
    plannedCyclicStages?: CapturedEvolutionStage[];
    /** Captured #401 plan only. Current mutable WorkoutDay cannot identify a historic exercise. */
    plannedResistanceGroups?: Array<{ id: string; memberUnitIds: string[] }>;
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
  performedAt: string | null;
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
    formula: 'confirmed session duration or deduplicated cyclic stages and separately scoped confirmed item duration in minutes',
    source: 'captured_plan_and_canonical_session_execution' },
  { key: 'distance', label: 'Distância executada', unit: 'km', aggregation: 'sum',
    formula: 'confirmed session distance or deduplicated cyclic stages and separately scoped confirmed item distances within captured sport and context',
    source: 'captured_plan_and_canonical_session_execution' },
  { key: 'pace', label: 'Ritmo registrado', unit: 'min/km', aggregation: 'mean',
    formula: 'mean(recorded session pace, or separately scoped confirmed cyclic stage/item pace) within same captured sport, method, topology and unit',
    source: 'captured_plan_and_canonical_session_execution' },
  { key: 'tonnage', label: 'Volume resistido registrado', unit: 'kg × rep', aggregation: 'sum',
    formula: 'sum(confirmed_executed_load_kg * confirmed_executed_repetitions)',
    source: 'canonical_execution_items' },
  { key: 'load', label: 'Carga por exercício e série', unit: 'kg', aggregation: 'last',
    formula: 'latest(confirmed_executed_load_kg) within same catalog, captured section, slot, system, blocks, group and set',
    source: 'captured_plan_and_canonical_execution_items' },
  { key: 'repetitions', label: 'Repetições por exercício e série', unit: 'rep', aggregation: 'last',
    formula: 'latest(confirmed_executed_repetitions) within same catalog, captured section, slot, system, blocks, group and set',
    source: 'captured_plan_and_canonical_execution_items' },
  { key: 'pse', label: 'PSE registrada', unit: '0–10', aggregation: 'mean',
    formula: 'mean(latest_revision_pse) within same feedback_scope',
    source: 'canonical_post_workout_feedback_current_revision' },
  { key: 'psr', label: 'PSR registrada', unit: '0–10', aggregation: 'mean',
    formula: 'mean(latest_revision_psr) within same feedback_scope',
    source: 'canonical_post_workout_feedback_current_revision' },
  { key: 'substitutions', label: 'Substituições executadas', unit: 'ocorrências', aggregation: 'sum',
    formula: 'sum(distinct_executed_substituted_sets_stages_and_resistance_groups)',
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

/** #389: an unclassified draft is not proof of an executed set, even in a partial session. */
const isConfirmedExecutedItem = (item: TrainingSessionExecutionItemValue): boolean =>
  item.outcome === 'full' || item.outcome === 'partial' || item.outcome === 'substituted'
  || (item.outcome == null && Boolean(item.completedAt));
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

/** An exercise method is not a sport: e.g. CEXT can mean running or cycling. */
function explicitCapturedSport(method: string | null | undefined): string | null {
  const label = comparableText(method)?.normalize('NFKD').replace(/\p{M}/gu, '') ?? '';
  const sportMarkers: Array<[string, RegExp]> = [
    ['running', /\b(corrida|correr|running|run)\b/u],
    ['cycling', /\b(ciclismo|pedalada|bicicleta|bike|cycling)\b/u],
    ['walking', /\b(caminhada|walking)\b/u],
    ['swimming', /\b(natacao|swimming)\b/u],
  ];
  const matches = sportMarkers.filter(([, expression]) => expression.test(label));
  // Ambiguous or generic methods cannot establish comparable sport identity.
  return matches.length === 1 ? matches[0][0] : null;
}

/** A captured method and topology never prove the sport without an explicit identifier. */
function capturedCyclicContext(session: WeeklyEvolutionSessionSource) {
  const method = comparableText(session.method);
  const structure = comparableText(session.cyclicStructure);
  const sport = explicitCapturedSport(method);
  const knownType = sport !== null && structure !== null;
  return {
    knownType,
    scope: knownType
      ? JSON.stringify(['captured-cyclic', sport, method, structure])
      : JSON.stringify(['unclassified-cyclic', session.sessionId]),
    label: knownType ? 'Sessão · ' + session.method!.trim()
      : 'Sessão · esporte cíclico não identificado',
  };
}

type RecordedCyclicStage = NonNullable<TrainingSessionExecutionSessionValues['cyclicStages']>[number];
type CapturedCyclicStages = NonNullable<NonNullable<WeeklyEvolutionSessionSource['execution']>['plannedCyclicStages']>;

/**
 * A recorded repeat parent is an aggregate of its descendants, not an extra
 * performed stage. For each measurement prefer the explicit parent total if
 * present; otherwise sum the measured children. A missing historical graph
 * cannot safely distinguish distinct leaves from parent/child aggregates.
 */
function sumCapturedStageMeasurements(
  stages: RecordedCyclicStage[], plan: CapturedCyclicStages | undefined,
  field: 'durationSec' | 'distanceMeters',
): number | null | 'incomparable' {
  const measured = stages.filter((stage) => stage.outcome !== 'not_performed'
    && stage[field] !== null && stage[field] !== undefined);
  if (!measured.length) return null;
  const occurrences = new Set<string>();
  for (const stage of measured) {
    const iteration = stage.iteration ?? 1;
    const occurrence = JSON.stringify([stage.plannedStageId, iteration]);
    if (!stage.plannedStageId || !Number.isInteger(iteration) || iteration < 1
      || occurrences.has(occurrence) || !finite(stage[field])) return 'incomparable';
    occurrences.add(occurrence);
  }
  if (!plan?.length) {
    // One stage with several iterations can be summed; distinct stage IDs
    // might instead be a parent aggregate and its leaves.
    if (new Set(measured.map((stage) => stage.plannedStageId)).size > 1) return 'incomparable';
    return measured.reduce((total, stage) => total + stage[field]!, 0);
  }
  const byId = new Map(plan.map((stage) => [stage.id, stage]));
  if (byId.size !== plan.length) return 'incomparable';
  const aggregates = new Set(measured.filter((stage) =>
    byId.get(stage.plannedStageId)?.kind === 'repeat').map((stage) => stage.plannedStageId));
  let total = 0;
  for (const stage of measured) {
    if (!byId.has(stage.plannedStageId)) return 'incomparable';
    const visited = new Set([stage.plannedStageId]);
    let parentId = byId.get(stage.plannedStageId)!.parentStageId;
    let representedByAncestor = false;
    while (parentId !== null) {
      if (visited.has(parentId) || !byId.has(parentId)) return 'incomparable';
      visited.add(parentId);
      if (aggregates.has(parentId)) representedByAncestor = true;
      parentId = byId.get(parentId)!.parentStageId;
    }
    if (!representedByAncestor) total += stage[field]!;
  }
  return total;
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
    performedAt: string | null = null,
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
      sessionId: session.sessionId, releaseId: session.releaseId, sourceId, updatedAt, performedAt,
    });
  };

  for (const session of sessions) {
    if (!isTerminalPerformed(session.status) || !session.execution) continue;
    const { sessionValues, items, plannedExercises, plannedCyclicStages, plannedResistanceGroups } = session.execution;
    const stages = sessionValues.cyclicStages ?? [];
    const stageDuration = sessionValues.durationSec == null
      ? sumCapturedStageMeasurements(stages, plannedCyclicStages, 'durationSec') : null;
    if (stageDuration === 'incomparable') incompatible.add('duration');
    const duration = sessionValues.durationSec ??
      (stageDuration === 'incomparable' ? null : stageDuration);
    if (duration !== null && duration !== undefined) {
      const durationScope = session.modality?.split('+').includes('cyclic')
        ? capturedCyclicContext(session) : { knownType: true, scope: 'session', label: 'Sessão' };
      if (!durationScope.knownType) incompatible.add('duration');
      add(session, 'duration', finite(duration) ? duration / 60 : duration,
        durationScope.scope, durationScope.label, session.sessionId);
    }
    const stageDistance = sessionValues.distanceKm == null
      ? sumCapturedStageMeasurements(stages, plannedCyclicStages, 'distanceMeters') : null;
    if (stageDistance === 'incomparable') incompatible.add('distance');
    const distance = sessionValues.distanceKm ??
      (stageDistance === 'incomparable' || stageDistance === null ? null : stageDistance / 1000);
    // Legacy/invalid snapshots retain the measured reading, never a fabricated
    // comparable type. Current mutable WorkoutDay modalities cannot fill the gap.
    const cyclicOrUnclassified = session.modality?.split('+').includes('cyclic')
      || !knownModality(session.modality);
    if (cyclicOrUnclassified) {
      const context = capturedCyclicContext(session);
      if (distance !== null && distance !== undefined) {
        if (!context.knownType) incompatible.add('distance');
        add(session, 'distance', distance, context.scope, context.label, session.sessionId);
      }
      if (sessionValues.pace !== undefined && sessionValues.pace !== null) {
        const converted = paceMinutes(sessionValues.pace);
        if (converted === null) incompatible.add('pace');
        else {
          if (!context.knownType) incompatible.add('pace');
          add(session, 'pace', converted, context.scope, context.label, session.sessionId);
        }
      } else {
        const stagePace = capturedStagePaces({
          sessionId: session.sessionId, stages, plan: plannedCyclicStages,
          cyclicScope: context.scope, cyclicLabel: context.label,
          knownCyclicType: context.knownType,
        });
        if (stagePace.incomparable) incompatible.add('pace');
        for (const reading of stagePace.readings) {
          add(session, 'pace', reading.value, reading.scope, reading.scopeLabel, reading.sourceId);
        }
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
    const resistanceOrUnclassified = session.modality?.split('+').includes('resistance')
      || !knownModality(session.modality);
    const confirmedItems = items.filter(isConfirmedExecutedItem);
    const executedItems = resistanceOrUnclassified ? confirmedItems : [];
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
      const performedAt = item.completedAt ?? session.executionFinishedAt ?? null;
      add(session, 'load', item.loadKg, scope, label, sourceId, session.sourceUpdatedAt, performedAt);
      add(session, 'repetitions', item.repetitions, scope, label, sourceId, session.sourceUpdatedAt, performedAt);
    }
    // A-013: item-level cyclic measurements are canonical execution readings too.
    // They are never assumed to be whole-session totals, nor added to captured
    // stage totals: independent scopes make overlapping sources incomparable.
    const itemKeys = new Set<string>();
    for (const item of confirmedItems) {
      const hasItemDuration = item.durationSec !== null && item.durationSec !== undefined;
      const hasItemDistance = item.distanceKm !== null && item.distanceKm !== undefined;
      const hasItemPace = item.pace !== null && item.pace !== undefined;
      if (!hasItemDuration && !hasItemDistance && !hasItemPace) continue;
      const key = JSON.stringify([item.plannedUnitId, item.setNumber ?? null]);
      const duplicate = itemKeys.has(key);
      itemKeys.add(key);
      const plan = planByUnit.get(item.plannedUnitId);
      const context = plan ? exerciseContext(plan) : null;
      const collision = context !== null && (contextUnits.get(context)?.size ?? 0) > 1;
      const setValid = Number.isInteger(item.setNumber) && (item.setNumber ?? 0) > 0;
      const itemComparable = Boolean(context) && !collision && !duplicate
        && setValid && item.outcome !== 'substituted';
      const itemScope = itemComparable
        ? JSON.stringify(['captured-item', context, item.setNumber])
        : JSON.stringify(['unclassified-item', session.sessionId, item.plannedUnitId, item.setNumber]);
      const itemLabel = itemComparable
        ? `${plan!.name} · ${plan!.section} · posição ${plan!.exerciseOrder} · série ${item.setNumber}`
        : 'Item executado · contexto histórico não comparável';
      const sourceId = `execution-item:${item.plannedSetId ?? `${item.plannedUnitId}:set:${item.setNumber ?? 'unknown'}`}`;
      const contextCyclic = capturedCyclicContext(session);
      const comparableCyclic = itemComparable && contextCyclic.knownType
        && session.modality?.split('+').includes('cyclic');
      const completedAt = item.completedAt ?? session.executionFinishedAt ?? null;
      for (const [key, present, rawValue, allowed] of [
        ['duration', hasItemDuration && sessionValues.durationSec == null,
          hasItemDuration && typeof item.durationSec === 'number' ? item.durationSec / 60 : item.durationSec, true],
        ['distance', hasItemDistance && sessionValues.distanceKm == null,
          item.distanceKm, comparableCyclic],
        ['pace', hasItemPace && sessionValues.pace == null,
          hasItemPace && typeof item.pace === 'string' ? paceMinutes(item.pace) : null, comparableCyclic],
      ] as const) {
        if (!present) continue;
        if (!allowed || !itemComparable || (key === 'pace' && rawValue === null)) incompatible.add(key);
        const scope = allowed && itemComparable
          ? JSON.stringify([itemScope, key === 'duration' ? 'duration' : contextCyclic.scope])
          : JSON.stringify(['unclassified-item-measure', session.sessionId, itemScope, key]);
        add(session, key, rawValue, scope, itemLabel, sourceId, session.sourceUpdatedAt, completedAt);
      }
    }

    if (tonnageSamples > 0) {
      add(session, 'tonnage', tonnage, 'session', 'Sessão', session.sessionId);
    }

    const substitutionCount = countDistinctExecutedSubstitutions(
      items, sessionValues, plannedCyclicStages, plannedResistanceGroups);
    if (substitutionCount === 'incomparable') incompatible.add('substitutions');
    else add(session, 'substitutions', substitutionCount, 'session', 'Sessão', session.sessionId);

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
    // Isolate unorderable records: an ID or planned date is not a completion time.
    for (const [signature, values] of [...groups]) {
      if (definition.aggregation !== 'last' || !ambiguousLatestOrder(values)) continue;
      groups.delete(signature);
      values.forEach((entry, index) =>
        groups.set(signature + '|order-unverified|' + String(index), [entry]));
      incompatible.add(definition.key);
    }
    const comparable = groups.size === 1 && !incompatible.has(definition.key);
    metrics.push({
      key: definition.key, label: definition.label, unit: definition.unit,
      status: incompatible.has(definition.key) || groups.size > 1
        ? 'incomparable' : relevant.length ? 'available' : 'insufficient_data',
      value: comparable ? round(measure(definition.aggregation, relevant)) : null,
      sampleCount: relevant.length,
      lastSourceUpdateAt: relevant.reduce<string | null>(
        (latest, item) => maxIso(latest, item.updatedAt), null),
      sourceLabel: PUBLIC_SOURCES[definition.key],
    });
    for (const [signature, values] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
      const sorted = [...values].sort((left, right) => observationOrder(definition.aggregation, left, right));
      series.push({
        key: definition.key,
        label: definition.label,
        unit: definition.unit,
        modality: sorted[0].modality,
        scopeLabel: sorted[0].scopeLabel
          + (signature.includes('|order-unverified|') ? ' · ordem temporal não identificada' : ''),
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
