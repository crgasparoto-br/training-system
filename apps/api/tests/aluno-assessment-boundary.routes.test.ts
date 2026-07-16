import express from 'express';

const request = require('supertest');

const mockAlunoService = {
  belongsToContract: jest.fn(),
  belongsToProfessor: jest.fn(),
  update: jest.fn(),
};

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-master',
      email: 'master@example.com',
      type: 'professor',
      professorId: 'professor-1',
      professorRole: 'master',
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

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  screenAccessMiddleware: jest.fn(() => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next()),
  blockAccessMiddleware: jest.fn(() => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next()),
}));

jest.mock('../src/modules/alunos/aluno.service', () => ({
  alunoService: mockAlunoService,
}));

jest.mock('../src/modules/assessments/assessment.service', () => ({
  assessmentService: {},
}));

jest.mock('../src/modules/alunos/aluno-assessment-plan.service', () => ({
  alunoAssessmentPlanService: {},
}));

jest.mock('../src/modules/alunos/profile-review.service', () => ({
  profileReviewService: {},
}));

jest.mock('../src/modules/alunos/profile-audit.service', () => ({
  profileAuditService: {},
}));

jest.mock('../src/modules/alunos/assessment-plan-notification.service', () => ({
  assessmentPlanNotificationService: {},
}));

jest.mock('../src/modules/student-contracts/student-contract.service', () => ({
  studentContractService: {},
}));

jest.mock('../src/modules/assessments/assessment-parser', () => ({
  parseAssessmentPdf: jest.fn(),
}));

jest.mock('../src/modules/assessments/assessment-ai', () => ({
  fillAssessmentWithAi: jest.fn(),
}));

const alunoRouter = require('../src/modules/alunos/aluno.routes').default;

const assessmentKeys = [
  'weight',
  'height',
  'bodyFatPercentage',
  'vo2Max',
  'anaerobicThreshold',
  'maxHeartRate',
  'restingHeartRate',
  'systolicPressure',
  'diastolicPressure',
  'macronutrients',
  'assessmentDate',
] as const;

const emptyParq = {
  q1: false,
  q2: false,
  q3: false,
  q4: false,
  q5: false,
  q6: false,
  q7: false,
  q8: false,
};

describe('PUT /alunos/:id assessment boundary', () => {
  const app = express();

  app.use(express.json());
  app.use('/alunos', alunoRouter);

  beforeEach(() => {
    jest.clearAllMocks();
    mockAlunoService.belongsToContract.mockResolvedValue(true);
    mockAlunoService.update.mockResolvedValue({
      id: 'aluno-1',
      age: 31,
      weight: 80,
      height: 175,
      bodyFatPercentage: 18,
      vo2Max: 45,
      anaerobicThreshold: 160,
      maxHeartRate: 188,
      restingHeartRate: 60,
      systolicPressure: 120,
      diastolicPressure: 80,
      macronutrients: {
        carbohydratesPercentage: 50,
        proteinsPercentage: 25,
        lipidsPercentage: 25,
        dailyCalories: 2200,
      },
      intakeForm: {
        assessmentDate: '2026-06-01T00:00:00.000Z',
        mainGoal: 'Objetivo atualizado',
        trainingBackground: 'Treino atualizado',
      },
      progressMetrics: [
        {
          id: 'metric-1',
          date: '2026-06-01T00:00:00.000Z',
          weight: 80,
          bodyFatPercentage: 18,
          vo2MaxEstimated: 45,
        },
      ],
    });
  });

  it('encaminha apenas cadastro e anamnese e mantém os dados históricos na resposta', async () => {
    const response = await request(app)
      .put('/alunos/aluno-1')
      .send({
        age: 31,
        schedulePlan: 'free',
        intakeForm: {
          mainGoal: 'Objetivo atualizado',
          medicalHistory: 'Histórico preservado',
          currentMedications: 'Nenhuma',
          injuriesHistory: 'Sem lesões',
          trainingBackground: 'Treino atualizado',
          observations: 'Observação atualizada',
          parqResponses: emptyParq,
          formResponses: {
            identification: {},
            financial: {},
            preferences: {},
            ahaResponses: {},
          },
        },
      });

    expect(response.status).toBe(200);
    expect(mockAlunoService.belongsToContract).toHaveBeenCalledWith('aluno-1', 'contract-1');
    expect(mockAlunoService.update).toHaveBeenCalledTimes(1);

    const [, payload] = mockAlunoService.update.mock.calls[0];
    const serializedPayload = JSON.stringify(payload);
    assessmentKeys.forEach((key) => {
      expect(serializedPayload).not.toContain(`\"${key}\"`);
    });

    expect(response.body.data).toMatchObject({
      weight: 80,
      height: 175,
      bodyFatPercentage: 18,
      vo2Max: 45,
      macronutrients: {
        carbohydratesPercentage: 50,
        proteinsPercentage: 25,
        lipidsPercentage: 25,
        dailyCalories: 2200,
      },
      intakeForm: {
        assessmentDate: '2026-06-01T00:00:00.000Z',
      },
      progressMetrics: [
        {
          id: 'metric-1',
          weight: 80,
          bodyFatPercentage: 18,
          vo2MaxEstimated: 45,
        },
      ],
    });
  });
});
