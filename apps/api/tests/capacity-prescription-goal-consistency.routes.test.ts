import express from 'express';

const request = require('supertest');
const mockProfessorFindFirst = jest.fn();
const mockClassificationFindMany = jest.fn();
const mockCanAccess = jest.fn();

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'professor@example.com',
      type: 'professor',
      contractId: 'contract-1',
      professorId: 'professor-1',
    };
    next();
  },
  professorMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('../src/modules/access-control/access-control.service', () => ({
  canProfessorAccessBlock: (...args: unknown[]) => mockCanAccess(...args),
}));

jest.mock(
  '../src/modules/capacity-prescriptions/capacity-prescription-source-permission.routes',
  () => ({
    capacityPrescriptionBoundaryPrisma: {
      professor: { findFirst: mockProfessorFindFirst },
      prontuarioGoalCapacityClassification: { findMany: mockClassificationFindMany },
    },
  })
);

const goalConsistencyRoutes = require(
  '../src/modules/capacity-prescriptions/capacity-prescription-goal-consistency.routes'
).default;

describe('capacity goal consistency boundary', () => {
  const app = express();
  app.use(express.json());
  app.use('/capacity-prescriptions', goalConsistencyRoutes);
  app.post('/capacity-prescriptions/alunos/:alunoId', (req, res) => {
    res.status(200).json({ data: req.body });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockProfessorFindFirst.mockResolvedValue({ id: 'professor-1' });
    mockCanAccess.mockResolvedValue(true);
    mockClassificationFindMany.mockResolvedValue([{ goalId: 'goal-1' }]);
  });

  it('rejeita origem de objetivo diferente do vínculo versionado', async () => {
    const response = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-1')
      .send({
        capacity: 'resisted',
        sourceRefs: [{ type: 'prontuario_goal', id: 'goal-1', label: 'Objetivo' }],
        linkedProntuarioGoalIds: [],
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(
      'Os objetivos do prontuário devem coincidir com os vínculos da versão'
    );
  });

  it('rejeita classificação local ainda não persistida', async () => {
    const response = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-1')
      .send({
        capacity: 'resisted',
        sourceRefs: [{ type: 'prontuario_goal', id: 'goal-2', label: 'Objetivo novo' }],
        linkedProntuarioGoalIds: ['goal-2'],
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(
      'Salve as classificações dos objetivos antes de versionar a capacidade'
    );
  });

  it('permite versionar quando classificação, origem e vínculo coincidem', async () => {
    const response = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-1')
      .send({
        capacity: 'resisted',
        sourceRefs: [{ type: 'prontuario_goal', id: 'goal-1', label: 'Objetivo' }],
        linkedProntuarioGoalIds: ['goal-1'],
      });

    expect(response.status).toBe(200);
    expect(mockClassificationFindMany).toHaveBeenCalledWith({
      where: {
        contractId: 'contract-1',
        alunoId: 'aluno-1',
        capacities: { has: 'resisted' },
      },
      select: { goalId: true },
    });
  });

  it('mantém o fluxo sem objetivos para perfil sem acesso ao bloco do PRNT', async () => {
    mockCanAccess.mockImplementation(
      async (_professor: unknown, blockKey: string) =>
        blockKey !== 'physicalAssessment.prnt.goals'
    );

    const response = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-1')
      .send({ capacity: 'balance', sourceRefs: [], linkedProntuarioGoalIds: [] });

    expect(response.status).toBe(200);
    expect(mockClassificationFindMany).not.toHaveBeenCalled();
  });
});
