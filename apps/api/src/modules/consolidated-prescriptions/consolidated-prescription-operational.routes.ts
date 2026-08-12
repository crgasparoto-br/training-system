import { PrismaClient } from '@prisma/client';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import type { AccessDataScope, ConsolidatedPrescriptionDataRefInput } from '@corrida/types';
import {
  canProfessorAccessBlock,
  getEffectiveDataScopeForProfessor,
} from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { ConsolidatedPrescriptionDomainError } from './consolidated-prescription.service.js';
import {
  consolidatedPrescriptionOperationalService,
  mergeServerOwnedOperationalRefs,
} from './consolidated-prescription-operational.service.js';
import {
  hasReservedOperationalOrigin,
  OPERATIONAL_MAPPING_REQUIRED_BLOCKS,
} from './consolidated-prescription-operational-integrity.js';

const router: Router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);
router.use(professorMiddleware);

type OperationalActor = {
  contractId: string;
  professorId: string;
  dataScope: AccessDataScope;
};
type OperationalRequest = Request & { operationalActor?: OperationalActor };

router.use(async (req: Request, res: Response, next: NextFunction) => {
  const createMatch = req.method === 'POST' && /^\/alunos\/[^/]+$/.exec(req.path);
  const updateMatch = req.method === 'PATCH' && /^\/alunos\/[^/]+\/composition$/.exec(req.path);
  if (!createMatch && !updateMatch) return next();
  try {
    const contractId = req.user?.contractId;
    const professorId = req.user?.professorId;
    const alunoId = req.path.split('/')[2];
    if (!contractId || !professorId || !alunoId) return next();
    const incoming = Array.isArray(req.body?.dataRefs)
      ? (req.body.dataRefs as ConsolidatedPrescriptionDataRefInput[])
      : [];
    const clientOwnedRefs = incoming.filter((ref) => !hasReservedOperationalOrigin(ref));

    if (createMatch) {
      req.body = {
        ...req.body,
        dataRefs: clientOwnedRefs,
      };
      return next();
    }

    const normalized = await mergeServerOwnedOperationalRefs(
      { contractId, alunoId, actorProfessorId: professorId },
      { dataRefs: clientOwnedRefs }
    );
    req.body = { ...req.body, dataRefs: normalized.dataRefs };
    return next();
  } catch (error) {
    if (error instanceof ConsolidatedPrescriptionDomainError && error.code === 'NOT_FOUND') {
      return next();
    }
    console.error('Erro ao preservar referências operacionais internas:', error);
    return sendError(res, 'Erro ao preservar rastreabilidade operacional da montagem', 500);
  }
});

const mappingSchema = z
  .object({
    exerciseLibraryId: z.string().trim().min(1),
    expectedMappingRevision: z.number().int().nonnegative(),
  })
  .strict();

const prepareSchema = z
  .object({ expectedCurrentVersion: z.number().int().nonnegative() })
  .strict();

const substitutionSchema = z
  .object({
    expectedCurrentVersion: z.number().int().nonnegative(),
    originalTechnicalCatalogItemId: z.string().trim().min(1),
    substituteExerciseLibraryId: z.string().trim().min(1),
    reason: z.string().trim().min(1),
    origin: z.string().trim().min(1),
  })
  .strict();

function requireConsolidatedBlocks(...blockKeys: string[]) {
  return async (req: OperationalRequest, res: Response, next: NextFunction) => {
    try {
      const contractId = req.user?.contractId;
      const professorId = req.user?.professorId;
      if (!contractId || !professorId) return sendError(res, 'Não autenticado', 401);
      const professor = await prisma.professor.findFirst({
        where: { id: professorId, contractId },
        include: { collaboratorFunction: true },
      });
      if (!professor) return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
      for (const blockKey of blockKeys) {
        if (!(await canProfessorAccessBlock(professor, blockKey))) {
          return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
        }
      }
      const dataScope = await getEffectiveDataScopeForProfessor(professor, 'plans');
      if (!dataScope) return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
      req.operationalActor = { contractId, professorId, dataScope };
      return next();
    } catch (error) {
      console.error('Erro ao validar acesso ao adaptador operacional da montagem:', error);
      return sendError(res, 'Erro ao verificar permissão', 500);
    }
  };
}

async function ensureAlunoScope(req: OperationalRequest, res: Response) {
  const actor = req.operationalActor;
  if (!actor) {
    sendError(res, 'Recurso não encontrado', 404);
    return null;
  }
  const aluno = await prisma.aluno.findFirst({
    where: { id: req.params.alunoId, contractId: actor.contractId },
    select: { id: true, professorId: true },
  });
  if (!aluno) {
    sendError(res, 'Recurso não encontrado', 404);
    return null;
  }
  if (actor.dataScope === 'contract' || aluno.professorId === actor.professorId) return actor;
  if (actor.dataScope !== 'managed' || !aluno.professorId) {
    sendError(res, 'Recurso não encontrado', 404);
    return null;
  }
  const responsibleProfessor = await prisma.professor.findFirst({
    where: { id: aluno.professorId, contractId: actor.contractId },
    select: { responsibleManagerId: true },
  });
  if (responsibleProfessor?.responsibleManagerId !== actor.professorId) {
    sendError(res, 'Recurso não encontrado', 404);
    return null;
  }
  return actor;
}

function contextFor(actor: OperationalActor, alunoId: string) {
  return {
    contractId: actor.contractId,
    alunoId,
    actorProfessorId: actor.professorId,
  };
}

function handleError(res: Response, error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
  if (error instanceof ConsolidatedPrescriptionDomainError) {
    if (error.code === 'NOT_FOUND') return sendError(res, 'Recurso não encontrado', 404);
    if (error.code === 'CONFLICT') {
      return sendError(res, error.message, 409, error.details ? [error.details] : undefined);
    }
    return sendError(res, error.message, 400, error.details ? [error.details] : undefined);
  }
  console.error(fallback, error);
  return sendError(res, fallback, 500);
}

router.get(
  '/alunos/:alunoId/operational-exercises',
  requireConsolidatedBlocks('plans.consolidatedPrescriptions.view'),
  async (req: OperationalRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const query = z
        .object({
          search: z.string().trim().optional(),
          category: z.string().trim().optional(),
          muscleGroup: z.string().trim().optional(),
        })
        .parse(req.query);
      const exercises = await consolidatedPrescriptionOperationalService.listOperationalExercises(
        contextFor(actor, req.params.alunoId),
        query
      );
      return sendSuccess(res, exercises, 'Biblioteca operacional carregada');
    } catch (error) {
      return handleError(res, error, 'Erro ao carregar biblioteca operacional');
    }
  }
);

router.put(
  '/alunos/:alunoId/exercise-mappings/:technicalCatalogItemId',
  requireConsolidatedBlocks(...OPERATIONAL_MAPPING_REQUIRED_BLOCKS),
  async (req: OperationalRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const command = mappingSchema.parse(req.body);
      const mapping = await consolidatedPrescriptionOperationalService.setExerciseMapping(
        contextFor(actor, req.params.alunoId),
        req.params.technicalCatalogItemId,
        command
      );
      return sendSuccess(res, mapping, 'Vínculo técnico com a biblioteca operacional salvo');
    } catch (error) {
      return handleError(res, error, 'Erro ao salvar vínculo operacional do exercício');
    }
  }
);

router.get(
  '/alunos/:alunoId/operational-preview',
  requireConsolidatedBlocks('plans.consolidatedPrescriptions.view'),
  async (req: OperationalRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const projection = await consolidatedPrescriptionOperationalService.getProjection(
        contextFor(actor, req.params.alunoId)
      );
      return sendSuccess(res, projection, 'Projeção operacional da montagem carregada');
    } catch (error) {
      return handleError(res, error, 'Erro ao preparar projeção operacional da montagem');
    }
  }
);

router.post(
  '/alunos/:alunoId/operational-preview/prepare',
  requireConsolidatedBlocks('plans.consolidatedPrescriptions.manage'),
  async (req: OperationalRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const command = prepareSchema.parse(req.body);
      const result = await consolidatedPrescriptionOperationalService.prepareProjection(
        contextFor(actor, req.params.alunoId),
        command
      );
      return sendSuccess(res, result, 'Projeção operacional registrada na versão da montagem', 201);
    } catch (error) {
      return handleError(res, error, 'Erro ao registrar projeção operacional da montagem');
    }
  }
);

router.post(
  '/alunos/:alunoId/exercise-substitutions',
  requireConsolidatedBlocks('plans.consolidatedPrescriptions.manage'),
  async (req: OperationalRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const command = substitutionSchema.parse(req.body);
      const operationContext = contextFor(actor, req.params.alunoId);
      const result = await consolidatedPrescriptionOperationalService.createExerciseSubstitution(
        operationContext,
        command
      );
      return sendSuccess(res, result, 'Substituição operacional registrada na montagem', 201);
    } catch (error) {
      return handleError(res, error, 'Erro ao registrar substituição operacional');
    }
  }
);

export default router;
