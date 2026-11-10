import express from 'express';
import { ACCESS_BLOCK_CATALOG, ALL_ACCESS_SCREEN_KEYS } from '@corrida/types';

const request = require('supertest');
const mockProfessorFindUnique = jest.fn();
const mockProfessorFindFirst = jest.fn();
const mockAlunoFindFirst = jest.fn();
const mockAccessPermissionFindMany = jest.fn();
const mockAccessPermissionCreateMany = jest.fn();
const mockListExercises = jest.fn();
const mockGetExerciseById = jest.fn();
const mockGetAlunoProgress = jest.fn();
const mockListAlunoProgress = jest.fn();
const mockUpdateAlunoProgress = jest.fn();
const mockCreateExercise = jest.fn();
const mockReviewExercise = jest.fn();
const mockListExerciseRevisions = jest.fn();
const mockUpdateExercise = jest.fn();
const mockDeleteExercise = jest.fn();

// Preserve the real middleware and access-control service: only the DB and
// endpoint domain service are mocked. The HTTP tests exercise the real grant
// evaluation and its ordering relative to the route handlers.
jest.mock('@prisma/client', () => ({
  ...jest.requireActual('@prisma/client'),
  PrismaClient: jest.fn(() => ({
    professor: { findUnique: mockProfessorFindUnique, findFirst: mockProfessorFindFirst },
    aluno: { findFirst: mockAlunoFindFirst },
    accessPermission: {
      findMany: mockAccessPermissionFindMany,
      createMany: mockAccessPermissionCreateMany,
    },
  })),
}));

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'professor-user-394', email: 'professor@example.com', type: 'professor',
    };
    next();
  },
  professorMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../src/modules/library/library.service', () => ({
  libraryService: {
    listExercises: mockListExercises,
    getExerciseById: mockGetExerciseById,
    getAlunoProgress: mockGetAlunoProgress,
    listAlunoProgress: mockListAlunoProgress,
    updateAlunoProgress: mockUpdateAlunoProgress,
    createExercise: mockCreateExercise,
    reviewExercise: mockReviewExercise,
    listExerciseRevisions: mockListExerciseRevisions,
    updateExercise: mockUpdateExercise,
    deleteExercise: mockDeleteExercise,
  },
}));

const libraryRouter = require('../src/routes/library.routes').default;
const app = express();
app.use(express.json());
app.use('/library', libraryRouter);

const actor = {
  id: 'professor-394', userId: 'professor-user-394', contractId: 'contract-394',
  role: 'professor', collaboratorFunctionId: 'function-394', currentStatus: 'active',
  dismissalDate: null, user: { isActive: true },
  collaboratorFunction: { id: 'function-394', code: 'professor' },
  contract: { id: 'contract-394', type: 'academy', name: 'Teste', document: '394' },
};

function accessRows(grantedScreens: readonly string[]) {
  const granted = new Set(grantedScreens);
  return [
    ...ALL_ACCESS_SCREEN_KEYS.map((screenKey) => ({
      collaboratorFunctionId: 'function-394', screenKey, blockKey: '',
      canView: granted.has(screenKey), dataScope: screenKey === 'plans' ? 'self' : null,
    })),
    ...ACCESS_BLOCK_CATALOG.map((block) => ({
      collaboratorFunctionId: 'function-394', screenKey: block.screenKey,
      blockKey: block.key, canView: false, dataScope: null,
    })),
  ];
}

function grantScreens(...screens: string[]) {
  mockAccessPermissionFindMany.mockResolvedValue(accessRows(screens));
}

describe('#394 A-394-012: operational exercise access preserves plans-only roles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfessorFindUnique.mockResolvedValue({ ...actor });
    mockProfessorFindFirst.mockResolvedValue({ ...actor });
    mockAlunoFindFirst.mockImplementation(async ({ where }: { where: {
      id: string; contractId: string; professor: { id?: string };
    } }) => (where.id === 'aluno-1' && where.contractId === 'contract-394'
      && where.professor.id === 'professor-394' ? { id: 'aluno-1' } : null));
    mockAccessPermissionCreateMany.mockResolvedValue({ count: 0 });
    mockListExercises.mockResolvedValue([{ id: 'approved-1', curationStatus: 'approved' }]);
    mockGetExerciseById.mockResolvedValue({ id: 'approved-1', curationStatus: 'approved' });
    mockGetAlunoProgress.mockResolvedValue({ alunoId: 'aluno-1', exerciseId: 'approved-1', lastLoad: 25 });
    mockListAlunoProgress.mockResolvedValue([]);
    mockUpdateAlunoProgress.mockResolvedValue({ alunoId: 'aluno-1', exerciseId: 'approved-1', lastLoad: 26 });
    mockListExerciseRevisions.mockResolvedValue([]);
    grantScreens('plans');
  });

  it('allows the official picker and scoped historical load for a plans-only professor', async () => {
    const list = await request(app).get('/library/exercises?search=agachamento');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ id: 'approved-1', curationStatus: 'approved' }]);
    expect(mockListExercises).toHaveBeenCalledWith(
      'contract-394', expect.objectContaining({ search: 'agachamento', scope: undefined }),
    );

    const progress = await request(app).get('/library/progress/aluno-1/approved-1');
    expect(progress.status).toBe(200);
    expect(progress.body.lastLoad).toBe(25);
    expect(mockGetAlunoProgress).toHaveBeenCalledWith('contract-394', 'aluno-1', 'approved-1');
    expect((await request(app).get('/library/progress/aluno-1')).status).toBe(200);
    expect(mockListAlunoProgress).toHaveBeenCalledWith('contract-394', 'aluno-1');
    expect(mockAccessPermissionCreateMany).not.toHaveBeenCalled();
  });

  it('does not grant progress mutations or unscoped exercise details to a plans-only professor', async () => {
    const updated = await request(app).put('/library/progress/aluno-1/approved-1')
      .send({ lastLoad: 26 });
    expect(updated.status).toBe(403);
    expect((await request(app).get('/library/exercises/approved-1')).status).toBe(403);
    expect(mockUpdateAlunoProgress).not.toHaveBeenCalled();
    expect(mockGetExerciseById).not.toHaveBeenCalled();
  });

  it('hides other students progress when Plans is limited to the professor himself', async () => {
    const denied = await request(app).get('/library/progress/aluno-2/approved-1');
    expect(denied.status).toBe(404);
    expect(mockGetAlunoProgress).not.toHaveBeenCalled();
    expect((await request(app).get('/library/progress/aluno-2')).status).toBe(404);
    expect(mockListAlunoProgress).not.toHaveBeenCalled();
  });

  it('denies drafts, revisions and catalog mutations without Library permission', async () => {
    const requests = [
      request(app).get('/library/exercises?scope=all'),
      request(app).get('/library/exercises?curationStatus=draft'),
      request(app).get('/library/exercises/approved-1/revisions'),
      request(app).post('/library/exercises').send({ name: 'Rascunho' }),
      request(app).put('/library/exercises/approved-1').send({ name: 'Editar', expectedVersion: 1 }),
      request(app).delete('/library/exercises/approved-1?expectedVersion=1'),
      request(app).post('/library/exercises/approved-1/curation').send({ action: 'approve', expectedVersion: 1 }),
    ];
    for (const response of await Promise.all(requests)) {
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Perfil sem permissão para acessar este recurso');
    }
    expect(mockListExercises).not.toHaveBeenCalled();
    expect(mockCreateExercise).not.toHaveBeenCalled();
    expect(mockUpdateExercise).not.toHaveBeenCalled();
    expect(mockDeleteExercise).not.toHaveBeenCalled();
    expect(mockReviewExercise).not.toHaveBeenCalled();
    expect(mockListExerciseRevisions).not.toHaveBeenCalled();
  });

  it('allows a library-only role to browse official exercises without granting curation', async () => {
    grantScreens('library');
    expect((await request(app).get('/library/exercises')).status).toBe(200);
    expect((await request(app).get('/library/progress/aluno-1/approved-1')).status).toBe(200);
    const denied = await request(app).get('/library/exercises?scope=all');
    expect(denied.status).toBe(403);
    expect(denied.body.message).toContain('administradores');
  });

  it('denies the operational routes when both Plans and Library are revoked', async () => {
    grantScreens();
    for (const path of ['/library/exercises', '/library/exercises/approved-1', '/library/progress/aluno-1/approved-1']) {
      const response = await request(app).get(path);
      expect(response.status).toBe(403);
    }
    expect(mockListExercises).not.toHaveBeenCalled();
    expect(mockGetAlunoProgress).not.toHaveBeenCalled();
  });

  it('rechecks the active professor and tenant, ignoring a forged client contract', async () => {
    mockProfessorFindUnique.mockResolvedValueOnce({ ...actor, user: { isActive: false } });
    const revoked = await request(app).get('/library/exercises');
    expect(revoked.status).toBe(404);
    expect(mockListExercises).not.toHaveBeenCalled();

    mockProfessorFindUnique.mockResolvedValue({ ...actor, contractId: 'other-contract' });
    const tenant = await request(app).get('/library/exercises?contractId=contract-394');
    expect(tenant.status).toBe(200);
    expect(mockListExercises).toHaveBeenCalledWith(
      'other-contract', expect.objectContaining({ scope: undefined }),
    );
  });

  it('preserves administrative reads and curation for an active master', async () => {
    mockProfessorFindUnique.mockResolvedValue({ ...actor, role: 'master' });
    const all = await request(app).get('/library/exercises?scope=all');
    expect(all.status).toBe(200);
    expect(mockListExercises).toHaveBeenCalledWith(
      'contract-394', expect.objectContaining({ scope: 'all' }),
    );
    mockReviewExercise.mockResolvedValue({ id: 'approved-1', curationStatus: 'approved' });
    const approval = await request(app).post('/library/exercises/approved-1/curation')
      .send({ action: 'approve', expectedVersion: 1 });
    expect(approval.status).toBe(200);
    expect(mockReviewExercise).toHaveBeenCalledWith(
      'contract-394', 'approved-1', 1, 'approve', 'professor-user-394',
    );
    expect((await request(app).get('/library/exercises/approved-1')).status).toBe(200);
    expect(mockGetExerciseById).toHaveBeenCalledWith('contract-394', 'approved-1', false);
  });
});
