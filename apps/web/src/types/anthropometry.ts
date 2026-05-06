export type AnthropometrySegmentType = 'principal' | 'opcional' | 'personalizado';
export type AnthropometrySexApplicability = 'masculino' | 'feminino' | 'ambos';

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

export interface AnthropometryAssessment {
  id: string;
  contractId: string;
  alunoId: string;
  professorId?: string | null;
  code: string;
  assessmentDate: string;
  notes?: string | null;
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
  femaleImageUrl?: string | null;
  maleImageUrl?: string | null;
  tutorialVideoUrl?: string | null;
  formulaHint?: string | null;
}
