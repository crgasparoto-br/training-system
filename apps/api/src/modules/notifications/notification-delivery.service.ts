export type ExternalNotificationChannel = 'email' | 'whatsapp';
export type ExternalDeliveryStatus =
  | 'accepted'
  | 'sent'
  | 'failed'
  | 'skipped'
  | 'not_configured';

export interface ExternalChannelDeliveryResult {
  channel: ExternalNotificationChannel;
  status: ExternalDeliveryStatus;
  error: string | null;
  providerMessageId: string | null;
  providerStatus: string | null;
}

export interface ExternalNotificationDeliveryResult {
  email: ExternalChannelDeliveryResult;
  whatsapp: ExternalChannelDeliveryResult;
}

export interface DeliverExternalNotificationInput {
  notificationId: string;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  recipientEmail: string | null;
  recipientPhone: string | null;
  title: string;
  message: string;
}

export interface NotificationDeliveryDependencies {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

const result = (
  channel: ExternalNotificationChannel,
  status: ExternalDeliveryStatus,
  error: string | null = null,
  providerMessageId: string | null = null,
  providerStatus: string | null = null
): ExternalChannelDeliveryResult => ({
  channel,
  status,
  error,
  providerMessageId,
  providerStatus,
});

const resolveCallbackBaseUrl = (env: NodeJS.ProcessEnv): URL | null => {
  const raw = env.NOTIFICATION_CALLBACK_BASE_URL?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
};

const buildTwilioStatusCallbackUrl = (
  notificationId: string,
  env: NodeJS.ProcessEnv
): string | null => {
  const base = resolveCallbackBaseUrl(env);
  if (!base) return null;
  const url = new URL('/api/v1/notification-delivery/twilio-status', base);
  url.searchParams.set('notificationId', notificationId);
  return url.toString();
};

const safeJson = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    const value = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const readHeader = (response: Response, name: string) => {
  try {
    return response.headers?.get(name) ?? null;
  } catch {
    return null;
  }
};

const deliverEmail = async (
  input: DeliverExternalNotificationInput,
  fetchImpl: typeof fetch,
  env: NodeJS.ProcessEnv
): Promise<ExternalChannelDeliveryResult> => {
  if (!input.emailEnabled) {
    return result('email', 'skipped');
  }

  if (!input.recipientEmail) {
    return result('email', 'failed', 'E-mail do aluno não cadastrado');
  }

  const apiKey = env.SENDGRID_API_KEY?.trim();
  const fromEmail = env.SENDGRID_FROM_EMAIL?.trim();
  const webhookPublicKey = env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY?.trim();
  const callbackBase = resolveCallbackBaseUrl(env);
  if (!apiKey || !fromEmail || !webhookPublicKey || !callbackBase) {
    return result(
      'email',
      'not_configured',
      'Configuração do SendGrid ou confirmação de entrega ausente'
    );
  }

  try {
    const response = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: input.recipientEmail }],
            custom_args: { notificationId: input.notificationId },
          },
        ],
        from: { email: fromEmail },
        subject: input.title,
        content: [{ type: 'text/plain', value: input.message }],
      }),
    });

    if (!response.ok) {
      return result('email', 'failed', `SendGrid retornou HTTP ${response.status}`);
    }

    return result(
      'email',
      'accepted',
      null,
      readHeader(response, 'x-message-id'),
      'accepted'
    );
  } catch {
    return result('email', 'failed', 'Falha de comunicação com o SendGrid');
  }
};

const toWhatsAppAddress = (phone: string) =>
  phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;

const mapTwilioImmediateStatus = (providerStatus: string | null): ExternalDeliveryStatus => {
  if (providerStatus === 'delivered' || providerStatus === 'read') return 'sent';
  if (providerStatus === 'failed' || providerStatus === 'undelivered') return 'failed';
  return 'accepted';
};

const deliverWhatsApp = async (
  input: DeliverExternalNotificationInput,
  fetchImpl: typeof fetch,
  env: NodeJS.ProcessEnv
): Promise<ExternalChannelDeliveryResult> => {
  if (!input.whatsappEnabled) {
    return result('whatsapp', 'skipped');
  }

  if (!input.recipientPhone) {
    return result('whatsapp', 'failed', 'Telefone do aluno não cadastrado');
  }

  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const fromWhatsApp = env.TWILIO_WHATSAPP_NUMBER?.trim();
  const statusCallback = buildTwilioStatusCallbackUrl(input.notificationId, env);
  if (!accountSid || !authToken || !fromWhatsApp || !statusCallback) {
    return result(
      'whatsapp',
      'not_configured',
      'Configuração do WhatsApp/Twilio ou callback de status ausente'
    );
  }

  const body = new URLSearchParams({
    To: toWhatsAppAddress(input.recipientPhone),
    From: toWhatsAppAddress(fromWhatsApp),
    Body: input.message,
    StatusCallback: statusCallback,
  });

  try {
    const response = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }
    );

    if (!response.ok) {
      return result('whatsapp', 'failed', `Twilio retornou HTTP ${response.status}`);
    }

    const payload = await safeJson(response);
    const providerMessageId = typeof payload.sid === 'string' ? payload.sid : null;
    const providerStatus =
      typeof payload.status === 'string' ? payload.status.trim().toLowerCase() : null;
    const status = mapTwilioImmediateStatus(providerStatus);
    const error = status === 'failed' ? `Twilio informou status ${providerStatus}` : null;
    return result('whatsapp', status, error, providerMessageId, providerStatus);
  } catch {
    return result('whatsapp', 'failed', 'Falha de comunicação com o Twilio');
  }
};

export const deliverExternalNotification = async (
  input: DeliverExternalNotificationInput,
  dependencies: NotificationDeliveryDependencies = {}
): Promise<ExternalNotificationDeliveryResult> => {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const env = dependencies.env ?? process.env;
  const [email, whatsapp] = await Promise.all([
    deliverEmail(input, fetchImpl, env),
    deliverWhatsApp(input, fetchImpl, env),
  ]);

  return { email, whatsapp };
};
