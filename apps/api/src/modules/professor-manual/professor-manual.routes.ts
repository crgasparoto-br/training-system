import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import {
  ensureDefaultProfessorManualForContract,
  professorManualService,
} from './professor-manual.service';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware';

const router: Router = Router();

router.use(authMiddleware);
router.use(professorMiddleware);

const formatSchema = z.enum([
  'dica_rapida',
  'alerta',
  'exemplo',
  'lembrete_metodo',
  'saiba_mais',
]);

const contextSchema = z.enum([
  'avaliacao_fisica',
  'montagem_treino',
  'uso_sistema',
]);

const createSchema = z.object({
  code: z.string().min(3).max(80),
  title: z.string().min(3).max(120),
  content: z.string().min(10),
  format: formatSchema,
  context: contextSchema,
  servicoContratado: z.string().max(60).optional().nullable(),
  setor: z.string().max(60).optional().nullable(),
  item: z.string().max(120).optional().nullable(),
  frase: z.string().optional().nullable(),
  productArea: z.string().min(3).max(80),
  productMoment: z.string().max(120).optional().nullable(),
  linkLabel: z.string().max(80).optional().nullable(),
  linkHref: z.string().max(255).optional().nullable(),
  order: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

router.get('/', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    await ensureDefaultProfessorManualForContract(contractId);

    const contextQuery = Array.isArray(req.query.context) ? req.query.context[0] : req.query.context;
    const formatQuery = Array.isArray(req.query.format) ? req.query.format[0] : req.query.format;
    const includeInactiveQuery = Array.isArray(req.query.includeInactive)
      ? req.query.includeInactive[0]
      : req.query.includeInactive;

    const items = await professorManualService.listByContract(contractId, {
      context: contextQuery ? contextSchema.parse(contextQuery) : undefined,
      format: formatQuery ? formatSchema.parse(formatQuery) : undefined,
      includeInactive: includeInactiveQuery === 'true',
    });

    return sendSuccess(res, items, 'Manual do professor carregado');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Filtro inválido para o Manual do Professor', 400, error.errors);
    }

    console.error('Erro ao listar manual do professor:', error);
    return sendError(res, 'Erro ao listar manual do professor', 500);
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const validated = createSchema.parse(req.body);
    const created = await professorManualService.create({
      contractId,
      ...validated,
      code: validated.code.trim().toUpperCase(),
      title: validated.title.trim(),
      content: validated.content.trim(),
      servicoContratado: validated.servicoContratado?.trim() || null,
      setor: validated.setor?.trim() || null,
      item: validated.item?.trim() || null,
      frase: validated.frase?.trim() || null,
      productArea: validated.productArea.trim(),
      productMoment: validated.productMoment?.trim() || null,
      linkLabel: validated.linkLabel?.trim() || null,
      linkHref: validated.linkHref?.trim() || null,
    });

    return sendSuccess(res, created, 'Item do Manual do Professor criado com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }

    if (error?.code === 'P2002') {
      return sendError(res, 'Já existe um item com esse código no contrato', 400);
    }

    console.error('Erro ao criar item do manual do professor:', error);
    return sendError(res, 'Erro ao criar item do manual do professor', 500);
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const validated = updateSchema.parse(req.body);
    const updated = await professorManualService.update(id, contractId, {
      ...validated,
      code: validated.code ? validated.code.trim().toUpperCase() : undefined,
      title: validated.title?.trim(),
      content: validated.content?.trim(),
      servicoContratado:
        validated.servicoContratado === undefined
          ? undefined
          : validated.servicoContratado?.trim() || null,
      setor: validated.setor === undefined ? undefined : validated.setor?.trim() || null,
      item: validated.item === undefined ? undefined : validated.item?.trim() || null,
      frase: validated.frase === undefined ? undefined : validated.frase?.trim() || null,
      productArea: validated.productArea?.trim(),
      productMoment:
        validated.productMoment === undefined ? undefined : validated.productMoment?.trim() || null,
      linkLabel: validated.linkLabel === undefined ? undefined : validated.linkLabel?.trim() || null,
      linkHref: validated.linkHref === undefined ? undefined : validated.linkHref?.trim() || null,
    });

    return sendSuccess(res, updated, 'Item do Manual do Professor atualizado com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }

    if (error?.message === 'ITEM_NOT_FOUND') {
      return sendError(res, 'Item do Manual do Professor não encontrado', 404);
    }

    if (error?.code === 'P2002') {
      return sendError(res, 'Já existe um item com esse código no contrato', 400);
    }

    console.error('Erro ao atualizar item do manual do professor:', error);
    return sendError(res, 'Erro ao atualizar item do manual do professor', 500);
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const deleted = await professorManualService.delete(id, contractId);
    return sendSuccess(res, deleted, 'Item do Manual do Professor removido com sucesso');
  } catch (error: any) {
    if (error?.message === 'ITEM_NOT_FOUND') {
      return sendError(res, 'Item do Manual do Professor não encontrado', 404);
    }

    console.error('Erro ao excluir item do manual do professor:', error);
    return sendError(res, 'Erro ao excluir item do manual do professor', 500);
  }
});

export default router;
