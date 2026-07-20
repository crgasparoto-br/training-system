import { Router } from 'express';
import professorDetailRoutes from './professor-detail.routes.js';
import professorRoutes from './professor.routes.js';

const router = Router();

router.use('/', professorDetailRoutes);
router.use('/', professorRoutes);

export { router as professorRoutes };
