import express from 'express';

const request = require('supertest');
const mockFindUnique = jest.fn();

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

jest.mock(
  '../src/modules/capacity-prescriptions/capacity-prescription-source-permission.routes',
  () => ({
    capacityPrescriptionBoundaryPrisma: {
      capacityPrescription: {
        findUnique: mockFindUnique,
      },
    },
  })
);

const statusNormalizationRoutes = require(
  '../src/modules/capacity-prescriptions/capacity-prescription-status-normalization.routes'
).default;

describe('capacity prescription status normalization boundary', () => {
  const app = express();
  app.use(express.json());
  app.use('/capacity-prescriptions', statusNormalizationRoutes);
  app.post('/capacity-prescriptions/alunos/:alunoId', (req, res) => {
    return res.status(200).json({ data: req.body });
  });

  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  it('rejects an existing update when the client omits the observed version', async () => {
    mockFindUnique.mockResolvedValueOnce({ status: 'active', currentVersion: 4 });

    const response = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-1')
      .send({ capacity: 'resisted' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('A prescrição foi alterada por outro usuário');
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        contractId_alunoId_capacity: {
          contractId: 'contract-1',
          alunoId: 'aluno-1',
          capacity: 'resisted',
        },
      },
      select: { status: true, currentVersion: true },
    });
  });

  it('defaults the first version to planned and binds creation to version zero', async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const response = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-1')
      .send({ capacity: 'cyclic' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      capacity: 'cyclic',
      status: 'planned',
      expectedCurrentVersion: 0,
    });
  });

  it('preserves an explicit optimistic version supplied by the client', async () => {
    mockFindUnique.mockResolvedValueOnce({ status: 'adjusting', currentVersion: 7 });

    const response = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-1')
      .send({ capacity: 'flexibility', expectedCurrentVersion: 7 });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      capacity: 'flexibility',
      status: 'adjusting',
      expectedCurrentVersion: 7,
    });
  });

  it('rejects an explicit status update when the client omits the observed version', async () => {
    mockFindUnique.mockResolvedValueOnce({ status: 'adjusting', currentVersion: 7 });

    const response = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-1')
      .send({ capacity: 'flexibility', status: 'active' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('A prescrição foi alterada por outro usuário');
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
  });

  it('keeps an explicit status and binds a new prescription to version zero', async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const response = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-1')
      .send({ capacity: 'balance', status: 'active' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      capacity: 'balance',
      status: 'active',
      expectedCurrentVersion: 0,
    });
  });

  it('does not replace explicit status or optimistic version supplied together', async () => {
    const response = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-1')
      .send({ capacity: 'balance', status: 'suspended', expectedCurrentVersion: 3 });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      capacity: 'balance',
      status: 'suspended',
      expectedCurrentVersion: 3,
    });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('leaves explicit invalid values for the canonical schema to reject', async () => {
    const response = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-1')
      .send({ capacity: 'balance', status: null });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ capacity: 'balance', status: null });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
