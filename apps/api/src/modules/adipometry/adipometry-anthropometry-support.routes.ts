import { Router, type Request, type Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  blockAccessMiddleware,
  screenAccessMiddleware,
} from '../access-control/access-control.middleware.js';
import { adipometryAnthropometrySupportService } from './adipometry-anthropometry-support.service.js';
import { AdipometryServiceError } from './adipometry.service.js';

const router: ExpressRouter = Router();
const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const querySchema = z.object({
  assessmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  anthropometryAssessmentId: idSchema.optional(),
}).strict();

router.use(authMiddleware);
router.use(professorMiddleware);
router.use(screenAccessMiddleware('physicalAssessment.protocol'));
router.use(blockAccessMiddleware('physicalAssessment.adpt.view'));

router.get('/alunos/:alunoId/anthropometry-support', async (req: Request, res: Response) => {
  try {
    const alunoId = idSchema.parse(req.params.alunoId);
    const query = querySchema.parse(req.query);
    const user = (req as any).user;
    const support = await adipometryAnthropometrySupportService.getSupport(
      user.contractId,
      alunoId,
      query.assessmentDate,
      query.anthropometryAssessmentId
    );
    return sendSuccess(res, support, 'Antropometria de apoio carregada.');
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos.', 400, {
        code: 'ADIPOMETRY_INVALID_INPUT',
        fields: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    if (error instanceof AdipometryServiceError) {
      return sendError(res, error.message, error.statusCode, { code: error.code });
    }
    console.error('Falha ao carregar antropometria de apoio', {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return sendError(res, 'Não foi possível carregar a antropometria de apoio.', 500, {
      code: 'ADIPOMETRY_UNEXPECTED_ERROR',
    });
  }
});

export default router;
