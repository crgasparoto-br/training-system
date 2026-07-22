const MAX_AUDIT_IP_LENGTH = 64;
const MAX_AUDIT_USER_AGENT_LENGTH = 256;

function sanitizeAuditText(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;

  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

  return normalized || undefined;
}

function sanitizeIpAddress(value: string | undefined): string | undefined {
  const normalized = sanitizeAuditText(value, MAX_AUDIT_IP_LENGTH);
  if (!normalized) return undefined;

  // Express entrega IPv4, IPv6 ou IPv4 mapeado em IPv6. Qualquer outro
  // conteúdo é descartado para não persistir cabeçalhos manipulados como IP.
  return /^[0-9a-fA-F:.]+$/.test(normalized) ? normalized : undefined;
}

export function sanitizePublicInviteAuditActor(actor: {
  ipAddress?: string;
  userAgent?: string;
}): { ipAddress?: string; userAgent?: string } {
  return {
    ipAddress: sanitizeIpAddress(actor.ipAddress),
    userAgent: sanitizeAuditText(actor.userAgent, MAX_AUDIT_USER_AGENT_LENGTH),
  };
}
