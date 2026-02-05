import { Router } from 'express';
import { libraryService } from '../modules/library/library.service';
import { authMiddleware, educatorMiddleware } from '../modules/auth/auth.middleware';

const router = Router();

router.use(authMiddleware);
router.use(educatorMiddleware);

/**
 * GET /api/library/exercises
 * Listar exercícios com filtros
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
    res.status(500).json({ message: 'Erro ao listar exercícios' });
  }
});

/**
 * GET /api/library/exercises/:id
 * Obter exercício por ID
 */
router.get('/exercises/:id', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    const exercise = await libraryService.getExerciseById(contractId, req.params.id);
    
    if (!exercise) {
      return res.status(404).json({ message: 'Exercício não encontrado' });
    }

    res.json(exercise);
  } catch (error) {
    console.error('Error getting exercise:', error);
    res.status(500).json({ message: 'Erro ao buscar exercício' });
  }
});

/**
 * POST /api/library/exercises
 * Criar novo exercício
 */
router.post('/exercises', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    const exercise = await libraryService.createExercise(contractId, req.body);
    res.status(201).json(exercise);
  } catch (error) {
    console.error('Error creating exercise:', error);
    res.status(500).json({ message: 'Erro ao criar exercício' });
  }
});

/**
 * PUT /api/library/exercises/:id
 * Atualizar exercício
 */
router.put('/exercises/:id', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    const exercise = await libraryService.updateExercise(contractId, req.params.id, req.body);
    res.json(exercise);
  } catch (error) {
    console.error('Error updating exercise:', error);
    res.status(500).json({ message: 'Erro ao atualizar exercício' });
  }
});

/**
 * DELETE /api/library/exercises/:id
 * Deletar exercício
 */
router.delete('/exercises/:id', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    await libraryService.deleteExercise(contractId, req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting exercise:', error);
    res.status(500).json({ message: 'Erro ao deletar exercício' });
  }
});

/**
 * GET /api/library/progress/:athleteId/:exerciseId
 * Obter progresso do aluno em um exercício
 */
router.get('/progress/:athleteId/:exerciseId', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    const progress = await libraryService.getStudentProgress(
      contractId,
      req.params.athleteId,
      req.params.exerciseId
    );
    res.json(progress);
  } catch (error) {
    console.error('Error getting progress:', error);
    res.status(500).json({ message: 'Erro ao buscar progresso' });
  }
});

/**
 * PUT /api/library/progress/:athleteId/:exerciseId
 * Atualizar progresso do aluno
 */
router.put('/progress/:athleteId/:exerciseId', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    const progress = await libraryService.updateStudentProgress(
      contractId,
      req.params.athleteId,
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
 * GET /api/library/progress/:athleteId
 * Listar todo o progresso de um aluno
 */
router.get('/progress/:athleteId', async (req, res) => {
  try {
    const contractId = (req as any).user.contractId;
    const progress = await libraryService.listStudentProgress(contractId, req.params.athleteId);
    res.json(progress);
  } catch (error) {
    console.error('Error listing progress:', error);
    res.status(500).json({ message: 'Erro ao listar progresso' });
  }
});

export default router;
