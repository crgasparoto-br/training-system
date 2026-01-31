import { Router, Request, Response } from 'express';
import { athleteService } from './athlete.service';
import { authMiddleware, educatorMiddleware } from '../auth/auth.middleware';
import { sendSuccess, sendError } from '@corrida/utils';
import { z } from 'zod';

const router = Router();

// Aplicar autenticação em todas as rotas
router.use(authMiddleware);
router.use(educatorMiddleware); // Apenas educadores podem gerenciar atletas

// Schemas de validação
const createAthleteSchema = z.object({
  userId: z.string().cuid(),
  age: z.number().int().min(10).max(100),
  weight: z.number().positive(),
  height: z.number().positive(),
  bodyFatPercentage: z.number().min(0).max(100).optional(),
  vo2Max: z.number().positive(),
  anaerobicThreshold: z.number().positive(),
  maxHeartRate: z.number().int().min(100).max(220),
  restingHeartRate: z.number().int().min(30).max(100),
});

const updateAthleteSchema = z.object({
  age: z.number().int().min(10).max(100).optional(),
  weight: z.number().positive().optional(),
  height: z.number().positive().optional(),
  bodyFatPercentage: z.number().min(0).max(100).optional(),
  vo2Max: z.number().positive().optional(),
  anaerobicThreshold: z.number().positive().optional(),
  maxHeartRate: z.number().int().min(100).max(220).optional(),
  restingHeartRate: z.number().int().min(30).max(100).optional(),
});

/**
 * POST /api/v1/athletes
 * Criar novo atleta
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const validatedData = createAthleteSchema.parse(req.body);
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    const athlete = await athleteService.create({
      ...validatedData,
      educatorId,
    });

    return sendSuccess(res, athlete, 'Atleta criado com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    console.error('Erro ao criar atleta:', error);
    return sendError(res, 'Erro ao criar atleta', 500);
  }
});

/**
 * GET /api/v1/athletes
 * Listar atletas do educador
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const educatorId = (req as any).user.educatorId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    const result = await athleteService.findByEducator(educatorId, page, limit);

    return sendSuccess(res, result, 'Atletas recuperados com sucesso');
  } catch (error) {
    console.error('Erro ao listar atletas:', error);
    return sendError(res, 'Erro ao listar atletas', 500);
  }
});

/**
 * GET /api/v1/athletes/search
 * Buscar atletas por nome
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const educatorId = (req as any).user.educatorId;
    const query = req.query.q as string;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    if (!query || query.length < 2) {
      return sendError(res, 'Query de busca deve ter no mínimo 2 caracteres', 400);
    }

    const athletes = await athleteService.search(educatorId, query);

    return sendSuccess(res, athletes, 'Busca realizada com sucesso');
  } catch (error) {
    console.error('Erro ao buscar atletas:', error);
    return sendError(res, 'Erro ao buscar atletas', 500);
  }
});

/**
 * GET /api/v1/athletes/:id
 * Obter atleta por ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    // Verificar se atleta pertence ao educador
    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta não encontrado ou não pertence a você', 404);
    }

    const athlete = await athleteService.findById(id);

    if (!athlete) {
      return sendError(res, 'Atleta não encontrado', 404);
    }

    // Calcular dados adicionais
    const bmi = athleteService.calculateBMI(athlete.weight, athlete.height);
    const hrZones = athleteService.calculateHeartRateZones(
      athlete.maxHeartRate,
      athlete.restingHeartRate
    );

    return sendSuccess(
      res,
      {
        ...athlete,
        calculated: {
          bmi,
          hrZones,
        },
      },
      'Atleta recuperado com sucesso'
    );
  } catch (error) {
    console.error('Erro ao obter atleta:', error);
    return sendError(res, 'Erro ao obter atleta', 500);
  }
});

/**
 * PUT /api/v1/athletes/:id
 * Atualizar atleta
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    // Verificar se atleta pertence ao educador
    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta não encontrado ou não pertence a você', 404);
    }

    const validatedData = updateAthleteSchema.parse(req.body);
    const athlete = await athleteService.update(id, validatedData);

    return sendSuccess(res, athlete, 'Atleta atualizado com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    console.error('Erro ao atualizar atleta:', error);
    return sendError(res, 'Erro ao atualizar atleta', 500);
  }
});

/**
 * DELETE /api/v1/athletes/:id
 * Deletar atleta
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    // Verificar se atleta pertence ao educador
    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta não encontrado ou não pertence a você', 404);
    }

    await athleteService.delete(id);

    return sendSuccess(res, null, 'Atleta deletado com sucesso');
  } catch (error) {
    console.error('Erro ao deletar atleta:', error);
    return sendError(res, 'Erro ao deletar atleta', 500);
  }
});

export default router;
