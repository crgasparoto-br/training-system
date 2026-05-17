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
    };
    next();
  },
  professorMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('../src/modules/library/library.service', () => ({
  libraryService: {
    createExercise: jest.fn(),
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
    expect(response.body).toEqual({ message: 'Payload invalido' });
    expect(libraryService.createExercise).not.toHaveBeenCalled();
  });

  it('rejects unknown exercise update fields with 400', async () => {
    const response = await request(app)
      .put('/library/exercises/exercise-1')
      .send({
        muscleGroups: 'Core',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Payload invalido' });
    expect(libraryService.updateExercise).not.toHaveBeenCalled();
  });

  it('rejects unknown progress update fields with 400', async () => {
    const response = await request(app)
      .put('/library/progress/aluno-1/exercise-1')
      .send({
        personalRecord: 100,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Payload invalido' });
    expect(libraryService.updateAlunoProgress).not.toHaveBeenCalled();
  });
});
