import { Router, type NextFunction, type Request, type Response } from 'express';
import { PHYSICAL_CAPACITY_TYPES, type AuthenticatedUserPayload } from '@corrida/types';
import { CountingType, ExerciseCurationStatus, LoadType, MovementType } from '@prisma/client';
import { z } from 'zod';
import {
  libraryService,
  type CreateExerciseDTO,
  type ExerciseFilters,
  type UpdateExerciseDTO,
} from '../modules/library/library.service.js';
import { authMiddleware, professorMiddleware } from '../modules/auth/auth.middleware.js';
import { screenAccessMiddleware } from '../modules/access-control/access-control.middleware.js';
import { canProfessorAccessScreen, getEffectiveDataScopeForProfessor,
  buildProfessorDataScopeWhere } from '../modules/access-control/access-control.service.js';
import { prismaRuntimeClient } from '../common/prisma-runtime-client.js';
import { LibraryCurationError, type CurationAction } from '../modules/library/library-curation.domain.js';

type LibraryProfessorRequest = Request & {
  user: AuthenticatedUserPayload & {
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
  scope: z.enum(['official', 'all']).optional(),
  curationStatus: z.nativeEnum(ExerciseCurationStatus).optional(),
  equipment: z.string().optional(),
  movementPattern: z.string().optional(),
  difficulty: z.string().optional(),
});

const exerciseIdParamsSchema = z.object({
  id: z.string().min(1),
});

const alunoParamsSchema = z.object({
  alunoId: z.string().min(1),
});

const progressParamsSchema = z.object({
  alunoId: z.string().min(1),
  exerciseId: z.string().min(1),
});

const listOfStrings = z.array(z.string().trim().min(1).max(250)).max(50);
const createExerciseSchema = z
  .object({
    name: z.string().trim().min(1),
    videoUrl: z.string().optional(),
    loadType: z.nativeEnum(LoadType).optional(),
    movementType: z.nativeEnum(MovementType).optional(),
    countingType: z.nativeEnum(CountingType).optional(),
    category: z.string().optional(),
    muscleGroup: z.string().optional(),
    notes: z.string().optional(),
    aliases: listOfStrings.optional(),
    capacity: z.enum(PHYSICAL_CAPACITY_TYPES).optional(),
    equipment: listOfStrings.optional(),
    primaryMuscleGroups: listOfStrings.optional(),
    secondaryMuscleGroups: listOfStrings.optional(),
    movementPattern: z.string().max(120).optional(),
    joints: listOfStrings.optional(),
    laterality: z.string().max(80).optional(),
    difficulty: z.string().max(80).optional(),
    instructions: listOfStrings.optional(),
    commonErrors: listOfStrings.optional(),
    regressions: listOfStrings.optional(),
    progressions: listOfStrings.optional(),
    alternatives: listOfStrings.optional(),
    restrictions: listOfStrings.optional(),
    alerts: listOfStrings.optional(),
    mediaOrigin: z.string().max(300).optional(),
    mediaLicense: z.string().max(300).optional(),
    mediaAuthor: z.string().max(200).optional(),
  })
  .strict();

const versionSchema = z.coerce.number().int().positive();
const updateExerciseSchema = createExerciseSchema.partial().extend({
  expectedVersion: versionSchema,
}).strict();
const exerciseCurationSchema = z.object({
  action: z.enum(['submit', 'approve', 'request_changes', 'deactivate', 'reopen']),
  expectedVersion: versionSchema,
}).strict();

const alunoProgressUpdateSchema = z
  .object({
    lastLoad: z.number().optional(),
    maxLoad: z.number().optional(),
  })
  .strict();

function assertLibraryProfessorRequest(req: Request): asserts req is LibraryProfessorRequest {
  if (!req.user?.contractId) {
    throw new Error('Professor contractId missing on request');
  }
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
    scope: req.query.scope,
    curationStatus: req.query.curationStatus,
    equipment: req.query.equipment,
    movementPattern: req.query.movementPattern,
    difficulty: req.query.difficulty,
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
      scope: parsed.data.scope,
      curationStatus: parsed.data.curationStatus,
      equipment: parsed.data.equipment,
      movementPattern: parsed.data.movementPattern,
      difficulty: parsed.data.difficulty,
    },
  };
}

function parseExerciseIdParams(req: Request):
  | { success: true; data: { id: string } }
  | { success: false } {
  const parsed = exerciseIdParamsSchema.safeParse(req.params);

  if (!parsed.success) {
    return { success: false };
  }

  return { success: true, data: parsed.data };
}

function parseAlunoParams(req: Request):
  | { success: true; data: { alunoId: string } }
  | { success: false } {
  const parsed = alunoParamsSchema.safeParse(req.params);

  if (!parsed.success) {
    return { success: false };
  }

  return { success: true, data: parsed.data };
}

function parseProgressParams(req: Request):
  | { success: true; data: { alunoId: string; exerciseId: string } }
  | { success: false } {
  const parsed = progressParamsSchema.safeParse(req.params);

  if (!parsed.success) {
    return { success: false };
  }

  return { success: true, data: parsed.data };
}

function parseCreateExerciseBody(req: Request):
  | { success: true; data: CreateExerciseDTO }
  | { success: false } {
  const parsed = createExerciseSchema.safeParse(req.body);

  if (!parsed.success) {
    return { success: false };
  }

  return { success: true, data: parsed.data };
}

function parseUpdateExerciseBody(req: Request):
  | { success: true; data: UpdateExerciseDTO & { expectedVersion: number } }
  | { success: false } {
  const parsed = updateExerciseSchema.safeParse(req.body);

  if (!parsed.success) {
    return { success: false };
  }

  return { success: true, data: parsed.data };
}

function parseAlunoProgressUpdateBody(req: Request):
  | { success: true; data: { lastLoad?: number; maxLoad?: number } }
  | { success: false } {
  const parsed = alunoProgressUpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    return { success: false };
  }

  return { success: true, data: parsed.data };
}

const router: Router = Router();

router.use(authMiddleware);
router.use(professorMiddleware);

// The workout builder consumes the approved catalog and exercise progress under
// the Plans screen. Only catalog administration requires the Library screen.
const operationalReadAccess = screenAccessMiddleware(['library', 'plans']);
const catalogAdministrationAccess = screenAccessMiddleware('library');

function exerciseListAccess(req: Request, res: Response, next: NextFunction) {
  const administrativeQuery = req.query.scope === 'all' || req.query.curationStatus !== undefined;
  return (administrativeQuery ? catalogAdministrationAccess : operationalReadAccess)(req, res, next);
}

/** Progress is student data, not catalog data: Library access cannot bypass Plans dataScope. */
async function progressStudentScopeAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const { professorId, contractId } = req.user ?? {};
    if (!professorId || !contractId) return res.status(403).json({ message: 'Acesso negado.' });
    const professor = await prismaRuntimeClient.professor.findFirst({
      where: { id: professorId, contractId },
      include: { collaboratorFunction: true },
    });
    if (!professor) return res.status(404).json({ message: 'Aluno não encontrado.' });
    // With Plans, always use its effective scope, even when Library is also granted.
    // Library-only professors retain access to progress of their own students, not
    // unrestricted contract-level progress. A master retains contract scope.
    const plansScope = await getEffectiveDataScopeForProfessor(professor, 'plans');
    if (!plansScope && !(await canProfessorAccessScreen(professor, 'library'))) {
      return res.status(403).json({ message: 'Acesso negado.' });
    }
    const scope = plansScope ?? 'self';
    const aluno = await prismaRuntimeClient.aluno.findFirst({
      where: {
        id: req.params.alunoId, contractId,
        professor: buildProfessorDataScopeWhere(contractId, professorId, scope),
      },
      select: { id: true },
    });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });
    return next();
  } catch (error) {
    console.error('Error checking exercise progress scope:', error);
    return res.status(500).json({ message: 'Erro ao verificar acesso ao progresso.' });
  }
}

function isCatalogManager(req: Request) {
  return req.user?.professorRole === 'master';
}
function requireCatalogManager(req: Request, res: Response) {
  if (isCatalogManager(req)) return true;
  res.status(403).json({ message: 'Apenas administradores podem gerenciar a biblioteca.' });
  return false;
}
function sendLibraryError(res: Response, error: unknown, message: string) {
  if (error instanceof LibraryCurationError) {
    const status = error.kind === 'not_found' ? 404 : error.kind === 'forbidden' ? 403 : error.kind === 'conflict' ? 409 : 422;
    return res.status(status).json({ message: error.message });
  }
  console.error('Library operation failed:', error);
  return res.status(500).json({ message });
}

/**
 * GET /api/library/exercises
 * Listar exercícios com filtros
 */
router.get('/exercises', exerciseListAccess, async (req, res) => {
  try {
    assertLibraryProfessorRequest(req);
    const contractId = req.user.contractId;
    const parsedFilters = parseExerciseFilters(req);

    if (!parsedFilters.success) {
      return res.status(400).json({ message: 'Filtros inválidos' });
    }

    if (parsedFilters.data.scope === 'all' && !requireCatalogManager(req, res)) return;
    if (parsedFilters.data.curationStatus && parsedFilters.data.scope !== 'all') {
      return res.status(400).json({ message: 'O filtro por situação exige acesso administrativo.' });
    }
    const exercises = await libraryService.listExercises(contractId, parsedFilters.data);
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
router.get('/exercises/:id', catalogAdministrationAccess, async (req, res) => {
  try {
    assertLibraryProfessorRequest(req);
    const contractId = req.user.contractId;
    const parsedParams = parseExerciseIdParams(req);

    if (!parsedParams.success) {
      return res.status(400).json({ message: 'Parâmetros inválidos' });
    }

    const exercise = await libraryService.getExerciseById(contractId, parsedParams.data.id, !isCatalogManager(req));

    if (!exercise) {
      return res.status(404).json({ message: 'Exercício não encontrado' });
    }

    res.json(exercise);
  } catch (error) {
    console.error('Error getting exercise:', error);
    return sendLibraryError(res, error, 'Erro ao buscar exercício');
  }
});

/**
 * POST /api/library/exercises
 * Criar novo exercício
 */
router.post('/exercises', catalogAdministrationAccess, async (req, res) => {
  try {
    assertLibraryProfessorRequest(req);
    const contractId = req.user.contractId;
    const parsedBody = parseCreateExerciseBody(req);

    if (!parsedBody.success) {
      return res.status(400).json({ message: 'Payload inválido' });
    }

    if (!requireCatalogManager(req, res)) return;
    const exercise = await libraryService.createExercise(contractId, parsedBody.data, req.user.userId);
    res.status(201).json(exercise);
  } catch (error) {
    console.error('Error creating exercise:', error);
    return sendLibraryError(res, error, 'Erro ao criar exercício');
  }
});

/**
 * PUT /api/library/exercises/:id
 * Atualizar exercício
 */
router.put('/exercises/:id', catalogAdministrationAccess, async (req, res) => {
  try {
    assertLibraryProfessorRequest(req);
    const contractId = req.user.contractId;
    const parsedParams = parseExerciseIdParams(req);
    const parsedBody = parseUpdateExerciseBody(req);

    if (!parsedParams.success) {
      return res.status(400).json({ message: 'Parâmetros inválidos' });
    }

    if (!parsedBody.success) {
      return res.status(400).json({ message: 'Payload inválido' });
    }

    if (!requireCatalogManager(req, res)) return;
    const { expectedVersion, ...data } = parsedBody.data;
    const exercise = await libraryService.updateExercise(
      contractId, parsedParams.data.id, data, expectedVersion, req.user.userId,
    );
    res.json(exercise);
  } catch (error) {
    console.error('Error updating exercise:', error);
    return sendLibraryError(res, error, 'Erro ao atualizar exercício');
  }
});

/**
 * DELETE /api/library/exercises/:id
 * Excluir exercício
 */
router.delete('/exercises/:id', catalogAdministrationAccess, async (req, res) => {
  try {
    assertLibraryProfessorRequest(req);
    const contractId = req.user.contractId;
    const parsedParams = parseExerciseIdParams(req);

    if (!parsedParams.success) {
      return res.status(400).json({ message: 'Parâmetros inválidos' });
    }

    if (!requireCatalogManager(req, res)) return;
    const parsedVersion = versionSchema.safeParse(req.query.expectedVersion);
    if (!parsedVersion.success) return res.status(400).json({ message: 'Versão esperada obrigatória.' });
    await libraryService.deleteExercise(contractId, parsedParams.data.id, parsedVersion.data, req.user.userId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting exercise:', error);
    return sendLibraryError(res, error, 'Erro ao desativar exercício');
  }
});

/**
 * POST /api/library/exercises/:id/curation
 * Explicit professional decision; no automatic changes to operational workouts.
 */
router.post('/exercises/:id/curation', catalogAdministrationAccess, async (req, res) => {
  try {
    assertLibraryProfessorRequest(req);
    if (!requireCatalogManager(req, res)) return;
    const params = parseExerciseIdParams(req);
    const body = exerciseCurationSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      return res.status(400).json({ message: 'Ação ou versão inválida.' });
    }
    const exercise = await libraryService.reviewExercise(
      req.user.contractId, params.data.id, body.data.expectedVersion,
      body.data.action as CurationAction, req.user.userId,
    );
    return res.json(exercise);
  } catch (error) {
    return sendLibraryError(res, error, 'Erro ao revisar exercício.');
  }
});

/** GET /api/library/exercises/:id/revisions: immutable tenant-scoped revision history. */
router.get('/exercises/:id/revisions', catalogAdministrationAccess, async (req, res) => {
  try {
    assertLibraryProfessorRequest(req);
    if (!requireCatalogManager(req, res)) return;
    const params = parseExerciseIdParams(req);
    if (!params.success) return res.status(400).json({ message: 'Parâmetros inválidos.' });
    const revisions = await libraryService.listExerciseRevisions(req.user.contractId, params.data.id);
    return res.json(revisions);
  } catch (error) {
    return sendLibraryError(res, error, 'Erro ao carregar histórico de curadoria.');
  }
});

/**
 * GET /api/library/progress/:alunoId/:exerciseId
 * Obter progresso do aluno em um exercício
 */
router.get('/progress/:alunoId/:exerciseId', operationalReadAccess, progressStudentScopeAccess, async (req, res) => {
  try {
    assertLibraryProfessorRequest(req);
    const contractId = req.user.contractId;
    const parsedParams = parseProgressParams(req);

    if (!parsedParams.success) {
      return res.status(400).json({ message: 'Parâmetros inválidos' });
    }

    const progress = await libraryService.getAlunoProgress(
      contractId,
      parsedParams.data.alunoId,
      parsedParams.data.exerciseId
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
router.put('/progress/:alunoId/:exerciseId', catalogAdministrationAccess, progressStudentScopeAccess, async (req, res) => {
  try {
    assertLibraryProfessorRequest(req);
    const contractId = req.user.contractId;
    const parsedParams = parseProgressParams(req);
    const parsedBody = parseAlunoProgressUpdateBody(req);

    if (!parsedParams.success) {
      return res.status(400).json({ message: 'Parâmetros inválidos' });
    }

    if (!parsedBody.success) {
      return res.status(400).json({ message: 'Payload inválido' });
    }

    const progress = await libraryService.updateAlunoProgress(
      contractId,
      parsedParams.data.alunoId,
      parsedParams.data.exerciseId,
      parsedBody.data
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
router.get('/progress/:alunoId', operationalReadAccess, progressStudentScopeAccess, async (req, res) => {
  try {
    assertLibraryProfessorRequest(req);
    const contractId = req.user.contractId;
    const parsedParams = parseAlunoParams(req);

    if (!parsedParams.success) {
      return res.status(400).json({ message: 'Parâmetros inválidos' });
    }

    const progress = await libraryService.listAlunoProgress(contractId, parsedParams.data.alunoId);
    res.json(progress);
  } catch (error) {
    console.error('Error listing progress:', error);
    res.status(500).json({ message: 'Erro ao listar progresso' });
  }
});

export default router;
