import { PrismaClient } from '@prisma/client';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import {
  CAPACITY_CATALOG_CATEGORIES,
  CAPACITY_PLANNING_LEVELS,
  CAPACITY_PRESCRIPTION_STATUSES,
  PHYSICAL_CAPACITY_TYPES,
} from '@corrida/types';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { CapacityPrescriptionDomainError } from './capacity-prescription.service.js';
import { capacityPrescriptionExtensionService } from './capacity-prescription-extension.service.js';

const router: Router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);
router.use(professorMiddleware);

type CapacityActor = { contractId: string; professorId: string };
type CapacityRequest = Request & { capacityActor?: CapacityActor };

const categorySchema = z.enum(CAPACITY_CATALOG_CATEGORIES);
const levelSchema = z.enum(CAPACITY_PLANNING_LEVELS);
const statusSchema = z.enum(CAPACITY_PRESCRIPTION_STATUSES);
const capacitySchema = z.enum(PHYSICAL_CAPACITY_TYPES);

const catalogPayloadSchema = z
  .object({
    category: categorySchema,
    code: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().trim().min(2).max(160),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

const planningPayloadSchema = z
  .object({
    parentId: z.string().trim().min(1).optional().nullable(),
    level: levelSchema,
    code: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().trim().min(2).max(160),
    objective: z.string().trim().max(4000).optional().nullable(),
    startDate: z.string().datetime().optional().nullable(),
    endDate: z.string().datetime().optional().nullable(),
    loadCode: z.string().trim().max(80).optional().nullable(),
    volume: z.string().trim().max(160).optional().nullable(),
    frequency: z.string().trim().max(160).optional().nullable(),
    capacityParameters: z.record(z.record(z.unknown())).optional(),
    status: statusSchema.optional(),
  })
  .strict();

const goalClassificationSchema = z
  .object({
    capacities: z.array(capacitySchema),
    relatesToAssessment: z.boolean(),
    relatesToActionPlan: z.boolean(),
  })
  .strict();

function requireCapacityBlock(blockKey: string) {
  return async (req: CapacityRequest, res: Response, next: NextFunction) => {
    try {
      const contractId = req.user?.contractId;
      const professorId = req.user?.professorId;
      if (!contractId || !professorId) return sendError(res, 'Não autenticado', 401);

      const professor = await prisma.professor.findFirst({
        where: { id: professorId, contractId },
        include: { collaboratorFunction: true },
      });
      if (!professor || !(await canProfessorAccessBlock(professor, blockKey))) {
        return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
      }

      req.capacityActor = { contractId, professorId };
      return next();
    } catch (error) {
      console.error('Erro ao validar acesso à extensão de prescrição:', error);
      return sendError(res, 'Erro ao verificar permissão', 500);
    }
  };
}

function actorFromRequest(req: CapacityRequest) {
  if (!req.capacityActor) {
    throw new CapacityPrescriptionDomainError('FORBIDDEN', 'Acesso não autorizado');
  }
  return req.capacityActor;
}

function handleError(res: Response, error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
  if (error instanceof CapacityPrescriptionDomainError) {
    if (error.code === 'NOT_FOUND') return sendError(res, 'Recurso não encontrado', 404);
    if (error.code === 'FORBIDDEN') return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
    if (error.code === 'CONFLICT') return sendError(res, error.message, 409);
    return sendError(res, error.message, 400);
  }
  console.error(fallback, error);
  return sendError(res, fallback, 500);
}

router.get(
  '/catalog',
  requireCapacityBlock('plans.capacityPrescriptions.view'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const query = z
        .object({ category: categorySchema.optional(), includeHistory: z.enum(['true', 'false']).optional() })
        .parse(req.query);
      const result = await capacityPrescriptionExtensionService.listCatalog(
        actor.contractId,
        query.category,
        query.includeHistory === 'true'
      );
      return sendSuccess(res, result, 'Catálogo técnico carregado');
    } catch (error) {
      return handleError(res, error, 'Erro ao listar catálogo técnico');
    }
  }
);

router.post(
  '/catalog',
  requireCapacityBlock('settings.parameters.capacityPrescriptions'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const payload = catalogPayloadSchema.parse(req.body);
      const result = await capacityPrescriptionExtensionService.saveCatalogItem(
        { contractId: actor.contractId, actorProfessorId: actor.professorId },
        payload
      );
      return sendSuccess(res, result, 'Item técnico versionado', 201);
    } catch (error) {
      return handleError(res, error, 'Erro ao salvar item técnico');
    }
  }
);

router.get(
  '/alunos/:alunoId/planning',
  requireCapacityBlock('plans.capacityPrescriptions.view'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const result = await capacityPrescriptionExtensionService.listPlanning(actor.contractId, req.params.alunoId);
      return sendSuccess(res, result, 'Planejamento macro, meso e micro carregado');
    } catch (error) {
      return handleError(res, error, 'Erro ao carregar planejamento');
    }
  }
);

router.post(
  '/alunos/:alunoId/planning',
  requireCapacityBlock('plans.capacityPrescriptions.manage'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const payload = planningPayloadSchema.parse(req.body);
      const result = await capacityPrescriptionExtensionService.savePlanningCycle(
        {
          contractId: actor.contractId,
          alunoId: req.params.alunoId,
          actorProfessorId: actor.professorId,
        },
        payload
      );
      return sendSuccess(res, result, 'Ciclo de planejamento versionado', 201);
    } catch (error) {
      return handleError(res, error, 'Erro ao salvar planejamento');
    }
  }
);

router.get(
  '/alunos/:alunoId/goal-classifications',
  requireCapacityBlock('plans.capacityPrescriptions.view'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const result = await capacityPrescriptionExtensionService.listGoalClassifications(
        actor.contractId,
        req.params.alunoId
      );
      return sendSuccess(res, result, 'Classificações de objetivos carregadas');
    } catch (error) {
      return handleError(res, error, 'Erro ao carregar classificações de objetivos');
    }
  }
);

router.put(
  '/alunos/:alunoId/goals/:goalId/classification',
  requireCapacityBlock('plans.capacityPrescriptions.manage'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const payload = goalClassificationSchema.parse(req.body);
      const result = await capacityPrescriptionExtensionService.saveGoalClassification(
        {
          contractId: actor.contractId,
          alunoId: req.params.alunoId,
          actorProfessorId: actor.professorId,
          goalId: req.params.goalId,
        },
        payload
      );
      return sendSuccess(res, result, 'Classificação do objetivo atualizada');
    } catch (error) {
      return handleError(res, error, 'Erro ao classificar objetivo');
    }
  }
);

export default router;
