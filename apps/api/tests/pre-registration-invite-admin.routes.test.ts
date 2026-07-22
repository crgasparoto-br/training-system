import express from 'express';

const request = require('supertest');

let mockHasAccess = true;

const preRegistrationInviteServiceMock = {
  generateFirstInvite: jest.fn(),
  regenerateInvite: jest.fn(),
  revokeInvite: jest.fn(),
  getSummary: jest.fn(),
  getHistory: jest.fn(),
  getAllowedActions: jest.fn(),
};

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
  professorMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  blockAccessMiddleware:
    () => (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!mockHasAccess) {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }
      return next();
    },
}));

jest.mock('../src/modules/pre-registration-invites/pre-registration-invite.service', () => ({
  PreRegistrationInviteError: class extends Error {},
  PreRegistrationInvitePublicAccessError: class extends Error {},
  preRegistrationInviteService: preRegistrationInviteServiceMock,
}));

const preRegistrationInviteAdminRoutes =
  require('../src/modules/pre-registration-invites/pre-registration-invite.routes').default;

describe('pre-registration invite admin routes - permissão dedicada', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/alunos', preRegistrationInviteAdminRoutes);

  beforeEach(() => {
    mockHasAccess = true;
    jest.clearAllMocks();
    preRegistrationInviteServiceMock.getSummary.mockResolvedValue({ id: 'invite-1' });
    preRegistrationInviteServiceMock.getHistory.mockResolvedValue([]);
    preRegistrationInviteServiceMock.getAllowedActions.mockResolvedValue({
      canGenerateFirst: false,
      canRegenerate: true,
      canRevoke: true,
    });
  });

  // Critério de consistência: as rotas GET administrativas do módulo (summary,
  // history, allowed-actions) devem exigir a mesma permissão dedicada
  // students.actions.manageEnrollmentInvite que as mutações, e não apenas
  // autenticação de professor do tenant.
  it.each([
    ['/api/v1/alunos/aluno-1/pre-registration-invites/summary'],
    ['/api/v1/alunos/aluno-1/pre-registration-invites/history'],
    ['/api/v1/alunos/aluno-1/pre-registration-invites/allowed-actions'],
  ])('nega acesso (403) a %s sem a permissão dedicada', async (path) => {
    mockHasAccess = false;

    const res = await request(app).get(path);

    expect(res.status).toBe(403);
  });

  it.each([
    ['/api/v1/alunos/aluno-1/pre-registration-invites/summary'],
    ['/api/v1/alunos/aluno-1/pre-registration-invites/history'],
    ['/api/v1/alunos/aluno-1/pre-registration-invites/allowed-actions'],
  ])('permite acesso a %s quando a permissão dedicada está presente', async (path) => {
    mockHasAccess = true;

    const res = await request(app).get(path);

    expect(res.status).toBe(200);
  });
});
