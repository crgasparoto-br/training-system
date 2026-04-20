import { Router, Request, Response } from 'express';
import { authMiddleware, professorMiddleware, alunoMiddleware } from '../modules/auth/auth.middleware.js';
import { authService } from '../modules/auth/auth.service.js';
import { alunoService } from '../modules/alunos/aluno.service.js';
import { workoutService } from '../modules/workout/workout.service.js';

const router: Router = Router();

router.use(authMiddleware);

const getAlunoId = async (req: Request) => {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await authService.getUserById(userId);
  return user?.aluno?.id ?? null;
};

// Get workout day by id
router.get('/workout-day/:id', alunoMiddleware, async (req: Request, res: Response) => {
  try {
    const alunoId = await getAlunoId(req);
    if (!alunoId) {
      return res.status(403).json({ error: 'Aluno não encontrado' });
    }

    const day = await workoutService.getWorkoutDay(req.params.id);

    if (!day) {
      return res.status(404).json({ error: 'Treino não encontrado' });
    }

    if (day.template?.plan?.alunoId !== alunoId) {
      return res.status(403).json({ error: 'Sem permissao para este treino' });
    }

    if (!day.template?.released) {
      return res.status(404).json({ error: 'Treino não liberado' });
    }

    return res.json(day);
  } catch (error: any) {
    console.error('Error getting workout day:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Get workout day by date
router.get('/workout-day', alunoMiddleware, async (req: Request, res: Response) => {
  try {
    const alunoId = await getAlunoId(req);
    if (!alunoId) {
      return res.status(403).json({ error: 'Aluno não encontrado' });
    }

    const { date } = req.query;
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }

    const day = await workoutService.getWorkoutDayByDate(alunoId, date);

    if (!day) {
      return res.status(404).json({ error: 'Treino não encontrado para a data' });
    }

    return res.json(day);
  } catch (error: any) {
    console.error('Error getting workout day by date:', error);
    return res.status(500).json({ error: error.message });
  }
});

// List workout days by date range
router.get('/workout-days', alunoMiddleware, async (req: Request, res: Response) => {
  try {
    const alunoId = await getAlunoId(req);
    if (!alunoId) {
      return res.status(403).json({ error: 'Aluno não encontrado' });
    }

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate || typeof startDate !== 'string' || typeof endDate !== 'string') {
      return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
    }

    const days = await workoutService.getWorkoutDaysByRange(alunoId, startDate, endDate, {
      releasedOnly: true,
    });

    return res.json(days);
  } catch (error: any) {
    console.error('Error listing workout days:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Update workout day status / PSR / PSE
router.put('/workout-day/:id/status', alunoMiddleware, async (req: Request, res: Response) => {
  try {
    const alunoId = await getAlunoId(req);
    if (!alunoId) {
      return res.status(403).json({ error: 'Aluno não encontrado' });
    }

    const day = await workoutService.getWorkoutDay(req.params.id);
    if (!day) {
      return res.status(404).json({ error: 'Treino não encontrado' });
    }

    if (day.template?.plan?.alunoId !== alunoId) {
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
router.post('/workout-exercise/:id/records', alunoMiddleware, async (req: Request, res: Response) => {
  try {
    const alunoId = await getAlunoId(req);
    if (!alunoId) {
      return res.status(403).json({ error: 'Aluno não encontrado' });
    }

    const execution = await workoutService.recordExecution({
      workoutExerciseId: req.params.id,
      alunoId,
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

// List executions by aluno and period
router.get('/aluno', alunoMiddleware, async (req: Request, res: Response) => {
  try {
    const alunoId = await getAlunoId(req);
    if (!alunoId) {
      return res.status(403).json({ error: 'Aluno não encontrado' });
    }

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate || typeof startDate !== 'string' || typeof endDate !== 'string') {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const data = await workoutService.getExecutionsByAluno(
      alunoId,
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

router.get('/professor/workout-day/:id', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const professorId = (req as any).user?.professorId as string | undefined;
    if (!professorId) {
      return res.status(403).json({ error: 'Professor não encontrado' });
    }

    const day = await workoutService.getWorkoutDay(req.params.id);
    if (!day) {
      return res.status(404).json({ error: 'Treino não encontrado' });
    }

    const alunoId = day.template?.plan?.alunoId ?? null;
    if (!alunoId) {
      return res.status(404).json({ error: 'Aluno não encontrado' });
    }

    const belongs = await alunoService.belongsToProfessor(alunoId, professorId);
    if (!belongs) {
      return res.status(403).json({ error: 'Sem permissao para este treino' });
    }

    if (!day.template?.released) {
      return res.status(404).json({ error: 'Treino não liberado' });
    }

    return res.json(day);
  } catch (error: any) {
    console.error('Error getting workout day (professor):', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get('/professor/workout-day', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const professorId = (req as any).user?.professorId as string | undefined;
    if (!professorId) {
      return res.status(403).json({ error: 'Professor não encontrado' });
    }

    const { date, alunoId } = req.query;
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }
    if (!alunoId || typeof alunoId !== 'string') {
      return res.status(400).json({ error: 'alunoId is required' });
    }

    const belongs = await alunoService.belongsToProfessor(alunoId, professorId);
    if (!belongs) {
      return res.status(403).json({ error: 'Sem permissao para este aluno' });
    }

    const day = await workoutService.getWorkoutDayByDate(alunoId, date);
    if (!day) {
      return res.status(404).json({ error: 'Treino não encontrado para a data' });
    }

    return res.json(day);
  } catch (error: any) {
    console.error('Error getting workout day by date (professor):', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get('/professor/workout-days', professorMiddleware, async (req: Request, res: Response) => {
  try {
    const professorId = (req as any).user?.professorId as string | undefined;
    if (!professorId) {
      return res.status(403).json({ error: 'Professor não encontrado' });
    }

    const { startDate, endDate, alunoId } = req.query;
    if (!startDate || !endDate || typeof startDate !== 'string' || typeof endDate !== 'string') {
      return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
    }
    if (!alunoId || typeof alunoId !== 'string') {
      return res.status(400).json({ error: 'alunoId is required' });
    }

    const belongs = await alunoService.belongsToProfessor(alunoId, professorId);
    if (!belongs) {
      return res.status(403).json({ error: 'Sem permissao para este aluno' });
    }

    const days = await workoutService.getWorkoutDaysByRange(alunoId, startDate, endDate, {
      releasedOnly: false,
    });

    return res.json(days);
  } catch (error: any) {
    console.error('Error listing workout days (professor):', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;

