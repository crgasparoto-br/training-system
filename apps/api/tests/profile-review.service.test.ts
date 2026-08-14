// ---------------------------------------------------------------------------
// Mocks – must be declared before imports (jest.mock is hoisted)
// ---------------------------------------------------------------------------
jest.mock('@prisma/client', () => {
  const aluno = { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), count: jest.fn() };
  const studentProfileReview = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const alunoProfileReviewSettings = { findUnique: jest.fn(), upsert: jest.fn() };
  const profileReviewPolicy = { findFirst: jest.fn() };
  const profile = { update: jest.fn() };
  const studentProfile = { upsert: jest.fn() };
  const studentLifecycleEvent = { create: jest.fn() };
  const alunoModel = { update: aluno.update };
  const alunoIntakeForm = { upsert: jest.fn() };
  const studentParqSubmission = { create: jest.fn() };

  const instance: Record<string, unknown> = {
    aluno,
    studentProfileReview,
    alunoProfileReviewSettings,
    profileReviewPolicy,
    profile,
    studentProfile,
    studentLifecycleEvent,
    aluno_update: alunoModel, // held separately to avoid name clash
    alunoIntakeForm,
    studentParqSubmission,
    $transaction: jest.fn(),
  };

  // Wire aluno.update (needed for applyAlunoPatch)
  (instance.aluno as Record<string, jest.Mock>).update = alunoModel.update;

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

type DbMock = {
  aluno: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock; count: jest.Mock };
  studentProfileReview: { findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
  alunoProfileReviewSettings: { findUnique: jest.Mock; upsert: jest.Mock };
  profileReviewPolicy: { findFirst: jest.Mock };
  profile: { update: jest.Mock };
  studentProfile: { upsert: jest.Mock };
  studentLifecycleEvent: { create: jest.Mock };
  alunoIntakeForm: { upsert: jest.Mock };
  studentParqSubmission: { create: jest.Mock };
  $transaction: jest.Mock;
};

const db = (jest.requireMock('@prisma/client') as { _db: DbMock })._db;
const { notificationService } = jest.requireMock('../src/modules/notifications/notification.service') as {
  notificationService: { create: jest.Mock };
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ALUNO_ID = 'aluno-1';
const ALUNO_USER_ID = 'user-1';
const REVIEW_ID = 'review-1';
const CONTRACT_ID = 'contract-1';

function makeAlunoRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: ALUNO_ID,
    contractId: CONTRACT_ID,
    userId: ALUNO_USER_ID,
    status: 'ACTIVE_STUDENT',
    leadName: null,
    leadEmail: null,
    leadEmailNormalized: null,
    leadPhone: null,
    leadPhoneNormalized: null,
    leadCpf: null,
    leadCpfNormalized: null,
    birthDate: null,
    studentProfile: null,
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
    createdAt: new Date('2025-01-01'),
    user: {
      id: ALUNO_USER_ID,
      profile: {
        name: 'João Silva',
        phone: '11999999999',
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
      },
    },
    professor: { contractId: CONTRACT_ID },
    currentStudentContract: null,
    intakeForm: null,
    ...overrides,
  };
}

function makePendingReview(overrides: Record<string, unknown> = {}) {
  return {
    id: REVIEW_ID,
    alunoId: ALUNO_ID,
    requestedByUserId: null,
    requestedAt: new Date('2026-01-01'),
    dueAt: new Date('2026-06-01'),
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
      user: { id: ALUNO_USER_ID },
      professor: { contractId: CONTRACT_ID },
      currentStudentContract: null,
    },
    ...overrides,
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
  notificationService.create.mockResolvedValue(true);
  db.aluno.findFirst.mockImplementation((args: unknown) => db.aluno.findUnique(args));
  db.aluno.count.mockResolvedValue(1);
  db.studentProfile.upsert.mockResolvedValue({});
  db.studentLifecycleEvent.create.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('profileReviewService', () => {
  // ── createManualReview ────────────────────────────────────────────────────
  describe('createManualReview', () => {
    it('cria uma revisão manual e emite notificação ao aluno', async () => {
      const alunoRecord = makeAlunoRecord();
      db.aluno.findUnique.mockResolvedValue(alunoRecord);
      db.alunoProfileReviewSettings.findUnique.mockResolvedValue(null);
      db.profileReviewPolicy.findFirst.mockResolvedValue(null);
      const createdReview = makePendingReview();
      db.studentProfileReview.create.mockResolvedValue(createdReview);

      const result = await profileReviewService.createManualReview({
        alunoId: ALUNO_ID,
        requestedByUserId: 'prof-1',
        dueAt: new Date('2026-06-01'),
      });

      expect(db.studentProfileReview.create).toHaveBeenCalledTimes(1);
      expect(notificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: ALUNO_USER_ID, type: 'profile_review_requested' }),
      );
      expect(result.id).toBe(REVIEW_ID);
    });

    it('lança erro quando aluno não existe', async () => {
      db.aluno.findUnique.mockResolvedValue(null);

      await expect(
        profileReviewService.createManualReview({ alunoId: 'nao-existe' }),
      ).rejects.toThrow('Aluno não encontrado');
    });
  });

  // ── getEffectiveSettings ──────────────────────────────────────────────────
  describe('getEffectiveSettings – calcular próxima revisão', () => {
    it('usa reviewPeriodMonths do aluno quando disponível', async () => {
      db.aluno.findUnique.mockResolvedValue(makeAlunoRecord());
      db.alunoProfileReviewSettings.findUnique.mockResolvedValue({
        alunoId: ALUNO_ID,
        reviewPeriodMonths: 2,
        nextReviewAt: null,
        isReviewRequired: true,
      });
      db.profileReviewPolicy.findFirst.mockResolvedValue({ defaultReviewPeriodMonths: 6, sections: null });

      const result = await profileReviewService.getEffectiveSettings(ALUNO_ID);

      // aluno-specific period overrides policy default
      expect(result.effective.reviewPeriodMonths).toBe(2);
    });

    it('usa defaultReviewPeriodMonths da política quando aluno não tem configuração', async () => {
      db.aluno.findUnique.mockResolvedValue(makeAlunoRecord());
      db.alunoProfileReviewSettings.findUnique.mockResolvedValue(null);
      db.profileReviewPolicy.findFirst.mockResolvedValue({
        defaultReviewPeriodMonths: 5,
        sections: null,
      });

      const result = await profileReviewService.getEffectiveSettings(ALUNO_ID);

      expect(result.effective.reviewPeriodMonths).toBe(5);
    });

    it('usa fallback de 4 meses quando não há configurações', async () => {
      db.aluno.findUnique.mockResolvedValue(makeAlunoRecord());
      db.alunoProfileReviewSettings.findUnique.mockResolvedValue(null);
      db.profileReviewPolicy.findFirst.mockResolvedValue(null);

      const result = await profileReviewService.getEffectiveSettings(ALUNO_ID);

      expect(result.effective.reviewPeriodMonths).toBe(4);
    });
  });

  // ── completeByStudent ─────────────────────────────────────────────────────
  describe('completeByStudent', () => {
    function setupCompleteBase() {
      db.studentProfileReview.findUnique.mockResolvedValue(makePendingReview());
      db.alunoProfileReviewSettings.findUnique.mockResolvedValue(null);
      db.profileReviewPolicy.findFirst.mockResolvedValue(null);
      // getAlunoSnapshot requires aluno.findUnique with profile
      db.aluno.findUnique.mockResolvedValue(makeAlunoRecord());
      db.alunoProfileReviewSettings.upsert.mockResolvedValue({});
    }

    const scopedInput = {
      reviewId: REVIEW_ID,
      alunoUserId: ALUNO_USER_ID,
      alunoId: ALUNO_ID,
      contractId: CONTRACT_ID,
    };

    it('conclui revisão sem alteração', async () => {
      setupCompleteBase();
      const updatedReview = { ...makePendingReview(), status: 'completed_no_changes', completedAt: new Date() };
      db.studentProfileReview.update.mockResolvedValue(updatedReview);

      const result = await profileReviewService.completeByStudent({
        ...scopedInput,
        noChanges: true,
      });

      expect(db.aluno.findFirst).toHaveBeenCalledWith({
        where: {
          id: ALUNO_ID,
          userId: ALUNO_USER_ID,
          contractId: CONTRACT_ID,
          status: 'ACTIVE_STUDENT',
        },
        select: { id: true },
      });
      expect(db.studentProfileReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: REVIEW_ID,
            alunoId: ALUNO_ID,
            status: 'pending',
          },
          data: expect.objectContaining({ status: 'completed_no_changes' }),
        }),
      );
      expect(result.status).toBe('completed_no_changes');
    });

    it('rejeita revisão que pertence a outro contrato do mesmo usuário', async () => {
      setupCompleteBase();
      db.studentProfileReview.findUnique.mockResolvedValue(
        makePendingReview({
          aluno: {
            id: ALUNO_ID,
            contractId: 'contract-2',
            user: { id: ALUNO_USER_ID },
            professor: { contractId: 'contract-2' },
            currentStudentContract: null,
          },
        })
      );

      await expect(
        profileReviewService.completeByStudent({ ...scopedInput, noChanges: true })
      ).rejects.toThrow('Revisão cadastral não encontrada');

      expect(db.$transaction).not.toHaveBeenCalled();
      expect(db.studentProfileReview.update).not.toHaveBeenCalled();
    });

    it('revalida o vínculo ativo dentro da transação antes de concluir', async () => {
      setupCompleteBase();
      db.aluno.findFirst
        .mockResolvedValueOnce(makeAlunoRecord())
        .mockResolvedValueOnce(null);

      await expect(
        profileReviewService.completeByStudent({ ...scopedInput, noChanges: true })
      ).rejects.toThrow('Revisão cadastral não encontrada');

      expect(db.studentProfileReview.update).not.toHaveBeenCalled();
    });

    it('rejeita reenvio concorrente quando a revisão deixa de estar pendente antes da gravação', async () => {
      setupCompleteBase();
      db.studentProfileReview.update.mockRejectedValue(
        Object.assign(new Error('Record not found'), { code: 'P2025' })
      );

      await expect(
        profileReviewService.completeByStudent({ ...scopedInput, noChanges: true })
      ).rejects.toThrow('A revisão cadastral não está pendente');
    });

    it('conclui com alteração direta (campo não-sensível aplicado imediatamente)', async () => {
      setupCompleteBase();
      const updatedReview = { ...makePendingReview(), status: 'completed_with_changes', completedAt: new Date(), requiresApproval: false };
      db.studentProfileReview.update.mockResolvedValue(updatedReview);
      db.profile.update.mockResolvedValue({});

      const result = await profileReviewService.completeByStudent({
        ...scopedInput,
        changes: {
          profile: { name: 'João Novo' }, // non-sensitive field
        },
      });

      expect(db.profile.update).toHaveBeenCalled();
      expect(db.studentProfileReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'completed_with_changes', requiresApproval: false }),
        }),
      );
      expect(result.approval.requiresApproval).toBe(false);
    });

    it('conclui com alteração que exige aprovação (campo sensível → requiresApproval = true)', async () => {
      setupCompleteBase();
      const updatedReview = {
        ...makePendingReview(),
        status: 'completed_with_changes',
        completedAt: new Date(),
        requiresApproval: true,
        changedFields: [
          { path: 'profile.cpf', before: null, after: '123.456.789-00', requiresApproval: true, status: 'pending_approval' },
        ],
      };
      db.studentProfileReview.update.mockResolvedValue(updatedReview);
      db.profile.update.mockResolvedValue({});

      const result = await profileReviewService.completeByStudent({
        ...scopedInput,
        changes: {
          profile: { cpf: '123.456.789-00' }, // sensitive field
        },
      });

      expect(db.studentProfileReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requiresApproval: true }),
        }),
      );
      expect(result.approval.requiresApproval).toBe(true);
    });

    it('marca PAR-Q como sensível e deixa a aplicação para aprovação', async () => {
      setupCompleteBase();
      db.aluno.findUnique.mockResolvedValue(
        makeAlunoRecord({
          currentStudentContract: {
            contract: {
              companyContractId: 'contract-current',
            },
          },
        })
      );
      const pendingReview = makePendingReview({
        aluno: {
          id: ALUNO_ID,
          contractId: CONTRACT_ID,
          user: { id: ALUNO_USER_ID },
          professor: { contractId: CONTRACT_ID },
          currentStudentContract: {
            contract: {
              companyContractId: 'contract-current',
            },
          },
        },
      });
      const updatedReview = {
        ...pendingReview,
        status: 'completed_with_changes',
        completedAt: new Date(),
        requiresApproval: true,
        changedFields: [
          { path: 'intakeForm.parqResponses.q1', before: false, after: true, requiresApproval: true, status: 'pending_approval' },
          { path: 'intakeForm.parqResponses.q8', before: false, after: true, requiresApproval: true, status: 'pending_approval' },
        ],
      };
      db.studentProfileReview.findUnique.mockResolvedValue(pendingReview);
      db.studentProfileReview.update.mockResolvedValue(updatedReview);

      await profileReviewService.completeByStudent({
        ...scopedInput,
        changes: {
          intakeForm: {
            parqResponses: {
              q1: true,
              q2: false,
              q3: false,
              q4: false,
              q5: false,
              q6: false,
              q7: false,
              q8: true,
            },
          },
        },
      });

      expect(db.studentParqSubmission.create).not.toHaveBeenCalled();
      expect(db.studentProfileReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requiresApproval: true }),
        })
      );
    });

  });

  // ── approveReview ─────────────────────────────────────────────────────────
  describe('approveReview', () => {
    it('rejeita a aprovação de alteração legada do PAR-Q sem criar dual-write', async () => {
      const reviewWithPending = {
        ...makePendingReview({
          status: 'completed_with_changes',
          requiresApproval: true,
          snapshotAfter: {
            intakeForm: {
              parqResponses: {
                q1: true,
                q2: false,
                q3: false,
                q4: false,
                q5: false,
                q6: false,
                q7: false,
                q8: true,
              },
            },
          },
          changedFields: [
            { path: 'intakeForm.parqResponses.q1', before: false, after: true, requiresApproval: true, status: 'pending_approval' },
            { path: 'intakeForm.parqResponses.q8', before: false, after: true, requiresApproval: true, status: 'pending_approval' },
          ],
          aluno: {
            id: ALUNO_ID,
            user: { id: ALUNO_USER_ID },
          },
        }),
      };
      db.studentProfileReview.findUnique.mockResolvedValue(reviewWithPending);

      await expect(
        profileReviewService.approveReview(ALUNO_ID, REVIEW_ID, 'prof-1')
      ).rejects.toMatchObject({
        code: 'LEGACY_WRITE_DISABLED',
        statusCode: 410,
      });

      expect(db.studentParqSubmission.create).not.toHaveBeenCalled();
      expect(db.alunoIntakeForm.upsert).not.toHaveBeenCalled();
      expect(db.studentProfileReview.update).not.toHaveBeenCalled();
    });

    it('aprova alteração sensível e aplica o patch', async () => {
      const reviewWithPending = {
        ...makePendingReview(),
        status: 'completed_with_changes',
        requiresApproval: true,
        snapshotAfter: { profile: { cpf: '123.456.789-00' } },
        changedFields: [
          { path: 'profile.cpf', before: null, after: '123.456.789-00', requiresApproval: true, status: 'pending_approval' },
        ],
        aluno: { id: ALUNO_ID, user: { id: ALUNO_USER_ID } },
      };
      db.studentProfileReview.findUnique.mockResolvedValue(reviewWithPending);
      db.profile.update.mockResolvedValue({});
      db.studentProfileReview.update.mockResolvedValue({
        ...reviewWithPending,
        approvedByUserId: 'prof-1',
        approvedAt: new Date(),
        requiresApproval: false,
        changedFields: [
          { path: 'profile.cpf', before: null, after: '123.456.789-00', requiresApproval: true, status: 'approved' },
        ],
        rejectedByUserId: null,
        rejectedAt: null,
        rejectionReason: null,
      });

      const result = await profileReviewService.approveReview(ALUNO_ID, REVIEW_ID, 'prof-1');

      expect(db.profile.update).toHaveBeenCalled();
      expect(db.studentProfileReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvedByUserId: 'prof-1',
            requiresApproval: false,
          }),
        }),
      );
      const cpfField = result.changedFields.find((f) => f.path === 'profile.cpf');
      expect(cpfField?.status).toBe('approved');
    });

    it('lança erro quando não há alterações sensíveis pendentes', async () => {
      const reviewNoPending = {
        ...makePendingReview(),
        changedFields: [
          { path: 'profile.name', before: 'João', after: 'Novo', requiresApproval: false, status: 'applied' },
        ],
        aluno: { id: ALUNO_ID, user: { id: ALUNO_USER_ID } },
      };
      db.studentProfileReview.findUnique.mockResolvedValue(reviewNoPending);

      await expect(
        profileReviewService.approveReview(ALUNO_ID, REVIEW_ID, 'prof-1'),
      ).rejects.toThrow('Esta revisão não possui alterações sensíveis pendentes de aprovação');
    });
  });

  // ── rejectReview ──────────────────────────────────────────────────────────
  describe('rejectReview', () => {
    it('rejeita alteração sensível e marca campos como rejected', async () => {
      const reviewWithPending = {
        ...makePendingReview(),
        changedFields: [
          { path: 'profile.cpf', before: null, after: '123.456.789-00', requiresApproval: true, status: 'pending_approval' },
        ],
      };
      db.studentProfileReview.findUnique.mockResolvedValue(reviewWithPending);
      db.studentProfileReview.update.mockResolvedValue({
        ...reviewWithPending,
        rejectedByUserId: 'prof-1',
        rejectedAt: new Date(),
        requiresApproval: false,
        changedFields: [
          { path: 'profile.cpf', before: null, after: '123.456.789-00', requiresApproval: true, status: 'rejected' },
        ],
        approvedAt: null,
        approvedByUserId: null,
        rejectionReason: 'Motivo de rejeição',
      });

      const result = await profileReviewService.rejectReview(ALUNO_ID, REVIEW_ID, 'prof-1', 'Motivo de rejeição');

      expect(db.studentProfileReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rejectedByUserId: 'prof-1', rejectionReason: 'Motivo de rejeição' }),
        }),
      );
      const cpfField = result.changedFields.find((f) => f.path === 'profile.cpf');
      expect(cpfField?.status).toBe('rejected');
    });

    it('lança erro quando não há alterações sensíveis pendentes para rejeitar', async () => {
      const reviewNoSensitive = {
        ...makePendingReview(),
        changedFields: [],
      };
      db.studentProfileReview.findUnique.mockResolvedValue(reviewNoSensitive);

      await expect(
        profileReviewService.rejectReview(ALUNO_ID, REVIEW_ID, 'prof-1', 'motivo'),
      ).rejects.toThrow('Esta revisão não possui alterações sensíveis pendentes de rejeição');
    });
  });
});