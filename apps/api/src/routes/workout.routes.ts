import { Router } from 'express';
import { workoutService } from '../modules/workout/workout.service.js';
import {
  classifyResistanceWriteError,
  sanitizeWorkoutMutation,
  ResistanceStructureValidationError,
  validateReorderEnvelope,
  validateTemplateCopyEnvelope,
  validateWorkoutWeekEnvelope,
} from '../modules/workout/resistance-structure.domain.js';
import { parseResistanceGroupBaseUpdatedAt } from '../modules/workout/resistance-groups.domain.js';
import { authMiddleware, professorMiddleware } from '../modules/auth/auth.middleware.js';
import { parseRequiredDate, sendSafeWorkoutError, workoutContractScopeMiddleware } from './workout-route-guards.js';

const router: Router = Router();

router.use(authMiddleware, professorMiddleware);
router.use(workoutContractScopeMiddleware);

// ============================================================================
// WORKOUT TEMPLATE ROUTES
// ============================================================================

// Get or create template
router.post('/templates/get-or-create', async (req, res) => {
  try {
    const weekStartDate = parseRequiredDate(req.body?.weekStartDate);
    if (!weekStartDate) {
      return res.status(400).json({ error: 'Invalid weekStartDate' });
    }

    const template = await workoutService.getOrCreateTemplate(sanitizeWorkoutMutation({
      ...req.body,
      weekStartDate,
    }, 'template', 'create'));
    res.json(template);
  } catch (error: unknown) {
    console.error('Error in get-or-create template:', error);
    const publicError = classifyResistanceWriteError(error);
    if (publicError.status === 500) {
      return res.status(500).json({
        code: 'WORKOUT_TEMPLATE_LOAD_FAILED',
        error: 'Não foi possível carregar o treino.',
      });
    }
    return res.status(publicError.status).json(publicError.body);
  }
});

// Get template by ID
router.get('/templates/:id', async (req, res) => {
  try {
    const template = await workoutService.getTemplateById(req.params.id);
    res.json(template);
  } catch (error: any) {
    console.error('Error getting template:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Update template
router.put('/templates/:id', async (req, res) => {
  try {
    const template = await workoutService.updateTemplate(req.params.id, sanitizeWorkoutMutation(req.body, 'template'));
    res.json(template);
  } catch (error: any) {
    console.error('Error updating template:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Save one complete builder week atomically. The service owns the strict
// whitelist and structure validation because this payload contains nested
// days, exercises, blocks and planned sets.
router.put('/templates/:id/save-week', async (req, res) => {
  try {
    validateWorkoutWeekEnvelope(req.body);
    const template = await workoutService.saveTemplateWeek(
      req.params.id,
      req.body,
      req.user?.contractId,
    );
    res.json(template);
  } catch (error: any) {
    console.error('Error saving workout week:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Delete template
router.delete('/templates/:id', async (req, res) => {
  try {
    await workoutService.deleteTemplate(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting template:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Release template
router.post('/templates/:id/release', async (req, res) => {
  try {
    const template = await workoutService.releaseTemplate(req.params.id);
    res.json(template);
  } catch (error: any) {
    console.error('Error releasing template:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Copy template
router.post('/templates/:id/copy', async (req, res) => {
  try {
    validateTemplateCopyEnvelope(req.body);
    const targetWeekStartDate = parseRequiredDate(req.body?.targetWeekStartDate);
    if (!targetWeekStartDate) {
      return res.status(400).json({ error: 'Invalid targetWeekStartDate' });
    }
    const targetWeekNumber = Number(req.body.targetWeekNumber);
    if (!Number.isInteger(targetWeekNumber) || targetWeekNumber <= 0) {
      return res.status(400).json({ error: 'Invalid targetWeekNumber' });
    }
    const template = await workoutService.copyTemplate(
      req.params.id,
      targetWeekNumber,
      targetWeekStartDate
    );
    res.json(template);
  } catch (error: unknown) {
    console.error('Error copying template:', error);
    const publicError = classifyResistanceWriteError(error);
    if (publicError.status === 500) {
      return res.status(500).json({ code: 'WORKOUT_COPY_FAILED', error: 'Não foi possível copiar a semana.' });
    }
    return res.status(publicError.status).json(publicError.body);
  }
});

// Copy only one modality atomically; the destination week is never left partial.
router.post('/templates/:id/copy-sections', async (req, res) => {
  try {
    validateTemplateCopyEnvelope(req.body, true);
    const targetWeekStartDate = parseRequiredDate(req.body?.targetWeekStartDate);
    const targetWeekNumber = req.body?.targetWeekNumber as number;
    const mode = req.body?.mode;
    if (!targetWeekStartDate || !Number.isInteger(targetWeekNumber) || targetWeekNumber <= 0
      || (mode !== 'cyclic' && mode !== 'resistance')) {
      throw new ResistanceStructureValidationError('Dados de cópia inválidos.');
    }
    const template = await workoutService.copyTemplateSections(
      req.params.id,
      targetWeekNumber,
      targetWeekStartDate,
      mode,
    );
    res.json(template);
  } catch (error: unknown) {
    console.error('Error copying workout sections:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// ============================================================================
// WORKOUT DAY ROUTES
// ============================================================================

// Get or create day
router.post('/days/get-or-create', async (req, res) => {
  try {
    const day = await workoutService.getOrCreateDay(sanitizeWorkoutMutation(req.body, 'day', 'create'));
    res.json(day);
  } catch (error: any) {
    console.error('Error in get-or-create day:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Get day by ID
router.get('/days/:id', async (req, res) => {
  try {
    const day = await workoutService.getDay(req.params.id);
    res.json(day);
  } catch (error: any) {
    console.error('Error getting day:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Update day
router.put('/days/:id', async (req, res) => {
  try {
    const day = await workoutService.updateDay(req.params.id, sanitizeWorkoutMutation(req.body, 'day'));
    res.json(day);
  } catch (error: any) {
    console.error('Error updating day:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Delete day
router.delete('/days/:id', async (req, res) => {
  try {
    await workoutService.deleteDay(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting day:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Copy day
router.post('/days/:id/copy', async (req, res) => {
  try {
    const targetDayOfWeek = Number(req.body?.targetDayOfWeek);
    const targetDate = parseRequiredDate(req.body?.targetDate);
    if (!Number.isInteger(targetDayOfWeek) || targetDayOfWeek < 1 || targetDayOfWeek > 7 || !targetDate) {
      return res.status(400).json({ code: 'INVALID_RESISTANCE_STRUCTURE', error: 'Dados de cópia inválidos.' });
    }
    const day = await workoutService.copyDay(req.params.id, targetDayOfWeek, targetDate);
    res.json(day);
  } catch (error: any) {
    console.error('Error copying day:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Replace all resistance exercises in a canonical WorkoutDay atomically.
router.put('/days/:id/resistance-exercises', async (req, res) => {
  try {
    const contractId = req.user?.contractId;
    if (!contractId) {
      return res.status(403).json({ error: 'Acesso negado.', code: 'FORBIDDEN' });
    }
    if (!Array.isArray(req.body?.exercises)) throw new ResistanceStructureValidationError('Lista de exercícios inválida.');
    const safe = (req.body.exercises as unknown[]).map((x) => sanitizeWorkoutMutation(x, 'exercise', 'create')) as Parameters<typeof workoutService.replaceDayResistanceExercises>[1];
    const exercises = await workoutService.replaceDayResistanceExercises(req.params.id, safe, contractId);
    res.json(exercises);
  } catch (error: any) {
    console.error('Error replacing resistance exercises:', error);
    const response = classifyResistanceWriteError(error);
    res.status(response.status).json(response.body);
  }
});

// Group arrangements reference existing workout exercises; they do not create new ones.
router.put('/days/:id/resistance-groups', async (req, res) => {
  try {
    if (!req.user?.contractId) return res.status(403).json({ code: 'FORBIDDEN', error: 'Acesso negado.' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || Object.keys(req.body).length !== 2
      || !Object.prototype.hasOwnProperty.call(req.body, 'groups')
      || !Object.prototype.hasOwnProperty.call(req.body, 'baseUpdatedAt')) {
      throw new ResistanceStructureValidationError('Informe apenas a lista de agrupamentos.');
    }
    parseResistanceGroupBaseUpdatedAt(req.body.baseUpdatedAt);
    const groups = await workoutService.replaceDayResistanceGroups(
      req.params.id, req.body.groups, req.user.contractId, req.body.baseUpdatedAt,
    );
    res.json(groups);
  } catch (error: unknown) {
    console.error('Error replacing resistance groups:', error);
    const mapped = classifyResistanceWriteError(error);
    if (mapped.status === 400) {
      return res.status(400).json({ code: mapped.body.code, error: 'Revise o tipo, a ordem e os participantes do agrupamento.' });
    }
    return sendSafeWorkoutError(res, error);
  }
});

// ============================================================================
// CYCLIC STAGES: canonical WorkoutDay child, never a parallel training tree
// ============================================================================
router.put('/days/:id/cyclic-stages', async (req, res) => {
  try {
    if (!req.user?.contractId) return res.status(403).json({ code: 'FORBIDDEN', error: 'Acesso negado.' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || Object.keys(req.body).length !== 1 || !Object.prototype.hasOwnProperty.call(req.body, 'stages')) {
      throw new ResistanceStructureValidationError('Informe apenas a lista de etapas cíclicas.');
    }
    const result = await workoutService.replaceDayCyclicStages(req.params.id, req.body.stages, req.user.contractId);
    res.json(result);
  } catch (error: unknown) {
    console.error('Error replacing cyclic stages:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// ============================================================================
// WORKOUT EXERCISE ROUTES
// ============================================================================

// List exercises by workout day
router.get('/exercises', async (req, res) => {
  try {
    const { workoutDayId } = req.query;
    if (!workoutDayId || typeof workoutDayId !== 'string') {
      return res.status(400).json({ error: 'workoutDayId is required' });
    }
    const exercises = await workoutService.getExercises(workoutDayId);
    res.json(exercises);
  } catch (error: any) {
    console.error('Error getting exercises:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Add exercise
router.post('/exercises', async (req, res) => {
  try {
    const exercise = await workoutService.addExercise(sanitizeWorkoutMutation(req.body, 'exercise', 'create'), req.user!.contractId);
    res.status(201).json(exercise);
  } catch (error: any) {
    console.error('Error adding exercise:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Reorder exercises
router.put('/exercises/reorder', async (req, res) => {
  try {
    validateReorderEnvelope(req.body);
    const { workoutDayId, section, exerciseIds } = req.body as {
      workoutDayId: string;
      section: string;
      exerciseIds: string[];
    };
    await workoutService.reorderExercises(workoutDayId, section, exerciseIds, req.user!.contractId);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error reordering exercises:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Update exercise
router.put('/exercises/:id', async (req, res) => {
  try {
    const exercise = await workoutService.updateExercise(req.params.id, sanitizeWorkoutMutation(req.body, 'exercise'), req.user!.contractId);
    res.json(exercise);
  } catch (error: any) {
    console.error('Error updating exercise:', error);
    return sendSafeWorkoutError(res, error);
  }
});

// Delete exercise
router.delete('/exercises/:id', async (req, res) => {
  try {
    await workoutService.deleteExercise(req.params.id, req.user!.contractId);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting exercise:', error);
    return sendSafeWorkoutError(res, error);
  }
});


export default router;
