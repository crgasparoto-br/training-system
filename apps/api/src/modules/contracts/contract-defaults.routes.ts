import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { masterMiddleware } from '../auth/auth.middleware.js';
import { cloneContractData } from './contract-data.service.js';
import {
  ContractDefaultsInstallStageError,
  installContractDefaults,
} from './contract-defaults.service.js';

const router: Router = Router();
const prisma = new PrismaClient();
const SLOW_DEFAULTS_INSTALL_MS = 4_000;

const copySchema = z.object({
  sourceContractId: z.string().trim().min(1),
  copyParameters: z.boolean().optional().default(true),
  copyExercises: z.boolean().optional().default(true),
  copyAssessmentTypes: z.boolean().optional().default(true),
});

const legacyCloneSchema = z.object({
  sourceContractId: z.string().trim().min(1).optional(),
  copyParameters: z.boolean().optional().default(true),
  copyExercises: z.boolean().optional().default(true),
  copyAssessmentTypes: z.boolean().optional().default(true),
});

const currentContractId = (req: Request) => (req as any).user?.contractId as string | undefined;
const currentProfessorId = (req: Request) => (req as any).user?.professorId as string | undefined;

const errorDetails = (error: unknown) => {
  const candidate = error && typeof error === 'object' ? (error as any) : {};
  const rootCause =
    error instanceof ContractDefaultsInstallStageError ? error.cause : error;
  const root = rootCause && typeof rootCause === 'object' ? (rootCause as any) : {};

  return {
    stage:
      error instanceof ContractDefaultsInstallStageError
        ? error.stage
        : 'install-defaults',
    stageDurationMs:
      error instanceof ContractDefaultsInstallStageError
        ? error.durationMs
        : undefined,
    errorName: root.name ?? candidate.name,
    errorCode: root.code ?? candidate.code,
    message: root.message ?? candidate.message,
    stack: root.stack ?? candidate.stack,
  };
};

async function copyFromExplicitSource(req: Request, res: Response) {
  const contractId = currentContractId(req);
  if (!contractId) {
    return sendError(res, 'Contrato não encontrado', 404);
  }

  const parsed = copySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'Informe explicitamente o contrato de origem para copiar dados', 400);
  }

  if (parsed.data.sourceContractId === contractId) {
    return sendError(res, 'Contrato de origem deve ser diferente do contrato atual', 400);
  }

  const source = await prisma.companyContract.findUnique({
    where: { id: parsed.data.sourceContractId },
    select: { id: true },
  });
  if (!source) {
    return sendError(res, 'Contrato de origem não encontrado', 404);
  }

  const result = await cloneContractData({
    sourceContractId: parsed.data.sourceContractId,
    targetContractId: contractId,
    professorId: currentProfessorId(req),
    copyParameters: parsed.data.copyParameters,
    copyExercises: parsed.data.copyExercises,
    copyAssessmentTypes: parsed.data.copyAssessmentTypes,
  });

  return sendSuccess(res, result, 'Dados copiados do contrato informado com sucesso');
}

router.post('/install-defaults', masterMiddleware, async (req: Request, res: Response) => {
  const correlationId = randomUUID();
  const startedAt = Date.now();

  try {
    const contractId = currentContractId(req);
    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const result = await installContractDefaults(contractId);
    const durationMs = Date.now() - startedAt;
    if (durationMs >= SLOW_DEFAULTS_INSTALL_MS) {
      console.warn('Instalação de padrões acima do limite de observação', {
        operation: 'contract-defaults.install',
        stage: 'complete',
        durationMs,
        correlationId,
      });
    }
    return sendSuccess(res, result, 'Padrões do sistema instalados com sucesso');
  } catch (error: unknown) {
    const durationMs = Date.now() - startedAt;
    console.error('Erro ao instalar padrões do sistema:', {
      operation: 'contract-defaults.install',
      durationMs,
      correlationId,
      ...errorDetails(error),
    });
    return sendError(res, 'Erro ao instalar padrões do sistema', 500, {
      code: 'CONTRACT_DEFAULTS_INTERNAL_ERROR',
      correlationId,
    });
  }
});

router.post('/copy-data', masterMiddleware, async (req: Request, res: Response) => {
  try {
    return await copyFromExplicitSource(req, res);
  } catch (error: any) {
    console.error('Erro ao copiar dados entre contratos:', error);
    return sendError(res, error.message || 'Erro ao copiar dados entre contratos', 500);
  }
});

/**
 * Compatibilidade temporária para clientes anteriores à Issue #365.
 * Sem sourceContractId, a rota instala somente os defaults versionados do produto;
 * com sourceContractId, mantém a cópia manual e explícita entre contratos.
 */
router.post('/clone-data', masterMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = legacyCloneSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Dados inválidos para instalação ou cópia', 400);
    }

    if (parsed.data.sourceContractId) {
      return await copyFromExplicitSource(req, res);
    }

    const contractId = currentContractId(req);
    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const result = await installContractDefaults(contractId);
    return sendSuccess(
      res,
      {
        parametersCreated: result.trainingParameters.installed,
        parametersSkipped: result.trainingParameters.skipped,
        exercisesCreated: result.exercises.installed,
        exercisesSkipped: result.exercises.skipped,
        assessmentTypesCreated: result.assessmentTypes.installed,
        assessmentTypesSkipped: result.assessmentTypes.skipped,
        defaults: result,
      },
      'Padrões do sistema instalados com sucesso'
    );
  } catch (error: any) {
    console.error('Erro ao instalar padrões ou copiar dados:', error);
    return sendError(res, error.message || 'Erro ao processar dados do contrato', 500);
  }
});

export default router;
