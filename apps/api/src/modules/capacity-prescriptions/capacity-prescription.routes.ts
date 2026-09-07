import { PrismaClient } from '@prisma/client';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import {
  CAPACITY_PRESCRIPTION_STATUSES,
  CAPACITY_SOURCE_TYPES,
  PHYSICAL_CAPACITY_TYPES,
  type CapacityPrescriptionParameters,
} from '@corrida/types';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  CapacityPrescriptionDomainError,
  capacityPrescriptionService,
} from './capacity-prescription.service.js';

const router: Router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);
router.use(professorMiddleware);

const capacitySchema = z.enum(PHYSICAL_CAPACITY_TYPES);
const statusSchema = z.enum(CAPACITY_PRESCRIPTION_STATUSES);
const sourceTypeSchema = z.enum(CAPACITY_SOURCE_TYPES);

const sourceSchema = z
  .object({
    type: sourceTypeSchema,
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    assessedAt: z.string().datetime().optional().nullable(),
    origin: z.string().trim().optional().nullable(),
    version: z.union([z.number().int().nonnegative(), z.string().trim().min(1)]).optional().nullable(),
    responsibleProfessorId: z.string().trim().optional().nullable(),
  })
  .strict();

const alertSchema = z
  .object({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
    severity: z.enum(['info', 'warning', 'critical']),
    sourceRefId: z.string().trim().optional().nullable(),
  })
  .strict();

const resistedParametersSchema = z
  .object({
    type: z.literal('resisted'),
    resisted: z
      .object({
        muscleGroups: z.array(z.string().trim().min(1)).optional(),
        exerciseTechnicalCatalogItemIds: z.array(z.string().trim().min(1)).optional(),
        method: z.string().trim().optional().nullable(),
        split: z.string().trim().optional().nullable(),
        sets: z.number().int().positive().optional().nullable(),
        repetitions: z.string().trim().optional().nullable(),
        load: z.string().trim().optional().nullable(),
        repetitionReserve: z.string().trim().optional().nullable(),
        expectedPse: z.number().min(0).max(10).optional().nullable(),
        restrictions: z.array(z.string().trim().min(1)).optional(),
      })
      .strict(),
  })
  .strict();

const cyclicParametersSchema = z
  .object({
    type: z.literal('cyclic'),
    cyclic: z
      .object({
        category: z.string().trim().optional().nullable(),
        reversibilityPrinciple: z.string().trim().optional().nullable(),
        zoneBasis: z.enum(['max_hr', 'heart_rate_reserve', 'lan', 'vo2max', 'pse']).optional().nullable(),
        zones: z
          .array(
            z
              .object({
                name: z.string().trim().min(1),
                volume: z.string().trim().optional().nullable(),
                targetHeartRate: z.string().trim().optional().nullable(),
                pace: z.string().trim().optional().nullable(),
                minPercent: z.number().min(0).max(100).optional().nullable(),
                maxPercent: z.number().min(0).max(100).optional().nullable(),
              })
              .strict()
          )
          .optional(),
        vo2MaxPercentage: z.number().positive().max(200).optional().nullable(),
        anaerobicThreshold: z.string().trim().optional().nullable(),
        time: z.string().trim().optional().nullable(),
        distance: z.string().trim().optional().nullable(),
        expectedPse: z.number().min(0).max(10).optional().nullable(),
      })
      .strict(),
  })
  .strict();

const flexibilityParametersSchema = z
  .object({
    type: z.literal('flexibility'),
    flexibility: z
      .object({
        articulations: z
          .array(
            z
              .object({
                name: z.string().trim().min(1),
                angle: z.number().optional().nullable(),
                deficit: z.string().trim().optional().nullable(),
                priority: z.enum(['low', 'medium', 'high']).optional().nullable(),
                suggestedPrescription: z.string().trim().optional().nullable(),
              })
              .strict()
          )
          .optional(),
        expectedPse: z.number().min(0).max(10).optional().nullable(),
      })
      .strict(),
  })
  .strict();

const balanceParametersSchema = z
  .object({
    type: z.literal('balance'),
    balance: z
      .object({
        focus: z.string().trim().optional().nullable(),
        supports: z.array(z.string().trim().min(1)).optional(),
        progressionNotes: z.string().trim().optional().nullable(),
        expectedPse: z.number().min(0).max(10).optional().nullable(),
      })
      .strict(),
  })
  .strict();

const parametersSchema = z.discriminatedUnion('type', [
  resistedParametersSchema,
  cyclicParametersSchema,
  flexibilityParametersSchema,
  balanceParametersSchema,
]);

const savePrescriptionSchema = z
  .object({
    capacity: capacitySchema,
    status: statusSchema.optional(),
    expectedCurrentVersion: z.number().int().nonnegative().optional(),
    responsibleProfessorId: z.string().trim().optional().nullable(),
    sourceRefs: z.array(sourceSchema).min(1),
    linkedProntuarioGoalIds: z.array(z.string().trim().min(1)).optional(),
    technicalJustification: z.string().trim().min(1),
    professorSummary: z.string().trim().min(1),
    studentMessage: z.string().trim().optional().nullable(),
    alerts: z.array(alertSchema).optional(),
    parameters: parametersSchema.optional().nullable(),
    parameterSetIds: z.array(z.string().trim().min(1)).optional(),
    methodologyVersion: z.string().trim().optional().nullable(),
  })
  .strict();

const parameterSetSchema = z
  .object({
    capacity: capacitySchema,
    code: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().trim().min(2).max(160),
    methodologyVersion: z.string().trim().min(1).max(120),
    parameters: parametersSchema,
  })
  .strict();

type CapacityActor = { contractId: string; professorId: string };
type CapacityRequest = Request & { capacityActor?: CapacityActor };

function requireCapacityBlock(blockKey: string) {
  return async (req: CapacityRequest, res: Response, next: NextFunction) => {
    try {
      const contractId = req.user?.contractId;
      const professorId = req.user?.professorId;
      if (!contractId || !professorId) {
        return sendError(res, 'Não autenticado', 401);
      }

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
      console.error('Erro ao validar acesso à prescrição por capacidade:', error);
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
  if (error instanceof z.ZodError) {
    return sendError(res, 'Dados inválidos', 400, error.errors);
  }
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
  '/parameters',
  requireCapacityBlock('plans.capacityPrescriptions.view'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const query = z
        .object({
          capacity: capacitySchema.optional(),
          includeHistory: z.enum(['true', 'false']).optional(),
        })
        .parse(req.query);
      const parameters = await capacityPrescriptionService.listParameterSets(
        actor.contractId,
        query.capacity,
        query.includeHistory === 'true'
      );
      return sendSuccess(res, parameters, 'Parâmetros de prescrição carregados');
    } catch (error) {
      return handleError(res, error, 'Erro ao listar parâmetros de prescrição');
    }
  }
);

router.post(
  '/parameters',
  requireCapacityBlock('settings.parameters.capacityPrescriptions'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const payload = parameterSetSchema.parse(req.body);
      const parameterSet = await capacityPrescriptionService.saveParameterSet(
        { contractId: actor.contractId, actorProfessorId: actor.professorId },
        {
          ...payload,
          parameters: payload.parameters as CapacityPrescriptionParameters,
        }
      );
      return sendSuccess(res, parameterSet, 'Parâmetro de prescrição versionado', 201);
    } catch (error) {
      return handleError(res, error, 'Erro ao salvar parâmetro de prescrição');
    }
  }
);

router.get(
  '/alunos/:alunoId',
  requireCapacityBlock('plans.capacityPrescriptions.view'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const query = z.object({ capacity: capacitySchema.optional() }).parse(req.query);
      const prescriptions = await capacityPrescriptionService.listByAluno(
        actor.contractId,
        req.params.alunoId,
        query.capacity
      );
      return sendSuccess(res, prescriptions, 'Prescrições por capacidade carregadas');
    } catch (error) {
      return handleError(res, error, 'Erro ao listar prescrições por capacidade');
    }
  }
);

router.post(
  '/alunos/:alunoId',
  requireCapacityBlock('plans.capacityPrescriptions.manage'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const payload = savePrescriptionSchema.parse(req.body);
      const prescription = await capacityPrescriptionService.saveVersion(
        {
          contractId: actor.contractId,
          actorProfessorId: actor.professorId,
          alunoId: req.params.alunoId,
        },
        {
          ...payload,
          parameters: payload.parameters as CapacityPrescriptionParameters | null | undefined,
        }
      );
      return sendSuccess(res, prescription, 'Prescrição por capacidade versionada', 201);
    } catch (error) {
      return handleError(res, error, 'Erro ao salvar prescrição por capacidade');
    }
  }
);

router.get(
  '/:id/versions',
  requireCapacityBlock('plans.capacityPrescriptions.view'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const versions = await capacityPrescriptionService.listHistory(actor.contractId, req.params.id);
      return sendSuccess(res, versions, 'Histórico da prescrição carregado');
    } catch (error) {
      return handleError(res, error, 'Erro ao carregar histórico da prescrição');
    }
  }
);

router.get(
  '/:id',
  requireCapacityBlock('plans.capacityPrescriptions.view'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const prescription = await capacityPrescriptionService.getById(actor.contractId, req.params.id);
      return sendSuccess(res, prescription, 'Prescrição por capacidade carregada');
    } catch (error) {
      return handleError(res, error, 'Erro ao carregar prescrição por capacidade');
    }
  }
);

export default router;
