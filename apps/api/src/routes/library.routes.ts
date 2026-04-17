import { Router } from 'express';
import { libraryService } from '../modules/library/library.service';
import { authMiddleware, professorMiddleware } from '../modules/auth/auth.middleware';

const router: Router = Router();

router.use(authMiddleware);
router.use(professorMiddleware);

/**
 * GET /api/library/exercises
 * Listar exercÃ­cios com filtros
 */
router.get('/exercises', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    const filters = {
      search: req.query.search as string,
      category: req.query.category as string,
      loadType: req.query.loadType as any,
      movementType: req.query.movementType as any,
      countingType: req.query.countingType as any,
      muscleGroup: req.query.muscleGroup as string,
    };

    const exercises = await libraryService.listExercises(contractId, filters);
    res.json(exercises);
  } catch (error) {
    console.error('Error listing exercises:', error);
    res.status(500).json({ message: 'Erro ao listar exercÃ­cios' });
  }
});

/**
 * GET /api/library/exercises/:id
 * Obter exercÃ­cio por ID
 */
router.get('/exercises/:id', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    const exercise = await libraryService.getExerciseById(contractId, req.params.id);
    
    if (!exercise) {
      return res.status(404).json({ message: 'ExercÃ­cio nÃ£o encontrado' });
    }

    res.json(exercise);
  } catch (error) {
    console.error('Error getting exercise:', error);
    res.status(500).json({ message: 'Erro ao buscar exercÃ­cio' });
  }
});

/**
 * POST /api/library/exercises
 * Criar novo exercÃ­cio
 */
router.post('/exercises', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    const exercise = await libraryService.createExercise(contractId, req.body);
    res.status(201).json(exercise);
  } catch (error) {
    console.error('Error creating exercise:', error);
    res.status(500).json({ message: 'Erro ao criar exercÃ­cio' });
  }
});

/**
 * PUT /api/library/exercises/:id
 * Atualizar exercÃ­cio
 */
router.put('/exercises/:id', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    const exercise = await libraryService.updateExercise(contractId, req.params.id, req.body);
    res.json(exercise);
  } catch (error) {
    console.error('Error updating exercise:', error);
    res.status(500).json({ message: 'Erro ao atualizar exercÃ­cio' });
  }
});

/**
 * DELETE /api/library/exercises/:id
 * Deletar exercÃ­cio
 */
router.delete('/exercises/:id', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    await libraryService.deleteExercise(contractId, req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting exercise:', error);
    res.status(500).json({ message: 'Erro ao deletar exercÃ­cio' });
  }
});

/**
 * GET /api/library/progress/:alunoId/:exerciseId
 * Obter progresso do aluno em um exercÃ­cio
 */
router.get('/progress/:alunoId/:exerciseId', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    const progress = await libraryService.getAlunoProgress(
      contractId,
      req.params.alunoId,
      req.params.exerciseId
    );
    res.json(progress);
  } catch (error) {
    console.error('Error getting progress:', error);
    res.status(500).json({ message: 'Erro ao buscar progresso' });
  }
});

/**
 * PUT /api/library/progress/:alunoId/:exerciseId
 * Atualizar progresso do aluno
 */
router.put('/progress/:alunoId/:exerciseId', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    const progress = await libraryService.updateAlunoProgress(
      contractId,
      req.params.alunoId,
      req.params.exerciseId,
      req.body
    );
    res.json(progress);
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(500).json({ message: 'Erro ao atualizar progresso' });
  }
});

/**
 * GET /api/library/progress/:alunoId
 * Listar todo o progresso de um aluno
 */
router.get('/progress/:alunoId', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    const progress = await libraryService.listAlunoProgress(contractId, req.params.alunoId);
    res.json(progress);
  } catch (error) {
    console.error('Error listing progress:', error);
    res.status(500).json({ message: 'Erro ao listar progresso' });
  }
});

export default router;

