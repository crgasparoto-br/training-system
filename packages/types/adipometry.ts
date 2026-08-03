export type AdipometryAssessmentStatus =
  | 'DRAFT'
  | 'FINALIZED'
  | 'SUPERSEDED'
  | 'CANCELLED'
  | 'VOIDED';
export type AdipometryPersistenceStatus = 'DRAFT' | 'COMPLETED';
export type AdipometryCorrectionCategory =
  | 'DATA_ENTRY_ERROR'
  | 'MEASUREMENT_TRANSCRIPTION_ERROR'
  | 'EVALUATION_DATE_ERROR'
  | 'PROTOCOL_SEX_ERROR'
  | 'PROTOCOL_SELECTION_ERROR'
  | 'OTHER';
export type AdipometryProtocolStatus = 'DRAFT' | 'APPROVED' | 'DISABLED';

export type AdipometrySkinfoldField =
  | 'tricepsMm'
  | 'subscapularMm'
  | 'suprailiacMm'
  | 'abdominalMm'
  | 'thighMm';

export type AdipometryInputField = 'weightKg' | AdipometrySkinfoldField;
export type AdipometryProtocolSex = 'male' | 'female';
export type AdipometryProtocolSexSource =
  | 'profile'
  | 'professional_confirmation'
  | 'professional_override';
export type AdipometryResultField =
  | 'skinfoldTotalMm'
  | 'bodyFatPercentage'
  | 'fatMassKg'
  | 'leanMassKg';

export interface AdipometryProtocolPopulation {
  ageMinYears: number;
  ageMaxYears: number;
  sexCriteria: string[];
  maturationCriteria: string;
}

export type AdipometryNumericVariable =
  | AdipometryInputField
  | AdipometryResultField
  | 'ageAtAssessment';

/**
 * Restricted, executable expression language persisted with an approved
 * protocol. Plain text is intentionally not accepted as a clinical equation.
 */
export type AdipometryExpression =
  | { op: 'constant'; value: number }
  | { op: 'variable'; name: AdipometryNumericVariable }
  | { op: 'add'; args: AdipometryExpression[] }
  | { op: 'subtract'; left: AdipometryExpression; right: AdipometryExpression }
  | { op: 'multiply'; args: AdipometryExpression[] }
  | { op: 'divide'; numerator: AdipometryExpression; denominator: AdipometryExpression }
  | { op: 'power'; base: AdipometryExpression; exponent: AdipometryExpression }
  | { op: 'log10'; value: AdipometryExpression }
  | { op: 'negate'; value: AdipometryExpression }
  | {
      op: 'ifEquals';
      field: `profileCriteria.${string}`;
      expected: string | number | boolean | null;
      then: AdipometryExpression;
      else: AdipometryExpression;
    };

export interface AdipometryProtocolEquation {
  id: string;
  output: Exclude<AdipometryResultField, 'skinfoldTotalMm'>;
  expression: AdipometryExpression;
}

export interface AdipometryProtocolBlockingLimit {
  min: number;
  max: number;
}

export interface AdipometryProtocolWarning {
  field: AdipometryInputField | AdipometryResultField;
  message: string;
  min?: number;
  max?: number;
}

export interface AdipometryProtocolTestVector {
  id: string;
  inputs: {
    ageAtAssessment: number;
    profileCriteria: Record<string, unknown>;
    measurements: Required<AdipometryMeasurements>;
  };
  expectedResults: AdipometryCalculatedResults;
  tolerance: Record<AdipometryResultField, number>;
}

export interface AdipometryProtocolClinicalApproval {
  status: 'approved';
  approverUserId: string;
  /** ISO-8601 instant with `Z` or an explicit numeric offset. */
  approvedAt: string;
  approvalRecordId: string;
  artifactSha256: string;
}

export interface AdipometryProtocolDefinitionSnapshot {
  schemaVersion: number;
  population: AdipometryProtocolPopulation;
  /** Canonical skinfold catalog recorded by the protocol. */
  requiredSkinfolds: AdipometrySkinfoldField[];
  /** Sex-specific completion and calculation authority for the current version. */
  calculationSkinfoldsBySex?: Record<'MALE' | 'FEMALE', AdipometrySkinfoldField[]>;
  inputUnits: Record<AdipometryInputField, 'kg' | 'mm'>;
  inputScales?: Record<AdipometryInputField, number>;
  outputUnits: Record<AdipometryResultField, 'kg' | 'mm' | 'percent'>;
  equations: AdipometryProtocolEquation[];
  limits: {
    blocking: Record<AdipometryInputField, AdipometryProtocolBlockingLimit>;
    warnings: AdipometryProtocolWarning[];
  };
  precision: {
    measurementScale: number;
    resultScale: number;
    internalScale: number;
    skinfoldTotalScale?: number;
    bodyDensityScale?: number;
  };
  rounding: {
    mode: 'HALF_UP' | 'HALF_EVEN';
    stage: 'FINAL_RESULTS_ONLY';
  };
  missingDataBehavior: {
    missingRequired: string;
    incompatibleProfile: string;
  };
  testVectors: AdipometryProtocolTestVector[];
  /**
   * Legacy/global approval metadata. Contract-scoped approval provenance is
   * stored separately in `AdipometryProtocolApprovalSnapshot` and candidate
   * definitions such as GUEDES_1991_ADULT_YOUNG omit this field.
   */
  clinicalApproval?: AdipometryProtocolClinicalApproval;
}

export interface AdipometryCalculationInputBase {
  weightKg: number;
  suprailiacMm: number;
}

export interface AdipometryMaleCalculationInputs extends AdipometryCalculationInputBase {
  tricepsMm: number;
  abdominalMm: number;
  subscapularMm: number | null;
  thighMm: number | null;
}

export interface AdipometryFemaleCalculationInputs extends AdipometryCalculationInputBase {
  subscapularMm: number;
  thighMm: number;
  tricepsMm: number | null;
  abdominalMm: number | null;
}

export interface AdipometryProtocolSexDecisionSnapshot<S extends AdipometryProtocolSex> {
  protocolSex: S;
  profileSexSnapshot: 'male' | 'female' | 'other';
  source: AdipometryProtocolSexSource;
  confirmedByUserId: string;
  confirmedAt: string;
  overrideReason: string | null;
}

export interface AdipometryProtocolApprovalSnapshot {
  id: string;
  responsibilityId: string;
  approvedAt: string;
  approvedByProfessorId: string;
  approvedByName: string;
  approvedByCref: string;
  approvedSpecificationHash: string;
  protocolReference: string;
  protocolDefinitionSnapshot: AdipometryProtocolDefinitionSnapshot;
}

interface AdipometryCalculationSnapshotBase {
  protocol: { code: string; version: number };
  protocolApproval: AdipometryProtocolApprovalSnapshot;
  assessmentDate: string;
  ageAtAssessment: number | null;
  rules: Record<string, unknown>;
  results: AdipometryCalculatedResults;
  implementationVersion: string;
  calculatedAt: string;
}

export type AdipometryCalculationSnapshot =
  | (AdipometryCalculationSnapshotBase & {
      profileCriteria: Record<string, unknown> & {
        protocolSex: 'male';
        sex: 'MALE';
      };
      protocolSexDecision: AdipometryProtocolSexDecisionSnapshot<'male'>;
      inputs: AdipometryMaleCalculationInputs;
    })
  | (AdipometryCalculationSnapshotBase & {
      profileCriteria: Record<string, unknown> & {
        protocolSex: 'female';
        sex: 'FEMALE';
      };
      protocolSexDecision: AdipometryProtocolSexDecisionSnapshot<'female'>;
      inputs: AdipometryFemaleCalculationInputs;
    });

export function formatAdipometryCode(sequenceNumber: number): string {
  if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) {
    throw new RangeError('Adipometry sequence must be a positive safe integer');
  }

  return `ADPT-${String(sequenceNumber).padStart(3, '0')}`;
}

export function formatAdipometryRevisionLabel(revisionNumber: number): string {
  if (!Number.isSafeInteger(revisionNumber) || revisionNumber <= 0) {
    throw new RangeError('Adipometry revision must be a positive safe integer');
  }

  return `R${revisionNumber}`;
}

export type AdipometryIncompatibilityCode =
  | 'PROTOCOL_NOT_APPROVED'
  | 'PROTOCOL_DISABLED'
  | 'PROTOCOL_VERSION_NOT_FOUND'
  | 'MISSING_ADIPOMETRY_CLINICAL_RESPONSIBLE'
  | 'PROTOCOL_NOT_APPROVED_FOR_CONTRACT'
  | 'MISSING_PROTOCOL_SEX_CONFIRMATION'
  | 'PROTOCOL_SEX_DIVERGENCE_REQUIRES_REASON'
  | 'SKINFOLD_CAPACITY_WARNING_CONFIRMATION_REQUIRED'
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
  status: AdipometryPersistenceStatus;
  revisionStatus: AdipometryAssessmentStatus;
  rootAssessmentId: string;
  revisionNumber: number;
  previousRevisionId?: string;
  correctionCategory?: AdipometryCorrectionCategory;
  correctionStartedAt?: string;
  correctionCancelledAt?: string;
  correctionCancellationReason?: string;
  voidedAt?: string;
  voidReason?: string;
  protocolCode?: string;
  protocolVersion?: number;
  protocolSex?: AdipometryProtocolSex;
  profileSexSnapshot?: 'male' | 'female' | 'other';
  protocolSexSource?: AdipometryProtocolSexSource;
  protocolSexConfirmedByUserId?: string;
  protocolSexConfirmedAt?: string;
  protocolSexOverrideReason?: string;
  skinfoldCapacityWarningConfirmedByUserId?: string;
  skinfoldCapacityWarningConfirmedAt?: string;
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
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  changedFields?: string[];
  notes?: string;
}

export interface CreateAdipometryDraftInput {
  alunoId: string;
  professorId: string;
  assessmentDate: string;
  measurements?: AdipometryMeasurements;
  protocolSex?: AdipometryProtocolSex;
  protocolSexSource?: AdipometryProtocolSexSource;
  protocolSexOverrideReason?: string;
  protocolCode?: string;
  protocolVersion?: number;
  anthropometryAssessmentId?: string;
  notes?: string;
}

export interface UpdateAdipometryDraftInput {
  assessmentDate?: string;
  measurements?: AdipometryMeasurements;
  protocolSex?: AdipometryProtocolSex;
  protocolSexSource?: AdipometryProtocolSexSource;
  protocolSexOverrideReason?: string | null;
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
  protocolSex: AdipometryProtocolSex;
  protocolSexSource: AdipometryProtocolSexSource;
  protocolSexOverrideReason?: string;
  skinfoldCapacityWarningConfirmed?: boolean;
  protocolCode: string;
  protocolVersion: number;
}

export interface AdipometryCalculationPreview {
  protocol: AdipometryProtocolSummary;
  normalizedMeasurements: AdipometryMeasurements;
  compatibility: AdipometryProtocolCompatibility;
  results?: AdipometryCalculatedResults;
  calculationSnapshot?: AdipometryCalculationSnapshot;
  inputFingerprint: string;
  canFinalize: boolean;
  anthropometrySupport: {
    latestEligible: AdipometryAnthropometryReference | null;
    linked: AdipometryAnthropometryReference | null;
  };
}

export interface CompleteAdipometryAssessmentInput {
  inputFingerprint: string;
  expectedUpdatedAt?: string;
}

export interface StartAdipometryCorrectionInput {
  currentAssessmentId: string;
  category: AdipometryCorrectionCategory;
  reason: string;
}

export interface CorrectAdipometryAssessmentInput extends StartAdipometryCorrectionInput {
  assessmentDate?: string;
  measurements: AdipometryMeasurements;
  protocolCode: string;
  protocolVersion: number;
  confirmProtocolChange?: boolean;
  anthropometryAssessmentId?: string | null;
  notes?: string | null;
}

export interface CancelAdipometryCorrectionInput {
  reason: string;
}

export interface VoidAdipometryAssessmentInput {
  reason: string;
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
 * O ator de auditoria também é injetado pelo backend autenticado e nunca é
 * aceito como campo controlado pelo frontend.
 */
export type AdipometryAuthoritativeResultFields = never;
