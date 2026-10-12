import type { NextFunction, Request, Response } from 'express';

const mockProfessorFindUnique = jest.fn();
const mockAccessPermissionFindFirst = jest.fn();
const mockCanProfessorAccessScreen = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    professor: {
      findUnique: mockProfessorFindUnique,
    },
    accessPermission: {
      findFirst: mockAccessPermissionFindFirst,
    },
  })),
}));

jest.mock('../src/modules/access-control/access-control.service', () => ({
  canProfessorAccessBlock: jest.fn(),
  canProfessorAccessScreen: mockCanProfessorAccessScreen,
}));

const { explicitBlockAccessMiddleware } = require(
  '../src/modules/access-control/access-control.middleware'
);

const createResponse = () => {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  (response.status as jest.Mock).mockReturnValue(response);
  return response;
};

const masterProfessor = {
  id: 'professor-1',
  userId: 'user-1',
  contractId: 'contract-1',
  role: 'master',
  collaboratorFunctionId: 'function-1',
  currentStatus: 'active',
  dismissalDate: null,
  user: {
    isActive: true,
  },
  collaboratorFunction: {
    id: 'function-1',
    code: 'master',
  },
  contract: {
    id: 'contract-1',
    type: 'company',
    document: '00000000000000',
    name: 'Contrato Teste',
  },
};

describe('explicitBlockAccessMiddleware for post-workout feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfessorFindUnique.mockResolvedValue(masterProfessor);
    mockCanProfessorAccessScreen.mockResolvedValue(true);
    mockAccessPermissionFindFirst.mockResolvedValue(null);
  });

  it('denies a master professor without an explicit persisted grant', async () => {
    const middleware = explicitBlockAccessMiddleware(
      'students.details.postWorkoutFeedback'
    );
    const request = {
      user: {
        userId: 'user-1',
        type: 'professor',
      },
    } as Request;
    const response = createResponse();
    const next = jest.fn() as NextFunction;

    await middleware(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: 'Ação sensível sem concessão explícita',
    });
    expect(mockAccessPermissionFindFirst).toHaveBeenCalledWith({
      where: {
        collaboratorFunctionId: 'function-1',
        screenKey: 'students.details',
        blockKey: 'students.details.postWorkoutFeedback',
        canView: true,
      },
      select: { id: true },
    });
  });

  it('allows access when the explicit persisted grant exists', async () => {
    mockAccessPermissionFindFirst.mockResolvedValue({ id: 'permission-1' });

    const middleware = explicitBlockAccessMiddleware(
      'students.details.postWorkoutFeedback'
    );
    const request = {
      user: {
        userId: 'user-1',
        type: 'professor',
      },
    } as Request;
    const response = createResponse();
    const next = jest.fn() as NextFunction;

    await middleware(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
    expect((request as any).user.professorId).toBe('professor-1');
    expect((request as any).user.contractId).toBe('contract-1');
    expect((request as any).user.professorRole).toBe('master');
    expect((request as any).user.collaboratorFunctionId).toBe('function-1');
  });
});
