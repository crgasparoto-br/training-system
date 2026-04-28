import { Router, Request, Response } from 'express';
import { contractService } from './contract.service.js';
import { cloneContractData } from './contract-data.service.js';
import { authMiddleware, masterMiddleware } from '../auth/auth.middleware.js';
import { sendSuccess, sendError } from '@corrida/utils';

const router: Router = Router();

router.use(authMiddleware);
router.use(masterMiddleware);

const normalizeDocument = (document: string) => document.replace(/\D/g, '');

/**
 * GET /api/v1/contracts/me
 * Obter contrato do professor master
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId;

    if (!contractId) {
      return sendError(res, 'Contrato nÃ£o encontrado', 404);
    }

    const contract = await contractService.getById(contractId);

    if (!contract) {
      return sendError(res, 'Contrato nÃ£o encontrado', 404);
    }

    return sendSuccess(res, contract, 'Contrato recuperado com sucesso');
  } catch (error) {
    console.error('Erro ao buscar contrato:', error);
    return sendError(res, 'Erro ao buscar contrato', 500);
  }
});

/**
 * PUT /api/v1/contracts/me
 * Atualizar contrato do professor master
 */
router.put('/me', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId;

    if (!contractId) {
      return sendError(res, 'Contrato nÃ£o encontrado', 404);
    }

    const contract = await contractService.getById(contractId);

    if (!contract) {
      return sendError(res, 'Contrato nÃ£o encontrado', 404);
    }

    const { name, document } = req.body as { name?: string; document?: string };
    const updateData: { name?: string; document?: string } = {};

    if (typeof name === 'string' && name.trim().length > 0) {
      updateData.name = name.trim();
    }

    if (typeof document === 'string' && document.trim().length > 0) {
      const normalized = normalizeDocument(document);
      const expectedLength = contract.type === 'academy' ? 14 : 11;

      if (normalized.length !== expectedLength) {
        return sendError(
          res,
          contract.type === 'academy' ? 'CNPJ invÃ¡lido' : 'CPF invÃ¡lido',
          400
        );
      }

      updateData.document = normalized;
    }

    const updated = await contractService.update(contractId, updateData);

    return sendSuccess(res, updated, 'Contrato atualizado com sucesso');
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return sendError(res, 'Documento jÃ¡ estÃ¡ registrado', 400);
    }
    console.error('Erro ao atualizar contrato:', error);
    return sendError(res, 'Erro ao atualizar contrato', 500);
  }
});

/**
 * POST /api/v1/contracts/clone-data
 * Clonar parÃ¢metros e exercÃ­cios para o contrato atual
 */
router.post('/clone-data', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    const professorId = (req as any).user.professorId as string | undefined;

    if (!contractId) {
      return sendError(res, 'Contrato nÃ£o encontrado', 404);
    }

    const {
      sourceContractId,
      copyParameters = true,
      copyExercises = true,
      copyAssessmentTypes = true,
    } = req.body as {
      sourceContractId?: string;
      copyParameters?: boolean;
      copyExercises?: boolean;
      copyAssessmentTypes?: boolean;
    };

    let resolvedSourceId = sourceContractId || process.env.DEFAULT_CONTRACT_ID;

    if (!resolvedSourceId) {
      const firstSource = await contractService.getFirstSourceContract(contractId);
      if (!firstSource) {
        return sendError(
          res,
          'Nenhum contrato de origem disponÃ­vel para clonagem',
          404
        );
      }
      resolvedSourceId = firstSource.id;
    }

    if (resolvedSourceId === contractId) {
      return sendError(
        res,
        'Contrato de origem deve ser diferente do contrato atual',
        400
      );
    }

    const result = await cloneContractData({
      sourceContractId: resolvedSourceId,
      targetContractId: contractId,
      professorId,
      copyParameters,
      copyExercises,
      copyAssessmentTypes,
    });

    return sendSuccess(res, result, 'Dados clonados com sucesso');
  } catch (error: any) {
    console.error('Erro ao clonar dados:', error);
    return sendError(res, error.message || 'Erro ao clonar dados', 500);
  }
});

export default router;

