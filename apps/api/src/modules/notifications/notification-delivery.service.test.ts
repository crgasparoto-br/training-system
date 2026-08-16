import { deliverExternalNotification } from './notification-delivery.service.js';

const baseInput = {
  notificationId: 'notification-1',
  emailEnabled: true,
  whatsappEnabled: true,
  recipientEmail: 'aluno@example.com',
  recipientPhone: '+5511999999999',
  title: 'Revisão cadastral pendente no Sistema ACESSO',
  message:
    'Você tem uma revisão cadastral pendente no Sistema ACESSO. Entre na sua conta para acessar a revisão.',
};

const env = {
  SENDGRID_API_KEY: 'sendgrid-key',
  SENDGRID_FROM_EMAIL: 'noreply@example.com',
  SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY: 'public-key-configured',
  TWILIO_ACCOUNT_SID: 'AC123',
  TWILIO_AUTH_TOKEN: 'twilio-token',
  TWILIO_WHATSAPP_NUMBER: '+5511000000000',
  TWILIO_WHATSAPP_PROFILE_REVIEW_CONTENT_SID: 'HX0123456789abcdef0123456789abcdef',
  NOTIFICATION_CALLBACK_BASE_URL: 'https://api.example.com',
};

const sendGridAcceptedResponse = () =>
  ({
    ok: true,
    status: 202,
    headers: { get: (name: string) => (name.toLowerCase() === 'x-message-id' ? 'sg-1' : null) },
    json: async () => ({}),
  }) as unknown as Response;

const twilioResponse = (status = 'queued') =>
  ({
    ok: true,
    status: 201,
    headers: { get: () => null },
    json: async () => ({ sid: 'SM123', status }),
  }) as unknown as Response;

describe('notification delivery adapters', () => {
  it('usa template aprovado no WhatsApp, sem Body livre, e inclui correlação/callback', async () => {
    const fetchImpl = jest.fn().mockImplementation(async (url: string) =>
      url.includes('sendgrid.com') ? sendGridAcceptedResponse() : twilioResponse('queued')
    );

    const delivery = await deliverExternalNotification(baseInput, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env,
    });

    expect(delivery.email).toEqual({
      channel: 'email',
      status: 'accepted',
      error: null,
      providerMessageId: 'sg-1',
      providerStatus: 'accepted',
    });
    expect(delivery.whatsapp).toEqual({
      channel: 'whatsapp',
      status: 'accepted',
      error: null,
      providerMessageId: 'SM123',
      providerStatus: 'queued',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const sendGridCall = fetchImpl.mock.calls.find(([url]) => String(url).includes('sendgrid.com'));
    expect(JSON.parse(String(sendGridCall?.[1]?.body)).personalizations[0].custom_args).toEqual({
      notificationId: 'notification-1',
    });

    const twilioCall = fetchImpl.mock.calls.find(([url]) => String(url).includes('twilio.com'));
    const twilioBody = String(twilioCall?.[1]?.body);
    expect(twilioBody).toContain('To=whatsapp%3A%2B5511999999999');
    expect(twilioBody).toContain('ContentSid=HX0123456789abcdef0123456789abcdef');
    expect(twilioBody).not.toContain('Body=');
    expect(twilioBody).toContain(
      'StatusCallback=https%3A%2F%2Fapi.example.com%2Fapi%2Fv1%2Fnotification-delivery%2Ftwilio-status%3FnotificationId%3Dnotification-1'
    );
  });

  it('só marca entregue quando o provider confirma entrega no resultado síncrono', async () => {
    const fetchImpl = jest.fn().mockImplementation(async (url: string) =>
      url.includes('sendgrid.com') ? sendGridAcceptedResponse() : twilioResponse('delivered')
    );

    const delivery = await deliverExternalNotification(baseInput, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env,
    });

    expect(delivery.email.status).toBe('accepted');
    expect(delivery.whatsapp.status).toBe('sent');
  });

  it('mantém resultado parcial quando apenas o WhatsApp falha', async () => {
    const fetchImpl = jest.fn().mockImplementation(async (url: string) =>
      url.includes('sendgrid.com')
        ? sendGridAcceptedResponse()
        : ({ ok: false, status: 503 } as Response)
    );

    const delivery = await deliverExternalNotification(baseInput, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env,
    });
    expect(delivery.email.status).toBe('accepted');
    expect(delivery.whatsapp).toEqual({
      channel: 'whatsapp',
      status: 'failed',
      error: 'Twilio retornou HTTP 503',
      providerMessageId: null,
      providerStatus: null,
    });
  });

  it('não chama provedores para canais desabilitados pelas preferências', async () => {
    const fetchImpl = jest.fn();
    const delivery = await deliverExternalNotification(
      { ...baseInput, emailEnabled: false, whatsappEnabled: false },
      { fetchImpl: fetchImpl as unknown as typeof fetch, env }
    );
    expect(delivery.email.status).toBe('skipped');
    expect(delivery.whatsapp.status).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('não chama Twilio sem ContentSid aprovado válido e não faz fallback para Body', async () => {
    for (const contentSid of [undefined, 'SM0123456789abcdef0123456789abcdef']) {
      const fetchImpl = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('sendgrid.com')) return sendGridAcceptedResponse();
        throw new Error('Twilio não deveria ser chamado sem ContentSid válido');
      });
      const envWithoutApprovedTemplate = {
        ...env,
        TWILIO_WHATSAPP_PROFILE_REVIEW_CONTENT_SID: contentSid,
      } as NodeJS.ProcessEnv;

      const delivery = await deliverExternalNotification(baseInput, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        env: envWithoutApprovedTemplate,
      });

      expect(delivery.email.status).toBe('accepted');
      expect(delivery.whatsapp.status).toBe('not_configured');
      expect(delivery.whatsapp.error).toContain('template aprovado');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('sendgrid.com');
    }
  });

  it('não dispara provider quando confirmação de entrega não está configurada', async () => {
    const fetchImpl = jest.fn();
    const delivery = await deliverExternalNotification(baseInput, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {
        SENDGRID_API_KEY: 'sendgrid-key',
        SENDGRID_FROM_EMAIL: 'noreply@example.com',
        TWILIO_ACCOUNT_SID: 'AC123',
        TWILIO_AUTH_TOKEN: 'twilio-token',
        TWILIO_WHATSAPP_NUMBER: '+5511000000000',
        TWILIO_WHATSAPP_PROFILE_REVIEW_CONTENT_SID: 'HX0123456789abcdef0123456789abcdef',
      },
    });
    expect(delivery.email.status).toBe('not_configured');
    expect(delivery.whatsapp.status).toBe('not_configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
