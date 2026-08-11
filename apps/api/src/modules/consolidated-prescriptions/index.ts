import { Router } from 'express';
import consolidatedPrescriptionRoutesBase from './consolidated-prescription.routes.js';
import consolidatedPrescriptionWorkspaceRoutes from './consolidated-prescription-workspace.routes.js';
import consolidatedPrescriptionOperationalRoutes from './consolidated-prescription-operational.routes.js';

const consolidatedPrescriptionRoutes: Router = Router();
consolidatedPrescriptionRoutes.use(consolidatedPrescriptionWorkspaceRoutes);
consolidatedPrescriptionRoutes.use(consolidatedPrescriptionOperationalRoutes);
consolidatedPrescriptionRoutes.use(consolidatedPrescriptionRoutesBase);

export { consolidatedPrescriptionRoutes };
export * from './consolidated-prescription.service.js';
export * from './consolidated-prescription-read.service.js';
export * from './consolidated-prescription-operational.service.js';
