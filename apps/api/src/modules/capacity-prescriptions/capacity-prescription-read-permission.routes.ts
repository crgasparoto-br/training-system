import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { PHYSICAL_CAPACITY_TYPES } from '@corrida/types';
import { sendError, sendSuccess } from '@corrida/utils';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { capacityPrescriptionBoundaryPrisma as prisma } from './capacity-prescription-source-permission.routes.js';
import { filterCapacityPrescriptionReadData } from './capacity-prescription-read-permission.service.js';
import {
  CapacityPrescriptionDomainError,
  capacityPrescriptionService,
} from './capacity-prescription.service.js';
import type { CapacitySourceAccessSubject } from './capacity-prescription-source-permission.service.js';

const router: Router = Router();
const capacitySchema = z.enum(PHYSICAL_CAPACITY_TYPES);

type CapacityReadActor = {
  contractId: string;
  professorId: string;
  professor: CapacitySourceAccessSubject;
};
type CapacityReadRequest = Request & { capacityReadActor?: CapacityReadActor };

async function requireCapacityRead(
  req: CapacityReadRequest,
  res: Response,
  next: NextFunction
) {
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
      !(await canProfessorAccessBlock(professor, 'plans.capacityPrescriptions.view'))
    ) {
      return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
    }

    req.capacityReadActor = { contractId, professorId, professor };
    return next();
  } catch (error) {
    console.error('Erro ao validar leitura da prescrição por capacidade:', error);
    return sendError(res, 'Erro ao verificar permissão', 500);
  }
}

function actorFromRequest(req: CapacityReadRequest) {
  if (!req.capacityReadActor) {
    throw new CapacityPrescriptionDomainError('FORBIDDEN', 'Acesso não autorizado');
  }
  return req.capacityReadActor;
}

function handleError(res: Response, error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
  if (error instanceof CapacityPrescriptionDomainError) {
    if (error.code === 'NOT_FOUND') return sendError(res, 'Recurso não encontrado', 404);
    if (error.code === 'FORBIDDEN') {
      return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
    }
    if (error.code === 'CONFLICT') return sendError(res, error.message, 409);
    return sendError(res, error.message, 400);
  }
  console.error(fallback, error);
  return sendError(res, fallback, 500);
}

router.get(
  '/alunos/:alunoId',
  authMiddleware,
  professorMiddleware,
  requireCapacityRead,
  async (req: CapacityReadRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const query = z.object({ capacity: capacitySchema.optional() }).parse(req.query);
      const prescriptions = await capacityPrescriptionService.listByAluno(
        actor.contractId,
        req.params.alunoId,
        query.capacity
      );
      const visible = await filterCapacityPrescriptionReadData({
        client: prisma,
        professor: actor.professor,
        contractId: actor.contractId,
        value: prescriptions,
      });
      return sendSuccess(res, visible, 'Prescrições por capacidade carregadas');
    } catch (error) {
      return handleError(res, error, 'Erro ao listar prescrições por capacidade');
    }
  }
);

router.get(
  '/:id/versions',
  authMiddleware,
  professorMiddleware,
  requireCapacityRead,
  async (req: CapacityReadRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const versions = await capacityPrescriptionService.listHistory(
        actor.contractId,
        req.params.id
      );
      const visible = await filterCapacityPrescriptionReadData({
        client: prisma,
        professor: actor.professor,
        contractId: actor.contractId,
        value: versions,
      });
      return sendSuccess(res, visible, 'Histórico da prescrição carregado');
    } catch (error) {
      return handleError(res, error, 'Erro ao carregar histórico da prescrição');
    }
  }
);

router.get(
  '/:id',
  authMiddleware,
  professorMiddleware,
  async (req: CapacityReadRequest, res: Response, next: NextFunction) => {
    if (req.params.id === 'parameters') return next('route');
    return requireCapacityRead(req, res, next);
  },
  async (req: CapacityReadRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const prescription = await capacityPrescriptionService.getById(
        actor.contractId,
        req.params.id
      );
      const visible = await filterCapacityPrescriptionReadData({
        client: prisma,
        professor: actor.professor,
        contractId: actor.contractId,
        value: prescription,
      });
      return sendSuccess(res, visible, 'Prescrição por capacidade carregada');
    } catch (error) {
      return handleError(res, error, 'Erro ao carregar prescrição por capacidade');
    }
  }
);

export default router;
