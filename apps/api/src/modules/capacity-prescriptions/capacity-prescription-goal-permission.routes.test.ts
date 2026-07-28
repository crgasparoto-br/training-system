import express from 'express';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import goalPermissionRoutes from './capacity-prescription-goal-permission.routes.js';
import { capacityPrescriptionBoundaryPrisma } from './capacity-prescription-source-permission.routes.js';

const request = require('supertest');

jest.mock('../auth/auth.middleware.js', () => ({
  authMiddleware: (req: any, _res: any, next: () => void) => {
    req.user = { contractId: 'contract-1', professorId: 'professor-1' };
    next();
  },
  professorMiddleware: (_req: any, _res: any, next: () => void) => next(),
}));

jest.mock('../access-control/access-control.service.js', () => ({
  canProfessorAccessBlock: jest.fn(),
}));

jest.mock('./capacity-prescription-source-permission.routes.js', () => ({
  capacityPrescriptionBoundaryPrisma: {
    professor: { findFirst: jest.fn() },
  },
}));

const canAccess = canProfessorAccessBlock as jest.MockedFunction<
  typeof canProfessorAccessBlock
>;
const findProfessor = capacityPrescriptionBoundaryPrisma.professor
  .findFirst as jest.MockedFunction<any>;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(goalPermissionRoutes);
  app.get('/alunos/:alunoId/goal-classifications', (_req, res) =>
    res.status(200).json({ reached: true })
  );
  app.put('/alunos/:alunoId/goals/:goalId/classification', (_req, res) =>
    res.status(200).json({ reached: true })
  );
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  findProfessor.mockResolvedValue({
    id: 'professor-1',
    role: 'professor',
    collaboratorFunction: { id: 'function-1', code: 'professor' },
  });
});

describe('capacity goal classification permission routes', () => {
  it('returns 403 on read when capacity view exists but PRNT goals is denied', async () => {
    canAccess.mockImplementation(async (_subject, blockKey) =>
      blockKey === 'plans.capacityPrescriptions.view'
    );

    const response = await request(createApp()).get(
      '/alunos/aluno-1/goal-classifications'
    );

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Perfil sem permissão para acessar este recurso');
    expect(canAccess).toHaveBeenCalledWith(
      expect.anything(),
      'physicalAssessment.prnt.goals'
    );
  });

  it('returns 403 on write when capacity manage exists but PRNT goals is denied', async () => {
    canAccess.mockImplementation(async (_subject, blockKey) =>
      blockKey === 'plans.capacityPrescriptions.manage'
    );

    const response = await request(createApp())
      .put('/alunos/aluno-1/goals/goal-1/classification')
      .send({ capacities: ['resisted'] });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Perfil sem permissão para acessar este recurso');
  });

  it('continues to the classification handlers when both composed blocks are allowed', async () => {
    canAccess.mockResolvedValue(true);

    const readResponse = await request(createApp()).get(
      '/alunos/aluno-1/goal-classifications'
    );
    const writeResponse = await request(createApp())
      .put('/alunos/aluno-1/goals/goal-1/classification')
      .send({ capacities: ['resisted'] });

    expect(readResponse.status).toBe(200);
    expect(readResponse.body).toEqual({ reached: true });
    expect(writeResponse.status).toBe(200);
    expect(writeResponse.body).toEqual({ reached: true });
  });
});
