import { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { blockAccessMiddleware } from '../access-control/access-control.middleware.js';

const prisma = new PrismaClient();

export const ADIPOMETRY_VIEW_BLOCK_KEY = 'physicalAssessment.adpt.view';
export const ADIPOMETRY_MANAGE_BLOCK_KEY = 'physicalAssessment.adpt.actions.manage';
export const ADIPOMETRY_CORRECT_BLOCK_KEY = 'physicalAssessment.adpt.actions.correctCompleted';

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
    return res.status(401).json({ success: false, error: 'Não autenticado' });
  }

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
    return res.status(404).json({
      success: false,
      error: 'Avaliação não encontrada.',
      details: { code: 'ADIPOMETRY_RESOURCE_NOT_FOUND' },
    });
  }

  const requiredBlock = assessment.revisionNumber > 1
    ? ADIPOMETRY_CORRECT_BLOCK_KEY
    : ADIPOMETRY_MANAGE_BLOCK_KEY;

  return blockAccessMiddleware(requiredBlock)(req, res, next);
}
