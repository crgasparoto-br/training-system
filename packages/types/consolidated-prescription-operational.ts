import type {
  ConsolidatedPrescriptionAssembly,
  ConsolidatedPrescriptionStatus,
} from './consolidated-prescription.js';
import type { PhysicalCapacityType } from './capacity-prescription.js';

export type ConsolidatedOperationalTarget =
  | 'WorkoutTemplate'
  | 'WorkoutDay'
  | 'WorkoutExercise'
  | 'none';

export type ConsolidatedOperationalCompatibility = 'mapped' | 'incompatible';

export interface OperationalExerciseSnapshot {
  id: string;
  name: string;
  videoUrl: string | null;
  loadType: string | null;
  movementType: string | null;
  countingType: string | null;
  category: string | null;
  muscleGroup: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface TechnicalExerciseSnapshot {
  id: string;
  code: string;
  name: string;
  version: number;
}

export interface TechnicalExerciseOperationalMapping {
  technicalCatalogItemId: string;
  technicalSnapshot: TechnicalExerciseSnapshot;
  exerciseLibraryId: string | null;
  operationalExerciseSnapshot: OperationalExerciseSnapshot | null;
  mappingRevision: number;
  mappedAt: string | null;
  mappedByProfessorId: string | null;
  currentExerciseAvailable: boolean;
  curationStatus: 'not_modeled';
}

export interface SetTechnicalExerciseOperationalMappingCommand {
  exerciseLibraryId: string;
  expectedMappingRevision: number;
}

export interface ConsolidatedOperationalProjectionItem {
  key: string;
  capacity: PhysicalCapacityType;
  capacityPrescriptionVersionId: string;
  target: ConsolidatedOperationalTarget;
  compatibility: ConsolidatedOperationalCompatibility;
  incompatibilityCode?: string | null;
  incompatibilityMessage?: string | null;
  technicalCatalogItemId?: string | null;
  mappingRevision?: number | null;
  mappedExerciseLibraryId?: string | null;
  effectiveExerciseLibraryId?: string | null;
  substituted?: boolean;
  technicalSnapshot?: TechnicalExerciseSnapshot | null;
  operationalExerciseSnapshot?: OperationalExerciseSnapshot | null;
  proposedFields: Record<string, unknown>;
  unsupportedParameters: string[];
  sourceParameters: Record<string, unknown> | null;
}

export interface ConsolidatedOperationalProjection {
  assemblyId: string;
  assemblyVersion: number;
  assemblyStatus: ConsolidatedPrescriptionStatus;
  items: ConsolidatedOperationalProjectionItem[];
  hasIncompatibilities: boolean;
  hasStalePreparedSnapshot: boolean;
  preparedSnapshotVersion: number | null;
  writesOperationalWorkout: false;
}

export interface PrepareConsolidatedOperationalProjectionCommand {
  expectedCurrentVersion: number;
}

export interface PrepareConsolidatedOperationalProjectionResult {
  assembly: ConsolidatedPrescriptionAssembly;
  projection: ConsolidatedOperationalProjection;
}

export interface CreateConsolidatedExerciseSubstitutionCommand {
  expectedCurrentVersion: number;
  originalTechnicalCatalogItemId: string;
  substituteExerciseLibraryId: string;
  reason: string;
  origin: string;
}

export interface ConsolidatedExerciseSubstitutionResult {
  assembly: ConsolidatedPrescriptionAssembly;
  originalTechnicalCatalogItemId: string;
  originalExerciseLibraryId: string;
  substituteExerciseLibraryId: string;
  recordedAt: string;
  recordedByProfessorId: string;
  writesOperationalWorkout: false;
}
