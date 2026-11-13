import type { ConsolidatedCombinedHistoryPreview } from './consolidated-prescription.js';
import type { PhysicalCapacityType } from './capacity-prescription.js';

export interface FutureTemporalBookingCandidate {
  bookingId: string;
  /** Null means a legacy booking without a provable civil-day source. */
  bookingDate: string | null;
  startTime: string;
  endTime: string;
  sourceUpdatedAt: string;
}
export interface FutureTemporalBinding {
  bookingId: string;
  capacityPrescriptionVersionId: string;
  expectedBookingUpdatedAt: string;
}
export interface FutureTemporalPreviewCommand {
  expectedCurrentVersion: number;
  windowStart: string;
  windowEnd: string;
  timeZone: string;
  bindings: FutureTemporalBinding[];
}
export type FutureTemporalProof = 'verified' | 'invalid_source_date' | 'invalid_local_range'
  | 'nonexistent_local_time' | 'ambiguous_local_time';
export interface FutureTemporalMappedSession {
  bookingId: string;
  bookingVersion: string;
  assemblyVersionId: string;
  capacity: PhysicalCapacityType;
  capacityPrescriptionVersionId: string;
  capacityVersion: number;
  startAtUtc: string | null;
  endAtUtc: string | null;
  proof: FutureTemporalProof;
}
export interface FutureTemporalGap {
  previousBookingId: string;
  nextBookingId: string;
  hoursFromEndToStart: number;
  overlapsInTime: boolean;
}
export interface FutureTemporalPreview {
  protocolVersion: 'combined-conflict-v1';
  assemblyVersionId: string;
  assemblyVersion: number;
  timeZone: string;
  timeZoneBasis: 'explicit_preview_assumption';
  coverage: 'partial';
  state: 'no_active_rules' | 'evaluated';
  temporalEvidenceStatus: 'verified_bindings_only' | 'insufficient_data';
  mappedSessions: FutureTemporalMappedSession[];
  gaps: FutureTemporalGap[];
  unlinkedCapacities: PhysicalCapacityType[];
  evaluations: ConsolidatedCombinedHistoryPreview['evaluations'];
  mayConcludeNoConflict: false;
  changesWorkoutAutomatically: false;
}
