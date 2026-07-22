import {
  sanitizePreRegistrationInviteRevocationReason,
  sanitizePublicInviteAuditActor,
} from './pre-registration-invite-audit.js';

const token = 'A'.repeat(43);

describe('pre-registration invite audit sanitization', () => {
  it('normaliza IP válido, remove controles e limita User-Agent', () => {
    const sanitized = sanitizePublicInviteAuditActor(
      {
        ipAddress: '  ::ffff:203.0.113.10  ',
        userAgent: `  browser\u0000with\ncontrols\u0085 ${'x'.repeat(400)}  `,
      },
      token
    );

    expect(sanitized.ipAddress).toBe('::ffff:203.0.113.10');
    expect(sanitized.userAgent).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(sanitized.userAgent?.length).toBeLessThanOrEqual(256);
  });

  it('descarta conteúdo que não representa IPv4 ou IPv6', () => {
    expect(
      sanitizePublicInviteAuditActor({ ipAddress: '1.2.3.4, injected' }, token).ipAddress
    ).toBeUndefined();
    expect(
      sanitizePublicInviteAuditActor({ ipAddress: '::::' }, token).ipAddress
    ).toBeUndefined();
  });

  it('remove token bruto e token presente em URL do User-Agent', () => {
    const sanitized = sanitizePublicInviteAuditActor(
      {
        userAgent: `client ${token} https://app.example/pre-cadastro/${token}`,
      },
      token
    );

    expect(sanitized.userAgent).not.toContain(token);
    expect(sanitized.userAgent).toContain('[REDACTED]');
  });

  it('remove token bruto e URL de convite do motivo de revogação', () => {
    const reason = sanitizePreRegistrationInviteRevocationReason(
      `Revogar https://app.example/pre-cadastro/${token} token ${token}`
    );

    expect(reason).not.toContain(token);
    expect(reason).toContain('[REDACTED]');
  });
});
