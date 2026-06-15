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

export interface CyclicCapacityParameters {
  category?: string | null;
  reversibilityPrinciple?: string | null;
  zones?: Array<{
    name: string;
    volume?: string | null;
    targetHeartRate?: string | null;
    pace?: string | null;
  }>;
  vo2MaxPercentage?: number | null;
  anaerobicThreshold?: string | null;
  time?: string | null;
  distance?: string | null;
  expectedPse?: number | null;
}

export interface FlexibilityCapacityParameters {
  articulations?: Array<{
    name: string;
    angle?: number | null;
    deficit?: string | null;
    priority?: 'low' | 'medium' | 'high' | null;
    suggestedPrescription?: string | null;
  }>;
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
