import { Router } from 'express';
import { workoutService } from '../modules/workout/workout.service.js';

const router = Router();

// ============================================================================
// WORKOUT TEMPLATE ROUTES
// ============================================================================

// Get or create template
router.post('/templates/get-or-create', async (req, res) => {
  try {
    const template = await workoutService.getOrCreateTemplate(req.body);
    res.json(template);
  } catch (error: any) {
    console.error('Error in get-or-create template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get template by ID
router.get('/templates/:id', async (req, res) => {
  try {
    const template = await workoutService.getTemplate(req.params.id);
    res.json(template);
  } catch (error: any) {
    console.error('Error getting template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update template
router.put('/templates/:id', async (req, res) => {
  try {
    const template = await workoutService.updateTemplate(req.params.id, req.body);
    res.json(template);
  } catch (error: any) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete template
router.delete('/templates/:id', async (req, res) => {
  try {
    await workoutService.deleteTemplate(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Copy template
router.post('/templates/:id/copy', async (req, res) => {
  try {
    const template = await workoutService.copyTemplate(
      req.params.id,
      req.body.targetWeekNumber,
      req.body.targetWeekStartDate
    );
    res.json(template);
  } catch (error: any) {
    console.error('Error copying template:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// WORKOUT DAY ROUTES
// ============================================================================

// Get or create day
router.post('/days/get-or-create', async (req, res) => {
  try {
    const day = await workoutService.getOrCreateDay(req.body);
    res.json(day);
  } catch (error: any) {
    console.error('Error in get-or-create day:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get day by ID
router.get('/days/:id', async (req, res) => {
  try {
    const day = await workoutService.getDay(req.params.id);
    res.json(day);
  } catch (error: any) {
    console.error('Error getting day:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update day
router.put('/days/:id', async (req, res) => {
  try {
    const day = await workoutService.updateDay(req.params.id, req.body);
    res.json(day);
  } catch (error: any) {
    console.error('Error updating day:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete day
router.delete('/days/:id', async (req, res) => {
  try {
    await workoutService.deleteDay(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting day:', error);
    res.status(500).json({ error: error.message });
  }
});

// Copy day
router.post('/days/:id/copy', async (req, res) => {
  try {
    const day = await workoutService.copyDay(
      req.params.id,
      req.body.targetDayOfWeek,
      req.body.targetDate
    );
    res.json(day);
  } catch (error: any) {
    console.error('Error copying day:', error);
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

// Add exercise
router.post('/exercises', async (req, res) => {
  try {
    const exercise = await workoutService.addExercise(req.body);
    res.status(201).json(exercise);
  } catch (error: any) {
    console.error('Error adding exercise:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update exercise
router.put('/exercises/:id', async (req, res) => {
  try {
    const exercise = await workoutService.updateExercise(req.params.id, req.body);
    res.json(exercise);
  } catch (error: any) {
    console.error('Error updating exercise:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete exercise
router.delete('/exercises/:id', async (req, res) => {
  try {
    await workoutService.deleteExercise(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting exercise:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reorder exercises
router.put('/exercises/reorder', async (req, res) => {
  try {
    await workoutService.reorderExercises(req.body);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error reordering exercises:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
