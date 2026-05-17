import { Router, type Request } from 'express';
import type { JwtPayload } from '@corrida/types';
import { CountingType, LoadType, MovementType } from '@prisma/client';
import { z } from 'zod';
import {
  libraryService,
  type ExerciseFilters,
} from '../modules/library/library.service.js';
import { authMiddleware, professorMiddleware } from '../modules/auth/auth.middleware.js';

type LibraryProfessorRequest = Request & {
  user: JwtPayload & {
    contractId: string;
  };
};

const exerciseFiltersSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  loadType: z.nativeEnum(LoadType).optional(),
  movementType: z.nativeEnum(MovementType).optional(),
  countingType: z.nativeEnum(CountingType).optional(),
  muscleGroup: z.string().optional(),
});

function getLibraryProfessorRequest(req: Request): LibraryProfessorRequest {
  return req as LibraryProfessorRequest;
}

function parseExerciseFilters(req: Request):
  | { success: true; data: ExerciseFilters }
  | { success: false } {
  const parsed = exerciseFiltersSchema.safeParse({
    search: req.query.search,
    category: req.query.category,
    loadType: req.query.loadType,
    movementType: req.query.movementType,
    countingType: req.query.countingType,
    muscleGroup: req.query.muscleGroup,
  });

  if (!parsed.success) {
    return { success: false };
  }

  return {
    success: true,
    data: {
      search: parsed.data.search,
      category: parsed.data.category,
      loadType: parsed.data.loadType,
      movementType: parsed.data.movementType,
      countingType: parsed.data.countingType,
      muscleGroup: parsed.data.muscleGroup,
    },
  };
}

const router: Router = Router();

router.use(authMiddleware);
router.use(professorMiddleware);

/**
 * GET /api/library/exercises
 * Listar exercicios com filtros
 */
router.get('/exercises', async (req, res) => {
  try {
    const contractId = getLibraryProfessorRequest(req).user.contractId;
    const parsedFilters = parseExerciseFilters(req);

    if (!parsedFilters.success) {
      return res.status(400).json({ message: 'Filtros invalidos' });
    }

    const exercises = await libraryService.listExercises(contractId, parsedFilters.data);
    res.json(exercises);
  } catch (error) {
    console.error('Error listing exercises:', error);
    res.status(500).json({ message: 'Erro ao listar exercicios' });
  }
});

/**
 * GET /api/library/exercises/:id
 * Obter exercicio por ID
 */
router.get('/exercises/:id', async (req, res) => {
  try {
    const contractId = getLibraryProfessorRequest(req).user.contractId;
    const exercise = await libraryService.getExerciseById(contractId, req.params.id);

    if (!exercise) {
      return res.status(404).json({ message: 'Exercicio nao encontrado' });
    }

    res.json(exercise);
  } catch (error) {
    console.error('Error getting exercise:', error);
    res.status(500).json({ message: 'Erro ao buscar exercicio' });
  }
});

/**
 * POST /api/library/exercises
 * Criar novo exercicio
 */
router.post('/exercises', async (req, res) => {
  try {
    const contractId = getLibraryProfessorRequest(req).user.contractId;
    const exercise = await libraryService.createExercise(contractId, req.body);
    res.status(201).json(exercise);
  } catch (error) {
    console.error('Error creating exercise:', error);
    res.status(500).json({ message: 'Erro ao criar exercicio' });
  }
});

/**
 * PUT /api/library/exercises/:id
 * Atualizar exercicio
 */
router.put('/exercises/:id', async (req, res) => {
  try {
    const contractId = getLibraryProfessorRequest(req).user.contractId;
    const exercise = await libraryService.updateExercise(contractId, req.params.id, req.body);
    res.json(exercise);
  } catch (error) {
    console.error('Error updating exercise:', error);
    res.status(500).json({ message: 'Erro ao atualizar exercicio' });
  }
});

/**
 * DELETE /api/library/exercises/:id
 * Deletar exercicio
 */
router.delete('/exercises/:id', async (req, res) => {
  try {
    const contractId = getLibraryProfessorRequest(req).user.contractId;
    await libraryService.deleteExercise(contractId, req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting exercise:', error);
    res.status(500).json({ message: 'Erro ao deletar exercicio' });
  }
});

/**
 * GET /api/library/progress/:alunoId/:exerciseId
 * Obter progresso do aluno em um exercicio
 */
router.get('/progress/:alunoId/:exerciseId', async (req, res) => {
  try {
    const contractId = getLibraryProfessorRequest(req).user.contractId;
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
    const contractId = getLibraryProfessorRequest(req).user.contractId;
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
    const contractId = getLibraryProfessorRequest(req).user.contractId;
    const progress = await libraryService.listAlunoProgress(contractId, req.params.alunoId);
    res.json(progress);
  } catch (error) {
    console.error('Error listing progress:', error);
    res.status(500).json({ message: 'Erro ao listar progresso' });
  }
});

export default router;
