import type { CapacityPrescriptionSourceRef } from '@corrida/types';

type AssessmentSourceType = CapacityPrescriptionSourceRef['type'];
type SpecificAssessmentSourceType = Exclude<
  AssessmentSourceType,
  | 'prontuario_goal'
  | 'prontuario_alert'
  | 'physical_assessment'
  | 'anthropometry'
  | 'student_preference'
  | 'professor_note'
>;

const specificAssessmentCategoryAliases: Record<SpecificAssessmentSourceType, readonly string[]> = {
  adipometry: ['adipometry', 'adipometria', 'adpt'],
  bioimpedance: ['bioimpedance', 'bioimpedanciometry', 'bioimpedanciometria'],
  ultrasound: ['ultrasound', 'ultrassonografia', 'ultrassom'],
  ventilometry: ['ventilometry', 'ventilometria', 'metabolic'],
  flexibility_assessment: ['flexibility', 'flexibilidade', 'flexibility_assessment'],
};

const specificAssessmentSourceTypes = new Set<AssessmentSourceType>(
  Object.keys(specificAssessmentCategoryAliases) as SpecificAssessmentSourceType[]
);

function normalizeAssessmentCategory(value: string) {
  return value.trim().toLowerCase();
}

export function isSpecificAssessmentSourceType(
  sourceType: AssessmentSourceType
): sourceType is SpecificAssessmentSourceType {
  return specificAssessmentSourceTypes.has(sourceType);
}

export function isAssessmentCategoryCompatible(
  sourceType: SpecificAssessmentSourceType,
  assessmentCategory: string
) {
  return specificAssessmentCategoryAliases[sourceType].includes(
    normalizeAssessmentCategory(assessmentCategory)
  );
}

/**
 * Descriptive categories such as "Adipometria 7 dobras" are represented as a
 * generic physical_assessment source. This keeps the projection key and the
 * persisted key identical while preserving the underlying record metadata.
 */
export function assessmentSourceTypeForPersistence(
  sourceType: AssessmentSourceType,
  assessmentCategory: string
): AssessmentSourceType {
  if (!isSpecificAssessmentSourceType(sourceType)) return sourceType;
  return isAssessmentCategoryCompatible(sourceType, assessmentCategory)
    ? sourceType
    : 'physical_assessment';
}

export function normalizeAssessmentSourceProjection(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeAssessmentSourceProjection);
  if (!value || typeof value !== 'object') return value;

  const item = value as Record<string, unknown>;
  const ref = item.ref;
  const category = item.category;
  if (!ref || typeof ref !== 'object' || typeof category !== 'string') return value;

  const sourceRef = ref as CapacityPrescriptionSourceRef;
  if (!isSpecificAssessmentSourceType(sourceRef.type)) return value;

  return {
    ...item,
    ref: {
      ...sourceRef,
      type: assessmentSourceTypeForPersistence(sourceRef.type, category),
    },
  };
}
