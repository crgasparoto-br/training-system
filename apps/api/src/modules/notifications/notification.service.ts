import { PrismaClient, type Notification, type NotificationType } from '@prisma/client';
import {
  deliverExternalNotification,
  type ExternalNotificationDeliveryResult,
} from './notification-delivery.service.js';

const prisma = new PrismaClient();

export type NotificationPayload = {
  alunoId: string;
  reviewId?: string;
  assessmentTypeId?: string;
  dueAt?: string | null;
  deepLink?: string | null;
  path?: string | null;
  [key: string]: unknown;
};

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  payload: NotificationPayload;
  dedupeWindowMinutes?: number;
  dispatchExternal?: boolean;
}

export interface CreateNotificationResult {
  notification: Notification;
  delivery: ExternalNotificationDeliveryResult | null;
}

const DEFAULT_DEDUPE_WINDOW_MINUTES = 120;

const normalizeIsoDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const toComparablePayload = (payload: NotificationPayload) => ({
  alunoId: payload.alunoId,
  reviewId: payload.reviewId ?? null,
  assessmentTypeId: payload.assessmentTypeId ?? null,
  dueAt: normalizeIsoDate(payload.dueAt),
  deepLink: payload.deepLink ?? null,
  path: payload.path ?? null,
});

const isDuplicate = (left: NotificationPayload, right: NotificationPayload) => {
  return JSON.stringify(toComparablePayload(left)) === JSON.stringify(toComparablePayload(right));
};

const resolveDeliveryChannels = async (userId: string) => {
  const preferences = await prisma.notificationPreferences.findUnique({
    where: { userId },
    select: {
      emailEnabled: true,
      smsEnabled: true,
      whatsappEnabled: true,
    },
  });

  return {
    emailEnabled: preferences?.emailEnabled ?? true,
    smsEnabled: preferences?.smsEnabled ?? true,
    whatsappEnabled: preferences?.whatsappEnabled ?? true,
  };
};

const buildExternalContent = (type: NotificationType) => {
  if (type !== 'profile_review_requested') {
    return null;
  }

  const title = 'Revisão cadastral pendente no Sistema ACESSO';
  const baseMessage =
    'Você tem uma revisão cadastral pendente no Sistema ACESSO. Entre na sua conta para acessar e concluir a revisão.';
  const frontendUrl = process.env.FRONTEND_URL?.trim();

  if (!frontendUrl) {
    return { title, message: baseMessage };
  }

  try {
    const url = new URL(frontendUrl);
    if (url.protocol !== 'https:') {
      return { title, message: baseMessage };
    }

    url.pathname = '/student/profile-review';
    url.search = '';
    url.hash = '';
    return { title, message: `${baseMessage} Acesse: ${url.toString()}` };
  } catch {
    return { title, message: baseMessage };
  }
};

export const notificationService = {
  async create(input: CreateNotificationInput): Promise<CreateNotificationResult | null> {
    const now = new Date();
    const dedupeWindowMinutes = input.dedupeWindowMinutes ?? DEFAULT_DEDUPE_WINDOW_MINUTES;
    const dedupeStart = new Date(now.getTime() - dedupeWindowMinutes * 60 * 1000);

    const recent = await prisma.notification.findMany({
      where: {
        userId: input.userId,
        type: input.type,
        createdAt: {
          gte: dedupeStart,
        },
      },
      select: {
        id: true,
        data: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 30,
    });

    const duplicated = recent.some((item) => {
      if (!item.data || typeof item.data !== 'object' || Array.isArray(item.data)) {
        return false;
      }

      return isDuplicate(item.data as NotificationPayload, input.payload);
    });

    if (duplicated) {
      return null;
    }

    const channels = await resolveDeliveryChannels(input.userId);

    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        data: {
          ...input.payload,
          channels,
        },
      },
    });

    if (!input.dispatchExternal) {
      return { notification, delivery: null };
    }

    const recipient = await prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        email: true,
        profile: {
          select: {
            phone: true,
          },
        },
      },
    });
    const externalContent = buildExternalContent(input.type) ?? {
      title: input.title,
      message: input.message,
    };

    const delivery = await deliverExternalNotification({
      emailEnabled: channels.emailEnabled,
      whatsappEnabled: channels.whatsappEnabled,
      recipientEmail: recipient?.email ?? null,
      recipientPhone: recipient?.profile?.phone ?? null,
      title: externalContent.title,
      message: externalContent.message,
    });

    const emailSent = delivery.email.status === 'sent';
    const whatsappSent = delivery.whatsapp.status === 'sent';
    const updatedNotification = await prisma.notification.update({
      where: { id: notification.id },
      data: {
        emailSent,
        whatsappSent,
        emailError: delivery.email.status === 'failed' ? delivery.email.error : null,
        whatsappError: delivery.whatsapp.status === 'failed' ? delivery.whatsapp.error : null,
        sentAt: emailSent || whatsappSent ? new Date() : null,
      },
    });

    return {
      notification: updatedNotification,
      delivery,
    };
  },
};
