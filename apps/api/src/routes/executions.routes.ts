import { Router, Request, Response } from 'express';
import { authMiddleware, educatorMiddleware, studentMiddleware } from '../modules/auth/auth.middleware.js';
import { authService } from '../modules/auth/auth.service.js';
import { athleteService } from '../modules/athletes/athlete.service.js';
import { workoutService } from '../modules/workout/workout.service.js';

const router = Router();

router.use(authMiddleware);

const getAthleteId = async (req: Request) => {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await authService.getUserById(userId);
  return user?.athlete?.id ?? null;
};

// Get workout day by id
router.get('/workout-day/:id', studentMiddleware, async (req: Request, res: Response) => {
  try {
    const athleteId = await getAthleteId(req);
    if (!athleteId) {
      return res.status(403).json({ error: 'Atleta nao encontrado' });
    }

    const day = await workoutService.getWorkoutDay(req.params.id);

    if (!day) {
      return res.status(404).json({ error: 'Treino nao encontrado' });
    }

    if (day.template?.plan?.athleteId !== athleteId) {
      return res.status(403).json({ error: 'Sem permissao para este treino' });
    }

    if (!day.template?.released) {
      return res.status(404).json({ error: 'Treino nao liberado' });
    }

    return res.json(day);
  } catch (error: any) {
    console.error('Error getting workout day:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Get workout day by date
router.get('/workout-day', studentMiddleware, async (req: Request, res: Response) => {
  try {
    const athleteId = await getAthleteId(req);
    if (!athleteId) {
      return res.status(403).json({ error: 'Atleta nao encontrado' });
    }

    const { date } = req.query;
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }

    const day = await workoutService.getWorkoutDayByDate(athleteId, date);

    if (!day) {
      return res.status(404).json({ error: 'Treino nao encontrado para a data' });
    }

    return res.json(day);
  } catch (error: any) {
    console.error('Error getting workout day by date:', error);
    return res.status(500).json({ error: error.message });
  }
});

// List workout days by date range
router.get('/workout-days', studentMiddleware, async (req: Request, res: Response) => {
  try {
    const athleteId = await getAthleteId(req);
    if (!athleteId) {
      return res.status(403).json({ error: 'Atleta nao encontrado' });
    }

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate || typeof startDate !== 'string' || typeof endDate !== 'string') {
      return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
    }

    const days = await workoutService.getWorkoutDaysByRange(athleteId, startDate, endDate, {
      releasedOnly: true,
    });

    return res.json(days);
  } catch (error: any) {
    console.error('Error listing workout days:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Update workout day status / PSR / PSE
router.put('/workout-day/:id/status', studentMiddleware, async (req: Request, res: Response) => {
  try {
    const athleteId = await getAthleteId(req);
    if (!athleteId) {
      return res.status(403).json({ error: 'Atleta nao encontrado' });
    }

    const day = await workoutService.getWorkoutDay(req.params.id);
    if (!day) {
      return res.status(404).json({ error: 'Treino nao encontrado' });
    }

    if (day.template?.plan?.athleteId !== athleteId) {
      return res.status(403).json({ error: 'Sem permissao para este treino' });
    }

    const updated = await workoutService.updateWorkoutDayStatus(req.params.id, {
      status: req.body.status,
      psrResponse: req.body.psrResponse ?? null,
      pseResponse: req.body.pseResponse ?? null,
    });

    return res.json(updated);
  } catch (error: any) {
    console.error('Error updating workout day status:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Record execution by set
router.post('/workout-exercise/:id/records', studentMiddleware, async (req: Request, res: Response) => {
  try {
    const athleteId = await getAthleteId(req);
    if (!athleteId) {
      return res.status(403).json({ error: 'Atleta nao encontrado' });
    }

    const execution = await workoutService.recordExecution({
      workoutExerciseId: req.params.id,
      athleteId,
      executionDate: new Date(),
      setNumber: req.body.setNumber ?? null,
      setsCompleted: req.body.setsCompleted ?? null,
      repsCompleted: req.body.repsCompleted ?? null,
      loadUsed: req.body.loadUsed ?? null,
      difficultyRating: req.body.difficultyRating ?? null,
      repsInReserve: req.body.repsInReserve ?? null,
      notes: req.body.notes ?? null,
    });

    return res.status(201).json(execution);
  } catch (error: any) {
    console.error('Error recording execution:', error);
    return res.status(500).json({ error: error.message });
  }
});

// List executions by athlete and period
router.get('/athlete', studentMiddleware, async (req: Request, res: Response) => {
  try {
    const athleteId = await getAthleteId(req);
    if (!athleteId) {
      return res.status(403).json({ error: 'Atleta nao encontrado' });
    }

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate || typeof startDate !== 'string' || typeof endDate !== 'string') {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const data = await workoutService.getExecutionsByAthlete(
      athleteId,
      new Date(`${startDate}T00:00:00`),
      new Date(`${endDate}T23:59:59`)
    );

    return res.json(data);
  } catch (error: any) {
    console.error('Error listing executions:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// EDUCATOR READ-ONLY ROUTES
// ============================================================================

router.get('/educator/workout-day/:id', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const educatorId = (req as any).user?.educatorId as string | undefined;
    if (!educatorId) {
      return res.status(403).json({ error: 'Educador nao encontrado' });
    }

    const day = await workoutService.getWorkoutDay(req.params.id);
    if (!day) {
      return res.status(404).json({ error: 'Treino nao encontrado' });
    }

    const athleteId = day.template?.plan?.athleteId ?? null;
    if (!athleteId) {
      return res.status(404).json({ error: 'Atleta nao encontrado' });
    }

    const belongs = await athleteService.belongsToEducator(athleteId, educatorId);
    if (!belongs) {
      return res.status(403).json({ error: 'Sem permissao para este treino' });
    }

    if (!day.template?.released) {
      return res.status(404).json({ error: 'Treino nao liberado' });
    }

    return res.json(day);
  } catch (error: any) {
    console.error('Error getting workout day (educator):', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get('/educator/workout-day', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const educatorId = (req as any).user?.educatorId as string | undefined;
    if (!educatorId) {
      return res.status(403).json({ error: 'Educador nao encontrado' });
    }

    const { date, athleteId } = req.query;
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }
    if (!athleteId || typeof athleteId !== 'string') {
      return res.status(400).json({ error: 'athleteId is required' });
    }

    const belongs = await athleteService.belongsToEducator(athleteId, educatorId);
    if (!belongs) {
      return res.status(403).json({ error: 'Sem permissao para este atleta' });
    }

    const day = await workoutService.getWorkoutDayByDate(athleteId, date);
    if (!day) {
      return res.status(404).json({ error: 'Treino nao encontrado para a data' });
    }

    return res.json(day);
  } catch (error: any) {
    console.error('Error getting workout day by date (educator):', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get('/educator/workout-days', educatorMiddleware, async (req: Request, res: Response) => {
  try {
    const educatorId = (req as any).user?.educatorId as string | undefined;
    if (!educatorId) {
      return res.status(403).json({ error: 'Educador nao encontrado' });
    }

    const { startDate, endDate, athleteId } = req.query;
    if (!startDate || !endDate || typeof startDate !== 'string' || typeof endDate !== 'string') {
      return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
    }
    if (!athleteId || typeof athleteId !== 'string') {
      return res.status(400).json({ error: 'athleteId is required' });
    }

    const belongs = await athleteService.belongsToEducator(athleteId, educatorId);
    if (!belongs) {
      return res.status(403).json({ error: 'Sem permissao para este atleta' });
    }

    const days = await workoutService.getWorkoutDaysByRange(athleteId, startDate, endDate, {
      releasedOnly: false,
    });

    return res.json(days);
  } catch (error: any) {
    console.error('Error listing workout days (educator):', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
