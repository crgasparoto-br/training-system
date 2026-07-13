import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, masterMiddleware } from '../auth/auth.middleware.js';
import { screenAccessMiddleware } from '../access-control/access-control.middleware.js';
import {
  assertActiveCatalogComponentTarget,
  assertCommercialOptionInactivationConfirmation,
  assertServiceInactivationConfirmation,
  getCommercialOptionImpact,
  getServiceCatalogImpact,
} from './service-impact.service.js';
import { serviceCatalogService } from './service.service.js';
import {
  CreatePlanComponentSchema,
  UpdateCatalogServiceSchema,
  UpdateCommercialOptionSchema,
  UpdatePlanComponentSchema,
} from './service.validation.js';

const router: Router = Router();
const readAccess = [authMiddleware, screenAccessMiddleware(['settings.services'])] as const;
const writeAccess = [...readAccess, masterMiddleware] as const;

function getContractId(req: Request) {
  const contractId = (req as any).user?.contractId as string | undefined;
  if (!contractId) throw new Error('Contrato não encontrado');
  return contractId;
}

function handleError(res: Response, error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return sendError(res, 'Dados inválidos', 400, error.errors);
  }

  const message = error instanceof Error ? error.message : fallback;
  const explicitStatus =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: number }).statusCode)
      : undefined;
  const status =
    explicitStatus || (message.includes('não encontrado') ? 404 : 400);
  return sendError(res, message || fallback, status);
}

router.get('/catalog/:id/impact', ...readAccess, async (req: Request, res: Response) => {
  try {
    const impact = await getServiceCatalogImpact(getContractId(req), req.params.id);
    return sendSuccess(res, impact, 'Impacto do serviço recuperado com sucesso');
  } catch (error) {
    return handleError(res, error, 'Erro ao calcular impacto do serviço');
  }
});

router.get(
  '/catalog/options/:optionId/impact',
  ...readAccess,
  async (req: Request, res: Response) => {
    try {
      const impact = await getCommercialOptionImpact(
        getContractId(req),
        req.params.optionId
      );
      return sendSuccess(res, impact, 'Impacto da opção recuperado com sucesso');
    } catch (error) {
      return handleError(res, error, 'Erro ao calcular impacto da opção');
    }
  }
);

router.put('/catalog/:id', ...writeAccess, async (req: Request, res: Response) => {
  try {
    const contractId = getContractId(req);
    const parsed = UpdateCatalogServiceSchema.parse(req.body);
    const { impactConfirmation, ...payload } = parsed;

    if (payload.isActive === false) {
      const currentImpact = await getServiceCatalogImpact(contractId, req.params.id);
      if (currentImpact.serviceIsActive) {
        await assertServiceInactivationConfirmation(
          contractId,
          req.params.id,
          impactConfirmation
        );
      }
    }

    const item = await serviceCatalogService.updateCatalogService(
      contractId,
      req.params.id,
      payload
    );
    return sendSuccess(res, item, 'Serviço atualizado com sucesso');
  } catch (error) {
    return handleError(res, error, 'Erro ao atualizar serviço');
  }
});

router.put(
  '/catalog/options/:optionId',
  ...writeAccess,
  async (req: Request, res: Response) => {
    try {
      const contractId = getContractId(req);
      const parsed = UpdateCommercialOptionSchema.parse(req.body);
      const { impactConfirmation, ...payload } = parsed;

      if (payload.isActive === false) {
        const currentImpact = await getCommercialOptionImpact(
          contractId,
          req.params.optionId
        );
        if (currentImpact.optionIsActive) {
          await assertCommercialOptionInactivationConfirmation(
            contractId,
            req.params.optionId,
            impactConfirmation
          );
        }
      }

      const item = await serviceCatalogService.updateCommercialOption(
        contractId,
        req.params.optionId,
        payload as any
      );
      return sendSuccess(res, item, 'Opção comercial atualizada com sucesso');
    } catch (error) {
      return handleError(res, error, 'Erro ao atualizar opção comercial');
    }
  }
);

router.post(
  '/catalog/:serviceId/components',
  ...writeAccess,
  async (req: Request, res: Response) => {
    try {
      const contractId = getContractId(req);
      const payload = CreatePlanComponentSchema.parse(req.body);
      await assertActiveCatalogComponentTarget(
        contractId,
        payload.targetServiceId,
        payload.targetOptionId
      );
      const item = await serviceCatalogService.createPlanComponent(
        contractId,
        req.params.serviceId,
        payload
      );
      return sendSuccess(res, item, 'Componente criado com sucesso', 201);
    } catch (error) {
      return handleError(res, error, 'Erro ao criar componente');
    }
  }
);

router.put(
  '/catalog/components/:componentId',
  ...writeAccess,
  async (req: Request, res: Response) => {
    try {
      const contractId = getContractId(req);
      const payload = UpdatePlanComponentSchema.parse(req.body);
      if (payload.targetServiceId !== undefined || payload.targetOptionId !== undefined) {
        await assertActiveCatalogComponentTarget(
          contractId,
          payload.targetServiceId,
          payload.targetOptionId
        );
      }
      const item = await serviceCatalogService.updatePlanComponent(
        contractId,
        req.params.componentId,
        payload
      );
      return sendSuccess(res, item, 'Componente atualizado com sucesso');
    } catch (error) {
      return handleError(res, error, 'Erro ao atualizar componente');
    }
  }
);

export default router;
