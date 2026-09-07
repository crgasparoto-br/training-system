import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  StudentLifecycleStatus,
  UserType,
} from '@prisma/client';
import { profileReviewService } from '../src/modules/alunos/profile-review.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractA = 'issue-345-profile-review-contract-a';
const contractB = 'issue-345-profile-review-contract-b';
const emailPrefix = 'issue-345-profile-review-';

async function createContract(id: string, document: string) {
  return prisma.companyContract.create({
    data: {
      id,
      type: ContractType.academy,
      document,
      name: `Contrato ${id}`,
    },
  });
}

async function createProfessor(contractId: string, suffix: string) {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Professor',
      code: `professor-${suffix}`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}professor-${suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: `Professor ${suffix}` } },
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId,
      role: ProfessorRole.master,
      collaboratorFunctionId: collaboratorFunction.id,
    },
  });

  return { user, professor };
}

async function createStudentUser(suffix: string) {
  return prisma.user.create({
    data: {
      email: `${emailPrefix}student-${suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.aluno,
      profile: {
        create: {
          name: `Aluno ${suffix}`,
          phone: null,
          birthDate: null,
          cpf: null,
        },
      },
    },
  });
}

async function createActiveAluno(
  contractId: string,
  professorId: string,
  suffix: string,
  userId?: string
) {
  const user = userId
    ? await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    : await createStudentUser(suffix);

  const aluno = await prisma.aluno.create({
    data: {
      userId: user.id,
      professorId,
      contractId,
      schedulePlan: 'free',
      status: StudentLifecycleStatus.ACTIVE_STUDENT,
      activatedAt: new Date('2026-08-01T12:00:00.000Z'),
      age: 30,
      weight: 72,
      height: 175,
    },
  });

  return { user, aluno };
}

async function createPendingReview(
  alunoId: string,
  requestedByUserId: string,
  sectionsRequested = ['personal', 'contact', 'address', 'health']
) {
  return profileReviewService.createManualReview({
    alunoId,
    requestedByUserId,
    dueAt: new Date('2026-08-30T12:00:00.000Z'),
    sectionsRequested,
  });
}

function changedField(result: any, path: string) {
  return result.changedFields.find((field: any) => field.path === path);
}

describeDatabase('issue #345 profile-review integrated flow with PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractA, contractB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await createContract(contractA, '57365610000345');
    await createContract(contractB, '57365610000346');
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractA, contractB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a manual request, persists the in-app notification and reuses one pending review', async () => {
    const { user: professorUser, professor } = await createProfessor(contractA, 'request');
    const { user: studentUser, aluno } = await createActiveAluno(
      contractA,
      professor.id,
      'request'
    );

    const first = await createPendingReview(aluno.id, professorUser.id);
    const second = await createPendingReview(aluno.id, professorUser.id);

    expect(first.reviewCreated).toBe(true);
    expect(first.notification.persisted).toBe(true);
    expect(second.reviewCreated).toBe(false);
    expect(second.id).toBe(first.id);
    await expect(
      prisma.studentProfileReview.count({
        where: { alunoId: aluno.id, status: 'pending' },
      })
    ).resolves.toBe(1);
    await expect(
      prisma.notification.count({
        where: { userId: studentUser.id },
      })
    ).resolves.toBeGreaterThanOrEqual(1);
  });

  it('completes the review without changes and schedules the next review', async () => {
    const { user: professorUser, professor } = await createProfessor(contractA, 'no-changes');
    const { user: studentUser, aluno } = await createActiveAluno(
      contractA,
      professor.id,
      'no-changes'
    );
    const review = await createPendingReview(aluno.id, professorUser.id);

    const result = await profileReviewService.completeByStudent({
      reviewId: review.id,
      alunoId: aluno.id,
      alunoUserId: studentUser.id,
      contractId: contractA,
      noChanges: true,
    });

    expect(result.status).toBe('completed_no_changes');
    expect(result.approval.requiresApproval).toBe(false);
    expect(result.changedFields).toEqual([]);
    await expect(
      prisma.alunoProfileReviewSettings.findUnique({ where: { alunoId: aluno.id } })
    ).resolves.toEqual(expect.objectContaining({ alunoId: aluno.id, nextReviewAt: expect.any(Date) }));
  });

  it('applies non-sensitive changes directly to the canonical student profile', async () => {
    const { user: professorUser, professor } = await createProfessor(contractA, 'direct');
    const { user: studentUser, aluno } = await createActiveAluno(
      contractA,
      professor.id,
      'direct'
    );
    const review = await createPendingReview(aluno.id, professorUser.id);

    const result = await profileReviewService.completeByStudent({
      reviewId: review.id,
      alunoId: aluno.id,
      alunoUserId: studentUser.id,
      contractId: contractA,
      changes: { profile: { phone: '11988887777' } },
    });

    expect(result.status).toBe('completed_with_changes');
    expect(result.approval.requiresApproval).toBe(false);
    expect(changedField(result, 'profile.phone')).toEqual(
      expect.objectContaining({ requiresApproval: false, status: 'applied' })
    );

    const canonical = await prisma.studentProfile.findUniqueOrThrow({
      where: { alunoId: aluno.id },
    });
    expect(canonical.identificationData).toEqual(
      expect.objectContaining({ phone: '11988887777' })
    );
  });

  it('keeps sensitive changes pending until the professor approves them', async () => {
    const { user: professorUser, professor } = await createProfessor(contractA, 'approve');
    const { user: studentUser, aluno } = await createActiveAluno(
      contractA,
      professor.id,
      'approve'
    );
    const review = await createPendingReview(aluno.id, professorUser.id);

    const submitted = await profileReviewService.completeByStudent({
      reviewId: review.id,
      alunoId: aluno.id,
      alunoUserId: studentUser.id,
      contractId: contractA,
      changes: { profile: { cpf: '52998224725' } },
    });

    expect(submitted.approval.requiresApproval).toBe(true);
    expect(submitted.approval.hasPendingApproval).toBe(true);
    expect(changedField(submitted, 'profile.cpf')).toEqual(
      expect.objectContaining({ requiresApproval: true, status: 'pending_approval' })
    );
    expect(await prisma.studentProfile.findUnique({ where: { alunoId: aluno.id } })).toBeNull();

    const approved = await profileReviewService.approveReview(
      aluno.id,
      review.id,
      professorUser.id
    );

    expect(approved.approval.requiresApproval).toBe(false);
    expect(changedField(approved, 'profile.cpf')).toEqual(
      expect.objectContaining({ status: 'approved' })
    );
    const canonical = await prisma.studentProfile.findUniqueOrThrow({
      where: { alunoId: aluno.id },
    });
    expect(canonical.identificationData).toEqual(
      expect.objectContaining({ cpf: '52998224725' })
    );
  });

  it('rejects a sensitive change without applying it to the canonical profile', async () => {
    const { user: professorUser, professor } = await createProfessor(contractA, 'reject');
    const { user: studentUser, aluno } = await createActiveAluno(
      contractA,
      professor.id,
      'reject'
    );
    const review = await createPendingReview(aluno.id, professorUser.id);

    const submitted = await profileReviewService.completeByStudent({
      reviewId: review.id,
      alunoId: aluno.id,
      alunoUserId: studentUser.id,
      contractId: contractA,
      changes: { profile: { birthDate: '1991-02-03' } },
    });
    expect(changedField(submitted, 'profile.birthDate')).toEqual(
      expect.objectContaining({ status: 'pending_approval' })
    );

    const rejected = await profileReviewService.rejectReview(
      aluno.id,
      review.id,
      professorUser.id,
      'Documento de suporte divergente'
    );

    expect(rejected.approval.requiresApproval).toBe(false);
    expect(rejected.approval.rejectionReason).toBe('Documento de suporte divergente');
    expect(changedField(rejected, 'profile.birthDate')).toEqual(
      expect.objectContaining({ status: 'rejected' })
    );
    expect(await prisma.studentProfile.findUnique({ where: { alunoId: aluno.id } })).toBeNull();
  });

  it('does not allow the same account to cross contract boundaries while completing a review', async () => {
    const { user: professorUserA, professor: professorA } = await createProfessor(
      contractA,
      'tenant-a'
    );
    const { professor: professorB } = await createProfessor(contractB, 'tenant-b');
    const sharedUser = await createStudentUser('shared');
    const { aluno: alunoA } = await createActiveAluno(
      contractA,
      professorA.id,
      'tenant-a',
      sharedUser.id
    );
    const { aluno: alunoB } = await createActiveAluno(
      contractB,
      professorB.id,
      'tenant-b',
      sharedUser.id
    );
    const review = await createPendingReview(alunoA.id, professorUserA.id);

    await expect(
      profileReviewService.completeByStudent({
        reviewId: review.id,
        alunoId: alunoB.id,
        alunoUserId: sharedUser.id,
        contractId: contractB,
        noChanges: true,
      })
    ).rejects.toThrow('Revisão cadastral não encontrada');

    await expect(
      prisma.studentProfileReview.findUniqueOrThrow({ where: { id: review.id } })
    ).resolves.toEqual(expect.objectContaining({ status: 'pending', alunoId: alunoA.id }));
  });
});
