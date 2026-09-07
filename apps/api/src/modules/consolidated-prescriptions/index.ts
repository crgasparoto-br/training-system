import { Router } from 'express';
import consolidatedPrescriptionRoutesBase from './consolidated-prescription.routes.js';
import consolidatedPrescriptionWorkspaceRoutes from './consolidated-prescription-workspace.routes.js';
import consolidatedPrescriptionOperationalRoutes from './consolidated-prescription-operational.routes.js';
import consolidatedPrescriptionReleaseRoutes from './consolidated-prescription-release.routes.js';
import consolidatedPrescriptionTraceabilityRoutes from './consolidated-prescription-traceability.routes.js';

const consolidatedPrescriptionRoutes: Router = Router();
consolidatedPrescriptionRoutes.use(consolidatedPrescriptionWorkspaceRoutes);
consolidatedPrescriptionRoutes.use(consolidatedPrescriptionOperationalRoutes);
consolidatedPrescriptionRoutes.use(consolidatedPrescriptionReleaseRoutes);
consolidatedPrescriptionRoutes.use(consolidatedPrescriptionTraceabilityRoutes);
consolidatedPrescriptionRoutes.use(consolidatedPrescriptionRoutesBase);

export { consolidatedPrescriptionRoutes };
export * from './consolidated-prescription.service.js';
export * from './consolidated-prescription-read.service.js';
export * from './consolidated-prescription-operational.service.js';
export * from './consolidated-prescription-release.service.js';
export * from './consolidated-prescription-traceability.service.js';
