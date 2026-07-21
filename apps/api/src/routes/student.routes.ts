import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { PrismaClient } from '@prisma/client';
import { alunoMiddleware, authMiddleware } from '../modules/auth/auth.middleware.js';
import { profileReviewService } from '../modules/alunos/profile-review.service.js';
import { profileAuditService } from '../modules/alunos/profile-audit.service.js';
import { assessmentService } from '../modules/assessments/assessment.service.js';
import { alunoAssessmentPlanService } from '../modules/alunos/aluno-assessment-plan.service.js';
import {
  normalizeRequestedStudentContractId,
  resolveActiveStudentMembership,
  StudentAccountContextError,
} from '../modules/alunos/student-account-context.service.js';
import { loadStudentIdentity, upsertStudentIdentity } from '../modules/alunos/student-identity.service.js';

const prisma = new PrismaClient();

/** Resolve o cadastro ativo da conta dentro do tenant explicitamente selecionado. */
async function requireAlunoByUserId(req: Request, userId: string) {
  const requestedContractId = normalizeRequestedStudentContractId(
    req.header('x-contract-id')
  );
  const membership = await resolveActiveStudentMembership(userId, requestedContractId);
  const aluno = await prisma.aluno.findFirst({
    where: { id: membership.id, contractId: membership.contractId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          profile: true,
        },
      },
      studentProfile: true,
      professor: { select: { contractId: true } },
      intakeForm: true,
      profileReviewSettings: true,
    },
  });

  if (!aluno?.user) {
    throw Object.assign(new Error('Aluno não encontrado'), { status: 404 });
  }
  return aluno as typeof aluno & { user: NonNullable<typeof aluno.user> };
}

const router: Router = Router();

router.use(authMiddleware);
router.use(alunoMiddleware);

const studentContractVisibilityPolicy = {
  showPaymentDay: process.env.STUDENT_APP_EXPOSE_CONTRACT_PAYMENT_DAY === 'true',
  showAmount: process.env.STUDENT_APP_EXPOSE_CONTRACT_AMOUNT === 'true',
  showSignedDocument: process.env.STUDENT_APP_EXPOSE_SIGNED_CONTRACT_DOCUMENT === 'true',
};

type StudentContractStatusValue =
  | 'draft'
  | 'pending_signature'
  | 'active'
  | 'expired'
  | 'canceled'
  | 'terminated'
  | 'generated'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'cancelled';

interface StudentContractSummaryItem {
  contractId: string;
  title: string;
  service: {
    id: string;
    name: string;
    code: string;
  } | null;
  status: StudentContractStatusValue;
  startDate: Date | null;
  endDate: Date | null;
  signedAt: Date | null;
  paymentDay: number | null;
  amount: number | null;
  signedDocumentUrl: string | null;
}

interface StudentContractSummaryData {
  activeContract: StudentContractSummaryItem | null;
  history: Array<
    Pick<StudentContractSummaryItem, 'contractId' | 'title' | 'service' | 'status' | 'startDate' | 'endDate' | 'signedAt'>
  >;
  visibility: {
    paymentDay: boolean;
    amount: boolean;
    signedDocumentUrl: boolean;
  };
}

const contractPriority: Record<StudentContractStatusValue, number> = {
  active: 0,
  pending_signature: 1,
  signed: 2,
  viewed: 3,
  sent: 4,
  generated: 5,
  draft: 6,
  expired: 7,
  terminated: 8,
  canceled: 9,
  cancelled: 9,
};

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toNumber?: () => number };
    if (typeof candidate.toNumber === 'function') {
      const converted = candidate.toNumber();
      return Number.isFinite(converted) ? converted : null;
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveFallbackStatus(value: string): StudentContractStatusValue {
  const normalized = value.toLowerCase();
  switch (normalized) {
    case 'draft':
      return 'draft';
    case 'generated':
      return 'generated';
    case 'sent':
      return 'sent';
    case 'viewed':
      return 'viewed';
    case 'signed':
      return 'signed';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    default:
      return 'draft';
  }
}

async function getStudentContractSummary(alunoId: string): Promise<StudentContractSummaryData> {
  const linkedContracts = await prisma.studentContract.findMany({
    where: { alunoId },
    include: {
      service: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      contract: {
        select: {
          id: true,
          title: true,
          status: true,
          signedAt: true,
          cancelledAt: true,
          pdfPath: true,
          createdAt: true,
        },
      },
    },
    orderBy: [
      { createdAt: 'desc' },
      { updatedAt: 'desc' },
    ],
  });

  const mapLinkedItem = (item: (typeof linkedContracts)[number]): StudentContractSummaryItem => ({
    contractId: item.contract.id,
    title: item.contract.title,
    service: item.service
      ? {
          id: item.service.id,
          name: item.service.name,
          code: item.service.code,
        }
      : null,
    status: item.status,
    startDate: item.startDate,
    endDate: item.endDate,
    signedAt: item.signedAt ?? item.contract.signedAt,
    paymentDay: studentContractVisibilityPolicy.showPaymentDay ? item.paymentDay : null,
    amount: studentContractVisibilityPolicy.showAmount ? toOptionalNumber(item.amount) : null,
    signedDocumentUrl:
      studentContractVisibilityPolicy.showSignedDocument && item.contract.status === 'SIGNED'
        ? item.contract.pdfPath ?? null
        : null,
  });

  const linkedItems = linkedContracts.map(mapLinkedItem);

  let allItems: StudentContractSummaryItem[] = linkedItems;

  if (allItems.length === 0) {
    const fallbackContracts = await prisma.contract.findMany({
      where: { alunoId },
      select: {
        id: true,
        title: true,
        status: true,
        signedAt: true,
        cancelledAt: true,
        pdfPath: true,
        createdAt: true,
        service: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    allItems = fallbackContracts.map((item) => ({
      contractId: item.id,
      title: item.title,
      service: item.service
        ? {
            id: item.service.id,
            name: item.service.name,
            code: item.service.code,
          }
        : null,
      status: resolveFallbackStatus(item.status),
      startDate: null,
      endDate: item.cancelledAt,
      signedAt: item.signedAt,
      paymentDay: null,
      amount: null,
      signedDocumentUrl:
        studentContractVisibilityPolicy.showSignedDocument && item.status === 'SIGNED'
          ? item.pdfPath ?? null
          : null,
    }));
  }

  const sortedItems = [...allItems].sort((a, b) => {
    const pa = contractPriority[a.status] ?? 99;
    const pb = contractPriority[b.status] ?? 99;
    return pa - pb;
  });

  const activeContract = sortedItems[0] ?? null;
  const history = sortedItems
    .filter((item) => item.contractId !== activeContract?.contractId)
    .map((item) => ({
      contractId: item.contractId,
      title: item.title,
      service: item.service,
      status: item.status,
      startDate: item.startDate,
      endDate: item.endDate,
      signedAt: item.signedAt,
    }));

  return {
    activeContract,
    history,
    visibility: {
      paymentDay: studentContractVisibilityPolicy.showPaymentDay,
      amount: studentContractVisibilityPolicy.showAmount,
      signedDocumentUrl: studentContractVisibilityPolicy.showSignedDocument,
    },
  };
}

const completeProfileReviewSchema = z
  .object({
    noChanges: z.boolean().optional(),
    changes: z
      .object({
        profile: z
          .object({
            name: z.string().trim().min(1).max(120).optional(),
            phone: z.string().trim().max(30).nullable().optional(),
            birthDate: z.string().nullable().optional(),
            gender: z.enum(['male', 'female', 'other']).nullable().optional(),
            cpf: z.string().trim().max(20).nullable().optional(),
            rg: z.string().trim().max(30).nullable().optional(),
            maritalStatus: z
              .enum(['single', 'married', 'stable_union', 'divorced', 'separated', 'widowed', 'other'])
              .nullable()
              .optional(),
            addressStreet: z.string().trim().max(120).nullable().optional(),
            addressNumber: z.string().trim().max(20).nullable().optional(),
            addressComplement: z.string().trim().max(120).nullable().optional(),
            addressNeighborhood: z.string().trim().max(120).nullable().optional(),
            addressCity: z.string().trim().max(120).nullable().optional(),
            addressState: z.string().trim().max(2).nullable().optional(),
            addressZipCode: z.string().trim().max(20).nullable().optional(),
            instagramHandle: z.string().trim().max(60).nullable().optional(),
          })
          .strict()
          .optional(),
        aluno: z
          .object({
            age: z.number().int().min(1).max(120).optional(),
            weight: z.number().min(1).max(400).nullable().optional(),
            height: z.number().min(30).max(260).nullable().optional(),
            bodyFatPercentage: z.number().min(0).max(80).nullable().optional(),
            vo2Max: z.number().min(1).max(120).nullable().optional(),
            anaerobicThreshold: z.number().min(1).max(40).nullable().optional(),
            maxHeartRate: z.number().int().min(40).max(240).nullable().optional(),
            restingHeartRate: z.number().int().min(20).max(160).nullable().optional(),
            systolicPressure: z.number().int().min(60).max(250).nullable().optional(),
            diastolicPressure: z.number().int().min(40).max(180).nullable().optional(),
          })
          .strict()
          .optional(),
        intakeForm: z
          .object({
            assessmentDate: z.string().nullable().optional(),
            mainGoal: z.string().trim().max(500).nullable().optional(),
            medicalHistory: z.string().trim().max(3000).nullable().optional(),
            currentMedications: z.string().trim().max(3000).nullable().optional(),
            injuriesHistory: z.string().trim().max(3000).nullable().optional(),
            trainingBackground: z.string().trim().max(3000).nullable().optional(),
            observations: z.string().trim().max(3000).nullable().optional(),
            parqResponses: z
              .object({
                q1: z.boolean().optional(),
                q2: z.boolean().optional(),
                q3: z.boolean().optional(),
                q4: z.boolean().optional(),
                q5: z.boolean().optional(),
                q6: z.boolean().optional(),
                q7: z.boolean().optional(),
                q8: z.boolean().optional(),
              })
              .strict()
              .optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) => {
      if (value.noChanges === true) {
        return !value.changes;
      }

      return Boolean(value.changes && Object.keys(value.changes).length > 0);
    },
    {
      message: 'Informe noChanges=true sem alterações ou envie um objeto changes com alterações',
      path: ['changes'],
    }
  );

/**
 * POST /api/v1/student/me/profile-reviews/:reviewId/complete
 * Conclusão da revisão cadastral pelo aluno autenticado
 */
router.post('/me/profile-reviews/:reviewId/complete', async (req: Request, res: Response) => {
  try {
    const { reviewId } = req.params;
    const validated = completeProfileReviewSchema.parse(req.body);

    const alunoUserId = (req as any).user.userId as string;
    const completed = await profileReviewService.completeByStudent({
      reviewId,
      alunoUserId,
      noChanges: validated.noChanges,
      changes: validated.changes,
    });

    return sendSuccess(res, completed, 'Revisão cadastral concluída com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    if (error?.message?.includes('não encontrada')) {
      return sendError(res, error.message, 404);
    }
    if (
      error?.message?.includes('permissão') ||
      error?.message?.includes('não está pendente') ||
      error?.message?.includes('Data inválida')
    ) {
      return sendError(res, error.message, 400);
    }
    console.error('Erro ao concluir revisão cadastral:', error);
    return sendError(res, 'Erro ao concluir revisão cadastral', 500);
  }
});

export default router;

// ---------------------------------------------------------------------------
// GET /api/v1/student/me/profile
// Retorna os dados pessoais permitidos para o aluno autenticado.
// Campos financeiros/legais/administrativos são omitidos.
// ---------------------------------------------------------------------------
router.get('/me/profile', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const aluno = await requireAlunoByUserId(req, userId);
    const contractSummary = await getStudentContractSummary(aluno.id);
    const identity = await loadStudentIdentity(aluno.id, aluno.contractId);
    const accountProfile = aluno.user.profile;

    const profile = {
      name: identity.name ?? '',
      avatar: accountProfile?.avatar ?? null,
      phone: identity.phone ?? null,
      birthDate: identity.birthDate ?? null,
      gender: identity.gender ?? null,
      maritalStatus: identity.maritalStatus ?? null,
      addressStreet: identity.addressStreet ?? null,
      addressNumber: identity.addressNumber ?? null,
      addressComplement: identity.addressComplement ?? null,
      addressNeighborhood: identity.addressNeighborhood ?? null,
      addressCity: identity.addressCity ?? null,
      addressState: identity.addressState ?? null,
      addressZipCode: identity.addressZipCode ?? null,
      instagramHandle: identity.instagramHandle ?? null,
    };

    const intakeForm = aluno.intakeForm
      ? {
          assessmentDate: aluno.intakeForm.assessmentDate,
          mainGoal: aluno.intakeForm.mainGoal,
          trainingBackground: aluno.intakeForm.trainingBackground,
          observations: aluno.intakeForm.observations,
        }
      : null;

    return sendSuccess(res, {
      id: aluno.id,
      email: aluno.user.email,
      contractSummary,
      profile,
      physical: {
        age: aluno.age,
        weight: aluno.weight,
        height: aluno.height,
      },
      intakeForm,
    });
  } catch (error: any) {
    if (error instanceof StudentAccountContextError) {
      const status = error.code === 'STUDENT_CONTRACT_CONTEXT_REQUIRED' ? 409 : 404;
      return sendError(res, error.message, status);
    }
    if (error?.status === 404) {
      return sendError(res, error.message, 404);
    }
    console.error('Erro ao buscar perfil do aluno:', error);
    return sendError(res, 'Erro ao buscar perfil', 500);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/v1/student/me/profile
// Atualiza apenas campos liberados para autoatendimento.
// Campos sensíveis (CPF, RG, dados de saúde, PAR-Q) não são aceitos aqui;
// para alterá-los o aluno deve concluir uma revisão cadastral.
// ---------------------------------------------------------------------------
const updateProfileSchema = z
  .object({
    phone: z.string().trim().max(30).nullable().optional(),
    addressStreet: z.string().trim().max(120).nullable().optional(),
    addressNumber: z.string().trim().max(20).nullable().optional(),
    addressComplement: z.string().trim().max(120).nullable().optional(),
    addressNeighborhood: z.string().trim().max(120).nullable().optional(),
    addressCity: z.string().trim().max(120).nullable().optional(),
    addressState: z.string().trim().max(2).nullable().optional(),
    addressZipCode: z.string().trim().max(20).nullable().optional(),
    instagramHandle: z.string().trim().max(60).nullable().optional(),
    intakeForm: z
      .object({
        mainGoal: z.string().trim().max(500).nullable().optional(),
        trainingBackground: z.string().trim().max(3000).nullable().optional(),
        observations: z.string().trim().max(3000).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

router.put('/me/profile', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const validated = updateProfileSchema.parse(req.body);
    const aluno = await requireAlunoByUserId(req, userId);

    const { intakeForm: intakeFormPatch, ...profilePatch } = validated;

    const profileData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(profilePatch)) {
      if (value !== undefined) {
        profileData[key] = value;
      }
    }

    const changedFieldNames: string[] = [];

    await prisma.$transaction(async (tx) => {
      if (Object.keys(profileData).length > 0) {
        await upsertStudentIdentity(
          aluno.id,
          aluno.contractId,
          profileData,
          {
            client: tx,
            actor: { userId },
            sourceType: 'student',
            sourceReference: 'student_app_profile',
            syncLegacyProfile: true,
          }
        );
        changedFieldNames.push(...Object.keys(profileData).map((k) => `identity.${k}`));
      }

      if (intakeFormPatch && Object.keys(intakeFormPatch).length > 0) {
        const intakeUpdate: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(intakeFormPatch)) {
          if (value !== undefined) {
            intakeUpdate[key] = value;
          }
        }

        if (Object.keys(intakeUpdate).length > 0) {
          await tx.alunoIntakeForm.upsert({
            where: { alunoId: aluno.id },
            create: { alunoId: aluno.id, ...intakeUpdate },
            update: intakeUpdate,
          });
          changedFieldNames.push(...Object.keys(intakeUpdate).map((k) => `intakeForm.${k}`));
        }
      }
    });

    if (changedFieldNames.length > 0) {
      await profileAuditService.log({
        alunoId: aluno.id,
        changedByUserId: userId,
        source: 'student_app',
        action: 'update_profile',
        changedFields: changedFieldNames,
        afterData: { ...profileData, intakeForm: intakeFormPatch ?? undefined },
      });
    }

    return sendSuccess(res, null, 'Perfil atualizado com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    if (error instanceof StudentAccountContextError) {
      const status = error.code === 'STUDENT_CONTRACT_CONTEXT_REQUIRED' ? 409 : 404;
      return sendError(res, error.message, status);
    }
    if (error?.status === 404) {
      return sendError(res, error.message, 404);
    }
    console.error('Erro ao atualizar perfil do aluno:', error);
    return sendError(res, 'Erro ao atualizar perfil', 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/student/me/profile-review
// Retorna a revisão cadastral pendente do aluno, se existir.
// ---------------------------------------------------------------------------
router.get('/me/profile-review', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const aluno = await requireAlunoByUserId(req, userId);

    const review = await prisma.studentProfileReview.findFirst({
      where: {
        alunoId: aluno.id,
        status: 'pending',
      },
      orderBy: { requestedAt: 'desc' },
    });

    return sendSuccess(res, review ?? null);
  } catch (error: any) {
    if (error instanceof StudentAccountContextError) {
      const status = error.code === 'STUDENT_CONTRACT_CONTEXT_REQUIRED' ? 409 : 404;
      return sendError(res, error.message, status);
    }
    if (error?.status === 404) {
      return sendError(res, error.message, 404);
    }
    console.error('Erro ao buscar revisão cadastral pendente:', error);
    return sendError(res, 'Erro ao buscar revisão cadastral', 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/student/me/assessments
// Retorna o histórico de avaliações do aluno (somente leitura).
// ---------------------------------------------------------------------------
router.get('/me/assessments', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const aluno = await requireAlunoByUserId(req, userId);

    const assessments = await assessmentService.listByAluno(aluno.id);

    return sendSuccess(res, assessments);
  } catch (error: any) {
    if (error instanceof StudentAccountContextError) {
      const status = error.code === 'STUDENT_CONTRACT_CONTEXT_REQUIRED' ? 409 : 404;
      return sendError(res, error.message, status);
    }
    if (error?.status === 404) {
      return sendError(res, error.message, 404);
    }
    console.error('Erro ao buscar avaliações do aluno:', error);
    return sendError(res, 'Erro ao buscar avaliações', 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/student/me/assessment-plan
// Retorna o plano de avaliações e próximas avaliações previstas (somente leitura).
// ---------------------------------------------------------------------------
router.get('/me/assessment-plan', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const aluno = await requireAlunoByUserId(req, userId);

    const contractId = aluno.professor?.contractId ?? aluno.contractId;
    const plan = await alunoAssessmentPlanService.getByAluno(aluno.id, contractId);

    return sendSuccess(res, plan);
  } catch (error: any) {
    if (error instanceof StudentAccountContextError) {
      const status = error.code === 'STUDENT_CONTRACT_CONTEXT_REQUIRED' ? 409 : 404;
      return sendError(res, error.message, status);
    }
    if (error?.status === 404) {
      return sendError(res, error.message, 404);
    }
    console.error('Erro ao buscar plano de avaliações:', error);
    return sendError(res, 'Erro ao buscar plano de avaliações', 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/student/me/notifications
// Retorna as notificações do aluno autenticado.
// ---------------------------------------------------------------------------
router.get('/me/notifications', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        data: true,
        createdAt: true,
        sentAt: true,
      },
    });

    return sendSuccess(res, notifications);
  } catch (error: any) {
    console.error('Erro ao buscar notificações do aluno:', error);
    return sendError(res, 'Erro ao buscar notificações', 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/student/me/summary
// Retorna resumo para a tela inicial do app mobile do aluno.
// ---------------------------------------------------------------------------
router.get('/me/summary', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const aluno = await requireAlunoByUserId(req, userId);
    const contractSummary = await getStudentContractSummary(aluno.id);

    const contractId = aluno.professor?.contractId ?? aluno.contractId;

    const [pendingReview, assessmentPlan, lastWorkout, notifications] = await Promise.all([
      prisma.studentProfileReview.findFirst({
        where: { alunoId: aluno.id, status: 'pending' },
        orderBy: { requestedAt: 'desc' },
        select: { id: true, dueAt: true, requestedAt: true },
      }),
      alunoAssessmentPlanService.getByAluno(aluno.id, contractId),
      prisma.workoutExecution.findFirst({
        where: { alunoId: aluno.id },
        orderBy: { executionDate: 'desc' },
        select: { id: true, executionDate: true },
      }),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, type: true, title: true, message: true, createdAt: true },
      }),
    ]);

    // Próxima revisão cadastral: dueAt da revisão pendente ou nextReviewAt das configurações
    const nextProfileReviewAt =
      pendingReview?.dueAt ??
      aluno.profileReviewSettings?.nextReviewAt ??
      null;

    // Próxima avaliação: item ativo mais próximo do vencimento (overdue ou scheduled)
    const upcomingAssessments = assessmentPlan.items
      .filter((item) => item.isActive && item.summary.nextDueDate)
      .sort((a, b) => {
        const da = new Date(a.summary.nextDueDate!).getTime();
        const db = new Date(b.summary.nextDueDate!).getTime();
        return da - db;
      });
    const nextAssessment = upcomingAssessments[0]
      ? {
          assessmentTypeId: upcomingAssessments[0].assessmentTypeId,
          assessmentTypeName: upcomingAssessments[0].assessmentType.name,
          nextDueDate: upcomingAssessments[0].summary.nextDueDate,
          status: upcomingAssessments[0].summary.status,
        }
      : null;

    return sendSuccess(res, {
      name: aluno.user.profile?.name ?? '',
      contract: {
        active: contractSummary.activeContract,
        history: contractSummary.history,
      },
      nextProfileReviewAt,
      hasPendingProfileReview: pendingReview !== null,
      nextAssessment,
      lastWorkoutDate: lastWorkout?.executionDate ?? null,
      recentNotifications: notifications,
    });
  } catch (error: any) {
    if (error instanceof StudentAccountContextError) {
      const status = error.code === 'STUDENT_CONTRACT_CONTEXT_REQUIRED' ? 409 : 404;
      return sendError(res, error.message, status);
    }
    if (error?.status === 404) {
      return sendError(res, error.message, 404);
    }
    console.error('Erro ao buscar resumo do aluno:', error);
    return sendError(res, 'Erro ao buscar resumo', 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/student/me/contract
// Retorna resumo contratual do aluno autenticado (somente leitura).
// ---------------------------------------------------------------------------
router.get('/me/contract', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const aluno = await requireAlunoByUserId(req, userId);
    const contractSummary = await getStudentContractSummary(aluno.id);

    return sendSuccess(res, contractSummary);
  } catch (error: any) {
    if (error instanceof StudentAccountContextError) {
      const status = error.code === 'STUDENT_CONTRACT_CONTEXT_REQUIRED' ? 409 : 404;
      return sendError(res, error.message, status);
    }
    if (error?.status === 404) {
      return sendError(res, error.message, 404);
    }
    console.error('Erro ao buscar contrato do aluno:', error);
    return sendError(res, 'Erro ao buscar contrato', 500);
  }
});
