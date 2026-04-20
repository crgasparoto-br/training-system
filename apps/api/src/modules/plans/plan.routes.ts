import { Router, Request, Response } from 'express';
import { planService } from './plan.service';
import { periodizationService } from '../periodization/periodization.service';
import { alunoService } from '../alunos/aluno.service';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware';
import { sendSuccess, sendError } from '@corrida/utils';
import { z } from 'zod';

const router: Router = Router();

// Aplicar autenticaÃ§Ã£o em todas as rotas
router.use(authMiddleware);

// Schemas de validaÃ§Ã£o
const createPlanSchema = z.object({
  alunoId: z.string().cuid(),
  name: z.string().min(3, 'Nome deve ter no mÃ­nimo 3 caracteres'),
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
  sessionType: z.enum(['easy', 'moderate', 'threshold', 'vo2max', 'anaerobic', 'recovery', 'long_run', 'strength', 'cross_training']),
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
 * Criar novo plano de treino (apenas professores)
 */
router.post('/', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const validatedData = createPlanSchema.parse(req.body);
    const professorId = (req as any).user.professorId;

    if (!professorId) {
      return sendError(res, 'Professor não encontrado', 404);
    }

    const plan = await planService.createPlan({
      ...validatedData,
      professorId,
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
 * Listar planos do professor ou aluno
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const rawAlunoId = typeof req.query.alunoId === 'string' ? req.query.alunoId.trim() : '';
    const rawProfessorId =
      typeof req.query.professorId === 'string' ? req.query.professorId.trim() : '';
    const alunoId = rawAlunoId || undefined;
    const professorId = rawProfessorId || undefined;
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const query = rawQuery || undefined;
    const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const status = rawStatus === 'active' || rawStatus === 'finished' ? rawStatus : 'all';

    let result;
    if (user.type === 'professor') {
      // Buscar professorId do banco
      const { authService } = await import('../auth/auth.service');
      const userWithProfessor = await authService.getUserById(user.userId);
      
      if (!userWithProfessor?.professor) {
        return sendError(res, 'Professor não encontrado', 404);
      }

      const isMasterAcademy =
        userWithProfessor.professor.role === 'master' &&
        userWithProfessor.professor.contract?.type === 'academy';

      if (isMasterAcademy && userWithProfessor.professor.contractId) {
        if (alunoId) {
          const belongs = await alunoService.belongsToContract(
            alunoId,
            userWithProfessor.professor.contractId
          );
          if (!belongs) {
            return sendError(res, 'Aluno não encontrado ou não pertence ao contrato', 404);
          }
        }

        result = await planService.findByContract(
          userWithProfessor.professor.contractId,
          page,
          limit,
          professorId,
          alunoId,
          status,
          query
        );
      } else {
        if (alunoId) {
          const belongs = await alunoService.belongsToProfessor(
            alunoId,
            userWithProfessor.professor.id
          );
          if (!belongs) {
            return sendError(res, 'Aluno não encontrado ou não pertence a você', 404);
          }
        }

        result = await planService.findByProfessor(
          userWithProfessor.professor.id,
          page,
          limit,
          alunoId,
          status,
          query
        );
      }
    } else {

      // Buscar alunoId do banco
      const { authService } = await import('../auth/auth.service');
      const userWithAluno = await authService.getUserById(user.userId);
      
      if (!userWithAluno?.aluno) {
        return sendError(res, 'Aluno não encontrado', 404);
      }
      
      const plans = await planService.findByAluno(userWithAluno.aluno.id, status, query);
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
router.get('/aluno/:alunoId', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { alunoId } = req.params;
    const professorId = (req as any).user.professorId;
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const query = rawQuery || undefined;
    const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const status = rawStatus === 'active' || rawStatus === 'finished' ? rawStatus : 'all';

    if (!professorId) {
      return sendError(res, 'Professor não encontrado', 404);
    }

    const belongs = await alunoService.belongsToProfessor(alunoId, professorId);
    if (!belongs) {
      return sendError(res, 'Aluno não encontrado ou não pertence a você', 404);
    }

    const plans = await planService.findByAluno(alunoId, status, query);
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
    console.error('Erro ao listar planos do aluno:', error);
    return sendError(res, 'Erro ao listar planos do aluno', 500);
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
      return sendError(res, 'Plano nÃ£o encontrado', 404);
    }

    // Calcular estatÃ­sticas
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
 * Atualizar plano (apenas professor dono)
 */
router.put('/:id', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const professorId = (req as any).user.professorId;

    if (!professorId) {
      return sendError(res, 'Professor não encontrado', 404);
    }

    // Verificar se plano pertence ao professor
    const belongs = await planService.belongsToProfessor(id, professorId);
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
 * Deletar plano (apenas professor dono)
 */
router.delete('/:id', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const professorId = (req as any).user.professorId;

    if (!professorId) {
      return sendError(res, 'Professor não encontrado', 404);
    }

    // Verificar se plano pertence ao professor
    const belongs = await planService.belongsToProfessor(id, professorId);
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
router.post('/:id/generate-weeks', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const professorId = (req as any).user.professorId;

    if (!professorId) {
      return sendError(res, 'Professor não encontrado', 404);
    }

    // Verificar se plano pertence ao professor
    const belongs = await planService.belongsToProfessor(id, professorId);
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
router.post('/macrocycles', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const validatedData = createMacrocycleSchema.parse(req.body);
    const macrocycle = await planService.createMacrocycle(validatedData);

    return sendSuccess(res, macrocycle, 'Macrociclo criado com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados invÃ¡lidos', 400, error.errors);
    }
    console.error('Erro ao criar macrociclo:', error);
    return sendError(res, 'Erro ao criar macrociclo', 500);
  }
});

/**
 * POST /api/v1/plans/mesocycles
 * Criar mesociclo
 */
router.post('/mesocycles', professorMiddleware, async (req: Request, res: Response) => {
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
      return sendError(res, 'Dados invÃ¡lidos', 400, error.errors);
    }
    console.error('Erro ao criar mesociclo:', error);
    return sendError(res, 'Erro ao criar mesociclo', 500);
  }
});

/**
 * POST /api/v1/plans/microcycles
 * Criar microciclo (sessÃ£o)
 */
router.post('/microcycles', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const validatedData = createMicrocycleSchema.parse(req.body);
    const microcycle = await planService.createMicrocycle(validatedData);

    return sendSuccess(res, microcycle, 'SessÃ£o criada com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados invÃ¡lidos', 400, error.errors);
    }
    console.error('Erro ao criar sessÃ£o:', error);
    return sendError(res, 'Erro ao criar sessÃ£o', 500);
  }
});

/**
 * PUT /api/v1/plans/microcycles/:id
 * Atualizar microciclo (sessÃ£o)
 */
router.put('/microcycles/:id', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const microcycle = await planService.updateMicrocycle(id, req.body);

    return sendSuccess(res, microcycle, 'SessÃ£o atualizada com sucesso');
  } catch (error) {
    console.error('Erro ao atualizar sessÃ£o:', error);
    return sendError(res, 'Erro ao atualizar sessÃ£o', 500);
  }
});

/**
 * DELETE /api/v1/plans/microcycles/:id
 * Deletar microciclo (sessÃ£o)
 */
router.delete('/microcycles/:id', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await planService.deleteMicrocycle(id);

    return sendSuccess(res, null, 'SessÃ£o deletada com sucesso');
  } catch (error) {
    console.error('Erro ao deletar sessÃ£o:', error);
    return sendError(res, 'Erro ao deletar sessÃ£o', 500);
  }
});

export default router;


