import { Prisma, PrismaClient, type Notification, type NotificationType } from '@prisma/client';
import {
  deliverExternalNotification,
  type ExternalChannelDeliveryResult,
  type ExternalNotificationDeliveryResult,
} from './notification-delivery.service.js';
import { notificationDeliveryStatusService } from './notification-delivery-status.service.js';

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

const shouldExposeImmediateDelivery = (delivery: ExternalNotificationDeliveryResult) =>
  delivery.email.status === 'accepted' ||
  delivery.email.status === 'sent' ||
  delivery.email.status === 'failed' ||
  delivery.email.status === 'not_configured' ||
  delivery.whatsapp.status === 'accepted' ||
  delivery.whatsapp.status === 'sent' ||
  delivery.whatsapp.status === 'failed' ||
  delivery.whatsapp.status === 'not_configured';

const DELIVERY_STATUSES = new Set([
  'accepted',
  'sent',
  'failed',
  'skipped',
  'not_configured',
]);

const readStoredDeliveryChannel = (
  notification: Notification,
  channel: 'email' | 'whatsapp',
  fallback: ExternalChannelDeliveryResult
): ExternalChannelDeliveryResult => {
  const data = isJsonRecord(notification.data) ? notification.data : {};
  const externalDelivery = isJsonRecord(data.externalDelivery) ? data.externalDelivery : {};
  const stored = isJsonRecord(externalDelivery[channel]) ? externalDelivery[channel] : null;
  const status = stored?.status;

  if (!stored || typeof status !== 'string' || !DELIVERY_STATUSES.has(status)) {
    return fallback;
  }

  return {
    channel,
    status: status as ExternalChannelDeliveryResult['status'],
    error: typeof stored.error === 'string' ? stored.error : null,
    providerMessageId:
      typeof stored.providerMessageId === 'string' ? stored.providerMessageId : null,
    providerStatus: typeof stored.providerStatus === 'string' ? stored.providerStatus : null,
  };
};

const readPersistedDelivery = (
  notification: Notification,
  fallback: ExternalNotificationDeliveryResult
): ExternalNotificationDeliveryResult => ({
  email: readStoredDeliveryChannel(notification, 'email', fallback.email),
  whatsapp: readStoredDeliveryChannel(notification, 'whatsapp', fallback.whatsapp),
});

const persistDispatchResult = async (
  notificationId: string,
  delivery: ExternalNotificationDeliveryResult
) => {
  for (const channelResult of [delivery.email, delivery.whatsapp]) {
    await notificationDeliveryStatusService.apply({
      notificationId,
      channel: channelResult.channel,
      status: channelResult.status,
      providerStatus: channelResult.providerStatus ?? channelResult.status,
      providerMessageId: channelResult.providerMessageId,
      error: channelResult.error,
    });
  }
};

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

    try {
      await persistDispatchResult(notification.id, dispatchResult);
      const updatedNotification =
        (await prisma.notification.findUnique({ where: { id: notification.id } })) ?? notification;
      const persistedDelivery = readPersistedDelivery(updatedNotification, dispatchResult);

      return {
        notification: updatedNotification,
        delivery: shouldExposeImmediateDelivery(persistedDelivery) ? persistedDelivery : null,
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
