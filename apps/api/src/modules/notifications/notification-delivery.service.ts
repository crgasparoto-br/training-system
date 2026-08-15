export type ExternalNotificationChannel = 'email' | 'sms';
export type ExternalDeliveryStatus = 'sent' | 'failed' | 'skipped';

export interface ExternalChannelDeliveryResult {
  channel: ExternalNotificationChannel;
  status: ExternalDeliveryStatus;
  error: string | null;
}

export interface ExternalNotificationDeliveryResult {
  email: ExternalChannelDeliveryResult;
  sms: ExternalChannelDeliveryResult;
}

export interface DeliverExternalNotificationInput {
  emailEnabled: boolean;
  smsEnabled: boolean;
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
  error: string | null = null
): ExternalChannelDeliveryResult => ({ channel, status, error });

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
  if (!apiKey || !fromEmail) {
    return result('email', 'failed', 'Configuração do SendGrid ausente');
  }

  try {
    const response = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.recipientEmail }] }],
        from: { email: fromEmail },
        subject: input.title,
        content: [{ type: 'text/plain', value: input.message }],
      }),
    });

    if (!response.ok) {
      return result('email', 'failed', `SendGrid retornou HTTP ${response.status}`);
    }

    return result('email', 'sent');
  } catch {
    return result('email', 'failed', 'Falha de comunicação com o SendGrid');
  }
};

const deliverSms = async (
  input: DeliverExternalNotificationInput,
  fetchImpl: typeof fetch,
  env: NodeJS.ProcessEnv
): Promise<ExternalChannelDeliveryResult> => {
  if (!input.smsEnabled) {
    return result('sms', 'skipped');
  }

  if (!input.recipientPhone) {
    return result('sms', 'failed', 'Telefone do aluno não cadastrado');
  }

  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const fromPhone = env.TWILIO_PHONE_NUMBER?.trim();
  if (!accountSid || !authToken || !fromPhone) {
    return result('sms', 'failed', 'Configuração do Twilio ausente');
  }

  const body = new URLSearchParams({
    To: input.recipientPhone,
    From: fromPhone,
    Body: input.message,
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
      return result('sms', 'failed', `Twilio retornou HTTP ${response.status}`);
    }

    return result('sms', 'sent');
  } catch {
    return result('sms', 'failed', 'Falha de comunicação com o Twilio');
  }
};

export const deliverExternalNotification = async (
  input: DeliverExternalNotificationInput,
  dependencies: NotificationDeliveryDependencies = {}
): Promise<ExternalNotificationDeliveryResult> => {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const env = dependencies.env ?? process.env;
  const [email, sms] = await Promise.all([
    deliverEmail(input, fetchImpl, env),
    deliverSms(input, fetchImpl, env),
  ]);

  return { email, sms };
};
