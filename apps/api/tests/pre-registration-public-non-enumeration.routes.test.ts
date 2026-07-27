import type { Server } from 'node:http';
import express from 'express';

jest.mock('../src/modules/auth/auth.middleware.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { userId: 'public-user' } as typeof req.user;
    next();
  },
  alunoMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  professorMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import { preRegistrationAuthenticatedRoutes } from '../src/modules/pre-registration-public/index.js';
import { preRegistrationDuplicateReviewService } from '../src/modules/pre-registration-public/pre-registration-duplicate-review.service.js';
import { preRegistrationPublicAtomicService } from '../src/modules/pre-registration-public/pre-registration-public-atomic.service.js';
import { PreRegistrationPublicError } from '../src/modules/pre-registration-public/pre-registration-public.service.js';

const session = {
  alunoId: 'aluno-publico',
  status: 'PRE_REGISTRATION_IN_PROGRESS',
  version: 2,
  currentStep: 'CONTACT',
  lastSavedAt: '2026-07-27T20:00:00.000Z',
  tenant: { name: 'Academia', privacyNoticeUrl: 'https://example.com/privacidade' },
  identity: {
    name: 'Pessoa Teste',
    cpf: '52998224725',
    birthDate: '1990-01-01',
  },
  isMinor: false,
  claimRole: 'STUDENT',
  guardianAuthorization: { status: 'NOT_REQUIRED', role: 'STUDENT' },
  privacy: {
    noticeVersion: 'pre-registration-v1',
    noticeUrl: 'https://example.com/privacidade',
  },
  missingRequiredFields: ['phone', 'email'],
  duplicateWarnings: ['email'],
  nextSteps: [],
} as const;

type ResponseBody = {
  success?: boolean;
  data?: unknown;
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
  timestamp?: string;
};

describe('public pre-registration non-enumeration boundary', () => {
  const app = express();
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    app.use(express.json());
    app.use('/api/v1/pre-registration', preRegistrationAuthenticatedRoutes);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('Não foi possível iniciar o servidor de teste.');
        }
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function patchStep(): Promise<{ status: number; body: ResponseBody }> {
    const response = await fetch(
      `${baseUrl}/api/v1/pre-registration/processes/aluno-publico/steps`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 1,
          step: 'IDENTIFICATION',
          data: {
            name: 'Pessoa Teste',
            cpf: '52998224725',
            birthDate: '1990-01-01',
          },
        }),
      }
    );
    return {
      status: response.status,
      body: await response.json() as ResponseBody,
    };
  }

  it('returns the same public status and payload shape with or without a duplicate', async () => {
    const projectedSession = { ...session, duplicateWarnings: [] };
    jest
      .spyOn(preRegistrationDuplicateReviewService, 'hasPendingDuplicateReview')
      .mockResolvedValue(false);
    jest
      .spyOn(preRegistrationPublicAtomicService, 'saveStep')
      .mockResolvedValueOnce(session as never)
      .mockRejectedValueOnce(
        new PreRegistrationPublicError(
          'Seus dados precisam de revisão pela academia antes de continuar.',
          'DUPLICATE_REVIEW_REQUIRED',
          { reviewRequired: true, field: 'cpf' }
        )
      );
    jest
      .spyOn(preRegistrationPublicAtomicService, 'getSession')
      .mockResolvedValue(session as never);
    const preserve = jest
      .spyOn(preRegistrationDuplicateReviewService, 'preserveDuplicateConflict')
      .mockResolvedValue({ version: 2, currentStep: 'CONTACT' });
    jest
      .spyOn(preRegistrationDuplicateReviewService, 'projectPublicSession')
      .mockResolvedValue(projectedSession as never);

    const withoutDuplicate = await patchStep();
    const withDuplicate = await patchStep();
    const { timestamp: _withoutTimestamp, ...withoutPayload } = withoutDuplicate.body;
    const { timestamp: _withTimestamp, ...withPayload } = withDuplicate.body;

    expect(withoutDuplicate.status).toBe(200);
    expect(withDuplicate.status).toBe(200);
    expect(withPayload).toEqual(withoutPayload);
    expect(preserve).toHaveBeenCalledWith(
      'public-user',
      'aluno-publico',
      expect.objectContaining({ step: 'IDENTIFICATION' })
    );

    const serialized = JSON.stringify(withPayload);
    expect(serialized).not.toMatch(/duplicate|duplicidade|reviewRequired|outro cadastro/i);
    expect(serialized).not.toContain('"duplicateWarnings":["email"]');
  });
});
