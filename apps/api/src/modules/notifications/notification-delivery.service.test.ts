import { deliverExternalNotification } from './notification-delivery.service.js';

const baseInput = {
  emailEnabled: true,
  whatsappEnabled: true,
  recipientEmail: 'aluno@example.com',
  recipientPhone: '+5511999999999',
  title: 'Revisão cadastral pendente no Sistema ACESSO',
  message: 'Você tem uma revisão cadastral pendente no Sistema ACESSO. Entre na sua conta para acessar a revisão.',
};

const env = {
  SENDGRID_API_KEY: 'sendgrid-key',
  SENDGRID_FROM_EMAIL: 'noreply@example.com',
  TWILIO_ACCOUNT_SID: 'AC123',
  TWILIO_AUTH_TOKEN: 'twilio-token',
  TWILIO_WHATSAPP_NUMBER: '+5511000000000',
};

describe('notification delivery adapters', () => {
  it('registra sucesso quando e-mail e WhatsApp são aceitos pelos provedores', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 202 });

    const delivery = await deliverExternalNotification(baseInput, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env,
    });

    expect(delivery.email).toEqual({ channel: 'email', status: 'sent', error: null });
    expect(delivery.whatsapp).toEqual({ channel: 'whatsapp', status: 'sent', error: null });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const twilioCall = fetchImpl.mock.calls.find(([url]) => String(url).includes('twilio.com'));
    expect(String(twilioCall?.[1]?.body)).toContain('To=whatsapp%3A%2B5511999999999');
  });

  it('mantém resultado parcial quando apenas o WhatsApp falha', async () => {
    const fetchImpl = jest.fn().mockImplementation(async (url: string) => ({
      ok: url.includes('sendgrid.com'),
      status: url.includes('sendgrid.com') ? 202 : 503,
    }));

    const delivery = await deliverExternalNotification(baseInput, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env,
    });

    expect(delivery.email.status).toBe('sent');
    expect(delivery.whatsapp).toEqual({
      channel: 'whatsapp',
      status: 'failed',
      error: 'Twilio retornou HTTP 503',
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

  it('converte configuração ausente em falha de entrega sem lançar exceção', async () => {
    const fetchImpl = jest.fn();

    const delivery = await deliverExternalNotification(baseInput, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {},
    });

    expect(delivery.email.status).toBe('failed');
    expect(delivery.whatsapp.status).toBe('failed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
