import { Router, type NextFunction, type Request, type Response } from 'express';
import type { CapacityPrescriptionSourceRef, FlexibilityArticulationParameters } from '@corrida/types';
import { sendError } from '@corrida/utils';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { mergeFlexibilityArticulationsFromAssessments } from './capacity-prescription-assessment-parameters.js';
import { capacityPrescriptionBoundaryPrisma as prisma } from './capacity-prescription-source-permission.routes.js';

const router: Router = Router();

const assessmentSourceTypes = new Set<CapacityPrescriptionSourceRef['type']>([
  'physical_assessment',
  'flexibility_assessment',
]);

async function requireCapacityManage(req: Request, res: Response, next: NextFunction) {
  try {
    const contractId = req.user?.contractId;
    const professorId = req.user?.professorId;
    if (!contractId || !professorId) return sendError(res, 'Não autenticado', 401);

    const professor = await prisma.professor.findFirst({
      where: { id: professorId, contractId },
      include: { collaboratorFunction: true },
    });
    if (
      !professor ||
      !(await canProfessorAccessBlock(professor, 'plans.capacityPrescriptions.manage'))
    ) {
      return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
    }
    return next();
  } catch (error) {
    console.error('Erro ao validar parâmetros derivados da avaliação:', error);
    return sendError(res, 'Erro ao verificar permissão', 500);
  }
}

router.post(
  '/alunos/:alunoId',
  authMiddleware,
  professorMiddleware,
  requireCapacityManage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      if (body.capacity !== 'flexibility') return next();

      const parameterSetIds = Array.isArray(body.parameterSetIds)
        ? body.parameterSetIds.filter((id) => typeof id === 'string' && Boolean(id.trim()))
        : [];
      if (parameterSetIds.length > 0) return next();

      const sourceRefs = Array.isArray(body.sourceRefs)
        ? (body.sourceRefs as CapacityPrescriptionSourceRef[])
        : [];
      const assessmentIds = Array.from(
        new Set(
          sourceRefs
            .filter((source) => assessmentSourceTypes.has(source.type))
            .map((source) => source.id)
            .filter(Boolean)
        )
      );
      if (!assessmentIds.length) return next();

      const contractId = req.user!.contractId!;
      const records = await prisma.studentAssessmentRecord.findMany({
        where: {
          id: { in: assessmentIds },
          contractId,
          alunoId: req.params.alunoId,
          status: { not: 'archived' },
        },
        orderBy: { performedAt: 'desc' },
        select: {
          measurements: {
            orderBy: { sortOrder: 'asc' },
            select: {
              metricKey: true,
              metricLabel: true,
              valueNumber: true,
              valueText: true,
            },
          },
        },
      });

      const rawParameters = body.parameters;
      const currentFlexibility =
        rawParameters &&
        typeof rawParameters === 'object' &&
        !Array.isArray(rawParameters) &&
        (rawParameters as Record<string, unknown>).type === 'flexibility' &&
        (rawParameters as Record<string, unknown>).flexibility &&
        typeof (rawParameters as Record<string, unknown>).flexibility === 'object'
          ? ((rawParameters as Record<string, unknown>).flexibility as Record<string, unknown>)
          : {};
      const existingArticulations = Array.isArray(currentFlexibility.articulations)
        ? (currentFlexibility.articulations as FlexibilityArticulationParameters[])
        : [];
      const articulations = mergeFlexibilityArticulationsFromAssessments(
        records,
        existingArticulations
      );
      if (!articulations.length) return next();

      body.parameters = {
        type: 'flexibility',
        flexibility: {
          ...currentFlexibility,
          articulations,
        },
      };
      return next();
    } catch (error) {
      console.error('Erro ao derivar parâmetros da avaliação física:', error);
      return sendError(res, 'Erro ao carregar parâmetros da avaliação física', 500);
    }
  }
);

export default router;
