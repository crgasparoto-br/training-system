import { Router } from 'express';
import prontuarioInitialAnamnesisRoutes from './prontuario-initial-anamnesis.routes.js';
import prontuarioLegacyRoutes from './prontuario.routes.js';

const router: Router = Router();

// Keep the clinical intake boundary isolated from the longitudinal PRNT routes.
// Both routers remain mounted under /api/v1/prontuario by main.ts.
router.use(prontuarioInitialAnamnesisRoutes);
router.use(prontuarioLegacyRoutes);

export { router as prontuarioRoutes };
