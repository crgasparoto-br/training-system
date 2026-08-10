import express from 'express';

const request = require('supertest');
const mockProfessorFindFirst = jest.fn();
const mockAssessmentFindMany = jest.fn();
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
      studentAssessmentRecord: { findMany: mockAssessmentFindMany },
    },
  })
);

const assessmentParameterRoutes = require(
  '../src/modules/capacity-prescriptions/capacity-prescription-assessment-parameters.routes'
).default;

describe('capacity assessment parameter boundary', () => {
  const app = express();
  app.use(express.json());
  app.use('/capacity-prescriptions', assessmentParameterRoutes);
  app.post('/capacity-prescriptions/alunos/:alunoId', (req, res) => {
    res.status(200).json({ data: req.body });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockProfessorFindFirst.mockResolvedValue({ id: 'professor-1' });
    mockCanAccess.mockResolvedValue(true);
    mockAssessmentFindMany.mockResolvedValue([
      {
        measurements: [
          {
            metricKey: 'flexao_ombro_angulo',
            metricLabel: 'Flexão de ombro',
            valueNumber: 142,
            valueText: null,
          },
        ],
      },
    ]);
  });

  it('alimenta a prescrição manual de flexibilidade com a avaliação selecionada', async () => {
    const response = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-1')
      .send({
        capacity: 'flexibility',
        sourceRefs: [
          {
            type: 'flexibility_assessment',
            id: 'assessment-1',
            label: 'Flexibilidade 2026',
          },
        ],
        parameters: {
          type: 'flexibility',
          flexibility: {
            articulations: [{ name: 'Ombro', priority: 'high' }],
            expectedPse: 3,
          },
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.parameters).toMatchObject({
      type: 'flexibility',
      flexibility: {
        articulations: [{ name: 'Ombro', angle: 142, priority: 'high' }],
        expectedPse: 3,
      },
    });
    expect(mockAssessmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['assessment-1'] },
          contractId: 'contract-1',
          alunoId: 'aluno-1',
        }),
      })
    );
  });

  it('não mistura parâmetros derivados com conjunto versionado', async () => {
    const response = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-1')
      .send({
        capacity: 'flexibility',
        parameterSetIds: ['set-1'],
        sourceRefs: [
          {
            type: 'flexibility_assessment',
            id: 'assessment-1',
            label: 'Flexibilidade 2026',
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.parameters).toBeUndefined();
    expect(mockAssessmentFindMany).not.toHaveBeenCalled();
  });
});
