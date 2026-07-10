import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CreateServiceSchema, UpdateServiceSchema, sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, masterMiddleware } from '../auth/auth.middleware.js';
import { screenAccessMiddleware } from '../access-control/access-control.middleware.js';
import { serviceCatalogService } from './service.service.js';
import {
  CreateCatalogServiceSchema,
  CreateCommercialOptionSchema,
  CreatePlanComponentSchema,
  CreatePresentationItemSchema,
  ReorderCatalogItemsSchema,
  UpdateCatalogServiceSchema,
  UpdateCommercialOptionSchema,
  UpdatePlanComponentSchema,
  UpdatePresentationItemSchema,
} from './service.validation.js';

const router: Router = Router();
const catalogReadAccess = [authMiddleware, screenAccessMiddleware(['settings.services'])] as const;
const catalogWriteAccess = [authMiddleware, screenAccessMiddleware(['settings.services']), masterMiddleware] as const;

function getContractId(req: Request) {
  const contractId = (req as any).user?.contractId as string | undefined;
  if (!contractId) throw new Error('Contrato não encontrado');
  return contractId;
}

function handleRouteError(res: Response, error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return sendError(res, 'Dados inválidos', 400, error.errors);
  }

  const message = error instanceof Error ? error.message : fallback;
  const status = message.includes('não encontrado') ? 404 : 400;
  return sendError(res, message || fallback, status);
}

router.get('/catalog', ...catalogReadAccess, async (req: Request, res: Response) => {
  try {
    const items = await serviceCatalogService.listCatalog(
      getContractId(req),
      req.query.includeInactive === 'true'
    );
    return sendSuccess(res, items, 'Catálogo recuperado com sucesso');
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao carregar catálogo');
  }
});

router.get('/catalog/:id', ...catalogReadAccess, async (req: Request, res: Response) => {
  try {
    const item = await serviceCatalogService.getCatalogDetail(getContractId(req), req.params.id);
    return sendSuccess(res, item, 'Serviço recuperado com sucesso');
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao carregar serviço');
  }
});

router.post('/catalog/bootstrap', ...catalogWriteAccess, async (req: Request, res: Response) => {
  try {
    const dryRun = req.body?.dryRun === true;
    const result = await serviceCatalogService.bootstrapReferenceCatalog(getContractId(req), dryRun);
    return sendSuccess(
      res,
      result,
      dryRun ? 'Simulação da carga concluída' : 'Catálogo ACESSO 2026 carregado com sucesso'
    );
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao carregar catálogo de referência');
  }
});

router.post('/catalog', ...catalogWriteAccess, async (req: Request, res: Response) => {
  try {
    const payload = CreateCatalogServiceSchema.parse(req.body);
    const item = await serviceCatalogService.createCatalogService(getContractId(req), payload);
    return sendSuccess(res, item, 'Serviço criado com sucesso', 201);
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao criar serviço');
  }
});

router.put('/catalog/:id', ...catalogWriteAccess, async (req: Request, res: Response) => {
  try {
    const payload = UpdateCatalogServiceSchema.parse(req.body);
    const item = await serviceCatalogService.updateCatalogService(getContractId(req), req.params.id, payload);
    return sendSuccess(res, item, 'Serviço atualizado com sucesso');
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao atualizar serviço');
  }
});

router.post('/catalog/:serviceId/options', ...catalogWriteAccess, async (req: Request, res: Response) => {
  try {
    const payload = CreateCommercialOptionSchema.parse(req.body);
    const item = await serviceCatalogService.createCommercialOption(
      getContractId(req),
      req.params.serviceId,
      payload as any
    );
    return sendSuccess(res, item, 'Opção comercial criada com sucesso', 201);
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao criar opção comercial');
  }
});

router.put('/catalog/options/:optionId', ...catalogWriteAccess, async (req: Request, res: Response) => {
  try {
    const payload = UpdateCommercialOptionSchema.parse(req.body);
    const item = await serviceCatalogService.updateCommercialOption(
      getContractId(req),
      req.params.optionId,
      payload as any
    );
    return sendSuccess(res, item, 'Opção comercial atualizada com sucesso');
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao atualizar opção comercial');
  }
});

router.put('/catalog/:serviceId/options/reorder', ...catalogWriteAccess, async (req: Request, res: Response) => {
  try {
    const { ids } = ReorderCatalogItemsSchema.parse(req.body);
    const items = await serviceCatalogService.reorderCommercialOptions(
      getContractId(req),
      req.params.serviceId,
      ids
    );
    return sendSuccess(res, items, 'Opções reordenadas com sucesso');
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao reordenar opções');
  }
});

router.post('/catalog/:serviceId/presentation-items', ...catalogWriteAccess, async (req: Request, res: Response) => {
  try {
    const payload = CreatePresentationItemSchema.parse(req.body);
    const item = await serviceCatalogService.createPresentationItem(
      getContractId(req),
      req.params.serviceId,
      payload
    );
    return sendSuccess(res, item, 'Item de apresentação criado com sucesso', 201);
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao criar item de apresentação');
  }
});

router.put('/catalog/presentation-items/:itemId', ...catalogWriteAccess, async (req: Request, res: Response) => {
  try {
    const payload = UpdatePresentationItemSchema.parse(req.body);
    const item = await serviceCatalogService.updatePresentationItem(
      getContractId(req),
      req.params.itemId,
      payload
    );
    return sendSuccess(res, item, 'Item de apresentação atualizado com sucesso');
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao atualizar item de apresentação');
  }
});

router.put('/catalog/:serviceId/presentation-items/reorder', ...catalogWriteAccess, async (req: Request, res: Response) => {
  try {
    const { ids } = ReorderCatalogItemsSchema.parse(req.body);
    const items = await serviceCatalogService.reorderPresentationItems(
      getContractId(req),
      req.params.serviceId,
      ids
    );
    return sendSuccess(res, items, 'Itens reordenados com sucesso');
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao reordenar itens');
  }
});

router.post('/catalog/:serviceId/components', ...catalogWriteAccess, async (req: Request, res: Response) => {
  try {
    const payload = CreatePlanComponentSchema.parse(req.body);
    const item = await serviceCatalogService.createPlanComponent(
      getContractId(req),
      req.params.serviceId,
      payload
    );
    return sendSuccess(res, item, 'Componente criado com sucesso', 201);
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao criar componente');
  }
});

router.put('/catalog/components/:componentId', ...catalogWriteAccess, async (req: Request, res: Response) => {
  try {
    const payload = UpdatePlanComponentSchema.parse(req.body);
    const item = await serviceCatalogService.updatePlanComponent(
      getContractId(req),
      req.params.componentId,
      payload
    );
    return sendSuccess(res, item, 'Componente atualizado com sucesso');
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao atualizar componente');
  }
});

router.put('/catalog/:serviceId/components/reorder', ...catalogWriteAccess, async (req: Request, res: Response) => {
  try {
    const { ids } = ReorderCatalogItemsSchema.parse(req.body);
    const items = await serviceCatalogService.reorderPlanComponents(
      getContractId(req),
      req.params.serviceId,
      ids
    );
    return sendSuccess(res, items, 'Componentes reordenados com sucesso');
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao reordenar componentes');
  }
});

// Adaptador temporário para cadastro de aluno, contratos e consumidores anteriores.
router.get(
  '/',
  authMiddleware,
  screenAccessMiddleware(['settings.services', 'students.registration']),
  async (req: Request, res: Response) => {
    try {
      const items = await serviceCatalogService.listByContract(
        getContractId(req),
        req.query.includeInactive === 'true'
      );
      return sendSuccess(res, items, 'Serviços recuperados com sucesso');
    } catch (error) {
      return handleRouteError(res, error, 'Erro ao carregar serviços');
    }
  }
);

router.post('/', authMiddleware, masterMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = CreateServiceSchema.parse(req.body);
    const item = await serviceCatalogService.create(getContractId(req), payload as any);
    return sendSuccess(res, item, 'Serviço criado com sucesso', 201);
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao criar serviço');
  }
});

router.put('/:id', authMiddleware, masterMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = UpdateServiceSchema.parse(req.body);
    const item = await serviceCatalogService.update(getContractId(req), req.params.id, payload as any);
    return sendSuccess(res, item, 'Serviço atualizado com sucesso');
  } catch (error) {
    return handleRouteError(res, error, 'Erro ao atualizar serviço');
  }
});

export default router;
