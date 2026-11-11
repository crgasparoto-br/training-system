import type { PreWorkoutCheckInView } from './pre-workout-check-in.js';
import type { CanonicalPostWorkoutFeedbackRevisionView } from './post-workout-feedback.js';

/**
 * Contrato de leitura da rotina semanal e do Treino de hoje (issue #387).
 *
 * A fonte é exclusivamente o grafo operacional liberado
 * `TrainingPlan -> WorkoutTemplate(released=true) -> WorkoutDay -> WorkoutExercise`.
 * Este contrato é somente leitura: o lifecycle da sessão pertence à issue #389.
 */

export type TrainingRoutineAudience = 'student' | 'professor';

/** Projeção somente leitura no vocabulário público canônico da #389; não autoriza transições. */
export type TrainingRoutineExecutionProjectionStatus =
  | 'not_started'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'partial'
  | 'not_performed';

export type TrainingSessionExecutionStatus = TrainingRoutineExecutionProjectionStatus;

/** #401: neutral comparisons; differences do not imply improvement or decline. */
export type TrainingSessionExecutionOutcome = 'full' | 'partial' | 'substituted' | 'not_performed';
/** historical_unknown: the original plan was not captured; coverage cannot be reconstructed. */
export type TrainingSessionComparisonOutcome = TrainingSessionExecutionOutcome | 'not_recorded' | 'unclassified' | 'incomplete_record' | 'historical_unknown';

export interface TrainingSessionComparisonMetric {
  key: string;
  label: string;
  planned: number | string | null;
  plannedMax: number | string | null;
  /** Exact prescription, lower bound, upper bound, interval or unavailable.
   * Optional for backwards compatibility with previously serialized comparisons. */
  plannedConstraint?: 'exact' | 'minimum' | 'maximum' | 'range' | null;
  executed: number | string | null;
  plannedUnit: string | null;
  executedUnit: string | null;
  difference: number | null;
}

export interface TrainingSessionComparisonUnit {
  /** Stable planned ID, not the display position or exercise name. */
  plannedUnitId: string;
  parentUnitId: string | null;
  iteration: number | null;
  /** Set execution number, when the same planned set was logged more than once. */
  executedSetNumber?: number | null;
  /** Explicit user-provided replacement, never inferred from exercise names. */
  substitutionNote?: string | null;
  kind: 'session' | 'cyclic_stage' | 'exercise' | 'block' | 'set' | 'group';
  label: string;
  outcome: TrainingSessionComparisonOutcome;
  /** Substitutions remain visible even in incomplete or partial aggregates. */
  containsSubstitution?: boolean;
  metrics: TrainingSessionComparisonMetric[];
}

export interface TrainingSessionComparison {
  sessionId: string;
  originReleaseId: string;
  /** Older sessions without a captured plan use an explicitly marked legacy fallback. */
  snapshotSource: 'captured' | 'released_plan';
  executionVersion: number;
  units: TrainingSessionComparisonUnit[];
  /** Vinculos historicos entre planejado e substituto, independentes dos resultados executados. */
  substitutions?: TrainingSubstitutionRecord[];
}

/** #404: imutavel, tenant-scoped e sem alteracao da prescricao original. */
export type TrainingSubstitutionKind = 'exercise' | 'session';
export type TrainingSubstitutionContext = 'planning' | 'review' | 'execution';
export type TrainingSubstitutionStatus = 'approved' | 'pending_review' | 'rejected';

export interface TrainingSubstitutionSnapshot {
  /** Identidade da unidade operacional original/substituta. */
  unitId: string;
  /** Identidade do item de catalogo ou da sessao. */
  id: string;
  name: string;
  /** "exercicio:<versao>" ou "liberacao:<versao>". */
  version: string;
  capacity: string | null;
  movementPattern: string | null;
  equipment: string[];
  difficulty: string | null;
  /** Na visao do aluno nunca inclui restricoes tecnicas. */
  restrictions: string[];
}

export interface TrainingSubstitutionRecord {
  id: string;
  sessionId: string;
  alunoId: string;
  kind: TrainingSubstitutionKind;
  context: TrainingSubstitutionContext;
  status: TrainingSubstitutionStatus;
  original: TrainingSubstitutionSnapshot;
  replacement: TrainingSubstitutionSnapshot;
  originalVersion: string;
  replacementVersion: string;
  reason: string;
  actorUserId: string;
  createdAt: string;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  version: number;
}

export interface TrainingSubstitutionAlternativePage {
  items: TrainingSubstitutionAlternative[];
  /** Offset for the next page; null when all matching alternatives were returned. */
  nextOffset: number | null;
}

export interface TrainingSubstitutionAlternative {
  kind: TrainingSubstitutionKind;
  replacement: TrainingSubstitutionSnapshot;
  suitability: {
    sameMovementPattern: boolean;
    sameCapacity: boolean;
    sameDifficulty: boolean;
    sharedEquipment: string[];
    requiresProfessionalReview: boolean;
  };
  /** Auxilio a escolha, jamais autorizacao clinica ou troca automatica. */
  objectiveHint: string | null;
}

export interface TrainingSubstitutionCreatePayload {
  kind: TrainingSubstitutionKind;
  context: TrainingSubstitutionContext;
  originalUnitId: string;
  replacementUnitId: string;
  reason: string;
  operationKey: string;
  expectedExecutionVersion?: number;
}

export interface TrainingSubstitutionReviewPayload {
  action: 'approve' | 'reject';
  expectedVersion: number;
  reason?: string | null;
}

export interface TrainingSessionCyclicStageExecutionValue {
  plannedStageId: string;
  /** Repeat iteration, 1-based. */
  iteration?: number;
  outcome: TrainingSessionExecutionOutcome;
  substitutionNote?: string | null;
  durationSec?: number | null;
  distanceMeters?: number | null;
  paceMinPerKm?: number | null;
  speedKmh?: number | null;
  heartRateBpm?: number | null;
  heartRateZone?: string | null;
  pse?: number | null;
}

/** #489: cursor within the #389 execution JSON, never a second lifecycle. */
export interface GuidedCyclicCursor {
  plannedStageId: string | null;
  iteration: number | null;
  startedAt: string | null;
  pausedDurationAtStartMs: number | null;
}

/** One *occurrence* of a canonical #398 stage; repeated children reuse the planned ID. */
export interface GuidedCyclicUnit {
  plannedStageId: string;
  iteration: number;
  order: number;
  kind: 'warmup' | 'work' | 'recovery' | 'cooldown';
  roundNumber: number | null;
  roundTotal: number | null;
  durationUnit: 'seconds' | 'meters';
  durationValue: number;
  targetKind: 'pace_min_per_km' | 'speed_kmh' | 'heart_rate_bpm' | 'zone' | 'pse' | null;
  targetValue: number | null;
  targetMin: number | null;
  targetMax: number | null;
  inclinePercent: number | null;
  cadenceSpm: number | null;
  notes: string | null;
}

export interface GuidedCyclicView {
  sessionId: string;
  status: TrainingSessionExecutionStatus;
  version: number;
  serverNow: string;
  availability: 'available' | 'legacy_read_only' | 'invalid_plan' | 'reconciliation_required';
  completed: number;
  total: number;
  current: GuidedCyclicUnit | null;
  next: GuidedCyclicUnit | null;
  currentStartedAt: string | null;
  elapsedMs: number | null;
  remainingMs: number | null;
}

export interface GuidedCyclicActionPayload {
  operationKey: string;
  expectedVersion: number;
  plannedStageId: string;
  iteration: number;
  action: 'start' | 'complete';
  /** Only completion accepts an outcome and performed measurements. */
  outcome?: TrainingSessionExecutionOutcome;
  values?: Omit<TrainingSessionCyclicStageExecutionValue, 'plannedStageId' | 'iteration' | 'outcome'>;
}

export interface TrainingSessionResistanceGroupExecutionValue {
  plannedGroupId: string;
  outcome: TrainingSessionExecutionOutcome;
  substitutionNote?: string | null;
  roundsCompleted?: number | null;
  restBetweenExercisesSec?: number | null;
  restBetweenRoundsSec?: number | null;
}

export interface TrainingSessionExecutionSessionValues {
  durationSec?: number | null;
  distanceKm?: number | null;
  pace?: string | null;
  /** Average speed of this session, not a value inferred from pace or distance. */
  speedKmh?: number | null;
  heartRateBpm?: number | null;
  heartRateZone?: string | null;
  /** Keyed incremental upserts. Omitted units/fields remain untouched; null clears a metric. */
  cyclicStages?: TrainingSessionCyclicStageExecutionValue[];
  /** #489: stable occurrence and server-timestamp anchor for guided execution. */
  guidedCyclic?: GuidedCyclicCursor;
  resistanceGroups?: TrainingSessionResistanceGroupExecutionValue[];
}

/** Write-only deletion intents. The execution view never exposes or persists these controls. */
export interface TrainingSessionExecutionSessionValuesPatch extends TrainingSessionExecutionSessionValues {
  removeCyclicStages?: Array<{ plannedStageId: string; iteration?: number }>;
  removeResistanceGroups?: string[];
}

export interface TrainingSessionExecutionItemValue {
  plannedUnitId: string;
  /** Série planejada correspondente; nulo somente para unidades sem séries estruturadas. */
  plannedSetId?: string | null;
  setNumber?: number;
  /** Only explicit write outcomes; aggregate/unknown labels are derived on read. */
  outcome?: TrainingSessionExecutionOutcome;
  substitutionNote?: string | null;
  rir?: number | null;
  rpe?: number | null;
  tempo?: string | null;
  restSec?: number | null;
  /** Marcador persistido de conclusão guiada; somente leitura, não aceito em payloads de escrita. */
  completedAt?: string | null;
  loadKg?: number | null;
  repetitions?: number | null;
  durationSec?: number | null;
  distanceKm?: number | null;
  pace?: string | null;
  heartRateBpm?: number | null;
  heartRateZone?: string | null;
}

export interface TrainingSessionExecutionView {
  /** Identidade pública estável: o próprio WorkoutDay.id. */
  sessionId: string;
  status: TrainingSessionExecutionStatus;
  version: number;
  startedAt: string | null;
  finishedAt: string | null;
  currentPauseStartedAt: string | null;
  pausedDurationMs: number;
  interruptionReason: string | null;
  origin: {
    releaseId: string;
    workoutTemplateId: string;
    trainingPlanId: string;
  };
  sessionValues: TrainingSessionExecutionSessionValues;
  items: TrainingSessionExecutionItemValue[];
}

export interface TrainingSessionExecutionTransitionPayload {
  operationKey: string;
  expectedVersion: number;
  targetStatus: TrainingSessionExecutionStatus;
  reason?: string | null;
  sessionValues?: TrainingSessionExecutionSessionValuesPatch;
  items?: TrainingSessionExecutionItemValue[];
}

export interface TrainingSessionExecutionValuesPayload {
  operationKey: string;
  expectedVersion: number;
  sessionValues?: TrainingSessionExecutionSessionValuesPatch;
  items?: TrainingSessionExecutionItemValue[];
}

/** O executor guia somente séries explicitamente modeladas por #399.
 * Agrupamentos são estruturados pelas entidades canônicas da #400. */
export type GuidedResistanceAvailability =
  | 'available' | 'legacy_read_only' | 'grouping_pending' | 'no_structured_resistance';

export type ResistanceExerciseGroupType =
  | 'superserie' | 'bi_set' | 'tri_set' | 'circuito'
  | 'bloco_tecnico' | 'mobilidade' | 'finalizacao';

export interface GuidedResistanceUnit {
  plannedUnitId: string;
  plannedSetId: string;
  setNumber: number;
  exerciseName: string;
  /** Link HTTPS configurado no catálogo; mídia opcional, sem reprodução automática. */
  videoUrl: string | null;
  section: string;
  blockKind: string;
  blockPosition: number;
  setPosition: number;
  exerciseSetTotal: number;
  groupId: string | null;
  groupType: ResistanceExerciseGroupType | null;
  groupPosition: number | null;
  groupSize: number | null;
  roundNumber: number | null;
  roundTotal: number | null;
  repsMin: number | null;
  repsMax: number | null;
  loadKg: number | null;
  loadPercent: number | null;
  rir: number | null;
  rpe: number | null;
  tempo: string | null;
  restSec: number | null;
  notes: string | null;
}

/** Descanso real da transição entre séries; nunca altera a prescrição. */
export interface GuidedResistanceRestView {
  id: string;
  afterPlannedSetId: string;
  plannedSeconds: number;
  extensionSeconds: number;
  startedAt: string;
  targetEndsAt: string;
  /** Instante canônico do servidor usado como âncora para exibição. */
  serverNow: string;
  /** Tempo gasto no servidor até obter este snapshot, não é tempo de descanso.
   * Omitido somente por consumidores antigos; nunca compara relógios do cliente e do servidor. */
  requestProcessingMs?: number;
  elapsedMs: number;
  remainingMs: number;
}

export interface GuidedResistanceRestActionPayload {
  operationKey: string;
  expectedVersion: number;
  restId: string;
  action: 'extend_15' | 'skip' | 'finish';
}

export interface GuidedResistanceView {
  sessionId: string;
  /** Servidor no instante da projeção, mesmo sem descanso; usado apenas para calibrar a apresentação. */
  serverNow?: string;
  status: TrainingSessionExecutionStatus;
  version: number;
  availability: GuidedResistanceAvailability;
  completed: number;
  total: number;
  current: GuidedResistanceUnit | null;
  next: GuidedResistanceUnit | null;
  /** Null significa sem descanso pendente; opcional para consumidores legados. */
  rest?: GuidedResistanceRestView | null;
}

export interface GuidedResistanceCompletePayload {
  operationKey: string;
  expectedVersion: number;
  plannedUnitId: string;
  plannedSetId: string;
  setNumber: number;
  repetitions: number | null;
  loadKg: number | null;
}

export type TrainingRoutineModality = 'resistance' | 'cyclic' | 'flexibility' | 'balance';

export type TrainingRoutineTodayState = 'released' | 'not_released' | 'none';

export type TrainingRoutineBlockKey = 'warmup' | 'main' | 'cooldown' | 'other';

export interface TrainingRoutineRange {
  min: string | null;
  max: string | null;
}

export interface TrainingRoutineConsolidatedRelease {
  releaseId: string;
  assemblyId: string;
  sourceAssemblyVersion: number;
  releasedAssemblyVersion: number;
}

export interface TrainingRoutineOrigin {
  /** A #387 publica somente sessões liberadas pela Montagem Consolidada. */
  kind: 'consolidated';
  releasedAt: string | null;
  /** Presente somente na visão do professor e quando `kind = consolidated`. */
  consolidatedRelease?: TrainingRoutineConsolidatedRelease;
}

export interface TrainingRoutineSessionSummary {
  /** Identificador estável da sessão operacional (`WorkoutDay.id`). */
  sessionId: string;
  workoutTemplateId: string;
  trainingPlanId: string;
  planName: string;
  date: string;
  dayOfWeek: number;
  mesocycleNumber: number;
  weekNumber: number;
  modalities: TrainingRoutineModality[];
  durationMin: number | null;
  location: string | null;
  method: string | null;
  status: TrainingRoutineExecutionProjectionStatus;
  origin: TrainingRoutineOrigin;
  /** Only executed, authorized sessions have historical comparisons. */
  comparison?: TrainingSessionComparison;
  substitutions?: TrainingSubstitutionRecord[];
  /** Professor only: minimal captured exercise units for planning a future session. */
  substitutionExercises?: Array<Pick<TrainingRoutineExercise, 'id' | 'name'>>;
}

export interface TrainingRoutineExercise {
  id: string;
  order: number;
  name: string;
  system: string | null;
  sets: number | null;
  reps: number | null;
  loadKg: number | null;
  intervalSec: number | null;
  notes: string | null;
}

export interface TrainingRoutineBlock {
  key: TrainingRoutineBlockKey;
  exercises: TrainingRoutineExercise[];
}

/** Immutable cyclic prescription; repeated stages contain ordered work and recovery children. */
export interface TrainingRoutineCyclicStage {
  id: string;
  position: number;
  kind: 'warmup' | 'work' | 'recovery' | 'cooldown' | 'repeat';
  durationUnit: 'seconds' | 'meters' | null;
  durationValue: number | null;
  targetKind: 'pace_min_per_km' | 'speed_kmh' | 'heart_rate_bpm' | 'zone' | 'pse' | null;
  targetValue: number | null;
  targetMin: number | null;
  targetMax: number | null;
  repeatCount: number | null;
  inclinePercent: number | null;
  cadenceSpm: number | null;
  notes: string | null;
  children: TrainingRoutineCyclicStage[];
}

export interface TrainingRoutineCyclicTargets {
  durationMin: number | null;
  distanceKm: number | null;
  heartRate: TrainingRoutineRange | null;
  speed: TrainingRoutineRange | null;
  pace: TrainingRoutineRange | null;
}

export interface TrainingRoutineTechnicalContext {
  coachGoal: string | null;
  trainingMethod: string | null;
  trainingDivision: string | null;
  repReserve: number | null;
  vo2maxPct: number | null;
}

export interface TrainingRoutineSessionDetail extends TrainingRoutineSessionSummary {
  execution: TrainingSessionExecutionView;
  objective: string | null;
  guidelines: string[];
  cyclic: TrainingRoutineCyclicTargets | null;
  cyclicStages: TrainingRoutineCyclicStage[];
  blocks: TrainingRoutineBlock[];
  comparison?: TrainingSessionComparison;
  preWorkoutCheckIn?: PreWorkoutCheckInView | null;
  postWorkoutFeedback?: CanonicalPostWorkoutFeedbackRevisionView[];
  /** Presente somente na visão do professor. */
  technical?: TrainingRoutineTechnicalContext;
}

export interface TrainingRoutineDay {
  date: string;
  isToday: boolean;
  sessions: TrainingRoutineSessionSummary[];
  /** Quantidade de sessões existentes ainda não liberadas; nenhum conteúdo é exposto. */
  pendingReleaseCount: number;
}

export interface TrainingRoutineExecutionAvailability {
  /**
   * `false` enquanto o contrato canônico de execução (#389) não existir.
   * A interface não pode habilitar iniciar/pausar/concluir/registrar impossibilidade sem ele.
   */
  available: boolean;
  reason: 'execution_contract_pending' | null;
}

/** #405: read-only weekly projection from released sessions and canonical execution. */
export interface TrainingRoutineWeeklyEvolution {
  period: { startDate: string; endDate: string };
  /** Readable source for both audiences, not the internal source code. */
  sourceLabel: string;
  counts: {
    prescribedSessions: number;
    completedSessions: number;
    partialSessions: number;
    notPerformedSessions: number;
    pendingSessions: number;
  };
  adherence: {
    status: 'available' | 'insufficient_data';
    value: number | null;
    unit: '%';
  };
  lastSourceUpdateAt: string | null;
  /** Present only in the professor API response, never in the student payload. */
  technical?: {
    ruleVersion: 'weekly-adherence-v1';
    source: 'consolidated_release_and_session_execution';
    formula: 'completedSessions / prescribedSessions * 100';
    sessions: Array<{ sessionId: string; status: TrainingRoutineExecutionProjectionStatus }>;
  };
}

export interface TrainingRoutineView {
  alunoId: string;
  audience: TrainingRoutineAudience;
  referenceDate: string;
  timeZone: string;
  week: { startDate: string; endDate: string };
  days: TrainingRoutineDay[];
  weeklyEvolution?: TrainingRoutineWeeklyEvolution;
  today: {
    date: string;
    state: TrainingRoutineTodayState;
    sessions: TrainingRoutineSessionDetail[];
  };
  execution: TrainingRoutineExecutionAvailability;
  /** Próxima sessão liberada pela montagem consolidada, mesmo fora da semana exibida. */
  nextSession?: {
    sessionId: string;
    date: string;
    status: TrainingRoutineExecutionProjectionStatus;
  } | null;
  /** Projeção canônica de última execução, independente da janela semanal. */
  lastExecution?: {
    sessionId: string;
    date: string;
    status: TrainingRoutineExecutionProjectionStatus;
  } | null;
  /** Contagem confirmada na semana, sem expor valores sensíveis das revisões. */
  feedbackContinuity?: {
    state: 'available' | 'unavailable';
    pendingCount: number;
    registeredCount: number;
  };
}
