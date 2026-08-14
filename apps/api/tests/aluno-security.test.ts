/**
 * Testes de Segurança – Domínio do Aluno
 *
 * Cobre:
 *  1. Aluno não acessa dados de outro aluno (service bloqueia por userId)
 *  2. Aluno não altera avaliação física via rota de aluno (a rota não expõe o endpoint)
 *  3. Aluno não altera plano de avaliações via rota de aluno (a rota não expõe o endpoint)
 *  4. Professor sem acesso ao aluno retorna 404 (alunoService.belongsToProfessor)
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
jest.mock('@prisma/client', () => {
  const aluno = { findUnique: jest.fn(), findFirst: jest.fn() };
  const studentProfileReview = { findUnique: jest.fn(), update: jest.fn() };
  const alunoProfileReviewSettings = { findUnique: jest.fn(), upsert: jest.fn() };
  const profileReviewPolicy = { findFirst: jest.fn() };
  const profile = { update: jest.fn() };

  const instance: Record<string, unknown> = {
    aluno,
    studentProfileReview,
    alunoProfileReviewSettings,
    profileReviewPolicy,
    profile,
    $transaction: jest.fn(),
  };

  (instance.aluno as Record<string, jest.Mock>).update = jest.fn();

  (instance.$transaction as jest.Mock).mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(instance);
    return Promise.all(arg as Promise<unknown>[]);
  });

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

jest.mock('../src/modules/notifications/notification.service', () => ({
  notificationService: { create: jest.fn().mockResolvedValue(true) },
}));

jest.mock('../src/modules/alunos/profile-audit.service', () => ({
  profileAuditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

import { profileReviewService } from '../src/modules/alunos/profile-review.service';
import { alunoService } from '../src/modules/alunos/aluno.service';
import studentRouterSource from 'fs';
import path from 'path';

type DbMock = {
  aluno: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  studentProfileReview: { findUnique: jest.Mock; update: jest.Mock };
  alunoProfileReviewSettings: { findUnique: jest.Mock; upsert: jest.Mock };
  profileReviewPolicy: { findFirst: jest.Mock };
  profile: { update: jest.Mock };
  $transaction: jest.Mock;
};

const db = (jest.requireMock('@prisma/client') as { _db: DbMock })._db;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ALUNO_ID = 'aluno-1';
const ALUNO_USER_ID = 'user-1';
const OTHER_USER_ID = 'user-OTHER';
const REVIEW_ID = 'review-1';
const CONTRACT_ID = 'contract-1';

function makePendingReview(ownUserId: string = ALUNO_USER_ID) {
  return {
    id: REVIEW_ID,
    alunoId: ALUNO_ID,
    requestedByUserId: null,
    requestedAt: new Date(),
    dueAt: new Date('2026-12-01'),
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
      id: ALUNO_ID,
      contractId: CONTRACT_ID,
      user: { id: ownUserId }, // the aluno's userId
      professor: { contractId: CONTRACT_ID },
    },
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(db);
    return Promise.all(arg as Promise<unknown>[]);
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Segurança – domínio do aluno', () => {
  // ── 1. Aluno não acessa dados de outro aluno ──────────────────────────────
  describe('aluno não acessa dados de outro aluno', () => {
    it('completeByStudent lança erro quando userId não pertence ao aluno da revisão', async () => {
      // review belongs to ALUNO_USER_ID, but caller passes OTHER_USER_ID
      db.studentProfileReview.findUnique.mockResolvedValue(makePendingReview(ALUNO_USER_ID));

      await expect(
        profileReviewService.completeByStudent({
          reviewId: REVIEW_ID,
          alunoUserId: OTHER_USER_ID, // ← wrong user
          alunoId: ALUNO_ID,
          contractId: CONTRACT_ID,
          noChanges: true,
        }),
      ).rejects.toThrow('Você não tem permissão para concluir esta revisão');

      // Should NOT have proceeded to update
      expect(db.studentProfileReview.update).not.toHaveBeenCalled();
    });

    it('approveReview lança erro quando revisão não pertence ao alunoId informado', async () => {
      // review's alunoId = ALUNO_ID, but we call with a different alunoId
      const reviewForOtherAluno = { ...makePendingReview(), alunoId: 'aluno-OTHER' };
      db.studentProfileReview.findUnique.mockResolvedValue(reviewForOtherAluno);

      await expect(
        profileReviewService.approveReview(ALUNO_ID, REVIEW_ID, 'prof-1'),
      ).rejects.toThrow('Revisão cadastral não encontrada para o aluno informado');
    });
  });

  // ── 2. Aluno não altera avaliação física ──────────────────────────────────
  describe('aluno não altera avaliação física', () => {
    it('a rota do aluno (/api/v1/student) não expõe PUT/POST para criação de avaliações físicas', () => {
      const studentRoutePath = path.resolve(
        __dirname,
        '../src/routes/student.routes.ts',
      );
      const source = require('fs').readFileSync(studentRoutePath, 'utf-8') as string;

      // Student routes must not define write operations on the assessments resource
      // A PUT or POST to .*/assessments would be a security violation
      const writesOnAssessments = /router\.(put|post|patch|delete)\s*\(\s*['"`][^'"`]*assessment[^'"`]*['"`]/i.test(source);
      expect(writesOnAssessments).toBe(false);
    });
  });

  // ── 3. Aluno não altera plano de avaliações ───────────────────────────────
  describe('aluno não altera plano de avaliações', () => {
    it('a rota do aluno (/api/v1/student) não expõe PUT/PATCH/DELETE para o plano de avaliações', () => {
      const studentRoutePath = path.resolve(
        __dirname,
        '../src/routes/student.routes.ts',
      );
      const source = require('fs').readFileSync(studentRoutePath, 'utf-8') as string;

      // Look for mutating operations on assessment-plan
      const writesOnPlan = /router\.(put|post|patch|delete)\s*\(\s*['"`][^'"`]*assessment-plan[^'"`]*['"`]/i.test(source);
      expect(writesOnPlan).toBe(false);
    });
  });

  // ── 4. Professor sem acesso ao aluno ─────────────────────────────────────
  describe('professor sem acesso ao aluno', () => {
    it('belongsToProfessor retorna false quando aluno pertence a outro professor', async () => {
      // DB returns null → aluno not found for this professor
      db.aluno.findFirst.mockResolvedValue(null);

      const belongs = await alunoService.belongsToProfessor(ALUNO_ID, 'prof-OUTRO');

      expect(belongs).toBe(false);
    });

    it('belongsToProfessor retorna true quando aluno pertence ao professor', async () => {
      db.aluno.findFirst.mockResolvedValue({ id: ALUNO_ID, professorId: 'prof-1' });

      const belongs = await alunoService.belongsToProfessor(ALUNO_ID, 'prof-1');

      expect(belongs).toBe(true);
    });
  });
});