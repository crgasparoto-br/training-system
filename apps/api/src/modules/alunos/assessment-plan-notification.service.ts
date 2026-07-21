import { PrismaClient } from '@prisma/client';
import { alunoAssessmentPlanService } from './aluno-assessment-plan.service.js';
import { notificationService } from '../notifications/notification.service.js';

const prisma = new PrismaClient();

export interface DispatchAssessmentPlanNotificationOptions {
  now?: Date;
  upcomingWindowDays?: number;
  dryRun?: boolean;
}

export interface DispatchAssessmentPlanNotificationResult {
  alunosChecked: number;
  notificationsCreated: number;
  dueNotificationsCreated: number;
  overdueNotificationsCreated: number;
  errors: Array<{ alunoId: string; message: string }>;
}

const DEFAULT_UPCOMING_WINDOW_DAYS = 7;

const toStartOfDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

export const assessmentPlanNotificationService = {
  async dispatchForAluno(alunoId: string, contractId: string, options: DispatchAssessmentPlanNotificationOptions = {}) {
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? false;
    const upcomingWindowDays = options.upcomingWindowDays ?? DEFAULT_UPCOMING_WINDOW_DAYS;
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + upcomingWindowDays);

    const aluno = await prisma.aluno.findUnique({
      where: { id: alunoId },
      select: {
        id: true,
        contractId: true,
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!aluno?.user?.id) {
      return { dueNotificationsCreated: 0, overdueNotificationsCreated: 0, notificationsCreated: 0 };
    }

    const plan = await alunoAssessmentPlanService.getByAluno(aluno.id, contractId);
    let dueNotificationsCreated = 0;
    let overdueNotificationsCreated = 0;
    let notificationsCreated = 0;

    for (const item of plan.items) {
      if (!item.isActive || !item.summary.nextDueDate) {
        continue;
      }

      const dueDate = new Date(item.summary.nextDueDate);
      if (Number.isNaN(dueDate.getTime())) {
        continue;
      }

      const dueStart = toStartOfDay(dueDate);
      const todayStart = toStartOfDay(now);

      if (dueStart < todayStart) {
        if (dryRun) {
          continue;
        }

        const created = await notificationService.create({
          userId: aluno.user.id,
          type: 'assessment_overdue',
          title: 'Avaliação física vencida',
          message: `A avaliação ${item.assessmentType.name} está vencida desde ${dueDate.toISOString()}.`,
          payload: {
            alunoId: aluno.id,
            assessmentTypeId: item.assessmentTypeId,
            dueAt: dueDate.toISOString(),
            path: '/student/assessment-plan',
            deepLink: 'acesso://student/assessment-plan',
          },
          dedupeWindowMinutes: 24 * 60,
        });

        if (created) {
          notificationsCreated += 1;
          overdueNotificationsCreated += 1;
        }

        continue;
      }

      if (dueDate <= threshold) {
        if (dryRun) {
          continue;
        }

        const created = await notificationService.create({
          userId: aluno.user.id,
          type: 'assessment_due',
          title: 'Próxima avaliação física prevista',
          message: `A avaliação ${item.assessmentType.name} está prevista para ${dueDate.toISOString()}.`,
          payload: {
            alunoId: aluno.id,
            assessmentTypeId: item.assessmentTypeId,
            dueAt: dueDate.toISOString(),
            path: '/student/assessment-plan',
            deepLink: 'acesso://student/assessment-plan',
          },
          dedupeWindowMinutes: 12 * 60,
        });

        if (created) {
          notificationsCreated += 1;
          dueNotificationsCreated += 1;
        }
      }
    }

    return { dueNotificationsCreated, overdueNotificationsCreated, notificationsCreated };
  },

  async dispatchDueAndOverdue(
    options: DispatchAssessmentPlanNotificationOptions = {}
  ): Promise<DispatchAssessmentPlanNotificationResult> {
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? false;
    const upcomingWindowDays = options.upcomingWindowDays ?? DEFAULT_UPCOMING_WINDOW_DAYS;
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + upcomingWindowDays);

    const alunos = await prisma.aluno.findMany({
      where: {
        status: 'ACTIVE_STUDENT',
        user: {
          isActive: true,
        },
      },
      select: {
        id: true,
        contractId: true,
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    const result: DispatchAssessmentPlanNotificationResult = {
      alunosChecked: alunos.length,
      notificationsCreated: 0,
      dueNotificationsCreated: 0,
      overdueNotificationsCreated: 0,
      errors: [],
    };

    for (const aluno of alunos) {
      try {
        const created = await this.dispatchForAluno(aluno.id, aluno.contractId, {
          now,
          upcomingWindowDays,
          dryRun,
        });

        result.notificationsCreated += created.notificationsCreated;
        result.dueNotificationsCreated += created.dueNotificationsCreated;
        result.overdueNotificationsCreated += created.overdueNotificationsCreated;
      } catch (error: any) {
        result.errors.push({
          alunoId: aluno.id,
          message: error?.message || 'Erro ao gerar notificações de avaliações',
        });
      }
    }

    return result;
  },
};
