import { Router, type Router as ExpressRouter } from 'express';
import adipometryOperationalRoutes from './adipometry.routes.js';
import adipometryAnthropometrySupportRoutes from './adipometry-anthropometry-support.routes.js';

const adipometryRoutes: ExpressRouter = Router();
adipometryRoutes.use(adipometryOperationalRoutes);
adipometryRoutes.use(adipometryAnthropometrySupportRoutes);

export { adipometryRoutes };
export * from './adipometry.service.js';
export * from './adipometry-anthropometry-support.service.js';
