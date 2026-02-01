import { Router, Request, Response } from 'express';
import { periodizationService } from './periodization.service';
import { authMiddleware, educatorMiddleware } from '../auth/auth.middleware';
import { sendSuccess, sendError } from '../../common/response';

const router = Router();

// Aplicar autenticação em todas as rotas
router.use(authMiddleware);

// ============================================================================
// MATRIZ DE PERIODIZAÇÃO
// ============================================================================

/**
 * POST /api/v1/periodization/matrix
 * Criar matriz de periodização
 */
router.post('/matrix', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { planId, totalMesocycles, weeksPerMesocycle } = req.body;

    if (!planId || !totalMesocycles || !weeksPerMesocycle) {
      return sendError(res, 'Dados inválidos', 400);
    }

    const matrix = await periodizationService.createMatrix({
      planId,
      totalMesocycles,
      weeksPerMesocycle,
    });

    return sendSuccess(res, matrix, 'Matriz criada com sucesso', 201);
  } catch (error: any) {
    console.error('Erro ao criar matriz:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * GET /api/v1/periodization/matrix/:planId
 * Obter matriz por planId
 */
router.get('/matrix/:planId', async (req: Request, res: Response) => {
  try {
    const { planId } = req.params;

    const matrix = await periodizationService.getByPlanId(planId);

    if (!matrix) {
      return sendError(res, 'Matriz não encontrada', 404);
    }

    return sendSuccess(res, matrix);
  } catch (error: any) {
    console.error('Erro ao buscar matriz:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * PUT /api/v1/periodization/matrix/:id
 * Atualizar matriz
 */
router.put('/matrix/:id', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { totalMesocycles, weeksPerMesocycle } = req.body;

    const matrix = await periodizationService.updateMatrix(id, {
      totalMesocycles,
      weeksPerMesocycle,
    });

    return sendSuccess(res, matrix, 'Matriz atualizada com sucesso');
  } catch (error: any) {
    console.error('Erro ao atualizar matriz:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * DELETE /api/v1/periodization/matrix/:id
 * Deletar matriz
 */
router.delete('/matrix/:id', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await periodizationService.deleteMatrix(id);

    return sendSuccess(res, null, 'Matriz deletada com sucesso');
  } catch (error: any) {
    console.error('Erro ao deletar matriz:', error);
    return sendError(res, error.message, 500);
  }
});

// ============================================================================
// ESTÍMULO RESISTIDO
// ============================================================================

/**
 * POST /api/v1/periodization/resisted
 * Criar ou atualizar estímulo resistido
 */
router.post('/resisted', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data.matrixId || !data.mesocycleNumber || !data.weekNumber) {
      return sendError(res, 'Dados inválidos', 400);
    }

    const stimulus = await periodizationService.upsertResistedStimulus(data);

    return sendSuccess(res, stimulus, 'Estímulo resistido salvo com sucesso');
  } catch (error: any) {
    console.error('Erro ao salvar estímulo resistido:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * GET /api/v1/periodization/resisted/:matrixId
 * Obter estímulos resistidos por matriz
 */
router.get('/resisted/:matrixId', async (req: Request, res: Response) => {
  try {
    const { matrixId } = req.params;

    const stimuli = await periodizationService.getResistedStimulusByMatrix(matrixId);

    return sendSuccess(res, stimuli);
  } catch (error: any) {
    console.error('Erro ao buscar estímulos resistidos:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * DELETE /api/v1/periodization/resisted/:id
 * Deletar estímulo resistido
 */
router.delete('/resisted/:id', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await periodizationService.deleteResistedStimulus(id);

    return sendSuccess(res, null, 'Estímulo resistido deletado com sucesso');
  } catch (error: any) {
    console.error('Erro ao deletar estímulo resistido:', error);
    return sendError(res, error.message, 500);
  }
});

// ============================================================================
// ESTÍMULO CÍCLICO
// ============================================================================

/**
 * POST /api/v1/periodization/cyclic
 * Criar ou atualizar estímulo cíclico
 */
router.post('/cyclic', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data.matrixId || !data.mesocycleNumber || !data.weekNumber) {
      return sendError(res, 'Dados inválidos', 400);
    }

    const stimulus = await periodizationService.upsertCyclicStimulus(data);

    return sendSuccess(res, stimulus, 'Estímulo cíclico salvo com sucesso');
  } catch (error: any) {
    console.error('Erro ao salvar estímulo cíclico:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * GET /api/v1/periodization/cyclic/:matrixId
 * Obter estímulos cíclicos por matriz
 */
router.get('/cyclic/:matrixId', async (req: Request, res: Response) => {
  try {
    const { matrixId } = req.params;

    const stimuli = await periodizationService.getCyclicStimulusByMatrix(matrixId);

    return sendSuccess(res, stimuli);
  } catch (error: any) {
    console.error('Erro ao buscar estímulos cíclicos:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * DELETE /api/v1/periodization/cyclic/:id
 * Deletar estímulo cíclico
 */
router.delete('/cyclic/:id', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await periodizationService.deleteCyclicStimulus(id);

    return sendSuccess(res, null, 'Estímulo cíclico deletado com sucesso');
  } catch (error: any) {
    console.error('Erro ao deletar estímulo cíclico:', error);
    return sendError(res, error.message, 500);
  }
});

// ============================================================================
// NUTRIÇÃO
// ============================================================================

/**
 * POST /api/v1/periodization/nutrition
 * Criar ou atualizar nutrição semanal
 */
router.post('/nutrition', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data.matrixId || !data.mesocycleNumber || !data.weekNumber) {
      return sendError(res, 'Dados inválidos', 400);
    }

    const nutrition = await periodizationService.upsertNutrition(data);

    return sendSuccess(res, nutrition, 'Nutrição salva com sucesso');
  } catch (error: any) {
    console.error('Erro ao salvar nutrição:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * GET /api/v1/periodization/nutrition/:matrixId
 * Obter nutrição por matriz
 */
router.get('/nutrition/:matrixId', async (req: Request, res: Response) => {
  try {
    const { matrixId } = req.params;

    const nutrition = await periodizationService.getNutritionByMatrix(matrixId);

    return sendSuccess(res, nutrition);
  } catch (error: any) {
    console.error('Erro ao buscar nutrição:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * DELETE /api/v1/periodization/nutrition/:id
 * Deletar nutrição
 */
router.delete('/nutrition/:id', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await periodizationService.deleteNutrition(id);

    return sendSuccess(res, null, 'Nutrição deletada com sucesso');
  } catch (error: any) {
    console.error('Erro ao deletar nutrição:', error);
    return sendError(res, error.message, 500);
  }
});

// ============================================================================
// PARÂMETROS
// ============================================================================

/**
 * POST /api/v1/periodization/parameters
 * Criar parâmetro
 */
router.post('/parameters', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { category, code, description, order } = req.body;

    if (!category || !code || !description) {
      return sendError(res, 'Dados inválidos', 400);
    }

    const parameter = await periodizationService.createParameter({
      category,
      code,
      description,
      order: order || 0,
    });

    return sendSuccess(res, parameter, 'Parâmetro criado com sucesso', 201);
  } catch (error: any) {
    console.error('Erro ao criar parâmetro:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * GET /api/v1/periodization/parameters
 * Obter todos os parâmetros
 */
router.get('/parameters', async (req: Request, res: Response) => {
  try {
    const { category } = req.query;

    let parameters;
    if (category) {
      parameters = await periodizationService.getParametersByCategory(category as string);
    } else {
      parameters = await periodizationService.getAllParameters();
    }

    return sendSuccess(res, parameters);
  } catch (error: any) {
    console.error('Erro ao buscar parâmetros:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * PUT /api/v1/periodization/parameters/:id
 * Atualizar parâmetro
 */
router.put('/parameters/:id', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { description, order, active } = req.body;

    const parameter = await periodizationService.updateParameter(id, {
      description,
      order,
      active,
    });

    return sendSuccess(res, parameter, 'Parâmetro atualizado com sucesso');
  } catch (error: any) {
    console.error('Erro ao atualizar parâmetro:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * DELETE /api/v1/periodization/parameters/:id
 * Deletar parâmetro
 */
router.delete('/parameters/:id', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await periodizationService.deleteParameter(id);

    return sendSuccess(res, null, 'Parâmetro deletado com sucesso');
  } catch (error: any) {
    console.error('Erro ao deletar parâmetro:', error);
    return sendError(res, error.message, 500);
  }
});

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * POST /api/v1/periodization/templates
 * Criar template
 */
router.post('/templates', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const data = req.body;

    const template = await periodizationService.createTemplate({
      ...data,
      educatorId: user.educatorId,
    });

    return sendSuccess(res, template, 'Template criado com sucesso', 201);
  } catch (error: any) {
    console.error('Erro ao criar template:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * GET /api/v1/periodization/templates
 * Listar templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    const templates = await periodizationService.listTemplates(user.educatorId);

    return sendSuccess(res, templates);
  } catch (error: any) {
    console.error('Erro ao listar templates:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * GET /api/v1/periodization/templates/:id
 * Obter template por ID
 */
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const template = await periodizationService.getTemplateById(id);

    if (!template) {
      return sendError(res, 'Template não encontrado', 404);
    }

    return sendSuccess(res, template);
  } catch (error: any) {
    console.error('Erro ao buscar template:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * POST /api/v1/periodization/templates/:id/use
 * Incrementar uso do template
 */
router.post('/templates/:id/use', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const template = await periodizationService.incrementTemplateUsage(id);

    return sendSuccess(res, template);
  } catch (error: any) {
    console.error('Erro ao incrementar uso:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * DELETE /api/v1/periodization/templates/:id
 * Deletar template
 */
router.delete('/templates/:id', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await periodizationService.deleteTemplate(id);

    return sendSuccess(res, null, 'Template deletado com sucesso');
  } catch (error: any) {
    console.error('Erro ao deletar template:', error);
    return sendError(res, error.message, 500);
  }
});

export default router;
