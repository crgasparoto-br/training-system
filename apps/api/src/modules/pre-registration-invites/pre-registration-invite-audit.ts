import { isIP } from 'node:net';

const MAX_AUDIT_IP_LENGTH = 64;
const MAX_AUDIT_USER_AGENT_LENGTH = 256;
const MIN_TOKEN_LIKE_LENGTH = 40;
const REDACTED_VALUE = '[REDACTED]';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactInviteSecrets(value: string, currentToken?: string): string {
  let redacted = value;

  if (currentToken) {
    redacted = redacted.replace(new RegExp(escapeRegExp(currentToken), 'g'), REDACTED_VALUE);
  }

  redacted = redacted.replace(
    /(\/pre-cadastro\/)[A-Za-z0-9_-]{30,}/gi,
    `$1${REDACTED_VALUE}`
  );

  const tokenLikePattern = new RegExp(
    `(^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{${MIN_TOKEN_LIKE_LENGTH},})(?=$|[^A-Za-z0-9_-])`,
    'g'
  );
  return redacted.replace(tokenLikePattern, `$1${REDACTED_VALUE}`);
}

function normalizeAuditText(value: string | undefined, currentToken?: string): string | undefined {
  if (!value) return undefined;

  const normalized = redactInviteSecrets(value, currentToken)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || undefined;
}

function sanitizeAuditText(
  value: string | undefined,
  maxLength: number,
  currentToken?: string
): string | undefined {
  return normalizeAuditText(value, currentToken)?.slice(0, maxLength);
}

function sanitizeIpAddress(value: string | undefined): string | undefined {
  const normalized = sanitizeAuditText(value, MAX_AUDIT_IP_LENGTH);
  if (!normalized) return undefined;

  return isIP(normalized) > 0 ? normalized : undefined;
}

export function sanitizePublicInviteAuditActor(
  actor: { ipAddress?: string; userAgent?: string },
  currentToken: string
): { ipAddress?: string; userAgent?: string } {
  return {
    ipAddress: sanitizeIpAddress(actor.ipAddress),
    userAgent: sanitizeAuditText(actor.userAgent, MAX_AUDIT_USER_AGENT_LENGTH, currentToken),
  };
}

export function sanitizePreRegistrationInviteRevocationReason(
  reason: string | undefined
): string | undefined {
  return normalizeAuditText(reason);
}
