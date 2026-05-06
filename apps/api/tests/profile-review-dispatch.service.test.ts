// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
jest.mock('@prisma/client', () => {
  const aluno = { findMany: jest.fn() };
  const alunoProfileReviewSettings = { findUnique: jest.fn() };
  const profileReviewPolicy = { findFirst: jest.fn() };
  const studentProfileReview = { findFirst: jest.fn() };

  const instance = {
    aluno,
    alunoProfileReviewSettings,
    profileReviewPolicy,
    studentProfileReview,
    $transaction: jest.fn(),
  };

  return { PrismaClient: jest.fn(() => instance), _db: instance };
});

jest.mock('../src/modules/alunos/profile-review.service', () => ({
  profileReviewService: {
    createManualReview: jest.fn(),
    getEffectiveSettings: jest.fn(),
  },
}));

jest.mock('../src/modules/notifications/notification.service', () => ({
  notificationService: { create: jest.fn().mockResolvedValue(true) },
}));

import { profileReviewDispatchService } from '../src/modules/alunos/profile-review-dispatch.service';

type DbMock = {
  aluno: { findMany: jest.Mock };
  alunoProfileReviewSettings: { findUnique: jest.Mock };
  profileReviewPolicy: { findFirst: jest.Mock };
  studentProfileReview: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

const db = (jest.requireMock('@prisma/client') as { _db: DbMock })._db;
const { profileReviewService: mockReviewService } = jest.requireMock('../src/modules/alunos/profile-review.service') as {
  profileReviewService: { createManualReview: jest.Mock; getEffectiveSettings: jest.Mock };
};
const { notificationService } = jest.requireMock('../src/modules/notifications/notification.service') as {
  notificationService: { create: jest.Mock };
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const CONTRACT_ID = 'contract-1';

function makeActiveAluno(id = 'aluno-1', overrides: Record<string, unknown> = {}) {
  return {
    id,
    createdAt: new Date('2025-01-01'),
    user: { id: `user-${id}` },
    professor: { contractId: CONTRACT_ID },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  notificationService.create.mockResolvedValue(true);
  mockReviewService.createManualReview.mockResolvedValue({ id: 'review-new' });
  mockReviewService.getEffectiveSettings.mockResolvedValue({
    effective: { reviewPeriodMonths: 4, sectionsRequested: [] },
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('profileReviewDispatchService', () => {
  // ── Notificação na criação ────────────────────────────────────────────────
  describe('criação de revisão', () => {
    it('cria revisão quando aluno está elegível (nextReviewAt <= threshold)', async () => {
      const aluno = makeActiveAluno();
      db.aluno.findMany.mockResolvedValue([aluno]);
      db.alunoProfileReviewSettings.findUnique.mockResolvedValue({
        alunoId: aluno.id,
        reviewPeriodMonths: 4,
        nextReviewAt: null,
        isReviewRequired: true,
      });
      db.profileReviewPolicy.findFirst.mockResolvedValue(null);
      // no pending review
      db.studentProfileReview.findFirst
        .mockResolvedValueOnce(null) // latestReview
        .mockResolvedValueOnce(null); // pendingReview

      // now is after nextReviewAt (aluno created 2025-01-01, +4 months = 2025-05-01, which is past)
      const result = await profileReviewDispatchService.dispatchDueProfileReviews({
        now: new Date('2026-05-05'),
        upcomingWindowDays: 7,
      });

      expect(mockReviewService.createManualReview).toHaveBeenCalledWith(
        expect.objectContaining({ alunoId: aluno.id }),
      );
      expect(result.createdReviews).toBe(1);
    });
  });

  // ── Não duplica revisão pendente ──────────────────────────────────────────
  describe('não duplicar revisão pendente', () => {
    it('pula aluno quando já existe revisão pendente não vencida', async () => {
      const aluno = makeActiveAluno();
      db.aluno.findMany.mockResolvedValue([aluno]);
      db.alunoProfileReviewSettings.findUnique.mockResolvedValue({
        alunoId: aluno.id,
        reviewPeriodMonths: 4,
        nextReviewAt: null,
        isReviewRequired: true,
      });
      db.profileReviewPolicy.findFirst.mockResolvedValue(null);
      db.studentProfileReview.findFirst
        .mockResolvedValueOnce(null) // latestReview
        .mockResolvedValueOnce({ id: 'review-pending', dueAt: new Date('2026-12-01') }); // pendingReview (due in the future)

      const result = await profileReviewDispatchService.dispatchDueProfileReviews({
        now: new Date('2026-05-05'),
      });

      expect(mockReviewService.createManualReview).not.toHaveBeenCalled();
      expect(result.skippedWithOpenPending).toBe(1);
    });

    it('pula aluno quando revisão pendente está vencida (não cria duplicata)', async () => {
      const aluno = makeActiveAluno();
      db.aluno.findMany.mockResolvedValue([aluno]);
      db.alunoProfileReviewSettings.findUnique.mockResolvedValue({
        alunoId: aluno.id,
        reviewPeriodMonths: 4,
        nextReviewAt: null,
        isReviewRequired: true,
      });
      db.profileReviewPolicy.findFirst.mockResolvedValue(null);
      db.studentProfileReview.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'review-old', dueAt: new Date('2026-01-01') }); // overdue pending

      const result = await profileReviewDispatchService.dispatchDueProfileReviews({
        now: new Date('2026-05-05'),
        createOverdueReminder: false,
      });

      expect(mockReviewService.createManualReview).not.toHaveBeenCalled();
      expect(result.skippedWithOpenPending).toBe(1);
    });
  });

  // ── Respeita período individual do aluno ──────────────────────────────────
  describe('respeita período individual do aluno', () => {
    it('usa reviewPeriodMonths individual do aluno (não o padrão da política)', async () => {
      // Aluno A: period = 1 month (should be due)
      // Aluno B: period = 24 months (should NOT be due yet)
      const alunoA = makeActiveAluno('aluno-a');
      const alunoB = makeActiveAluno('aluno-b', { createdAt: new Date('2025-01-01') });

      db.aluno.findMany.mockResolvedValue([alunoA, alunoB]);
      db.profileReviewPolicy.findFirst.mockResolvedValue({
        defaultReviewPeriodMonths: 12,
        sections: null,
        reminderBeforeDays: 7,
      });
      db.studentProfileReview.findFirst.mockResolvedValue(null); // no reviews for any

      // alunoA: 1-month period → next review = createdAt + 1m = 2025-02-01 (already past)
      // alunoB: 24-month period → next review = 2025-01-01 + 24m = 2027-01-01 (not due yet)
      db.alunoProfileReviewSettings.findUnique
        .mockResolvedValueOnce({ alunoId: 'aluno-a', reviewPeriodMonths: 1, nextReviewAt: null, isReviewRequired: true })
        .mockResolvedValueOnce({ alunoId: 'aluno-b', reviewPeriodMonths: 24, nextReviewAt: null, isReviewRequired: true });

      const result = await profileReviewDispatchService.dispatchDueProfileReviews({
        now: new Date('2026-05-05'),
        upcomingWindowDays: 7,
      });

      expect(result.eligibleAlunos).toBe(1);
      expect(result.createdReviews).toBe(1);
      // alunoA should have triggered createManualReview
      expect(mockReviewService.createManualReview).toHaveBeenCalledWith(
        expect.objectContaining({ alunoId: 'aluno-a' }),
      );
      expect(result.skippedNotDue).toBe(1); // alunoB skipped
    });

    it('pula aluno quando isReviewRequired = false', async () => {
      const aluno = makeActiveAluno();
      db.aluno.findMany.mockResolvedValue([aluno]);
      db.alunoProfileReviewSettings.findUnique.mockResolvedValue({
        alunoId: aluno.id,
        reviewPeriodMonths: 4,
        nextReviewAt: null,
        isReviewRequired: false, // disabled
      });
      db.profileReviewPolicy.findFirst.mockResolvedValue(null);
      db.studentProfileReview.findFirst.mockResolvedValue(null);

      const result = await profileReviewDispatchService.dispatchDueProfileReviews({
        now: new Date('2026-05-05'),
      });

      expect(mockReviewService.createManualReview).not.toHaveBeenCalled();
      expect(result.skippedNotDue).toBe(1);
    });

    it('não cria revisão em modo dryRun', async () => {
      const aluno = makeActiveAluno();
      db.aluno.findMany.mockResolvedValue([aluno]);
      db.alunoProfileReviewSettings.findUnique.mockResolvedValue({
        alunoId: aluno.id,
        reviewPeriodMonths: 1,
        nextReviewAt: null,
        isReviewRequired: true,
      });
      db.profileReviewPolicy.findFirst.mockResolvedValue(null);
      db.studentProfileReview.findFirst.mockResolvedValue(null);

      const result = await profileReviewDispatchService.dispatchDueProfileReviews({
        now: new Date('2026-05-05'),
        dryRun: true,
      });

      expect(mockReviewService.createManualReview).not.toHaveBeenCalled();
      expect(result.eligibleAlunos).toBe(1);
      expect(result.createdReviews).toBe(1); // counted but not actually created
    });
  });
});
