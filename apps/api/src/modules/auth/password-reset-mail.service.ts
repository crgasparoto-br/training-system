import sgMail from '@sendgrid/mail';

const sendgridApiKey = process.env.SENDGRID_API_KEY?.trim();
const sendgridFromEmail = process.env.SENDGRID_FROM_EMAIL?.trim();

if (sendgridApiKey) {
  sgMail.setApiKey(sendgridApiKey);
}

function isMailConfigured() {
  return Boolean(sendgridApiKey && sendgridFromEmail);
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  if (!isMailConfigured()) {
    console.warn(
      `[auth] SendGrid não configurado. Link de redefinição para ${email}: ${resetUrl}`
    );
    return { delivered: false };
  }

  await sgMail.send({
    to: email,
    from: sendgridFromEmail as string,
    subject: 'Redefinição de senha - Sistema Acesso',
    text: [
      'Recebemos uma solicitação para redefinir sua senha.',
      'Use o link abaixo para continuar:',
      resetUrl,
      '',
      'Se você não solicitou a redefinição, ignore este e-mail.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="margin-bottom: 16px;">Redefinição de senha</h2>
        <p>Recebemos uma solicitação para redefinir sua senha no Sistema Acesso.</p>
        <p>
          <a
            href="${resetUrl}"
            style="display:inline-block;padding:12px 20px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;"
          >
            Redefinir senha
          </a>
        </p>
        <p>Se o botão acima não funcionar, copie e cole este link no navegador:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>Se você não solicitou a redefinição, ignore este e-mail.</p>
      </div>
    `,
  });

  return { delivered: true };
}