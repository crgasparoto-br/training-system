export type AnthropometrySegmentType = 'principal' | 'opcional' | 'personalizado';
export type AnthropometrySexApplicability = 'masculino' | 'feminino' | 'ambos';
export type AnthropometryAssessmentStatus = 'DRAFT' | 'COMPLETED';

export interface AnthropometryVariation {
  absolute: number;
  percentage: number | null;
}

export interface AnthropometrySegment {
  id: string;
  contractId: string;
  name: string;
  description?: string | null;
  technicalDescription?: string | null;
  sexApplicability: AnthropometrySexApplicability;
  type: AnthropometrySegmentType;
  order: number;
  active: boolean;
  importByDefault: boolean;
  importObservationByDefault: boolean;
  requiredForCompletion: boolean;
  requirementVersion: number;
  requirementConfiguredAt?: string | null;
  femaleImageUrl?: string | null;
  maleImageUrl?: string | null;
  tutorialVideoUrl?: string | null;
  formulaHint?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnthropometryAssessmentValue {
  id: string;
  assessmentId: string;
  segmentId: string;
  value?: string | null;
  unit: string;
  observation?: string | null;
  variationFromPrevious?: AnthropometryVariation | null;
  segment?: AnthropometrySegment;
}

export interface AnthropometryObservation {
  id: string;
  assessmentId: string;
  segmentId?: string | null;
  text: string;
  importable: boolean;
  segment?: AnthropometrySegment | null;
}

export interface AnthropometryCorrectionAudit {
  id: string;
  assessmentId: string;
  contractId: string;
  alunoId: string;
  actorUserId?: string | null;
  actorProfessorId?: string | null;
  reason: string;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  createdAt: string;
}

export interface AnthropometryAssessment {
  id: string;
  contractId: string;
  alunoId: string;
  professorId?: string | null;
  code: string;
  assessmentDate: string;
  notes?: string | null;
  status: AnthropometryAssessmentStatus;
  completedAt?: string | null;
  completedByUserId?: string | null;
  completionRequirementsSnapshot?: unknown | null;
  corrections: AnthropometryCorrectionAudit[];
  createdAt: string;
  updatedAt: string;
  professor?: {
    id: string;
    user?: {
      profile?: {
        name?: string;
      };
    };
  } | null;
  values: AnthropometryAssessmentValue[];
  observations: AnthropometryObservation[];
}

export interface AnthropometrySegmentPayload {
  name: string;
  description?: string | null;
  technicalDescription?: string | null;
  sexApplicability?: AnthropometrySexApplicability;
  type?: AnthropometrySegmentType;
  order?: number;
  active?: boolean;
  importByDefault?: boolean;
  importObservationByDefault?: boolean;
  requiredForCompletion?: boolean;
  femaleImageUrl?: string | null;
  maleImageUrl?: string | null;
  tutorialVideoUrl?: string | null;
  formulaHint?: string | null;
}

export interface AnthropometryCorrectionPayload {
  reason: string;
  values?: Array<Pick<AnthropometryAssessmentValue, 'segmentId' | 'value' | 'unit' | 'observation'>>;
  notes?: string | null;
  observations?: Array<Pick<AnthropometryObservation, 'segmentId' | 'text' | 'importable'>>;
}
