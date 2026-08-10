import { PrismaClient } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import type { CapacityPrescriptionSourceRef } from '@corrida/types';
import { sendError } from '@corrida/utils';
import {
  assessmentSourceTypeForPersistence,
  isSpecificAssessmentSourceType,
} from './capacity-prescription-assessment-category.js';

const router: Router = Router();
const prisma = new PrismaClient();

router.post('/alunos/:alunoId', async (req: Request, res: Response, next) => {
  try {
    const contractId = req.user?.contractId;
    const body = req.body as Record<string, unknown>;
    const sourceRefs = Array.isArray(body.sourceRefs)
      ? (body.sourceRefs as CapacityPrescriptionSourceRef[])
      : [];

    if (!contractId || !sourceRefs.some((source) => isSpecificAssessmentSourceType(source.type))) {
      return next();
    }

    const sourceIds = sourceRefs
      .filter((source) => isSpecificAssessmentSourceType(source.type))
      .map((source) => source.id);
    const records = await prisma.studentAssessmentRecord.findMany({
      where: {
        id: { in: sourceIds },
        contractId,
        alunoId: req.params.alunoId,
      },
      select: { id: true, assessmentCategory: true },
    });
    const categoryById = new Map(
      records.map((record) => [record.id, record.assessmentCategory])
    );

    body.sourceRefs = sourceRefs.map((source) => {
      const assessmentCategory = categoryById.get(source.id);
      if (!assessmentCategory || !isSpecificAssessmentSourceType(source.type)) return source;
      return {
        ...source,
        type: assessmentSourceTypeForPersistence(source.type, assessmentCategory),
      };
    });

    return next();
  } catch (error) {
    console.error('Erro ao compatibilizar categoria da fonte de avaliação:', error);
    return sendError(res, 'Erro ao validar fontes técnicas', 500);
  }
});

export default router;
