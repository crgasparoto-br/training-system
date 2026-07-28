import express from 'express';
import prontuarioRouter from '../src/modules/prontuario/prontuario.routes';
import { prontuarioService } from '../src/modules/prontuario/prontuario.service';
import { prontuarioOverviewReadService } from '../src/modules/prontuario/prontuario-overview-read.service';

const request = require('supertest');

const SUMMARY_BLOCK = 'physicalAssessment.prnt.summary';
const PARQ_BLOCK = 'physicalAssessment.prnt.parqSubmissions';

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'professor@example.com',
      type: 'professor',
      professorId: 'professor-1',
      professorRole: 'professor',
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
  screenAccessMiddleware: () => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
  blockAccessMiddleware: (blockKey: string) => (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const allowed = new Set((req.header('x-allowed-blocks') || '').split(',').filter(Boolean));
    if (allowed.has(blockKey)) return next();
    return res.status(403).json({ success: false, error: 'Perfil sem permissão para acessar este recurso' });
  },
}));

jest.mock('../src/modules/access-control/access-control.service', () => ({
  canProfessorAccessBlock: jest.fn().mockResolvedValue(false),
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    professor: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'professor-1',
        collaboratorFunction: { id: 'function-1' },
      }),
    },
  })),
}));

jest.mock('../src/modules/pre-registration-public/pre-registration-parq.service', () => {
  class ParqServiceError extends Error {
    constructor(
      message: string,
      readonly code: string
    ) {
      super(message);
      this.name = 'ParqServiceError';
    }
  }

  return {
    ParqServiceError,
    preRegistrationParqService: {
      reviewProfessional: jest.fn(),
    },
  };
});

jest.mock('../src/modules/prontuario/prontuario.service', () => ({
  prontuarioService: {
    listParqSubmissions: jest.fn(),
  },
}));

jest.mock('../src/modules/prontuario/prontuario-overview-read.service', () => ({
  prontuarioOverviewBoundaryPrisma: {
    professor: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'professor-1',
        collaboratorFunction: { id: 'function-1' },
      }),
    },
  },
  prontuarioOverviewReadService: {
    overview: jest.fn(),
  },
}));

const detailedSubmission = {
  id: 'submission-1',
  alunoId: 'aluno-1',
  contractId: 'contract-1',
  catalogVersion: 'parq-2026-01',
  submittedAt: '2026-07-26T10:00:00.000Z',
  responses: { q1: false, q2: true, q3: false, q4: false, q5: false, q6: false, q7: false },
  positiveItems: [{ key: 'q2', label: 'Resposta clínica protegida' }],
  positiveCount: 1,
  declarationAccepted: true,
  sourceType: 'student',
  review: {
    id: 'review-1',
    status: 'PENDING',
    reviewNotes: 'Observação clínica protegida',
  },
};

describe('prontuario PAR-Q authorization boundary', () => {
  const app = express();

  app.use(express.json());
  app.use('/api/v1/prontuario', prontuarioRouter);

  beforeEach(() => {
    jest.clearAllMocks();
    (prontuarioOverviewReadService.overview as jest.Mock).mockResolvedValue({
      records: [],
      currentRecord: null,
      latestParqSubmission: detailedSubmission,
      parqSubmissions: [detailedSubmission],
      parqState: 'COMPLETED_REVIEW_REQUIRED',
      parqLegacy: { preserved: false, needsRepeat: false },
    });
    (prontuarioService.listParqSubmissions as jest.Mock).mockResolvedValue([detailedSubmission]);
  });

  it('returns only the administrative PAR-Q summary with summary permission', async () => {
    const response = await request(app)
      .get('/api/v1/prontuario/alunos/aluno-1')
      .set('x-allowed-blocks', SUMMARY_BLOCK);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      records: [],
      currentRecord: null,
      parq: {
        state: 'COMPLETED_REVIEW_REQUIRED',
        latestSubmission: {
          id: 'submission-1',
          catalogVersion: 'parq-2026-01',
          submittedAt: '2026-07-26T10:00:00.000Z',
          positiveCount: 1,
          review: { status: 'PENDING' },
        },
        requiresProfessionalReview: true,
        legacy: { preserved: false, needsRepeat: false },
      },
    });

    expect(prontuarioOverviewReadService.overview).toHaveBeenCalledWith(
      'contract-1',
      'aluno-1',
      {
        goals: false,
        anamnesisFollowUp: false,
        activityHistory: false,
        medicationsProcedures: false,
        painCases: false,
        discomforts: false,
      }
    );

    const serialized = JSON.stringify(response.body.data);
    for (const forbidden of ['responses', 'positiveItems', 'reviewNotes', 'Resposta clínica protegida']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('denies the dedicated PAR-Q history endpoint without its specific block permission', async () => {
    const response = await request(app)
      .get('/api/v1/prontuario/alunos/aluno-1/parq-submissions')
      .set('x-allowed-blocks', SUMMARY_BLOCK);

    expect(response.status).toBe(403);
    expect(prontuarioService.listParqSubmissions).not.toHaveBeenCalled();
  });

  it('returns detailed PAR-Q history only with the specific block permission', async () => {
    const response = await request(app)
      .get('/api/v1/prontuario/alunos/aluno-1/parq-submissions')
      .set('x-allowed-blocks', PARQ_BLOCK);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      id: 'submission-1',
      responses: { q2: true },
      positiveItems: [{ key: 'q2', label: 'Resposta clínica protegida' }],
      review: { reviewNotes: 'Observação clínica protegida' },
    });
    expect(prontuarioService.listParqSubmissions).toHaveBeenCalledWith('contract-1', 'aluno-1');
  });
});
