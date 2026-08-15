import { Prisma, PrismaClient, type Notification, type NotificationType } from '@prisma/client';
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
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toComparablePayload = (payload: NotificationPayload) => ({
  alunoId: payload.alunoId,
  reviewId: payload.reviewId ?? null,
  assessmentTypeId: payload.assessmentTypeId ?? null,
  dueAt: normalizeIsoDate(payload.dueAt),
  deepLink: payload.deepLink ?? null,
  path: payload.path ?? null,
});

const isDuplicate = (left: NotificationPayload, right: NotificationPayload) =>
  JSON.stringify(toComparablePayload(left)) === JSON.stringify(toComparablePayload(right));

const isJsonRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const findRecentDuplicate = async (
  client: Pick<Prisma.TransactionClient, 'notification'> | PrismaClient,
  input: CreateNotificationInput,
  dedupeStart: Date
) => {
  const recent = await client.notification.findMany({
    where: { userId: input.userId, type: input.type, createdAt: { gte: dedupeStart } },
    select: { id: true, data: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return recent.some((item) => {
    if (!isJsonRecord(item.data)) return false;
    return isDuplicate(item.data as NotificationPayload, input.payload);
  });
};

const createInternalNotification = async (
  input: CreateNotificationInput,
  channels: { emailEnabled: boolean; smsEnabled: boolean; whatsappEnabled: boolean },
  dedupeStart: Date
): Promise<Notification | null> => {
  const attempt = () =>
    prisma.$transaction(
      async (tx) => {
        if (await findRecentDuplicate(tx, input, dedupeStart)) return null;
        return tx.notification.create({
          data: {
            userId: input.userId,
            type: input.type,
            title: input.title,
            message: input.message,
            data: { ...input.payload, channels },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

  try {
    return await attempt();
  } catch (error: any) {
    if (error?.code !== 'P2034') throw error;
    if (await findRecentDuplicate(prisma, input, dedupeStart)) return null;
    return attempt();
  }
};

const resolveDeliveryChannels = async (userId: string) => {
  const preferences = await prisma.notificationPreferences.findUnique({
    where: { userId },
    select: { emailEnabled: true, smsEnabled: true, whatsappEnabled: true },
  });
  return {
    emailEnabled: preferences?.emailEnabled ?? true,
    smsEnabled: preferences?.smsEnabled ?? true,
    whatsappEnabled: preferences?.whatsappEnabled ?? true,
  };
};

const buildExternalContent = (type: NotificationType) => {
  if (type !== 'profile_review_requested') return null;
  const title = 'Revisão cadastral pendente no Sistema ACESSO';
  const baseMessage =
    'Você tem uma revisão cadastral pendente no Sistema ACESSO. Entre na sua conta para acessar e concluir a revisão.';
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (!frontendUrl) return { title, message: baseMessage };
  try {
    const url = new URL(frontendUrl);
    if (url.protocol !== 'https:') return { title, message: baseMessage };
    url.pathname = '/student/profile-review';
    url.search = '';
    url.hash = '';
    return { title, message: `${baseMessage} Acesse: ${url.toString()}` };
  } catch {
    return { title, message: baseMessage };
  }
};

const deliveryDiagnostic = (status: string, error: string | null) =>
  status === 'failed' || status === 'not_configured' ? error : null;

const hasConfirmedDelivery = (delivery: ExternalNotificationDeliveryResult) =>
  delivery.email.status === 'sent' || delivery.whatsapp.status === 'sent';

const shouldExposeImmediateDelivery = (delivery: ExternalNotificationDeliveryResult) =>
  hasConfirmedDelivery(delivery) ||
  delivery.email.status === 'failed' ||
  delivery.email.status === 'not_configured' ||
  delivery.whatsapp.status === 'failed' ||
  delivery.whatsapp.status === 'not_configured';

export const notificationService = {
  async create(input: CreateNotificationInput): Promise<CreateNotificationResult | null> {
    const now = new Date();
    const dedupeWindowMinutes = input.dedupeWindowMinutes ?? DEFAULT_DEDUPE_WINDOW_MINUTES;
    const dedupeStart = new Date(now.getTime() - dedupeWindowMinutes * 60 * 1000);
    const channels = await resolveDeliveryChannels(input.userId);
    const notification = await createInternalNotification(input, channels, dedupeStart);
    if (!notification) return null;
    if (!input.dispatchExternal) return { notification, delivery: null };

    const recipient = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, profile: { select: { phone: true } } },
    });
    const externalContent =
      buildExternalContent(input.type) ?? { title: input.title, message: input.message };
    const dispatchResult = await deliverExternalNotification({
      notificationId: notification.id,
      emailEnabled: channels.emailEnabled,
      whatsappEnabled: channels.whatsappEnabled,
      recipientEmail: recipient?.email ?? null,
      recipientPhone: recipient?.profile?.phone ?? null,
      title: externalContent.title,
      message: externalContent.message,
    });

    const emailDelivered = dispatchResult.email.status === 'sent';
    const whatsappDelivered = dispatchResult.whatsapp.status === 'sent';
    const currentData = isJsonRecord(notification.data) ? notification.data : {};

    try {
      const updatedNotification = await prisma.notification.update({
        where: { id: notification.id },
        data: {
          data: {
            ...currentData,
            externalDelivery: {
              email: dispatchResult.email,
              whatsapp: dispatchResult.whatsapp,
            },
          } as unknown as Prisma.InputJsonValue,
          emailSent: emailDelivered,
          whatsappSent: whatsappDelivered,
          emailError: deliveryDiagnostic(dispatchResult.email.status, dispatchResult.email.error),
          whatsappError: deliveryDiagnostic(
            dispatchResult.whatsapp.status,
            dispatchResult.whatsapp.error
          ),
          sentAt: emailDelivered || whatsappDelivered ? new Date() : null,
        },
      });
      return {
        notification: updatedNotification,
        delivery: shouldExposeImmediateDelivery(dispatchResult) ? dispatchResult : null,
      };
    } catch {
      console.error('Falha ao persistir estado da entrega externa da notificação');
      return {
        notification,
        delivery: shouldExposeImmediateDelivery(dispatchResult) ? dispatchResult : null,
      };
    }
  },
};
