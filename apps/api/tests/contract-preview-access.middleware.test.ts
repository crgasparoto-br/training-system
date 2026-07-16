import type { NextFunction, Request, Response } from 'express';

const mockFindUnique = jest.fn();
const mockCanProfessorAccessBlock = jest.fn();
const mockCanProfessorAccessScreen = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    professor: {
      findUnique: mockFindUnique,
    },
  })),
}));

jest.mock('../src/modules/access-control/access-control.service', () => ({
  canProfessorAccessBlock: mockCanProfessorAccessBlock,
  canProfessorAccessScreen: mockCanProfessorAccessScreen,
}));

const { contractPreviewAccessMiddleware } = require(
  '../src/modules/contracts/contract-preview-access.middleware'
);

const createResponse = () => {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  (response.status as jest.Mock).mockReturnValue(response);
  return response;
};

const professor = {
  id: 'professor-1',
  role: 'professor',
  collaboratorFunction: {
    id: 'function-1',
    code: 'administrative',
  },
};

describe('contractPreviewAccessMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue(professor);
    mockCanProfessorAccessBlock.mockResolvedValue(false);
    mockCanProfessorAccessScreen.mockResolvedValue(false);
  });

  it('allows preview through the financial contract permission', async () => {
    mockCanProfessorAccessBlock.mockResolvedValue(true);
    const request = {
      user: { userId: 'user-1', type: 'professor' },
    } as Request;
    const response = createResponse();
    const next = jest.fn() as NextFunction;

    await contractPreviewAccessMiddleware(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockCanProfessorAccessBlock).toHaveBeenCalledWith(
      professor,
      'students.actions.manageFinancialContract'
    );
  });

  it('allows preview through settings.contract without financial permission', async () => {
    mockCanProfessorAccessScreen.mockResolvedValue(true);
    const request = {
      user: { userId: 'user-1', type: 'professor' },
    } as Request;
    const response = createResponse();
    const next = jest.fn() as NextFunction;

    await contractPreviewAccessMiddleware(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockCanProfessorAccessScreen).toHaveBeenCalledWith(
      professor,
      'settings.contract'
    );
  });

  it('denies preview when neither permission is available', async () => {
    const request = {
      user: { userId: 'user-1', type: 'professor' },
    } as Request;
    const response = createResponse();
    const next = jest.fn() as NextFunction;

    await contractPreviewAccessMiddleware(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: 'Perfil sem permissão para acessar este recurso',
    });
  });
});
