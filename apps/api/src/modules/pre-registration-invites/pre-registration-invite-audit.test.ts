import { sanitizePublicInviteAuditActor } from './pre-registration-invite-audit.js';

describe('pre-registration invite public audit context', () => {
  it('normaliza IP válido e remove controles do User-Agent com limite de tamanho', () => {
    const sanitized = sanitizePublicInviteAuditActor({
      ipAddress: '  ::ffff:203.0.113.10  ',
      userAgent: `  browser\u0000with\ncontrols ${'x'.repeat(400)}  `,
    });

    expect(sanitized.ipAddress).toBe('::ffff:203.0.113.10');
    expect(sanitized.userAgent).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(sanitized.userAgent?.length).toBeLessThanOrEqual(256);
  });

  it('descarta conteúdo que não representa IPv4 ou IPv6', () => {
    expect(sanitizePublicInviteAuditActor({ ipAddress: '1.2.3.4, injected' }).ipAddress).toBeUndefined();
  });
});
