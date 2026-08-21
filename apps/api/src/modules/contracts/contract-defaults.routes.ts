import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { masterMiddleware } from '../auth/auth.middleware.js';
import { cloneContractData } from './contract-data.service.js';
import { installContractDefaults } from './contract-defaults.service.js';

const router: Router = Router();
const prisma = new PrismaClient();

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
  try {
    const contractId = currentContractId(req);
    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const result = await installContractDefaults(contractId);
    return sendSuccess(res, result, 'Padrões do sistema instalados com sucesso');
  } catch (error: any) {
    console.error('Erro ao instalar padrões do sistema:', error);
    return sendError(res, error.message || 'Erro ao instalar padrões do sistema', 500);
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
