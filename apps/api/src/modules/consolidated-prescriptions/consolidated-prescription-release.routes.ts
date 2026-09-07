import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  ConsolidatedReleaseDomainError,
  consolidatedPrescriptionReleaseService,
} from './consolidated-prescription-release.service.js';

const router: Router = Router();
router.use(authMiddleware);
router.use(professorMiddleware);

const releaseSchema = z
  .object({
    expectedCurrentVersion: z.number().int().positive(),
    target: z
      .object({
        trainingPlanId: z.string().trim().min(1),
        mesocycleNumber: z.number().int().positive(),
        weekNumber: z.number().int().positive(),
        weekStartDate: z.string().trim().min(1),
        placements: z
          .array(
            z
              .object({
                projectionKey: z.string().trim().min(1),
                dayOfWeek: z.number().int().min(1).max(7),
                workoutDate: z.string().trim().min(1),
                section: z.string().trim().min(1).optional(),
                exerciseOrder: z.number().int().positive().optional(),
              })
              .strict()
          )
          .default([]),
      })
      .strict(),
  })
  .strict();

function handleError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
  if (error instanceof ConsolidatedReleaseDomainError) {
    if (error.code === 'NOT_FOUND') return sendError(res, 'Recurso não encontrado', 404);
    if (error.code === 'FORBIDDEN') return sendError(res, 'Perfil sem permissão para liberar esta montagem', 403);
    if (error.code === 'CONFLICT') {
      return sendError(res, error.message, 409, error.details ? [error.details] : undefined);
    }
    return sendError(res, error.message, 400, error.details ? [error.details] : undefined);
  }

  const correlationId = randomUUID();
  console.error('Erro ao liberar saída operacional da montagem consolidada:', {
    correlationId,
    error,
  });
  return res.status(500).json({
    success: false,
    code: 'API_UNEXPECTED_ERROR',
    error: 'Erro ao liberar saída operacional da montagem consolidada',
    correlationId,
    timestamp: new Date().toISOString(),
  });
}

router.post('/alunos/:alunoId/operational-release', async (req: Request, res: Response) => {
  try {
    const contractId = req.user?.contractId;
    const professorId = req.user?.professorId;
    if (!contractId || !professorId) return sendError(res, 'Não autenticado', 401);
    const command = releaseSchema.parse(req.body);
    const result = await consolidatedPrescriptionReleaseService.release(
      {
        contractId,
        alunoId: req.params.alunoId,
        actorProfessorId: professorId,
      },
      command
    );
    return sendSuccess(
      res,
      result,
      result.idempotent
        ? 'Saída operacional já estava liberada para esta versão'
        : 'Saída operacional liberada com rastreabilidade'
    );
  } catch (error) {
    return handleError(res, error);
  }
});

export default router;
