export { default as capacityPrescriptionRoutes } from './capacity-prescription-composite.routes.js';
export {
  CapacityPrescriptionDomainError,
  DEFAULT_CAPACITY_PARAMETER_SETS,
  calculateCyclicHeartRateZones,
  capacityPrescriptionService,
  createCapacityPrescriptionService,
} from './capacity-prescription.service.js';
export {
  EXTENDED_CAPACITY_PARAMETER_SETS,
  capacityPrescriptionExtensionService,
  createCapacityPrescriptionExtensionService,
} from './capacity-prescription-extension.service.js';
export {
  capacityExerciseMappingService,
  createCapacityExerciseMappingService,
  mergePersistedExerciseMapping,
  readPersistedExerciseMapping,
  validateResistedTechnicalExerciseRefs,
} from './capacity-exercise-mapping.service.js';
export {
  deriveCapacityAlerts,
  mergeCapacityAlerts,
  serializeCapacityApiData,
  serializeCapacityVersion,
} from './capacity-prescription-public.js';
export {
  ADIPOMETRY_FORMULA_VERSION,
  calculateAdipometryComposition,
} from './capacity-prescription-formulas.js';
export type {
  AdipometryCompositionInput,
  AdipometryCompositionResult,
  AdipometrySex,
  AdipometrySkinfoldsMm,
} from './capacity-prescription-formulas.js';
