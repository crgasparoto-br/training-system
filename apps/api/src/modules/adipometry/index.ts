import { Router, type Router as ExpressRouter } from 'express';
import adipometryOperationalRoutes from './adipometry.routes.js';
import adipometryAnthropometrySupportRoutes from './adipometry-anthropometry-support.routes.js';
import adipometryWebRemediationRoutes from './adipometry-web-remediation.routes.js';
import { adipometryPublicBoundaryMiddleware } from './adipometry-public-boundary.middleware.js';
import { installAdipometryRuntimeHardening } from './adipometry-runtime-hardening.js';

installAdipometryRuntimeHardening();

const adipometryRoutes: ExpressRouter = Router();
adipometryRoutes.use(adipometryPublicBoundaryMiddleware);
adipometryRoutes.use(adipometryWebRemediationRoutes);
adipometryRoutes.use(adipometryOperationalRoutes);
adipometryRoutes.use(adipometryAnthropometrySupportRoutes);

export { adipometryRoutes };
export * from './adipometry.service.js';
export * from './adipometry-anthropometry-support.service.js';
export * from './adipometry-clinical-integrity.js';
export * from './adipometry-responsible-professor.js';
