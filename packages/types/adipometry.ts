export type AdipometryAssessmentStatus = 'DRAFT' | 'COMPLETED';
export type AdipometryProtocolStatus = 'DRAFT' | 'APPROVED' | 'DISABLED';

export interface AdipometryProtocolDefinitionSnapshot {
  population: Record<string, unknown>;
  requiredSkinfolds: string[];
  inputUnits: Record<string, string>;
  outputUnits: Record<string, string>;
  equations: Array<Record<string, unknown>> | Record<string, unknown>;
  limits: Record<string, unknown>;
  precision: Record<string, unknown>;
  rounding: Record<string, unknown>;
  missingDataBehavior: string;
  testVectors: Array<Record<string, unknown>>;
}

export interface AdipometryCalculationSnapshot {
  protocol: { code: string; version: number };
  assessmentDate: string;
  ageAtAssessment: number | null;
  profileCriteria: Record<string, unknown>;
  inputs: Required<AdipometryMeasurements>;
  rules: Record<string, unknown>;
  results: AdipometryCalculatedResults;
  implementationVersion: string;
  calculatedAt: string;
}

export function formatAdipometryCode(sequenceNumber: number): string {
  if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) {
    throw new RangeError('Adipometry sequence must be a positive safe integer');
  }

  return `ADPT-${String(sequenceNumber).padStart(3, '0')}`;
}

export type AdipometryIncompatibilityCode =
  | 'PROTOCOL_NOT_APPROVED'
  | 'PROTOCOL_DISABLED'
  | 'PROTOCOL_VERSION_NOT_FOUND'
  | 'MISSING_BIRTH_DATE'
  | 'MISSING_GENDER'
  | 'MISSING_MATURITY'
  | 'AGE_NOT_APPLICABLE'
  | 'GENDER_NOT_APPLICABLE'
  | 'MISSING_MEASUREMENT'
  | 'MEASUREMENT_OUT_OF_RANGE';

export interface AdipometryMeasurements {
  weightKg?: number;
  tricepsMm?: number;
  subscapularMm?: number;
  suprailiacMm?: number;
  abdominalMm?: number;
  thighMm?: number;
}

export interface AdipometryCalculatedResults {
  skinfoldTotalMm: number;
  bodyFatPercentage: number;
  fatMassKg: number;
  leanMassKg: number;
}

export interface AdipometryProtocolCompatibility {
  compatible: boolean;
  reasons: Array<{
    code: AdipometryIncompatibilityCode;
    field?: string;
    message: string;
  }>;
  warnings: Array<{
    code: string;
    field?: string;
    message: string;
  }>;
}

export interface AdipometryProtocolSummary {
  code: string;
  name: string;
  version: number;
  status: AdipometryProtocolStatus;
  compatibility: AdipometryProtocolCompatibility;
}

export interface AdipometryAnthropometryReference {
  anthropometryAssessmentId: string;
  assessmentCode: string;
  assessmentDate: string;
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
  protocolCode?: string;
  protocolVersion?: number;
  bodyFatPercentage?: number;
  correctedByAssessmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdipometryAssessmentDetail extends AdipometryAssessmentSummary {
  measurements: AdipometryMeasurements;
  results?: AdipometryCalculatedResults;
  calculationSnapshot?: AdipometryCalculationSnapshot;
  anthropometryReference?: AdipometryAnthropometryReference;
  correctsAssessmentId?: string;
  notes?: string;
}

export interface CreateAdipometryDraftInput {
  alunoId: string;
  professorId: string;
  assessmentDate: string;
  measurements?: AdipometryMeasurements;
  protocolCode?: string;
  protocolVersion?: number;
  anthropometryAssessmentId?: string;
  notes?: string;
}

export interface UpdateAdipometryDraftInput {
  assessmentDate?: string;
  measurements?: AdipometryMeasurements;
  protocolCode?: string;
  protocolVersion?: number;
  anthropometryAssessmentId?: string | null;
  notes?: string | null;
}

export interface AdipometryCalculationPreviewRequest {
  assessmentId?: string;
  alunoId: string;
  assessmentDate: string;
  measurements: AdipometryMeasurements;
  protocolCode: string;
  protocolVersion: number;
}

export interface AdipometryCalculationPreview {
  protocol: AdipometryProtocolSummary;
  normalizedMeasurements: AdipometryMeasurements;
  compatibility: AdipometryProtocolCompatibility;
  results?: AdipometryCalculatedResults;
  calculationSnapshot?: AdipometryCalculationSnapshot;
}

export interface CompleteAdipometryAssessmentInput {
  protocolCode: string;
  protocolVersion: number;
}

export interface CorrectAdipometryAssessmentInput {
  reason: string;
  assessmentDate?: string;
  measurements: AdipometryMeasurements;
  protocolCode: string;
  protocolVersion: number;
  anthropometryAssessmentId?: string | null;
  notes?: string | null;
}

export interface AdipometryComparisonItem {
  assessment: AdipometryAssessmentSummary;
  measurements: AdipometryMeasurements;
  results: AdipometryCalculatedResults;
}

export interface AdipometryComparison {
  previous?: AdipometryComparisonItem;
  current: AdipometryComparisonItem;
  deltas?: Partial<AdipometryMeasurements & AdipometryCalculatedResults>;
}

/**
 * Payloads de criação, atualização e finalização não possuem campos de resultado.
 * Resultados derivados são sempre calculados e persistidos pelo backend.
 */
export type AdipometryAuthoritativeResultFields = never;
