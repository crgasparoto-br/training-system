export const PHYSICAL_CAPACITY_TYPES = [
  'resisted',
  'flexibility',
  'cyclic',
  'balance',
] as const;

export type PhysicalCapacityType = (typeof PHYSICAL_CAPACITY_TYPES)[number];

export const CAPACITY_PRESCRIPTION_STATUSES = [
  'planned',
  'active',
  'adjusting',
  'suspended',
  'finished',
] as const;

export type CapacityPrescriptionStatus = (typeof CAPACITY_PRESCRIPTION_STATUSES)[number];

export const CAPACITY_SOURCE_TYPES = [
  'prontuario_goal',
  'prontuario_alert',
  'physical_assessment',
  'anthropometry',
  'adipometry',
  'bioimpedance',
  'ultrasound',
  'ventilometry',
  'flexibility_assessment',
  'student_preference',
  'professor_note',
] as const;

export type CapacityPrescriptionSourceType = (typeof CAPACITY_SOURCE_TYPES)[number];

export const CAPACITY_PLANNING_LEVELS = ['macro', 'meso', 'micro'] as const;
export type CapacityPlanningLevel = (typeof CAPACITY_PLANNING_LEVELS)[number];

export const CAPACITY_CATALOG_CATEGORIES = [
  'environment',
  'muscle_group',
  'acronym',
  'cyclic_stimulus',
  'method',
  'exercise',
  'microcycle_load',
  'articulation',
  'training_split',
  'repetition_zone',
] as const;
export type CapacityCatalogCategory = (typeof CAPACITY_CATALOG_CATEGORIES)[number];

export interface CapacityPrescriptionSourceRef {
  type: CapacityPrescriptionSourceType;
  id: string;
  label: string;
  assessedAt?: string | null;
  origin?: string | null;
  version?: number | string | null;
  responsibleProfessorId?: string | null;
}

export interface CapacityPrescriptionAlert {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  sourceRefId?: string | null;
}

export interface ResistedCapacityParameters {
  muscleGroups?: string[];
  method?: string | null;
  split?: string | null;
  sets?: number | null;
  repetitions?: string | null;
  load?: string | null;
  repetitionReserve?: string | null;
  expectedPse?: number | null;
  restrictions?: string[];
}

export interface CyclicCapacityZone {
  name: string;
  volume?: string | null;
  targetHeartRate?: string | null;
  pace?: string | null;
  minPercent?: number | null;
  maxPercent?: number | null;
}

export interface CyclicCapacityParameters {
  category?: string | null;
  reversibilityPrinciple?: string | null;
  zoneBasis?: 'max_hr' | 'heart_rate_reserve' | 'lan' | 'vo2max' | 'pse' | null;
  zones?: CyclicCapacityZone[];
  vo2MaxPercentage?: number | null;
  anaerobicThreshold?: string | null;
  time?: string | null;
  distance?: string | null;
  expectedPse?: number | null;
}

export interface FlexibilityArticulationParameters {
  name: string;
  angle?: number | null;
  deficit?: string | null;
  priority?: 'low' | 'medium' | 'high' | null;
  suggestedPrescription?: string | null;
}

export interface FlexibilityCapacityParameters {
  articulations?: FlexibilityArticulationParameters[];
  expectedPse?: number | null;
}

export interface BalanceCapacityParameters {
  focus?: string | null;
  supports?: string[];
  progressionNotes?: string | null;
  expectedPse?: number | null;
}

export type CapacityPrescriptionParameters =
  | { type: 'resisted'; resisted: ResistedCapacityParameters }
  | { type: 'cyclic'; cyclic: CyclicCapacityParameters }
  | { type: 'flexibility'; flexibility: FlexibilityCapacityParameters }
  | { type: 'balance'; balance: BalanceCapacityParameters };

export interface CapacityPrescriptionDraft {
  alunoId: string;
  contractId: string;
  responsibleProfessorId: string;
  capacity: PhysicalCapacityType;
  status: CapacityPrescriptionStatus;
  version: number;
  sourceRefs: CapacityPrescriptionSourceRef[];
  linkedProntuarioGoalIds: string[];
  technicalJustification: string;
  professorSummary: string;
  studentMessage?: string | null;
  alerts: CapacityPrescriptionAlert[];
  parameters?: CapacityPrescriptionParameters | null;
  createdAt: string;
  updatedAt: string;
  publishesTodayWorkout: false;
}

export interface CreateCapacityPrescriptionDraftPayload {
  alunoId: string;
  contractId: string;
  responsibleProfessorId: string;
  capacity: PhysicalCapacityType;
  status?: CapacityPrescriptionStatus;
  version?: number;
  sourceRefs: CapacityPrescriptionSourceRef[];
  linkedProntuarioGoalIds?: string[];
  technicalJustification: string;
  professorSummary: string;
  studentMessage?: string | null;
  alerts?: CapacityPrescriptionAlert[];
  parameters?: CapacityPrescriptionParameters | null;
}

export interface SaveCapacityPrescriptionPayload {
  capacity: PhysicalCapacityType;
  status?: CapacityPrescriptionStatus;
  expectedCurrentVersion?: number;
  responsibleProfessorId?: string | null;
  sourceRefs: CapacityPrescriptionSourceRef[];
  linkedProntuarioGoalIds?: string[];
  technicalJustification: string;
  professorSummary: string;
  studentMessage?: string | null;
  alerts?: CapacityPrescriptionAlert[];
  parameters?: CapacityPrescriptionParameters | null;
  parameterSetIds?: string[];
  methodologyVersion?: string | null;
}

export interface CapacityPrescriptionParameterSetPayload {
  capacity: PhysicalCapacityType;
  code: string;
  name: string;
  methodologyVersion: string;
  parameters: CapacityPrescriptionParameters;
}

export interface CapacityPrescriptionVersionView {
  id: string;
  prescriptionId: string;
  contractId: string;
  alunoId: string;
  capacity: PhysicalCapacityType;
  status: CapacityPrescriptionStatus;
  version: number;
  responsibleProfessorId: string;
  technicalJustification: string;
  professorSummary: string;
  studentMessage?: string | null;
  methodologyVersion?: string | null;
  parameterSetIds: string[];
  parameters?: CapacityPrescriptionParameters | null;
  sourceRefs: CapacityPrescriptionSourceRef[];
  linkedProntuarioGoalIds: string[];
  alerts: CapacityPrescriptionAlert[];
  createdAt: string;
  publishesTodayWorkout: false;
}

export interface CapacityPrescriptionView {
  id: string;
  contractId: string;
  alunoId: string;
  capacity: PhysicalCapacityType;
  status: CapacityPrescriptionStatus;
  currentVersion: number;
  createdByProfessorId: string;
  updatedByProfessorId: string;
  createdAt: string;
  updatedAt: string;
  publishesTodayWorkout: false;
  latestVersion?: CapacityPrescriptionVersionView | null;
}

export interface CapacityPrescriptionParameterSetView {
  id: string;
  contractId: string;
  capacity: PhysicalCapacityType;
  code: string;
  name: string;
  version: number;
  methodologyVersion: string;
  parameters: CapacityPrescriptionParameters;
  isCurrent: boolean;
  createdByProfessorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CapacityTechnicalCatalogItemPayload {
  category: CapacityCatalogCategory;
  code: string;
  name: string;
  metadata?: Record<string, unknown>;
}

export interface CapacityTechnicalCatalogItemView extends CapacityTechnicalCatalogItemPayload {
  id: string;
  contractId: string;
  version: number;
  isCurrent: boolean;
  createdByProfessorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CapacityPlanningCyclePayload {
  parentId?: string | null;
  level: CapacityPlanningLevel;
  code: string;
  name: string;
  objective?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  loadCode?: string | null;
  volume?: string | null;
  frequency?: string | null;
  capacityParameters?: Partial<Record<PhysicalCapacityType, Record<string, unknown>>>;
  status?: CapacityPrescriptionStatus;
}

export interface CapacityPlanningCycleView extends CapacityPlanningCyclePayload {
  id: string;
  contractId: string;
  alunoId: string;
  responsibleProfessorId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProntuarioGoalCapacityClassificationPayload {
  capacities: PhysicalCapacityType[];
  relatesToAssessment: boolean;
  relatesToActionPlan: boolean;
}

export interface ProntuarioGoalCapacityClassificationView
  extends ProntuarioGoalCapacityClassificationPayload {
  goalId: string;
  contractId: string;
  alunoId: string;
  updatedByProfessorId: string;
  updatedAt: string;
}
