export type ProntuarioRecordStatus = 'open' | 'closed' | 'archived';
export type ProntuarioItemStatus = 'active' | 'monitoring' | 'resolved' | 'archived';
export type ProntuarioActivityType = 'running' | 'strength' | 'mobility' | 'sport' | 'occupational' | 'other';
export type ProntuarioMedicationProcedureType = 'medication' | 'supplement' | 'procedure' | 'exam' | 'therapy' | 'other';
export type ProntuarioPainCaseStatus = 'active' | 'monitoring' | 'resolved' | 'archived';

export type StudentParqResponses = Record<string, boolean>;

export interface StudentParqPositiveItem {
  key: string;
  label: string;
}

export interface StudentParqSubmission {
  id: string;
  alunoId: string;
  contractId: string;
  submittedAt: string;
  responses: StudentParqResponses;
  positiveItems?: StudentParqPositiveItem[] | null;
  declarationAccepted: boolean;
  notes?: string | null;
}

export interface ProntuarioGoal {
  id: string;
  recordId: string;
  title: string;
  description?: string | null;
  status: ProntuarioItemStatus;
  priority: number;
  targetDate?: string | null;
}

export interface ProntuarioAnamnesisFollowUp {
  id: string;
  recordId: string;
  parqSubmissionId?: string | null;
  itemKey: string;
  itemLabel: string;
  status: ProntuarioItemStatus;
  followUpNotes?: string | null;
  actionPlan?: string | null;
  closedAt?: string | null;
}

export interface ProntuarioActivityHistory {
  id: string;
  recordId: string;
  activityType: ProntuarioActivityType;
  description: string;
  frequency?: string | null;
  duration?: string | null;
  intensity?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  notes?: string | null;
}

export interface ProntuarioMedicationProcedure {
  id: string;
  recordId: string;
  type: ProntuarioMedicationProcedureType;
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
}

export interface ProntuarioPainFollowUp {
  id: string;
  painCaseId: string;
  followUpAt: string;
  intensity?: number | null;
  notes?: string | null;
  conduct?: string | null;
}

export interface ProntuarioPainCase {
  id: string;
  recordId: string;
  title: string;
  region?: string | null;
  status: ProntuarioPainCaseStatus;
  onsetDate?: string | null;
  description?: string | null;
  closedAt?: string | null;
  followUps?: ProntuarioPainFollowUp[];
}

export interface ProntuarioDiscomfortEntry {
  id?: string;
  snapshotId?: string;
  regionId: string;
  regionName: string;
  discomfortTypes: string[];
  intensity: number;
  notes?: string | null;
}

export interface ProntuarioDiscomfortSnapshot {
  id: string;
  recordId: string;
  alunoId: string;
  contractId: string;
  professorId?: string | null;
  snapshotAt: string;
  notes?: string | null;
  entries: ProntuarioDiscomfortEntry[];
}

export interface ProntuarioRecord {
  id: string;
  alunoId: string;
  contractId: string;
  professorId?: string | null;
  code: string;
  status: ProntuarioRecordStatus;
  recordDate: string;
  summary?: string | null;
  notes?: string | null;
  closedAt?: string | null;
  goals: ProntuarioGoal[];
  anamnesisFollowUps: ProntuarioAnamnesisFollowUp[];
  activityHistory: ProntuarioActivityHistory[];
  medicationsProcedures: ProntuarioMedicationProcedure[];
  painCases: ProntuarioPainCase[];
  discomfortSnapshots: ProntuarioDiscomfortSnapshot[];
}

export interface ProntuarioOverview {
  records: ProntuarioRecord[];
  currentRecord: ProntuarioRecord | null;
  latestParqSubmission: StudentParqSubmission | null;
  parqSubmissions: StudentParqSubmission[];
}

export type ProntuarioRecordPayload = {
  recordDate?: string;
  summary?: string | null;
  notes?: string | null;
};