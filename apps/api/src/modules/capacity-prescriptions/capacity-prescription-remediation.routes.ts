import { Prisma, PrismaClient } from '@prisma/client';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  CAPACITY_CATALOG_CATEGORIES,
  CAPACITY_PLANNING_LEVELS,
  CAPACITY_PRESCRIPTION_STATUSES,
  PHYSICAL_CAPACITY_TYPES,
  type CapacityPrescriptionSourceRef,
  type FlexibilityArticulationParameters,
} from '@corrida/types';
import { sendError, sendSuccess } from '@corrida/utils';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  CapacityPrescriptionDomainError,
} from './capacity-prescription.service.js';
import {
  createCapacityPrescriptionExtensionService,
} from './capacity-prescription-extension.service.js';

const router: Router = Router();
const prisma = new PrismaClient();

const capacitySchema = z.enum(PHYSICAL_CAPACITY_TYPES);
const categorySchema = z.enum(CAPACITY_CATALOG_CATEGORIES);
const levelSchema = z.enum(CAPACITY_PLANNING_LEVELS);
const statusSchema = z.enum(CAPACITY_PRESCRIPTION_STATUSES);

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

type CapacityActor = {
  contractId: string;
  professorId: string;
  professor: NonNullable<Awaited<ReturnType<typeof loadProfessor>>>;
};

type CapacityRequest = Request & { capacityActor?: CapacityActor };

async function loadProfessor(contractId: string, professorId: string) {
  return prisma.professor.findFirst({
    where: { id: professorId, contractId },
    include: { collaboratorFunction: true },
  });
}

function requireBlock(blockKey: string) {
  return async (req: CapacityRequest, res: Response, next: NextFunction) => {
    try {
      const contractId = req.user?.contractId;
      const professorId = req.user?.professorId;
      if (!contractId || !professorId) return sendError(res, 'Não autenticado', 401);
      const professor = await loadProfessor(contractId, professorId);
      if (!professor || !(await canProfessorAccessBlock(professor, blockKey))) {
        return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
      }
      req.capacityActor = { contractId, professorId, professor };
      return next();
    } catch (error) {
      console.error('Erro ao validar remediações da prescrição por capacidade:', error);
      return sendError(res, 'Erro ao verificar permissão', 500);
    }
  };
}

function handleError(res: Response, error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
  if (error instanceof CapacityPrescriptionDomainError) {
    if (error.code === 'NOT_FOUND') return sendError(res, 'Recurso não encontrado', 404);
    if (error.code === 'FORBIDDEN') return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
    if (error.code === 'CONFLICT') return sendError(res, error.message, 409);
    return sendError(res, error.message, 400);
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  ) {
    return sendError(res, 'O recurso foi alterado por outro usuário', 409);
  }
  console.error(fallback, error);
  return sendError(res, fallback, 500);
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const articulationAliases: Array<{ name: string; aliases: string[] }> = [
  { name: 'Coluna cervical', aliases: ['pescoco', 'cervical'] },
  { name: 'Ombro', aliases: ['ombro'] },
  { name: 'Cotovelo', aliases: ['cotovelo'] },
  { name: 'Punho', aliases: ['punho'] },
  { name: 'Dedos', aliases: ['dedo', 'dedos', 'falange'] },
  { name: 'Quadril', aliases: ['quadril'] },
  { name: 'Joelho', aliases: ['joelho'] },
];

function articulationFromMeasurement(measurement: {
  metricKey: string;
  metricLabel: string | null;
  valueNumber: unknown;
  valueText: string | null;
  unit: string | null;
}): FlexibilityArticulationParameters | null {
  const descriptor = normalizeText(`${measurement.metricKey} ${measurement.metricLabel ?? ''}`);
  const articulation = articulationAliases.find((candidate) =>
    candidate.aliases.some((alias) => descriptor.includes(alias))
  );
  if (!articulation) return null;

  const rawValue = measurement.valueNumber ?? measurement.valueText;
  const angle = rawValue === null || rawValue === undefined || rawValue === '' ? null : Number(rawValue);
  if (angle === null || !Number.isFinite(angle)) return null;

  return {
    name: articulation.name,
    angle,
    priority: 'medium',
    deficit: null,
    suggestedPrescription: null,
  };
}

function sameSet(left: string[], right: string[]) {
  const a = Array.from(new Set(left)).sort();
  const b = Array.from(new Set(right)).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

router.post(
  '/catalog',
  authMiddleware,
  professorMiddleware,
  requireBlock('settings.parameters.capacityPrescriptions'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = req.capacityActor!;
      const payload = catalogPayloadSchema.parse(req.body);
      const lockKey = [actor.contractId, payload.category, payload.code.trim().toUpperCase()].join(':');
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
        const service = createCapacityPrescriptionExtensionService(tx as unknown as PrismaClient);
        return service.saveCatalogItem(
          { contractId: actor.contractId, actorProfessorId: actor.professorId },
          payload
        );
      });
      return sendSuccess(res, result, 'Item técnico versionado', 201);
    } catch (error) {
      return handleError(res, error, 'Erro ao salvar item técnico');
    }
  }
);

router.post(
  '/alunos/:alunoId/planning',
  authMiddleware,
  professorMiddleware,
  requireBlock('plans.capacityPrescriptions.manage'),
  async (req: CapacityRequest, res: Response) => {
    try {
      const actor = req.capacityActor!;
      const payload = planningPayloadSchema.parse(req.body);
      const lockKey = [
        actor.contractId,
        req.params.alunoId,
        payload.level,
        payload.code.trim().toUpperCase(),
      ].join(':');
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
        const service = createCapacityPrescriptionExtensionService(tx as unknown as PrismaClient);
        return service.savePlanningCycle(
          {
            contractId: actor.contractId,
            alunoId: req.params.alunoId,
            actorProfessorId: actor.professorId,
          },
          payload
        );
      });
      return sendSuccess(res, result, 'Ciclo de planejamento versionado', 201);
    } catch (error) {
      return handleError(res, error, 'Erro ao salvar planejamento');
    }
  }
);

router.post(
  '/alunos/:alunoId',
  authMiddleware,
  professorMiddleware,
  requireBlock('plans.capacityPrescriptions.manage'),
  async (req: CapacityRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.capacityActor!;
      const body = req.body as Record<string, unknown>;
      const capacity = capacitySchema.safeParse(body.capacity);
      if (!capacity.success) return next();

      const sourceRefs = Array.isArray(body.sourceRefs)
        ? (body.sourceRefs as CapacityPrescriptionSourceRef[])
        : [];
      const linkedGoalIds = Array.isArray(body.linkedProntuarioGoalIds)
        ? body.linkedProntuarioGoalIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
        : [];
      const sourceGoalIds = sourceRefs
        .filter((source) => source?.type === 'prontuario_goal' && typeof source.id === 'string')
        .map((source) => source.id.trim())
        .filter(Boolean);

      if (!sameSet(sourceGoalIds, linkedGoalIds)) {
        return sendError(
          res,
          'Fontes e vínculos de objetivos do prontuário devem representar o mesmo conjunto',
          400
        );
      }

      if (linkedGoalIds.length > 0) {
        const classified = await prisma.$queryRaw<Array<{ goalId: string }>>(Prisma.sql`
          SELECT "goalId" FROM "ProntuarioGoalCapacityClassification"
          WHERE "contractId" = ${actor.contractId}
            AND "alunoId" = ${req.params.alunoId}
            AND "goalId" IN (${Prisma.join(linkedGoalIds)})
            AND ${capacity.data} = ANY("capacities")
        `);
        if (!sameSet(classified.map((item) => item.goalId), linkedGoalIds)) {
          return sendError(
            res,
            'Salve a classificação dos objetivos para esta capacidade antes de versionar',
            409
          );
        }
      }

      const parameters = body.parameters as
        | { type?: unknown; flexibility?: { articulations?: unknown } }
        | null
        | undefined;
      const hasManualFlexibility =
        parameters?.type === 'flexibility' &&
        Array.isArray(parameters.flexibility?.articulations) &&
        parameters.flexibility.articulations.length > 0;

      if (capacity.data === 'flexibility' && !hasManualFlexibility) {
        const assessmentIds = sourceRefs
          .filter((source) =>
            ['physical_assessment', 'flexibility_assessment'].includes(String(source?.type))
          )
          .map((source) => source.id)
          .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()));

        if (assessmentIds.length > 0) {
          const assessments = await prisma.studentAssessmentRecord.findMany({
            where: {
              id: { in: assessmentIds },
              contractId: actor.contractId,
              alunoId: req.params.alunoId,
              assessmentCategory: { in: ['flexibility', 'flexibilidade', 'flexibility_assessment'] },
            },
            include: {
              measurements: {
                select: {
                  metricKey: true,
                  metricLabel: true,
                  valueNumber: true,
                  valueText: true,
                  unit: true,
                },
              },
            },
          });
          const articulations = Array.from(
            new Map(
              assessments
                .flatMap((assessment) => assessment.measurements)
                .map(articulationFromMeasurement)
                .filter((item): item is FlexibilityArticulationParameters => Boolean(item))
                .map((item) => [item.name, item])
            ).values()
          );
          if (articulations.length > 0) {
            body.parameters = {
              type: 'flexibility',
              flexibility: { articulations },
            };
          }
        }
      }

      return next();
    } catch (error) {
      return handleError(res, error, 'Erro ao validar vínculos e avaliações da prescrição');
    }
  }
);

export { articulationFromMeasurement, sameSet };
export default router;
