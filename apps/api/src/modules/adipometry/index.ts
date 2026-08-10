import { Router, type Router as ExpressRouter } from 'express';
import adipometryProfessionalActorRoutes from './adipometry-professional-actor.routes.js';
import adipometryOperationalRoutes from './adipometry.routes.js';
import adipometryAnthropometrySupportRoutes from './adipometry-anthropometry-support.routes.js';
import adipometryWebRemediationRoutes from './adipometry-web-remediation.routes.js';
import { adipometryPublicBoundaryMiddleware } from './adipometry-public-boundary.middleware.js';
import { installAdipometryRuntimeHardening } from './adipometry-runtime-hardening.js';

installAdipometryRuntimeHardening();

const adipometryRoutes: ExpressRouter = Router();
adipometryRoutes.use(adipometryPublicBoundaryMiddleware);
// The actor-aware routes are authoritative for the guided web flow. Legacy
// professor-only routes remain mounted afterwards for backwards compatibility.
adipometryRoutes.use(adipometryProfessionalActorRoutes);
adipometryRoutes.use(adipometryWebRemediationRoutes);
adipometryRoutes.use(adipometryOperationalRoutes);
adipometryRoutes.use(adipometryAnthropometrySupportRoutes);

export { adipometryRoutes };
export * from './adipometry.service.js';
export * from './adipometry-anthropometry-support.service.js';
export * from './adipometry-clinical-integrity.js';
export * from './adipometry-responsible-professor.js';
