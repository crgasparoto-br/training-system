import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware';
import { assessmentTypeService, ensureDefaultAssessmentTypesForContract } from './assessment-type.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router: Router = Router();

router.use(authMiddleware);
router.use(professorMiddleware);

const scheduleTypeEnum = z.enum(['fixed_interval', 'after_type']);

const createSchema = z.object({
  name: z.string().min(3),
  code: z.string().min(2),
  description: z.string().optional(),
  scheduleType: scheduleTypeEnum,
  intervalMonths: z.number().int().min(1).optional(),
  afterTypeId: z.string().optional(),
  offsetMonths: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(3).optional(),
  code: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  scheduleType: scheduleTypeEnum.optional(),
  intervalMonths: z.number().int().min(1).optional().nullable(),
  afterTypeId: z.string().optional().nullable(),
  offsetMonths: z.number().int().min(0).optional().nullable(),
  isActive: z.boolean().optional(),
});

const validateScheduleRules = (data: {
  scheduleType: 'fixed_interval' | 'after_type';
  intervalMonths?: number | null;
  afterTypeId?: string | null;
  offsetMonths?: number | null;
}) => {
  if (data.scheduleType === 'fixed_interval') {
    if (!data.intervalMonths || data.intervalMonths <= 0) {
      return 'Informe a periodicidade (em meses).';
    }
    return null;
  }

  if (!data.afterTypeId) {
    return 'Selecione o tipo base para calcular a prÃƒÂ³xima avaliaÃƒÂ§ÃƒÂ£o.';
  }

  if (data.offsetMonths !== undefined && data.offsetMonths !== null && data.offsetMonths < 0) {
    return 'O intervalo apÃƒÂ³s o tipo base deve ser 0 ou maior.';
  }

  return null;
};

router.get('/', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId;
    if (!contractId) {
      return sendError(res, 'Contrato nÃƒÂ£o encontrado', 404);
    }

    await ensureDefaultAssessmentTypesForContract(contractId);
    const types = await assessmentTypeService.listByContract(contractId);
    return sendSuccess(res, types, 'Tipos de avaliaÃƒÂ§ÃƒÂ£o carregados');
  } catch (error) {
    console.error('Erro ao listar tipos de avaliaÃƒÂ§ÃƒÂ£o:', error);
    return sendError(res, 'Erro ao listar tipos de avaliaÃƒÂ§ÃƒÂ£o', 500);
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId;
    if (!contractId) {
      return sendError(res, 'Contrato nÃƒÂ£o encontrado', 404);
    }

    const validated = createSchema.parse(req.body);
    const scheduleError = validateScheduleRules(validated);
    if (scheduleError) {
      return sendError(res, scheduleError, 400);
    }

    if (validated.afterTypeId) {
      const baseType = await prisma.assessmentType.findFirst({
        where: { id: validated.afterTypeId, contractId },
      });
      if (!baseType) {
        return sendError(res, 'Tipo base nÃƒÂ£o encontrado no contrato', 404);
      }
    }

    const created = await assessmentTypeService.create({
      contractId,
      ...validated,
    });

    return sendSuccess(res, created, 'Tipo de avaliaÃƒÂ§ÃƒÂ£o criado com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados invÃƒÂ¡lidos', 400, error.errors);
    }
    if (error?.code === 'P2002') {
      return sendError(res, 'CÃƒÂ³digo jÃƒÂ¡ estÃƒÂ¡ em uso', 400);
    }
    console.error('Erro ao criar tipo de avaliaÃƒÂ§ÃƒÂ£o:', error);
    return sendError(res, 'Erro ao criar tipo de avaliaÃƒÂ§ÃƒÂ£o', 500);
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;
    if (!contractId) {
      return sendError(res, 'Contrato nÃƒÂ£o encontrado', 404);
    }

    const validated = updateSchema.parse(req.body);
    const existing = await prisma.assessmentType.findUnique({
      where: { id, contractId },
    });

    if (!existing) {
      return sendError(res, 'Tipo de avaliaÃƒÂ§ÃƒÂ£o nÃƒÂ£o encontrado', 404);
    }

    const scheduleType = validated.scheduleType ?? existing.scheduleType;
    const intervalMonths =
      scheduleType === 'fixed_interval'
        ? validated.intervalMonths ?? existing.intervalMonths
        : null;
    const afterTypeId =
      scheduleType === 'after_type'
        ? validated.afterTypeId ?? existing.afterTypeId
        : null;
    const offsetMonths =
      scheduleType === 'after_type'
        ? validated.offsetMonths ?? existing.offsetMonths ?? 0
        : null;

    const scheduleError = validateScheduleRules({
      scheduleType,
      intervalMonths,
      afterTypeId,
      offsetMonths,
    });

    if (scheduleError) {
      return sendError(res, scheduleError, 400);
    }

    if (afterTypeId && afterTypeId === id) {
      return sendError(res, 'O tipo base nÃƒÂ£o pode ser o mesmo tipo.', 400);
    }

    if (afterTypeId) {
      const baseType = await prisma.assessmentType.findFirst({
        where: { id: afterTypeId, contractId },
      });
      if (!baseType) {
        return sendError(res, 'Tipo base nÃƒÂ£o encontrado no contrato', 404);
      }
    }

    const updated = await assessmentTypeService.update(id, contractId, {
      ...validated,
      scheduleType,
      intervalMonths,
      afterTypeId,
      offsetMonths,
    });

    return sendSuccess(res, updated, 'Tipo de avaliaÃƒÂ§ÃƒÂ£o atualizado com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados invÃƒÂ¡lidos', 400, error.errors);
    }
    if (error?.code === 'P2002') {
      return sendError(res, 'CÃƒÂ³digo jÃƒÂ¡ estÃƒÂ¡ em uso', 400);
    }
    console.error('Erro ao atualizar tipo de avaliaÃƒÂ§ÃƒÂ£o:', error);
    return sendError(res, 'Erro ao atualizar tipo de avaliaÃƒÂ§ÃƒÂ£o', 500);
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;
    if (!contractId) {
      return sendError(res, 'Contrato nÃƒÂ£o encontrado', 404);
    }

    const deleted = await assessmentTypeService.delete(id, contractId);
    return sendSuccess(res, deleted, 'Tipo de avaliaÃƒÂ§ÃƒÂ£o atualizado');
  } catch (error) {
    console.error('Erro ao excluir tipo de avaliaÃƒÂ§ÃƒÂ£o:', error);
    return sendError(res, 'Erro ao excluir tipo de avaliaÃƒÂ§ÃƒÂ£o', 500);
  }
});

export default router;

