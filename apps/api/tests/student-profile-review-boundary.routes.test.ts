import express from 'express';

const request = require('supertest');
const mockCompleteByStudent = jest.fn();
const mockResolveActiveStudentMembership = jest.fn();
const mockAlunoFindFirst = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    aluno: { findFirst: mockAlunoFindFirst },
    studentContract: { findMany: jest.fn() },
  })),
}));

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'aluno@example.com',
      type: 'aluno',
    } as any;
    next();
  },
  alunoMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../src/modules/alunos/profile-review.service', () => ({
  profileReviewService: {
    getPendingReviewForStudent: jest.fn(),
    completeByStudent: mockCompleteByStudent,
  },
}));

jest.mock('../src/modules/alunos/profile-audit.service', () => ({
  profileAuditService: { log: jest.fn() },
}));

jest.mock('../src/modules/assessments/assessment.service', () => ({
  assessmentService: {},
}));

jest.mock('../src/modules/alunos/aluno-assessment-plan.service', () => ({
  alunoAssessmentPlanService: {},
}));

jest.mock('../src/modules/alunos/student-account-context.service', () => {
  class StudentAccountContextError extends Error {
    constructor(
      message: string,
      public readonly code: 'STUDENT_NOT_FOUND' | 'STUDENT_CONTRACT_CONTEXT_REQUIRED'
    ) {
      super(message);
      this.name = 'StudentAccountContextError';
    }
  }

  return {
    normalizeRequestedStudentContractId: (value?: string | string[] | null) => {
      const raw = Array.isArray(value) ? value[0] : value;
      const normalized = raw?.trim();
      return normalized || undefined;
    },
    resolveActiveStudentMembership: mockResolveActiveStudentMembership,
    StudentAccountContextError,
  };
});

jest.mock('../src/modules/alunos/student-identity.service', () => ({
  loadStudentIdentity: jest.fn(),
  upsertStudentIdentity: jest.fn(),
}));

jest.mock('../src/modules/alunos/student-health-intake-write.service', () => ({
  hasCanonicalHealthIntakeMutation: jest.fn(() => false),
  upsertCanonicalStudentHealthIntake: jest.fn(),
}));

const router = require('../src/routes/student.routes').default;
const { StudentAccountContextError } = require('../src/modules/alunos/student-account-context.service');

describe('student profile review public boundary', () => {
  const app = express();
  app.use(express.json());
  app.use('/student', router);

  beforeEach(() => {
    jest.clearAllMocks();

    mockResolveActiveStudentMembership.mockImplementation(
      async (_userId: string, requestedContractId?: string) => {
        if (!requestedContractId) {
          throw new StudentAccountContextError(
            'Informe o contrato ativo para continuar.',
            'STUDENT_CONTRACT_CONTEXT_REQUIRED'
          );
        }
        if (requestedContractId === 'revoked-contract') {
          throw new StudentAccountContextError('Aluno não encontrado.', 'STUDENT_NOT_FOUND');
        }
        if (requestedContractId === 'contract-1') {
          return { id: 'aluno-1', contractId: 'contract-1' };
        }
        if (requestedContractId === 'contract-2') {
          return { id: 'aluno-2', contractId: 'contract-2' };
        }
        throw new StudentAccountContextError('Aluno não encontrado.', 'STUDENT_NOT_FOUND');
      }
    );

    mockAlunoFindFirst.mockImplementation(async ({ where }: { where: { id: string; contractId: string } }) => ({
      id: where.id,
      contractId: where.contractId,
      user: { id: 'user-1', email: 'aluno@example.com', profile: {} },
      studentProfile: null,
      studentHealthIntake: null,
      professor: { contractId: where.contractId },
      intakeForm: null,
      profileReviewSettings: null,
    }));

    mockCompleteByStudent.mockImplementation(async (input: { reviewId: string; contractId: string }) => {
      if (input.reviewId === 'review-contract-1' && input.contractId !== 'contract-1') {
        throw Object.assign(new Error('Revisão cadastral não encontrada'), { statusCode: 404 });
      }
      return {
        id: input.reviewId,
        status: 'completed_no_changes',
        approval: { requiresApproval: false, hasPendingApproval: false },
      };
    });
  });

  it('conclui a revisão usando o aluno e o contrato ativos selecionados no header', async () => {
    const response = await request(app)
      .post('/student/me/profile-reviews/review-contract-1/complete')
      .set('x-contract-id', 'contract-1')
      .send({ noChanges: true });

    expect(response.status).toBe(200);
    expect(mockResolveActiveStudentMembership).toHaveBeenCalledWith('user-1', 'contract-1');
    expect(mockAlunoFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'aluno-1', contractId: 'contract-1' },
      })
    );
    expect(mockCompleteByStudent).toHaveBeenCalledWith({
      reviewId: 'review-contract-1',
      alunoUserId: 'user-1',
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      noChanges: true,
      changes: undefined,
    });
  });

  it('não permite concluir revisão de outro contrato da mesma conta', async () => {
    const response = await request(app)
      .post('/student/me/profile-reviews/review-contract-1/complete')
      .set('x-contract-id', 'contract-2')
      .send({ noChanges: true });

    expect(response.status).toBe(404);
    expect(mockResolveActiveStudentMembership).toHaveBeenCalledWith('user-1', 'contract-2');
    expect(mockCompleteByStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewId: 'review-contract-1',
        alunoId: 'aluno-2',
        contractId: 'contract-2',
      })
    );
  });

  it('rejeita vínculo revogado ou inativo antes de chamar a conclusão', async () => {
    const response = await request(app)
      .post('/student/me/profile-reviews/review-contract-1/complete')
      .set('x-contract-id', 'revoked-contract')
      .send({ noChanges: true });

    expect(response.status).toBe(404);
    expect(mockCompleteByStudent).not.toHaveBeenCalled();
  });

  it('exige seleção explícita quando o contexto contratual é ambíguo', async () => {
    const response = await request(app)
      .post('/student/me/profile-reviews/review-contract-1/complete')
      .send({ noChanges: true });

    expect(response.status).toBe(409);
    expect(mockCompleteByStudent).not.toHaveBeenCalled();
  });
});
