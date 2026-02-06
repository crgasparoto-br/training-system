import { Router, Request, Response } from 'express';
import { planService } from './plan.service';
import { periodizationService } from '../periodization/periodization.service';
import { athleteService } from '../athletes/athlete.service';
import { authMiddleware, educatorMiddleware } from '../auth/auth.middleware';
import { sendSuccess, sendError } from '@corrida/utils';
import { z } from 'zod';

const router = Router();

// Aplicar autenticação em todas as rotas
router.use(authMiddleware);

// Schemas de validação
const createPlanSchema = z.object({
  athleteId: z.string().cuid(),
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  description: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const createMacrocycleSchema = z.object({
  planId: z.string().cuid(),
  name: z.string().min(3),
  phase: z.enum(['base', 'build', 'peak', 'recovery', 'taper']),
  weekStart: z.number().int().positive(),
  weekEnd: z.number().int().positive(),
  focusAreas: z.array(z.string()),
});

const createMesocycleSchema = z.object({
  macrocycleId: z.string().cuid(),
  weekNumber: z.number().int().positive(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  focus: z.string().optional(),
  volumeTarget: z.number().positive().optional(),
});

const createMicrocycleSchema = z.object({
  mesocycleId: z.string().cuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  sessionType: z.enum(['easy_run', 'tempo_run', 'interval', 'long_run', 'recovery', 'strength', 'rest']),
  durationMinutes: z.number().int().positive(),
  distanceKm: z.number().positive().optional(),
  intensityPercentage: z.number().min(0).max(100),
  paceMinPerKm: z.number().positive().optional(),
  heartRateZone: z.number().int().min(1).max(5).optional(),
  instructions: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/v1/plans
 * Criar novo plano de treino (apenas educadores)
 */
router.post('/', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const validatedData = createPlanSchema.parse(req.body);
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    const plan = await planService.createPlan({
      ...validatedData,
      educatorId,
      startDate: new Date(validatedData.startDate),
      endDate: new Date(validatedData.endDate),
    });

    return sendSuccess(res, plan, 'Plano criado com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    console.error('Erro ao criar plano:', error);
    return sendError(res, 'Erro ao criar plano', 500);
  }
});

/**
 * GET /api/v1/plans
 * Listar planos do educador ou atleta
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const rawAthleteId = typeof req.query.athleteId === 'string' ? req.query.athleteId.trim() : '';
    const rawEducatorId =
      typeof req.query.educatorId === 'string' ? req.query.educatorId.trim() : '';
    const athleteId = rawAthleteId || undefined;
    const educatorId = rawEducatorId || undefined;
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const query = rawQuery || undefined;
    const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const status = rawStatus === 'active' || rawStatus === 'finished' ? rawStatus : 'all';

    let result;
    if (user.type === 'educator') {
      // Buscar educatorId do banco
      const { authService } = await import('../auth/auth.service');
      const userWithEducator = await authService.getUserById(user.userId);
      
      if (!userWithEducator?.educator) {
        return sendError(res, 'Educador nao encontrado', 404);
      }

      const isMasterAcademy =
        userWithEducator.educator.role === 'master' &&
        userWithEducator.educator.contract?.type === 'academy';

      if (isMasterAcademy && userWithEducator.educator.contractId) {
        if (athleteId) {
          const belongs = await athleteService.belongsToContract(
            athleteId,
            userWithEducator.educator.contractId
          );
          if (!belongs) {
            return sendError(res, 'Atleta nao encontrado ou nao pertence ao contrato', 404);
          }
        }

        result = await planService.findByContract(
          userWithEducator.educator.contractId,
          page,
          limit,
          educatorId,
          athleteId,
          status,
          query
        );
      } else {
        if (athleteId) {
          const belongs = await athleteService.belongsToEducator(
            athleteId,
            userWithEducator.educator.id
          );
          if (!belongs) {
            return sendError(res, 'Atleta nao encontrado ou nao pertence a voce', 404);
          }
        }

        result = await planService.findByEducator(
          userWithEducator.educator.id,
          page,
          limit,
          athleteId,
          status,
          query
        );
      }
    } else {

      // Buscar athleteId do banco
      const { authService } = await import('../auth/auth.service');
      const userWithAthlete = await authService.getUserById(user.userId);
      
      if (!userWithAthlete?.athlete) {
        return sendError(res, 'Atleta não encontrado', 404);
      }
      
      const plans = await planService.findByAthlete(userWithAthlete.athlete.id, status, query);
      result = { plans, pagination: { page: 1, limit: plans.length, total: plans.length, totalPages: 1 } };
    }

    return sendSuccess(res, result, 'Planos recuperados com sucesso');
  } catch (error) {
    console.error('Erro ao listar planos:', error);
    return sendError(res, 'Erro ao listar planos', 500);
  }
});

/**
 * GET /api/v1/plans/:id
 * Obter plano por ID
 */
router.get('/athlete/:athleteId', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { athleteId } = req.params;
    const educatorId = (req as any).user.educatorId;
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const query = rawQuery || undefined;
    const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const status = rawStatus === 'active' || rawStatus === 'finished' ? rawStatus : 'all';

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    const belongs = await athleteService.belongsToEducator(athleteId, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta não encontrado ou não pertence a você', 404);
    }

    const plans = await planService.findByAthlete(athleteId, status, query);
    const result = {
      plans,
      pagination: {
        page: 1,
        limit: plans.length,
        total: plans.length,
        totalPages: 1,
      },
    };

    return sendSuccess(res, result, 'Planos recuperados com sucesso');
  } catch (error) {
    console.error('Erro ao listar planos do atleta:', error);
    return sendError(res, 'Erro ao listar planos do atleta', 500);
  }
});

/**
 * GET /api/v1/plans/:id
 * Obter plano por ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const plan = await planService.findById(id);

    if (!plan) {
      return sendError(res, 'Plano não encontrado', 404);
    }

    // Calcular estatísticas
    const stats = await planService.getPlanStats(id);

    return sendSuccess(
      res,
      {
        ...plan,
        stats,
      },
      'Plano recuperado com sucesso'
    );
  } catch (error) {
    console.error('Erro ao obter plano:', error);
    return sendError(res, 'Erro ao obter plano', 500);
  }
});

/**
 * PUT /api/v1/plans/:id
 * Atualizar plano (apenas educador dono)
 */
router.put('/:id', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    // Verificar se plano pertence ao educador
    const belongs = await planService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Plano não encontrado ou não pertence a você', 404);
    }

    const existingPlan = await planService.findById(id);
    if (!existingPlan) {
      return sendError(res, 'Plano não encontrado', 404);
    }

    const plan = await planService.updatePlan(id, req.body);

    const incomingStartDate = req.body?.startDate
      ? new Date(req.body.startDate)
      : existingPlan.startDate;
    const incomingEndDate = req.body?.endDate
      ? new Date(req.body.endDate)
      : existingPlan.endDate;

    const startChanged = incomingStartDate.getTime() !== existingPlan.startDate.getTime();
    const endChanged = incomingEndDate.getTime() !== existingPlan.endDate.getTime();

    if (startChanged || endChanged) {
      await planService.generateWeeks(id, incomingStartDate, incomingEndDate);

      const diffTime = Math.abs(incomingEndDate.getTime() - incomingStartDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const totalWeeks = Math.max(1, Math.ceil(diffDays / 7));
      const weeksPerMesocycle = 4;
      const totalMesocycles = Math.max(1, Math.ceil(totalWeeks / weeksPerMesocycle));

      const matrix = await periodizationService.getByPlanId(id);
      if (matrix && matrix.totalMesocycles !== totalMesocycles) {
        await periodizationService.updateMatrix(matrix.id, {
          totalMesocycles,
          weeksPerMesocycle,
        });
      }
    }

    return sendSuccess(res, plan, 'Plano atualizado com sucesso');
  } catch (error) {
    console.error('Erro ao atualizar plano:', error);
    return sendError(res, 'Erro ao atualizar plano', 500);
  }
});

/**
 * DELETE /api/v1/plans/:id
 * Deletar plano (apenas educador dono)
 */
router.delete('/:id', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    // Verificar se plano pertence ao educador
    const belongs = await planService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Plano não encontrado ou não pertence a você', 404);
    }

    await planService.deletePlan(id);

    return sendSuccess(res, null, 'Plano deletado com sucesso');
  } catch (error) {
    console.error('Erro ao deletar plano:', error);
    return sendError(res, 'Erro ao deletar plano', 500);
  }
});

/**
 * POST /api/v1/plans/:id/generate-weeks
 * Gerar semanas automaticamente para um plano
 */
router.post('/:id/generate-weeks', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    // Verificar se plano pertence ao educador
    const belongs = await planService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Plano não encontrado ou não pertence a você', 404);
    }

    const plan = await planService.findById(id);
    if (!plan) {
      return sendError(res, 'Plano não encontrado', 404);
    }

    const result = await planService.generateWeeks(id, plan.startDate, plan.endDate);

    return sendSuccess(res, result, 'Semanas geradas com sucesso');
  } catch (error) {
    console.error('Erro ao gerar semanas:', error);
    return sendError(res, 'Erro ao gerar semanas', 500);
  }
});

/**
 * POST /api/v1/plans/macrocycles
 * Criar macrociclo
 */
router.post('/macrocycles', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const validatedData = createMacrocycleSchema.parse(req.body);
    const macrocycle = await planService.createMacrocycle(validatedData);

    return sendSuccess(res, macrocycle, 'Macrociclo criado com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    console.error('Erro ao criar macrociclo:', error);
    return sendError(res, 'Erro ao criar macrociclo', 500);
  }
});

/**
 * POST /api/v1/plans/mesocycles
 * Criar mesociclo
 */
router.post('/mesocycles', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const validatedData = createMesocycleSchema.parse(req.body);
    const mesocycle = await planService.createMesocycle({
      ...validatedData,
      startDate: new Date(validatedData.startDate),
      endDate: new Date(validatedData.endDate),
    });

    return sendSuccess(res, mesocycle, 'Mesociclo criado com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    console.error('Erro ao criar mesociclo:', error);
    return sendError(res, 'Erro ao criar mesociclo', 500);
  }
});

/**
 * POST /api/v1/plans/microcycles
 * Criar microciclo (sessão)
 */
router.post('/microcycles', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const validatedData = createMicrocycleSchema.parse(req.body);
    const microcycle = await planService.createMicrocycle(validatedData);

    return sendSuccess(res, microcycle, 'Sessão criada com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    console.error('Erro ao criar sessão:', error);
    return sendError(res, 'Erro ao criar sessão', 500);
  }
});

/**
 * PUT /api/v1/plans/microcycles/:id
 * Atualizar microciclo (sessão)
 */
router.put('/microcycles/:id', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const microcycle = await planService.updateMicrocycle(id, req.body);

    return sendSuccess(res, microcycle, 'Sessão atualizada com sucesso');
  } catch (error) {
    console.error('Erro ao atualizar sessão:', error);
    return sendError(res, 'Erro ao atualizar sessão', 500);
  }
});

/**
 * DELETE /api/v1/plans/microcycles/:id
 * Deletar microciclo (sessão)
 */
router.delete('/microcycles/:id', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await planService.deleteMicrocycle(id);

    return sendSuccess(res, null, 'Sessão deletada com sucesso');
  } catch (error) {
    console.error('Erro ao deletar sessão:', error);
    return sendError(res, 'Erro ao deletar sessão', 500);
  }
});

export default router;

