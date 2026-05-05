import { PrismaClient } from '@prisma/client';
import { profileReviewService } from './profile-review.service.js';
import { notificationService } from '../notifications/notification.service.js';

const prisma = new PrismaClient();

export interface DispatchProfileReviewJobOptions {
  now?: Date;
  upcomingWindowDays?: number;
  createOverdueReminder?: boolean;
  dryRun?: boolean;
}

export interface DispatchProfileReviewJobResult {
  totalActiveAlunos: number;
  eligibleAlunos: number;
  createdReviews: number;
  skippedWithOpenPending: number;
  skippedNotDue: number;
  overdueRemindersCreated: number;
  errors: Array<{ alunoId: string; message: string }>;
}

const DEFAULT_UPCOMING_WINDOW_DAYS = 7;

const addMonths = (baseDate: Date, months: number) => {
  const nextDate = new Date(baseDate);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
};

const addDays = (baseDate: Date, days: number) => {
  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const resolveEffectivePeriodMonths = (
  reviewPeriodMonths: number | null | undefined,
  defaultReviewPeriodMonths: number | null | undefined
) => {
  if (reviewPeriodMonths && reviewPeriodMonths > 0) {
    return reviewPeriodMonths;
  }

  if (defaultReviewPeriodMonths && defaultReviewPeriodMonths > 0) {
    return defaultReviewPeriodMonths;
  }

  return 4;
};

const resolveNextReviewAt = (
  alunoCreatedAt: Date,
  reviewPeriodMonths: number,
  settingsNextReviewAt: Date | null,
  lastReview?: {
    nextReviewAt: Date | null;
    completedAt: Date | null;
    requestedAt: Date;
  } | null
) => {
  if (settingsNextReviewAt) {
    return settingsNextReviewAt;
  }

  if (lastReview?.nextReviewAt) {
    return lastReview.nextReviewAt;
  }

  if (lastReview?.completedAt) {
    return addMonths(lastReview.completedAt, reviewPeriodMonths);
  }

  return addMonths(alunoCreatedAt, reviewPeriodMonths);
};

const hasOpenPendingReview = (
  pendingReview: {
    id: string;
    dueAt: Date | null;
  } | null,
  now: Date
) => {
  if (!pendingReview) {
    return false;
  }

  if (!pendingReview.dueAt) {
    return true;
  }

  return pendingReview.dueAt >= now;
};

const isOverduePendingReview = (
  pendingReview: {
    id: string;
    dueAt: Date | null;
  } | null,
  now: Date
) => {
  if (!pendingReview?.dueAt) {
    return false;
  }

  return pendingReview.dueAt < now;
};

const createOverdueReminderIfNeeded = async (
  userId: string,
  alunoId: string,
  reviewId: string,
  dueAt: Date,
  dryRun: boolean
) => {
  if (dryRun) {
    return false;
  }

  const created = await notificationService.create({
    userId,
    type: 'profile_review_overdue',
    title: 'Revisão cadastral vencida',
    message: `Você possui uma revisão cadastral vencida desde ${dueAt.toISOString()}.`,
    payload: {
      alunoId,
      reviewId,
      dueAt: dueAt.toISOString(),
      path: '/student/profile-review',
      deepLink: 'acesso://student/profile-review',
    },
    dedupeWindowMinutes: 24 * 60,
  });

  return Boolean(created);
};

const createPendingReminderIfNeeded = async (
  userId: string,
  alunoId: string,
  reviewId: string,
  dueAt: Date,
  dryRun: boolean
) => {
  if (dryRun) {
    return false;
  }

  const created = await notificationService.create({
    userId,
    type: 'profile_review_reminder',
    title: 'Lembrete de revisão cadastral',
    message: `Sua revisão cadastral está pendente. Prazo: ${dueAt.toISOString()}.`,
    payload: {
      alunoId,
      reviewId,
      dueAt: dueAt.toISOString(),
      path: '/student/profile-review',
      deepLink: 'acesso://student/profile-review',
    },
    dedupeWindowMinutes: 12 * 60,
  });

  return Boolean(created);
};

export const profileReviewDispatchService = {
  async dispatchDueProfileReviews(
    options: DispatchProfileReviewJobOptions = {}
  ): Promise<DispatchProfileReviewJobResult> {
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? false;
    const createOverdueReminder = options.createOverdueReminder ?? true;

    const activeAlunos = await prisma.aluno.findMany({
      where: {
        user: {
          isActive: true,
        },
      },
      select: {
        id: true,
        createdAt: true,
        user: {
          select: {
            id: true,
          },
        },
        professor: {
          select: {
            contractId: true,
          },
        },
      },
    });

    const result: DispatchProfileReviewJobResult = {
      totalActiveAlunos: activeAlunos.length,
      eligibleAlunos: 0,
      createdReviews: 0,
      skippedWithOpenPending: 0,
      skippedNotDue: 0,
      overdueRemindersCreated: 0,
      errors: [],
    };

    for (const aluno of activeAlunos) {
      try {
        const [settings, policy, latestReview, pendingReview] = await Promise.all([
          prisma.alunoProfileReviewSettings.findUnique({
            where: { alunoId: aluno.id },
          }),
          prisma.profileReviewPolicy.findFirst({
            where: {
              contractId: aluno.professor.contractId,
              isActive: true,
            },
            orderBy: {
              updatedAt: 'desc',
            },
          }),
          prisma.studentProfileReview.findFirst({
            where: {
              alunoId: aluno.id,
            },
            orderBy: {
              requestedAt: 'desc',
            },
            select: {
              nextReviewAt: true,
              completedAt: true,
              requestedAt: true,
            },
          }),
          prisma.studentProfileReview.findFirst({
            where: {
              alunoId: aluno.id,
              status: 'pending',
            },
            orderBy: {
              requestedAt: 'desc',
            },
            select: {
              id: true,
              dueAt: true,
            },
          }),
        ]);

        const isReviewRequired = settings?.isReviewRequired ?? true;
        if (!isReviewRequired) {
          result.skippedNotDue += 1;
          continue;
        }

        if (hasOpenPendingReview(pendingReview, now)) {
          const reminderBeforeDays =
            policy?.reminderBeforeDays ??
            options.upcomingWindowDays ??
            DEFAULT_UPCOMING_WINDOW_DAYS;

          if (pendingReview?.dueAt) {
            const threshold = addDays(now, reminderBeforeDays);
            if (pendingReview.dueAt <= threshold && pendingReview.dueAt >= now) {
              await createPendingReminderIfNeeded(
                aluno.user.id,
                aluno.id,
                pendingReview.id,
                pendingReview.dueAt,
                dryRun
              );
            }
          }

          result.skippedWithOpenPending += 1;
          continue;
        }

        if (isOverduePendingReview(pendingReview, now)) {
          if (createOverdueReminder && pendingReview?.dueAt) {
            const reminderCreated = await createOverdueReminderIfNeeded(
              aluno.user.id,
              aluno.id,
              pendingReview.id,
              pendingReview.dueAt,
              dryRun
            );

            if (reminderCreated) {
              result.overdueRemindersCreated += 1;
            }
          }

          result.skippedWithOpenPending += 1;
          continue;
        }

        const reviewPeriodMonths = resolveEffectivePeriodMonths(
          settings?.reviewPeriodMonths,
          policy?.defaultReviewPeriodMonths
        );

        const nextReviewAt = resolveNextReviewAt(
          aluno.createdAt,
          reviewPeriodMonths,
          settings?.nextReviewAt ?? null,
          latestReview
        );

        const reminderBeforeDays = policy?.reminderBeforeDays ?? options.upcomingWindowDays ?? DEFAULT_UPCOMING_WINDOW_DAYS;
        const threshold = addDays(now, reminderBeforeDays);
        const isEligible = nextReviewAt <= threshold;

        if (!isEligible) {
          result.skippedNotDue += 1;
          continue;
        }

        result.eligibleAlunos += 1;

        if (!dryRun) {
          await profileReviewService.createManualReview({
            alunoId: aluno.id,
            requestedByUserId: null,
            dueAt: nextReviewAt,
            sectionsRequested: Array.isArray(policy?.sections)
              ? policy?.sections.filter((item): item is string => typeof item === 'string')
              : undefined,
          });
        }

        result.createdReviews += 1;
      } catch (error: any) {
        result.errors.push({
          alunoId: aluno.id,
          message: error?.message || 'Erro desconhecido no dispatch de revisão cadastral',
        });
      }
    }

    return result;
  },
};
