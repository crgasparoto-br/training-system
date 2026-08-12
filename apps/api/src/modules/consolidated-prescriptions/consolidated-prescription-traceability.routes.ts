import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  ConsolidatedTraceabilityDomainError,
  consolidatedPrescriptionTraceabilityService,
  type ConsolidatedTraceabilityLookup,
} from './consolidated-prescription-traceability.service.js';

const router: Router = Router();
router.use(authMiddleware);
router.use(professorMiddleware);

const traceabilityQuerySchema = z
  .object({
    workoutTemplateId: z.string().trim().min(1).optional(),
    workoutDayId: z.string().trim().min(1).optional(),
    workoutExerciseId: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine(
    (value) =>
      [value.workoutTemplateId, value.workoutDayId, value.workoutExerciseId].filter(Boolean).length === 1,
    { message: 'Informe exatamente um ID operacional para rastreabilidade' }
  );

function handleError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
  if (error instanceof ConsolidatedTraceabilityDomainError) {
    if (error.code === 'NOT_FOUND') return sendError(res, 'Recurso não encontrado', 404);
    if (error.code === 'FORBIDDEN') {
      return sendError(res, 'Perfil sem permissão para consultar a rastreabilidade', 403);
    }
    return sendError(res, error.message, 400);
  }
  console.error('Erro ao consultar rastreabilidade da saída operacional:', error);
  return sendError(res, 'Erro ao consultar rastreabilidade da saída operacional', 500);
}

router.get('/alunos/:alunoId/operational-traceability', async (req: Request, res: Response) => {
  try {
    const contractId = req.user?.contractId;
    const professorId = req.user?.professorId;
    if (!contractId || !professorId) return sendError(res, 'Não autenticado', 401);

    const lookup = traceabilityQuerySchema.parse(req.query) as ConsolidatedTraceabilityLookup;
    const result = await consolidatedPrescriptionTraceabilityService.getTraceability(
      {
        contractId,
        alunoId: req.params.alunoId,
        actorProfessorId: professorId,
      },
      lookup
    );
    return sendSuccess(res, result, 'Rastreabilidade operacional consultada com sucesso');
  } catch (error) {
    return handleError(res, error);
  }
});

export default router;
