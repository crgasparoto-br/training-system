import { Router, type Request, type Response } from 'express';
import legacyRoutes from './capacity-prescription.routes.js';
import canonicalSourceRoutes from './capacity-prescription-canonical-source.routes.js';
import assessmentCompatibilityRoutes from './capacity-prescription-assessment-compatibility.routes.js';
import assessmentParameterRoutes from './capacity-prescription-assessment-parameters.routes.js';
import extensionRoutes from './capacity-prescription-extension.routes.js';
import exerciseMappingRoutes from './capacity-exercise-mapping.routes.js';
import goalConsistencyRoutes from './capacity-prescription-goal-consistency.routes.js';
import goalPermissionRoutes from './capacity-prescription-goal-permission.routes.js';
import planningValidationRoutes from './capacity-prescription-planning-validation.routes.js';
import readPermissionRoutes from './capacity-prescription-read-permission.routes.js';
import sourceIntegrityRoutes from './capacity-prescription-source-integrity.routes.js';
import sourcePermissionRoutes from './capacity-prescription-source-permission.routes.js';
import sourceRoutes from './capacity-prescription-source.routes.js';
import statusNormalizationRoutes from './capacity-prescription-status-normalization.routes.js';
import { normalizeAssessmentSourceProjection } from './capacity-prescription-assessment-category.js';
import { serializeCapacityApiData } from './capacity-prescription-public.js';

const router: Router = Router();

router.use((req: Request, res: Response, next) => {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (body && typeof body === 'object' && 'data' in body) {
      const envelope = body as Record<string, unknown>;
      return originalJson({
        ...envelope,
        data: serializeCapacityApiData(
          normalizeAssessmentSourceProjection(envelope.data)
        ),
      });
    }
    return originalJson(
      serializeCapacityApiData(normalizeAssessmentSourceProjection(body))
    );
  }) as Response['json'];
  next();
});

// Autorizações e integridade das origens devem ser verificadas antes de qualquer
// reconstrução de metadados ou persistência das rotas compostas.
router.use(sourcePermissionRoutes);
router.use(sourceIntegrityRoutes);
router.use(planningValidationRoutes);
router.use(goalPermissionRoutes);

// Fontes do PRNT e do perfil são reconstruídas antes da normalização das
// avaliações e da derivação dos alertas. A compatibilidade final garante que
// categorias descritivas usem a mesma chave pública e persistida.
router.use(canonicalSourceRoutes);
router.use(sourceRoutes);
router.use(assessmentCompatibilityRoutes);
router.use(assessmentParameterRoutes);
router.use(goalConsistencyRoutes);
router.use(statusNormalizationRoutes);
router.use(extensionRoutes);
router.use(exerciseMappingRoutes);

// Consultas atuais e históricas revalidam os blocos específicos das fontes
// antes de chegar às rotas legadas, evitando exposição após revogação de acesso.
router.use(readPermissionRoutes);
router.use(legacyRoutes);

export default router;
