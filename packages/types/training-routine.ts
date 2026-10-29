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

export interface TrainingSessionExecutionSessionValues {
  durationSec?: number | null;
  distanceKm?: number | null;
  pace?: string | null;
  heartRateBpm?: number | null;
  heartRateZone?: string | null;
}

export interface TrainingSessionExecutionItemValue {
  plannedUnitId: string;
  /** Série planejada correspondente; nulo somente para unidades sem séries estruturadas. */
  plannedSetId?: string | null;
  setNumber?: number;
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
  sessionValues?: TrainingSessionExecutionSessionValues;
  items?: TrainingSessionExecutionItemValue[];
}

export interface TrainingSessionExecutionValuesPayload {
  operationKey: string;
  expectedVersion: number;
  sessionValues?: TrainingSessionExecutionSessionValues;
  items?: TrainingSessionExecutionItemValue[];
}

/** O executor guia somente séries explicitamente modeladas por #399.
 * Agrupamentos aguardam a estrutura canônica da #400. */
export type GuidedResistanceAvailability =
  | 'available' | 'legacy_read_only' | 'grouping_pending' | 'no_structured_resistance';

export type ResistanceExerciseGroupType =
  | 'superset' | 'biset' | 'triset' | 'circuit' | 'technical_block' | 'mobility' | 'finisher';

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

export interface GuidedResistanceView {
  sessionId: string;
  status: TrainingSessionExecutionStatus;
  version: number;
  availability: GuidedResistanceAvailability;
  completed: number;
  total: number;
  current: GuidedResistanceUnit | null;
  next: GuidedResistanceUnit | null;
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
  blocks: TrainingRoutineBlock[];
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

export interface TrainingRoutineView {
  alunoId: string;
  audience: TrainingRoutineAudience;
  referenceDate: string;
  timeZone: string;
  week: { startDate: string; endDate: string };
  days: TrainingRoutineDay[];
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
