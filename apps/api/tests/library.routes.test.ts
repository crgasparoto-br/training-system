import express from 'express';
import libraryRouter from '../src/routes/library.routes';
import { libraryService } from '../src/modules/library/library.service';

const request = require('supertest');

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'professor@example.com',
      type: 'professor',
      contractId: 'contract-1',
      professorId: 'professor-1',
      professorRole: req.headers['x-test-role'] === 'professor' ? 'professor' : 'master',
    };
    next();
  },
  professorMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  screenAccessMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

// This input-validation fixture authenticates a master with a contract-scoped
// student. The new progress guard must run before the payload validator; without
// these mocks the request is correctly denied and never reaches validation.
jest.mock('../src/common/prisma-runtime-client', () => ({
  prismaRuntimeClient: {
    professor: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'professor-1', contractId: 'contract-1', role: 'master',
      }),
    },
    aluno: { findFirst: jest.fn().mockResolvedValue({ id: 'aluno-1' }) },
  },
}));

jest.mock('../src/modules/access-control/access-control.service', () => ({
  getEffectiveDataScopeForProfessor: jest.fn().mockResolvedValue('contract'),
  canProfessorAccessScreen: jest.fn().mockResolvedValue(true),
  buildProfessorDataScopeWhere: jest.fn().mockReturnValue({ contractId: 'contract-1' }),
}));

jest.mock('../src/modules/library/library.service', () => ({
  libraryService: {
    createExercise: jest.fn(),
    listExercises: jest.fn(),
    getExerciseById: jest.fn(),
    reviewExercise: jest.fn(),
    deleteExercise: jest.fn(),
    listExerciseRevisions: jest.fn(),
    updateExercise: jest.fn(),
    updateAlunoProgress: jest.fn(),
  },
}));

describe('library routes input validation', () => {
  const app = express();

  app.use(express.json());
  app.use('/library', libraryRouter);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unknown exercise creation fields with 400', async () => {
    const response = await request(app)
      .post('/library/exercises')
      .send({
        name: 'Prancha',
        muscleGroups: 'Core',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Payload inválido' });
    expect(libraryService.createExercise).not.toHaveBeenCalled();
  });

  it('#394: rejects whitespace-only canonical names before the PostgreSQL guard', async () => {
    const response = await request(app).post('/library/exercises').send({ name: '   ' });
    expect(response.status).toBe(400);
    expect(libraryService.createExercise).not.toHaveBeenCalled();
  });

  it('#394 A-008: rejects noncanonical capacity on create and edit; accepts the four official codes', async () => {
    for (const capacity of ['resistance', 'custom', 'RESISTED', '']) {
      const create = await request(app).post('/library/exercises').send({ name: 'Teste', capacity });
      expect(create.status).toBe(400);
      const edit = await request(app).put('/library/exercises/e1')
        .send({ capacity, expectedVersion: 1 });
      expect(edit.status).toBe(400);
    }
    expect(libraryService.createExercise).not.toHaveBeenCalled();
    expect(libraryService.updateExercise).not.toHaveBeenCalled();
    (libraryService.createExercise as jest.Mock).mockResolvedValue({ id: 'new-1' });
    for (const capacity of ['resisted', 'flexibility', 'cyclic', 'balance']) {
      const created = await request(app).post('/library/exercises')
        .send({ name: 'Teste', capacity });
      expect(created.status).toBe(201);
    }
    expect(libraryService.createExercise).toHaveBeenCalledTimes(4);
  });

  it('rejects unknown exercise update fields with 400', async () => {
    const response = await request(app)
      .put('/library/exercises/exercise-1')
      .send({
        muscleGroups: 'Core',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Payload inválido' });
    expect(libraryService.updateExercise).not.toHaveBeenCalled();
  });

  it('rejects unknown progress update fields with 400 after validating access to the student', async () => {
    const response = await request(app)
      .put('/library/progress/aluno-1/exercise-1')
      .send({
        personalRecord: 100,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Payload inválido' });
    expect(libraryService.updateAlunoProgress).not.toHaveBeenCalled();
  });
  it('defaults the public exercise picker to approved-only records', async () => {
    (libraryService.listExercises as jest.Mock).mockResolvedValue([]);
    const response = await request(app).get('/library/exercises');
    expect(response.status).toBe(200);
    expect(libraryService.listExercises).toHaveBeenCalledWith(
      'contract-1', expect.objectContaining({ scope: undefined }),
    );
  });

  it('does not allow non-manager professors to list drafts', async () => {
    const response = await request(app)
      .get('/library/exercises?scope=all').set('x-test-role', 'professor');
    expect(response.status).toBe(403);
    expect(libraryService.listExercises).not.toHaveBeenCalled();
  });

  it('does not allow non-managers to create or approve an exercise', async () => {
    const created = await request(app).post('/library/exercises')
      .set('x-test-role', 'professor').send({ name: 'Rascunho' });
    expect(created.status).toBe(403);
    const approved = await request(app).post('/library/exercises/exercise-1/curation')
      .set('x-test-role', 'professor').send({ action: 'approve', expectedVersion: 1 });
    expect(approved.status).toBe(403);
    expect(libraryService.createExercise).not.toHaveBeenCalled();
    expect(libraryService.reviewExercise).not.toHaveBeenCalled();
  });

  it('records explicit master approval with actor and required expected version', async () => {
    (libraryService.reviewExercise as jest.Mock).mockResolvedValue({ id: 'exercise-1', curationStatus: 'approved' });
    const invalid = await request(app).post('/library/exercises/exercise-1/curation')
      .send({ action: 'approve' });
    expect(invalid.status).toBe(400);
    const valid = await request(app).post('/library/exercises/exercise-1/curation')
      .send({ action: 'approve', expectedVersion: 2 });
    expect(valid.status).toBe(200);
    expect(libraryService.reviewExercise).toHaveBeenCalledTimes(1);
    expect(libraryService.reviewExercise).toHaveBeenCalledWith(
      'contract-1', 'exercise-1', 2, 'approve', 'user-1',
    );
  });

  it('returns 403 when the administrator is revoked during the service transaction', async () => {
    // The real domain error must remain typed so that the HTTP boundary returns 403.
    const { LibraryCurationError } = require('../src/modules/library/library-curation.domain');
    (libraryService.reviewExercise as jest.Mock).mockRejectedValueOnce(
      new LibraryCurationError('forbidden', 'Acesso administrativo à biblioteca não está mais autorizado.'),
    );
    const response = await request(app).post('/library/exercises/exercise-1/curation')
      .send({ action: 'approve', expectedVersion: 2 });
    expect(response.status).toBe(403);
    expect(libraryService.reviewExercise).toHaveBeenCalledTimes(1);
  });

  it('enforces version on updates and rejects curation fields injected by clients', async () => {
    const omitted = await request(app).put('/library/exercises/exercise-1')
      .send({ name: 'Alteração sem versão' });
    expect(omitted.status).toBe(400);
    const injected = await request(app).put('/library/exercises/exercise-1')
      .send({ curationStatus: 'approved', expectedVersion: 1 });
    expect(injected.status).toBe(400);
    expect(libraryService.updateExercise).not.toHaveBeenCalled();
  });

  it('soft deactivation requires an explicit version and manager access', async () => {
    const noVersion = await request(app).delete('/library/exercises/exercise-1');
    expect(noVersion.status).toBe(400);
    const proper = await request(app).delete('/library/exercises/exercise-1?expectedVersion=4');
    expect(proper.status).toBe(204);
    expect(libraryService.deleteExercise).toHaveBeenCalledWith('contract-1', 'exercise-1', 4, 'user-1');
  });

  it('restricts revision history to the administrative role', async () => {
    const denied = await request(app).get('/library/exercises/exercise-1/revisions').set('x-test-role', 'professor');
    expect(denied.status).toBe(403);
    (libraryService.listExerciseRevisions as jest.Mock).mockResolvedValue([]);
    const allowed = await request(app).get('/library/exercises/exercise-1/revisions');
    expect(allowed.status).toBe(200);
    expect(libraryService.listExerciseRevisions).toHaveBeenCalledWith('contract-1', 'exercise-1');
  });

  it('keeps historical records available to the administrator but hides inactive entries from other professors', async () => {
    (libraryService.getExerciseById as jest.Mock).mockResolvedValue({ id: 'exercise-1' });
    const publicRead = await request(app).get('/library/exercises/exercise-1')
      .set('x-test-role', 'professor');
    expect(publicRead.status).toBe(200);
    expect(libraryService.getExerciseById).toHaveBeenCalledWith('contract-1', 'exercise-1', true);
    const adminRead = await request(app).get('/library/exercises/exercise-1');
    expect(adminRead.status).toBe(200);
    expect(libraryService.getExerciseById).toHaveBeenCalledWith('contract-1', 'exercise-1', false);
  });

});
