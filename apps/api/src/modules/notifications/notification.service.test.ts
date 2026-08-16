const mockDb = {
  notification: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  notificationPreferences: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockDb),
  Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
}));

jest.mock('./notification-delivery.service.js', () => ({
  deliverExternalNotification: jest.fn(),
}));

import { notificationService } from './notification.service.js';

const { deliverExternalNotification } = jest.requireMock('./notification-delivery.service.js') as {
  deliverExternalNotification: jest.Mock;
};

const input = {
  userId: 'user-1',
  type: 'profile_review_requested' as any,
  title: 'Revisão cadastral solicitada',
  message: 'Mensagem interna',
  payload: { alunoId: 'aluno-1', reviewId: 'review-1' },
  dedupeWindowMinutes: 30,
  dispatchExternal: true,
};

const notification = {
  id: 'notification-1',
  userId: 'user-1',
  type: 'profile_review_requested',
  title: input.title,
  message: input.message,
  data: { ...input.payload, channels: { emailEnabled: true, smsEnabled: true, whatsappEnabled: true } },
  emailSent: false,
  smsSent: false,
  whatsappSent: false,
  emailError: null,
  smsError: null,
  whatsappError: null,
  createdAt: new Date(),
  sentAt: null,
};

const acceptedDelivery = {
  email: {
    channel: 'email',
    status: 'accepted',
    error: null,
    providerMessageId: 'sg-1',
    providerStatus: 'accepted',
  },
  whatsapp: {
    channel: 'whatsapp',
    status: 'accepted',
    error: null,
    providerMessageId: 'SM1',
    providerStatus: 'queued',
  },
};

const skippedChannel = {
  channel: 'whatsapp',
  status: 'skipped',
  error: null,
  providerMessageId: null,
  providerStatus: null,
};

describe('notificationService.create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) =>
      callback(mockDb)
    );
    mockDb.notification.findMany.mockResolvedValue([]);
    mockDb.notification.findUnique.mockResolvedValue(notification);
    mockDb.notification.create.mockResolvedValue(notification);
    mockDb.notification.update.mockResolvedValue(notification);
    mockDb.notificationPreferences.findUnique.mockResolvedValue({
      emailEnabled: true,
      smsEnabled: true,
      whatsappEnabled: true,
    });
    mockDb.user.findUnique.mockResolvedValue({
      email: 'aluno@example.com',
      profile: { phone: '+5511999999999' },
    });
    deliverExternalNotification.mockResolvedValue(acceptedDelivery);
  });

  it('usa transação serializável e expõe accepted sem tratá-lo como entrega confirmada', async () => {
    const result = await notificationService.create(input);

    expect(mockDb.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(mockDb.notification.create).toHaveBeenCalledTimes(1);
    expect(deliverExternalNotification).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: 'notification-1' })
    );
    expect(result?.delivery?.email.status).toBe('accepted');
    expect(result?.delivery?.whatsapp.status).toBe('accepted');
    expect(result?.notification.emailSent).toBe(false);
    expect(result?.notification.whatsappSent).toBe(false);
    expect(result?.notification.sentAt).toBeNull();
  });

  it('expõe accepted quando o outro canal foi pulado', async () => {
    deliverExternalNotification.mockResolvedValueOnce({
      email: acceptedDelivery.email,
      whatsapp: skippedChannel,
    });

    const result = await notificationService.create(input);

    expect(result?.delivery?.email.status).toBe('accepted');
    expect(result?.delivery?.whatsapp.status).toBe('skipped');
    expect(result?.notification.emailSent).toBe(false);
  });

  it('mantém delivery nulo quando nenhum canal produziu efeito externo', async () => {
    deliverExternalNotification.mockResolvedValueOnce({
      email: { ...skippedChannel, channel: 'email' },
      whatsapp: skippedChannel,
    });

    const result = await notificationService.create(input);

    expect(result?.delivery).toBeNull();
  });

  it('recupera conflito serializável reutilizando a notificação concorrente sem novo outbound', async () => {
    const conflict = Object.assign(new Error('serialization conflict'), { code: 'P2034' });
    mockDb.$transaction.mockRejectedValueOnce(conflict);
    mockDb.notification.findMany.mockResolvedValueOnce([
      { id: 'notification-other', data: { alunoId: 'aluno-1', reviewId: 'review-1' } },
    ]);

    const result = await notificationService.create(input);

    expect(result).toBeNull();
    expect(mockDb.notification.create).not.toHaveBeenCalled();
    expect(deliverExternalNotification).not.toHaveBeenCalled();
  });

  it('preserva accepted conhecido do provider quando a persistência posterior falha', async () => {
    mockDb.notification.update.mockRejectedValueOnce(new Error('database unavailable'));

    const result = await notificationService.create(input);

    expect(result?.notification).toBe(notification);
    expect(result?.delivery?.email.status).toBe('accepted');
    expect(result?.delivery?.whatsapp.status).toBe('accepted');
    expect(result?.notification.emailSent).toBe(false);
    expect(result?.notification.whatsappSent).toBe(false);
    expect(deliverExternalNotification).toHaveBeenCalledTimes(1);
  });

  it('preserva confirmações sent que chegam por callback antes da persistência do accepted', async () => {
    const callbackSentAt = new Date();
    const callbackConfirmed = {
      ...notification,
      data: {
        ...notification.data,
        externalDelivery: {
          email: {
            channel: 'email',
            status: 'sent',
            error: null,
            providerMessageId: 'sg-1',
            providerStatus: 'delivered',
          },
          whatsapp: {
            channel: 'whatsapp',
            status: 'sent',
            error: null,
            providerMessageId: 'SM1',
            providerStatus: 'read',
          },
        },
      },
      emailSent: true,
      whatsappSent: true,
      sentAt: callbackSentAt,
    };

    deliverExternalNotification.mockImplementationOnce(async () => {
      mockDb.notification.findUnique.mockResolvedValue(callbackConfirmed);
      return acceptedDelivery;
    });

    const result = await notificationService.create(input);

    expect(mockDb.notification.update).not.toHaveBeenCalled();
    expect(result?.notification).toBe(callbackConfirmed);
    expect(result?.delivery?.email.status).toBe('sent');
    expect(result?.delivery?.whatsapp.status).toBe('sent');
    expect(result?.notification.sentAt).toBe(callbackSentAt);
  });

  it('preserva falhas terminais que chegam por callback antes da persistência do accepted', async () => {
    const callbackFailed = {
      ...notification,
      data: {
        ...notification.data,
        externalDelivery: {
          email: {
            channel: 'email',
            status: 'failed',
            error: 'SendGrid informou bounce',
            providerMessageId: 'sg-1',
            providerStatus: 'bounce',
          },
          whatsapp: {
            channel: 'whatsapp',
            status: 'failed',
            error: 'Twilio informou undelivered',
            providerMessageId: 'SM1',
            providerStatus: 'undelivered',
          },
        },
      },
      emailError: 'SendGrid informou bounce',
      whatsappError: 'Twilio informou undelivered',
    };

    deliverExternalNotification.mockImplementationOnce(async () => {
      mockDb.notification.findUnique.mockResolvedValue(callbackFailed);
      return acceptedDelivery;
    });

    const result = await notificationService.create(input);

    expect(mockDb.notification.update).not.toHaveBeenCalled();
    expect(result?.notification).toBe(callbackFailed);
    expect(result?.delivery?.email.status).toBe('failed');
    expect(result?.delivery?.whatsapp.status).toBe('failed');
  });
});
