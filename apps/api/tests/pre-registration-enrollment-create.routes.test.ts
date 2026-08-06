import express from 'express';

const request = require('supertest');
const mockCreate = jest.fn();
const mockGetDetail = jest.fn();

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'master@example.com',
      type: 'professor',
      professorId: 'professor-1',
      contractId: 'contract-1',
    };
    next();
  },
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  screenAccessMiddleware:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  blockAccessMiddleware:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock(
  '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service',
  () => ({
    preRegistrationEnrollmentCreateService: { create: mockCreate },
  })
);

jest.mock('../src/modules/pre-registration-admin/pre-registration-admin.service', () => {
  class PreRegistrationAdminError extends Error {
    constructor(message: string, public readonly code: string) {
      super(message);
    }
  }
  return {
    PreRegistrationAdminError,
    preRegistrationAdminService: { getDetail: mockGetDetail },
  };
});

jest.mock('../src/modules/pre-registration-enrollment/pre-registration-enrollment-access.service', () => ({
  assertPreRegistrationAlunoVisible: jest.fn(),
}));

jest.mock('../src/modules/pre-registration-enrollment/pre-registration-enrollment-response.service', () => ({
  assertDuplicateDecisionScope: jest.fn(),
  projectScopedEnrollmentReview: jest.fn(),
  projectScopedLeadDuplicateCheck: jest.fn(),
}));

jest.mock('../src/modules/pre-registration-enrollment/pre-registration-enrollment.service', () => {
  class PreRegistrationEnrollmentError extends Error {
    constructor(message: string, public readonly code: string, public readonly details?: object) {
      super(message);
    }
  }
  return {
    PreRegistrationEnrollmentError,
    preRegistrationEnrollmentService: {
      inspectProposedLead: jest.fn(),
      inspectProposedUpdate: jest.fn(),
      inspect: jest.fn(),
      decide: jest.fn(),
      markReady: jest.fn(),
      confirmEnrollment: jest.fn(),
    },
  };
});

const { PreRegistrationAdminError } = require(
  '../src/modules/pre-registration-admin/pre-registration-admin.service'
);
const { PreRegistrationEnrollmentError } = require(
  '../src/modules/pre-registration-enrollment/pre-registration-enrollment.service'
);
const { preRegistrationEnrollmentRoutes } = require(
  '../src/modules/pre-registration-enrollment/pre-registration-enrollment.routes'
);

describe('pre-registration lead creation route', () => {
  const app = express();
  app.use(express.json());
  app.use('/pre-registration-admin', preRegistrationEnrollmentRoutes);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'PRE_REGISTRATION_INTERNAL_ERROR', cause: error });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a controlled 400 for invalid lead input', async () => {
    const error = new PreRegistrationEnrollmentError(
      'Informe um telefone válido com DDD.',
      'INVALID_INPUT',
      { fields: ['phone'] }
    );
    mockCreate.mockRejectedValue(error);

    const response = await request(app)
      .post('/pre-registration-admin/leads')
      .send({ name: 'Maria', origin: 'Campanha', phone: '1234' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: 'Informe um telefone válido com DDD.',
      code: 'INVALID_INPUT',
    });
    expect(response.body.error).not.toBe('PRE_REGISTRATION_INTERNAL_ERROR');
    expect(mockGetDetail).not.toHaveBeenCalled();
  });

  it('keeps a known post-create domain failure out of the generic 500 boundary', async () => {
    mockCreate.mockResolvedValue('lead-1');
    mockGetDetail.mockRejectedValue(
      new PreRegistrationAdminError('Pré-matrícula não encontrada.', 'NOT_FOUND')
    );

    const response = await request(app)
      .post('/pre-registration-admin/leads')
      .send({ name: 'Maria', origin: 'Campanha', email: 'maria@example.com' });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: 'Pré-matrícula não encontrada.',
      code: 'NOT_FOUND',
    });
    expect(response.body.error).not.toBe('PRE_REGISTRATION_INTERNAL_ERROR');
  });
});
