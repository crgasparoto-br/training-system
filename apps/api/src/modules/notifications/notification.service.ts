import { PrismaClient, type NotificationType } from '@prisma/client';

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

export const notificationService = {
  async create(input: CreateNotificationInput) {
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

    return prisma.notification.create({
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
  },
};
