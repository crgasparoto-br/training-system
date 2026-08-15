import express from 'express';

const request = require('supertest');

jest.mock('@prisma/client', () => {
  const aluno = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const studentProfileReview = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const alunoProfileReviewSettings = {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  };
  const profileReviewPolicy = { findFirst: jest.fn() };
  const studentContract = { findMany: jest.fn() };

  const instance: Record<string, unknown> = {
    aluno,
    studentProfileReview,
    alunoProfileReviewSettings,
    profileReviewPolicy,
    studentContract,
    $transaction: jest.fn(),
  };

  (instance.$transaction as jest.Mock).mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback(instance)
  );

  return {
    PrismaClient: jest.fn(() => instance),
    StudentProfileReviewStatus: {
      pending: 'pending',
      completed_no_changes: 'completed_no_changes',
      completed_with_changes: 'completed_with_changes',
    },
    Prisma: { JsonNull: null },
    _db: instance,
  };
});

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

jest.mock('../src/modules/notifications/notification.service', () => ({
  notificationService: { create: jest.fn().mockResolvedValue(true) },
}));

jest.mock('../src/modules/alunos/profile-audit.service', () => ({
  profileAuditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../src/modules/assessments/assessment.service', () => ({
  assessmentService: {},
}));

jest.mock('../src/modules/alunos/aluno-assessment-plan.service', () => ({
  alunoAssessmentPlanService: {},
}));

const mockResolveActiveStudentMembership = jest.fn();
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
  loadStudentIdentity: jest.fn().mockResolvedValue({
    name: 'Aluno Teste',
    phone: null,
    birthDate: null,
    gender: null,
    cpf: null,
    rg: null,
    maritalStatus: null,
    addressStreet: null,
    addressNumber: null,
    addressComplement: null,
    addressNeighborhood: null,
    addressCity: null,
    addressState: null,
    addressZipCode: null,
    instagramHandle: null,
  }),
  upsertStudentIdentity: jest.fn(),
}));

jest.mock('../src/modules/alunos/student-health-intake-write.service', () => ({
  hasCanonicalHealthIntakeMutation: jest.fn(() => false),
  upsertCanonicalStudentHealthIntake: jest.fn(),
}));

const router = require('../src/routes/student.routes').default;
const { StudentAccountContextError } = require('../src/modules/alunos/student-account-context.service');

type DbMock = {
  aluno: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  studentProfileReview: { findUnique: jest.Mock; update: jest.Mock };
  alunoProfileReviewSettings: { findUnique: jest.Mock; upsert: jest.Mock };
  profileReviewPolicy: { findFirst: jest.Mock };
  studentContract: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

const db = (jest.requireMock('@prisma/client') as { _db: DbMock })._db;

const makeRouteAluno = (id: string, contractId: string) => ({
  id,
  contractId,
  userId: 'user-1',
  status: 'ACTIVE_STUDENT',
  age: 30,
  weight: 75,
  height: 175,
  bodyFatPercentage: null,
  vo2Max: null,
  anaerobicThreshold: null,
  maxHeartRate: null,
  restingHeartRate: null,
  systolicPressure: null,
  diastolicPressure: null,
  user: { id: 'user-1', email: 'aluno@example.com', profile: {} },
  studentProfile: null,
  studentHealthIntake: null,
  professor: { contractId },
  intakeForm: null,
  profileReviewSettings: null,
});

const makeReview = (contractId = 'contract-1') => ({
  id: 'review-contract-1',
  alunoId: 'aluno-1',
  requestedAt: new Date('2026-08-01T00:00:00Z'),
  dueAt: null,
  completedAt: null,
  status: 'pending',
  requiresApproval: false,
  approvedAt: null,
  approvedByUserId: null,
  rejectedAt: null,
  rejectedByUserId: null,
  rejectionReason: null,
  changedFields: null,
  snapshotBefore: null,
  snapshotAfter: null,
  nextReviewAt: null,
  sectionsRequested: null,
  aluno: {
    id: 'aluno-1',
    contractId,
    user: { id: 'user-1' },
    professor: { contractId },
  },
});

describe('student profile review public boundary', () => {
  const app = express();
  app.use(express.json());
  app.use('/student', router);

  beforeEach(() => {
    jest.clearAllMocks();

    db.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(db));
    db.alunoProfileReviewSettings.findUnique.mockResolvedValue(null);
    db.alunoProfileReviewSettings.upsert.mockResolvedValue({});
    db.profileReviewPolicy.findFirst.mockResolvedValue(null);

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

    db.aluno.findFirst.mockImplementation(
      async ({ where }: { where: { id: string; contractId: string } }) => {
        if (where.id === 'aluno-1' && where.contractId === 'contract-1') {
          return makeRouteAluno('aluno-1', 'contract-1');
        }
        if (where.id === 'aluno-2' && where.contractId === 'contract-2') {
          return makeRouteAluno('aluno-2', 'contract-2');
        }
        return null;
      }
    );

    db.aluno.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === 'aluno-1' ? makeRouteAluno('aluno-1', 'contract-1') : null
    );

    db.studentProfileReview.findUnique.mockResolvedValue(makeReview());
    db.studentProfileReview.update.mockResolvedValue({
      ...makeReview(),
      status: 'completed_no_changes',
      completedAt: new Date('2026-08-15T00:00:00Z'),
      changedFields: [],
    });
  });

  it('conclui a revisão usando o aluno e o contrato ativos selecionados no header', async () => {
    const response = await request(app)
      .post('/student/me/profile-reviews/review-contract-1/complete')
      .set('x-contract-id', 'contract-1')
      .send({ noChanges: true });

    expect(response.status).toBe(200);
    expect(mockResolveActiveStudentMembership).toHaveBeenCalledWith('user-1', 'contract-1');
    expect(db.aluno.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'aluno-1', contractId: 'contract-1' },
      })
    );
    expect(db.studentProfileReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'review-contract-1', alunoId: 'aluno-1', status: 'pending' },
      })
    );
  });

  it('não permite concluir revisão de outro contrato da mesma conta', async () => {
    const response = await request(app)
      .post('/student/me/profile-reviews/review-contract-1/complete')
      .set('x-contract-id', 'contract-2')
      .send({ noChanges: true });

    expect(response.status).toBe(404);
    expect(mockResolveActiveStudentMembership).toHaveBeenCalledWith('user-1', 'contract-2');
    expect(db.studentProfileReview.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'review-contract-1' } })
    );
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.studentProfileReview.update).not.toHaveBeenCalled();
  });

  it('rejeita vínculo revogado ou inativo antes de consultar ou concluir a revisão', async () => {
    const response = await request(app)
      .post('/student/me/profile-reviews/review-contract-1/complete')
      .set('x-contract-id', 'revoked-contract')
      .send({ noChanges: true });

    expect(response.status).toBe(404);
    expect(db.studentProfileReview.findUnique).not.toHaveBeenCalled();
    expect(db.studentProfileReview.update).not.toHaveBeenCalled();
  });

  it('exige seleção explícita quando o contexto contratual é ambíguo', async () => {
    const response = await request(app)
      .post('/student/me/profile-reviews/review-contract-1/complete')
      .send({ noChanges: true });

    expect(response.status).toBe(409);
    expect(db.studentProfileReview.findUnique).not.toHaveBeenCalled();
    expect(db.studentProfileReview.update).not.toHaveBeenCalled();
  });
});
