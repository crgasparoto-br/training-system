import { Prisma, PrismaClient, type Notification } from '@prisma/client';
import type {
  ExternalDeliveryStatus,
  ExternalNotificationChannel,
} from './notification-delivery.service.js';

const prisma = new PrismaClient();

export interface ExternalDeliveryEvent {
  notificationId: string;
  channel: ExternalNotificationChannel;
  status: Extract<ExternalDeliveryStatus, 'accepted' | 'sent' | 'failed'>;
  providerStatus: string;
  providerMessageId?: string | null;
  error?: string | null;
}

export interface ExternalDeliveryEventResult {
  status: 'updated' | 'duplicate' | 'ignored' | 'not_found';
}

type JsonRecord = Record<string, unknown>;

type StoredChannelState = {
  status?: ExternalDeliveryStatus;
  error?: string | null;
  providerMessageId?: string | null;
  providerStatus?: string | null;
};

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const asStoredChannelState = (value: unknown): StoredChannelState => asRecord(value);

const isTerminal = (status: ExternalDeliveryStatus | undefined) =>
  status === 'sent' || status === 'failed';

export const resolveDeliveryTransition = (
  currentStatus: ExternalDeliveryStatus | undefined,
  nextStatus: ExternalDeliveryEvent['status']
): 'apply' | 'duplicate' | 'ignore' => {
  if (currentStatus === nextStatus) return 'duplicate';
  if (isTerminal(currentStatus)) return 'ignore';
  return 'apply';
};

const buildUpdatedData = (notification: Notification, event: ExternalDeliveryEvent) => {
  const data = asRecord(notification.data);
  const externalDelivery = asRecord(data.externalDelivery);
  const current = asStoredChannelState(externalDelivery[event.channel]);
  const transition = resolveDeliveryTransition(current.status, event.status);
  if (transition !== 'apply') return { transition, data };

  return {
    transition,
    data: {
      ...data,
      externalDelivery: {
        ...externalDelivery,
        [event.channel]: {
          ...current,
          status: event.status,
          error: event.status === 'failed' ? event.error ?? 'Falha de entrega externa' : null,
          providerMessageId: event.providerMessageId ?? current.providerMessageId ?? null,
          providerStatus: event.providerStatus,
          updatedAt: new Date().toISOString(),
        },
      },
    },
  };
};

const applyEventOnce = async (event: ExternalDeliveryEvent): Promise<ExternalDeliveryEventResult> =>
  prisma.$transaction(
    async (tx) => {
      const notification = await tx.notification.findUnique({
        where: { id: event.notificationId },
      });

      if (!notification || notification.type !== 'profile_review_requested') {
        return { status: 'not_found' as const };
      }

      const { transition, data } = buildUpdatedData(notification, event);
      if (transition === 'duplicate') return { status: 'duplicate' as const };
      if (transition === 'ignore') return { status: 'ignored' as const };

      const delivered = event.status === 'sent';
      await tx.notification.update({
        where: { id: notification.id },
        data: {
          data: data as Prisma.InputJsonValue,
          ...(event.channel === 'email'
            ? {
                emailSent: delivered || notification.emailSent,
                emailError:
                  event.status === 'failed'
                    ? event.error ?? 'Falha de entrega externa'
                    : delivered
                      ? null
                      : notification.emailError,
              }
            : {
                whatsappSent: delivered || notification.whatsappSent,
                whatsappError:
                  event.status === 'failed'
                    ? event.error ?? 'Falha de entrega externa'
                    : delivered
                      ? null
                      : notification.whatsappError,
              }),
          sentAt: delivered ? notification.sentAt ?? new Date() : notification.sentAt,
        },
      });

      return { status: 'updated' as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

export const notificationDeliveryStatusService = {
  async apply(event: ExternalDeliveryEvent): Promise<ExternalDeliveryEventResult> {
    try {
      return await applyEventOnce(event);
    } catch (error: any) {
      if (error?.code !== 'P2034') throw error;
      return applyEventOnce(event);
    }
  },
};
