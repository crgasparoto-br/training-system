import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { sendError } from '@corrida/utils';
import { blockAccessMiddleware } from '../access-control/access-control.middleware.js';

const prisma = new PrismaClient();

export const ADIPOMETRY_VIEW_BLOCK_KEY = 'physicalAssessment.adpt.view';
export const ADIPOMETRY_MANAGE_BLOCK_KEY = 'physicalAssessment.adpt.actions.manage';
export const ADIPOMETRY_CORRECT_BLOCK_KEY = 'physicalAssessment.adpt.actions.correctCompleted';

export function resolveAdipometryDraftMutationBlock(revisionNumber: number): string {
  return revisionNumber > 1
    ? ADIPOMETRY_CORRECT_BLOCK_KEY
    : ADIPOMETRY_MANAGE_BLOCK_KEY;
}

/**
 * Initial drafts use the ordinary management capability. Any revision created
 * to correct a finalized assessment requires the dedicated correction grant
 * for every mutation, including editing, recalculating and finalizing.
 */
export async function adipometryDraftMutationAccessMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const user = req.user;
  if (!user?.contractId) {
    return sendError(res, 'Não autenticado', 401, { code: 'AUTH_REQUIRED' });
  }

  try {
    const assessment = await prisma.adipometryAssessment.findFirst({
      where: {
        id: req.params.id,
        contractId: user.contractId,
      },
      select: {
        revisionNumber: true,
      },
    });

    if (!assessment) {
      return sendError(res, 'Avaliação não encontrada.', 404, {
        code: 'ADIPOMETRY_RESOURCE_NOT_FOUND',
      });
    }

    return blockAccessMiddleware(
      resolveAdipometryDraftMutationBlock(assessment.revisionNumber)
    )(req, res, next);
  } catch (error) {
    const correlationId = randomUUID();
    console.error('Falha ao resolver permissão do rascunho ADPT', {
      correlationId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return sendError(res, 'Não foi possível verificar a permissão da adipometria.', 500, {
      code: 'ADIPOMETRY_ACCESS_CHECK_FAILED',
      correlationId,
    });
  }
}
