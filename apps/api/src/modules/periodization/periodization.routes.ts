import { Router, Request, Response } from 'express';
import { periodizationService } from './periodization.service';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware';
import { sendSuccess, sendError } from '../../common/response';

const router: Router = Router();

// Aplicar autenticaÃ§Ã£o em todas as rotas
router.use(authMiddleware);

// ============================================================================
// MATRIZ DE PERIODIZAÃ‡ÃƒO
// ============================================================================

/**
 * POST /api/v1/periodization/matrix
 * Criar matriz de periodizaÃ§Ã£o
 */
router.post('/matrix', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { planId, totalMesocycles, weeksPerMesocycle } = req.body;

    if (!planId || !totalMesocycles || !weeksPerMesocycle) {
      return sendError(res, 'Dados invÃ¡lidos', 400);
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
      return sendError(res, 'Matriz nÃ£o encontrada', 404);
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
router.put('/matrix/:id', professorMiddleware, async (req: Request, res: Response) => {
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
router.delete('/matrix/:id', professorMiddleware, async (req: Request, res: Response) => {
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
// ESTÃMULO RESISTIDO
// ============================================================================

/**
 * POST /api/v1/periodization/resisted
 * Criar ou atualizar estÃ­mulo resistido
 */
router.post('/resisted', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data.matrixId || !data.mesocycleNumber || !data.weekNumber) {
      return sendError(res, 'Dados invÃ¡lidos', 400);
    }

    const stimulus = await periodizationService.upsertResistedStimulus(data);

    return sendSuccess(res, stimulus, 'EstÃ­mulo resistido salvo com sucesso');
  } catch (error: any) {
    console.error('Erro ao salvar estÃ­mulo resistido:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * GET /api/v1/periodization/resisted/:matrixId
 * Obter estÃ­mulos resistidos por matriz
 */
router.get('/resisted/:matrixId', async (req: Request, res: Response) => {
  try {
    const { matrixId } = req.params;

    const stimuli = await periodizationService.getResistedStimulusByMatrix(matrixId);

    return sendSuccess(res, stimuli);
  } catch (error: any) {
    console.error('Erro ao buscar estÃ­mulos resistidos:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * DELETE /api/v1/periodization/resisted/:id
 * Deletar estÃ­mulo resistido
 */
router.delete('/resisted/:id', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await periodizationService.deleteResistedStimulus(id);

    return sendSuccess(res, null, 'EstÃ­mulo resistido deletado com sucesso');
  } catch (error: any) {
    console.error('Erro ao deletar estÃ­mulo resistido:', error);
    return sendError(res, error.message, 500);
  }
});

// ============================================================================
// ESTÃMULO CÃCLICO
// ============================================================================

/**
 * POST /api/v1/periodization/cyclic
 * Criar ou atualizar estÃ­mulo cÃ­clico
 */
router.post('/cyclic', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data.matrixId || !data.mesocycleNumber || !data.weekNumber) {
      return sendError(res, 'Dados invÃ¡lidos', 400);
    }

    const stimulus = await periodizationService.upsertCyclicStimulus(data);

    return sendSuccess(res, stimulus, 'EstÃ­mulo cÃ­clico salvo com sucesso');
  } catch (error: any) {
    console.error('Erro ao salvar estÃ­mulo cÃ­clico:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * GET /api/v1/periodization/cyclic/:matrixId
 * Obter estÃ­mulos cÃ­clicos por matriz
 */
router.get('/cyclic/:matrixId', async (req: Request, res: Response) => {
  try {
    const { matrixId } = req.params;

    const stimuli = await periodizationService.getCyclicStimulusByMatrix(matrixId);

    return sendSuccess(res, stimuli);
  } catch (error: any) {
    console.error('Erro ao buscar estÃ­mulos cÃ­clicos:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * DELETE /api/v1/periodization/cyclic/:id
 * Deletar estÃ­mulo cÃ­clico
 */
router.delete('/cyclic/:id', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await periodizationService.deleteCyclicStimulus(id);

    return sendSuccess(res, null, 'EstÃ­mulo cÃ­clico deletado com sucesso');
  } catch (error: any) {
    console.error('Erro ao deletar estÃ­mulo cÃ­clico:', error);
    return sendError(res, error.message, 500);
  }
});

// ============================================================================
// NUTRIÃ‡ÃƒO
// ============================================================================

/**
 * POST /api/v1/periodization/nutrition
 * Criar ou atualizar nutriÃ§Ã£o semanal
 */
router.post('/nutrition', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data.matrixId || !data.mesocycleNumber || !data.weekNumber) {
      return sendError(res, 'Dados invÃ¡lidos', 400);
    }

    const nutrition = await periodizationService.upsertNutrition(data);

    return sendSuccess(res, nutrition, 'NutriÃ§Ã£o salva com sucesso');
  } catch (error: any) {
    console.error('Erro ao salvar nutriÃ§Ã£o:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * GET /api/v1/periodization/nutrition/:matrixId
 * Obter nutriÃ§Ã£o por matriz
 */
router.get('/nutrition/:matrixId', async (req: Request, res: Response) => {
  try {
    const { matrixId } = req.params;

    const nutrition = await periodizationService.getNutritionByMatrix(matrixId);

    return sendSuccess(res, nutrition);
  } catch (error: any) {
    console.error('Erro ao buscar nutriÃ§Ã£o:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * DELETE /api/v1/periodization/nutrition/:id
 * Deletar nutriÃ§Ã£o
 */
router.delete('/nutrition/:id', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await periodizationService.deleteNutrition(id);

    return sendSuccess(res, null, 'NutriÃ§Ã£o deletada com sucesso');
  } catch (error: any) {
    console.error('Erro ao deletar nutriÃ§Ã£o:', error);
    return sendError(res, error.message, 500);
  }
});

// ============================================================================
// PARÃ‚METROS
// ============================================================================

/**
 * POST /api/v1/periodization/parameters
 * Criar parÃ¢metro
 */
router.post('/parameters', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { category, code, description, order } = req.body;
    const contractId = (req as any).user.contractId;

    if (!category || !code || !description) {
      return sendError(res, 'Dados invÃ¡lidos', 400);
    }

    const parameter = await periodizationService.createParameter({
      contractId,
      category,
      code,
      description,
      order: order || 0,
    });

    return sendSuccess(res, parameter, 'ParÃ¢metro criado com sucesso', 201);
  } catch (error: any) {
    console.error('Erro ao criar parÃ¢metro:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * GET /api/v1/periodization/parameters
 * Obter todos os parÃ¢metros
 */
router.get('/parameters', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { category, includeInactive } = req.query;
    const includeInactiveFlag = includeInactive === 'true';
    const contractId = (req as any).user.contractId;

    let parameters;
    if (category) {
      parameters = await periodizationService.getParametersByCategory(
        contractId,
        category as string,
        includeInactiveFlag
      );
    } else {
      parameters = await periodizationService.getAllParameters(contractId, includeInactiveFlag);
    }

    return sendSuccess(res, parameters);
  } catch (error: any) {
    console.error('Erro ao buscar parÃ¢metros:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * PUT /api/v1/periodization/parameters/:id
 * Atualizar parÃ¢metro
 */
router.put('/parameters/:id', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { description, order, active } = req.body;
    const contractId = (req as any).user.contractId;

    const parameter = await periodizationService.updateParameter(contractId, id, {
      description,
      order,
      active,
    });

    return sendSuccess(res, parameter, 'ParÃ¢metro atualizado com sucesso');
  } catch (error: any) {
    console.error('Erro ao atualizar parÃ¢metro:', error);
    return sendError(res, error.message, 500);
  }
});

/**
 * PUT /api/v1/periodization/parameters/category
 * Renomear categoria de parametros
 */
router.put('/parameters/category', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { fromCategory, toCategory } = req.body;
    const contractId = (req as any).user.contractId;

    if (!fromCategory || !toCategory) {
      return sendError(res, 'Dados invalidos', 400);
    }

    const result = await periodizationService.renameParameterCategory(
      contractId,
      fromCategory,
      toCategory
    );

    return sendSuccess(
      res,
      result,
      `Categoria renomeada com sucesso. ${result.updated} parametros atualizados.`
    );
  } catch (error: any) {
    console.error('Erro ao renomear categoria:', error);
    if (error?.message?.startsWith('CONFLICT:')) {
      return sendError(res, error.message.replace('CONFLICT:', '').trim(), 409);
    }
    return sendError(res, error.message, 500);
  }
});

/**
 * DELETE /api/v1/periodization/parameters/:id
 * Deletar parÃ¢metro
 */
router.delete('/parameters/:id', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;

    await periodizationService.deleteParameter(contractId, id);

    return sendSuccess(res, null, 'ParÃ¢metro deletado com sucesso');
  } catch (error: any) {
    console.error('Erro ao deletar parÃ¢metro:', error);
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
router.post('/templates', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const data = req.body;

    const template = await periodizationService.createTemplate({
      ...data,
      professorId: user.professorId,
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
    
    const templates = await periodizationService.listTemplates(user.professorId);

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
      return sendError(res, 'Template nÃ£o encontrado', 404);
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
router.delete('/templates/:id', professorMiddleware, async (req: Request, res: Response) => {
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

