export const ADIPOMETRY_ASSESSMENT_STATUSES = ['draft', 'completed'] as const;
export type AdipometryAssessmentStatus = (typeof ADIPOMETRY_ASSESSMENT_STATUSES)[number];

export const ADIPOMETRY_PROTOCOL_STATUSES = ['draft', 'approved', 'disabled'] as const;
export type AdipometryProtocolStatus = (typeof ADIPOMETRY_PROTOCOL_STATUSES)[number];

export const ADIPOMETRY_SKINFOLD_KEYS = [
  'triceps',
  'subscapular',
  'suprailiac',
  'abdominal',
  'thigh',
] as const;
export type AdipometrySkinfoldKey = (typeof ADIPOMETRY_SKINFOLD_KEYS)[number];

export const ADIPOMETRY_INCOMPATIBILITY_REASONS = [
  'protocol_not_approved',
  'protocol_disabled',
  'missing_birth_date',
  'missing_sex',
  'age_out_of_range',
  'sex_not_supported',
  'maturation_not_available',
  'missing_required_measurement',
  'measurement_out_of_range',
  'profile_data_incompatible',
] as const;
export type AdipometryProtocolIncompatibilityReason =
  (typeof ADIPOMETRY_INCOMPATIBILITY_REASONS)[number];

export interface AdipometryMeasurementsInput {
  weightKg?: number | null;
  tricepsMm?: number | null;
  subscapularMm?: number | null;
  suprailiacMm?: number | null;
  abdominalMm?: number | null;
  thighMm?: number | null;
}

export interface AdipometryCompletedMeasurements {
  weightKg: number;
  tricepsMm: number;
  subscapularMm: number;
  suprailiacMm: number;
  abdominalMm: number;
  thighMm: number;
}

export interface AdipometryCalculatedResults {
  sumSkinfoldsMm: number;
  bodyFatPercentage: number;
  fatMassKg: number;
  leanMassKg: number;
}

export interface AdipometryProtocolRef {
  code: string;
  version: string;
}

export interface AdipometryCalculationRulesSnapshot {
  equations: unknown[];
  limits: Record<string, unknown>;
  precision: Record<string, unknown>;
  rounding: Record<string, unknown>;
}

export interface AdipometryCalculationSnapshot {
  schemaVersion: 1;
  protocol: AdipometryProtocolRef;
  assessmentDate: string;
  ageAtAssessment: number | null;
  profileCriteria: Record<string, unknown>;
  inputs: AdipometryCompletedMeasurements;
  rules: AdipometryCalculationRulesSnapshot;
  intermediateValues: Record<string, unknown>;
  results: AdipometryCalculatedResults;
}

export interface AdipometryProtocolAvailability extends AdipometryProtocolRef {
  name: string;
  status: AdipometryProtocolStatus;
  applicable: boolean;
  incompatibilityReasons: AdipometryProtocolIncompatibilityReason[];
  approvalDate?: string | null;
  approvedBy?: string | null;
}

export interface AdipometryAnthropometryReference {
  id: string;
  code: string;
  assessmentDate: string;
  contractId: string;
  alunoId: string;
}

export interface AdipometryAssessmentSummary {
  id: string;
  contractId: string;
  alunoId: string;
  professorId: string;
  code: string;
  sequenceNumber: number;
  assessmentDate: string;
  status: AdipometryAssessmentStatus;
  protocol?: AdipometryProtocolRef | null;
  bodyFatPercentage?: number | null;
  createdAt: string;
  updatedAt: string;
  correctionOfId?: string | null;
  correctedByAssessmentId?: string | null;
}

export interface AdipometryAssessmentDetail extends AdipometryAssessmentSummary {
  measurements: AdipometryMeasurementsInput;
  results?: AdipometryCalculatedResults | null;
  calculationSnapshot?: AdipometryCalculationSnapshot | null;
  supportAnthropometry?: AdipometryAnthropometryReference | null;
  notes?: string | null;
  correctionReason?: string | null;
  correctedByProfessorId?: string | null;
  correctedAt?: string | null;
}

export interface CreateAdipometryDraftPayload {
  alunoId: string;
  professorId: string;
  assessmentDate: string;
  measurements?: AdipometryMeasurementsInput;
  protocolCode?: string | null;
  supportAnthropometryId?: string | null;
  notes?: string | null;
}

export interface UpdateAdipometryDraftPayload {
  expectedUpdatedAt: string;
  professorId?: string;
  assessmentDate?: string;
  measurements?: AdipometryMeasurementsInput;
  protocolCode?: string | null;
  supportAnthropometryId?: string | null;
  notes?: string | null;
}

export interface AdipometryCalculationPreviewRequest {
  alunoId: string;
  assessmentDate: string;
  protocolCode: string;
  measurements: AdipometryMeasurementsInput;
}

export interface AdipometryCalculationAlert {
  code: string;
  field?: keyof AdipometryMeasurementsInput | null;
  severity: 'warning' | 'blocking';
  message: string;
}

export interface AdipometryCalculationPreview {
  protocol: AdipometryProtocolRef;
  ageAtAssessment?: number | null;
  measurements: AdipometryMeasurementsInput;
  results?: AdipometryCalculatedResults | null;
  alerts: AdipometryCalculationAlert[];
  canFinalize: boolean;
}

export interface FinalizeAdipometryAssessmentPayload {
  expectedUpdatedAt: string;
  protocolCode: string;
  protocolVersion: string;
}

export interface CorrectAdipometryAssessmentPayload {
  professorId: string;
  reason: string;
  assessmentDate: string;
  measurements: AdipometryMeasurementsInput;
  protocolCode: string;
  protocolVersion: string;
  supportAnthropometryId?: string | null;
  notes?: string | null;
}

export interface AdipometryComparisonValue {
  previous?: number | null;
  current?: number | null;
  delta?: number | null;
  unit: 'kg' | 'mm' | '%';
}

export interface AdipometryComparison {
  previous: AdipometryAssessmentSummary;
  current: AdipometryAssessmentSummary;
  comparableProtocol: boolean;
  protocolWarning?: string | null;
  measurements: Record<keyof AdipometryMeasurementsInput, AdipometryComparisonValue>;
  results: Record<keyof AdipometryCalculatedResults, AdipometryComparisonValue>;
}

export function formatAdipometryCode(sequenceNumber: number): string {
  if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 1) {
    throw new RangeError('Adipometry sequence number must be a positive safe integer.');
  }

  return `ADPT-${String(sequenceNumber).padStart(3, '0')}`;
}
