import type { RequestHandler } from 'express';

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);
const ALLOWED_DOMAIN_CODES = new Set([
  'INVALID_INPUT',
  'NOT_FOUND',
  'FORBIDDEN',
  'CONCURRENT_MODIFICATION',
  'PRECONDITION_FAILED',
  'INVALID_INVITE',
  'ACTIVE_INVITE_EXISTS',
  'ACCOUNT_EXISTS',
  'ACCOUNT_INCOMPATIBLE',
  'ACCOUNT_ALREADY_LINKED',
  'ACTIVE_STUDENT',
  'DUPLICATE_REVIEW_REQUIRED',
  'BLOCKING_DUPLICATE',
  'REVIEW_STALE',
  'MISSING_REQUIRED_FIELDS',
  'CONSENT_REQUIRED',
  'CONSENT_VERSION_MISMATCH',
  'BASIC_PRE_REGISTRATION_REQUIRED',
  'INCOMPLETE_RESPONSES',
  'HEALTH_INTAKE_COMPLETED',
  'PRE_REGISTRATION_COMPLETED',
  'PRE_REGISTRATION_DISABLED',
  'PRE_REGISTRATION_REQUEST_REJECTED',
  'PRE_REGISTRATION_INTERNAL_ERROR',
  'RATE_LIMITED',
]);

type PreRegistrationRolloutEnv = {
  NODE_ENV?: string;
  PRE_REGISTRATION_ENABLED?: string;
};

type PreRegistrationTelemetryEnv = {
  PRE_REGISTRATION_TELEMETRY_ENABLED?: string;
};

export type PreRegistrationHttpArea =
  | 'public-invite'
  | 'authenticated-onboarding'
  | 'administrative-management'
  | 'administrative-invite';

export interface PreRegistrationHttpMetric {
  event: 'pre_registration_http';
  area: PreRegistrationHttpArea;
  method: string;
  statusCode: number;
  durationMs: number;
  outcome: 'success' | 'client_error' | 'server_error';
  domainCode?: string;
}

function parseBooleanFlag(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (ENABLED_VALUES.has(normalized)) return true;
  if (DISABLED_VALUES.has(normalized)) return false;
  return undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function extractPreRegistrationDomainCode(body: unknown): string | undefined {
  const payload = objectRecord(body);
  const details = objectRecord(payload?.details);
  const candidates = [payload?.code, details?.code, payload?.error];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim();
    if (ALLOWED_DOMAIN_CODES.has(normalized)) return normalized;
  }
  return undefined;
}

/**
 * Production is fail-safe: the feature must be enabled explicitly. Development
 * and test keep the current flow available unless it is disabled explicitly.
 */
export function isPreRegistrationEnabled(
  env: PreRegistrationRolloutEnv = process.env
): boolean {
  const configured = parseBooleanFlag(env.PRE_REGISTRATION_ENABLED);
  if (configured !== undefined) return configured;
  return env.NODE_ENV !== 'production';
}

export function isPreRegistrationTelemetryEnabled(
  env: PreRegistrationTelemetryEnv = process.env
): boolean {
  const configured = parseBooleanFlag(env.PRE_REGISTRATION_TELEMETRY_ENABLED);
  return configured ?? true;
}

export function buildPreRegistrationHttpMetric(input: {
  area: PreRegistrationHttpArea;
  method: string;
  statusCode: number;
  durationMs: number;
  domainCode?: string;
}): PreRegistrationHttpMetric {
  const statusCode = Number.isFinite(input.statusCode) ? Math.trunc(input.statusCode) : 500;
  const durationMs = Number.isFinite(input.durationMs)
    ? Math.max(0, Math.round(input.durationMs))
    : 0;
  const domainCode =
    typeof input.domainCode === 'string' && ALLOWED_DOMAIN_CODES.has(input.domainCode)
      ? input.domainCode
      : undefined;

  return {
    event: 'pre_registration_http',
    area: input.area,
    method: input.method.toUpperCase(),
    statusCode,
    durationMs,
    outcome:
      statusCode >= 500 ? 'server_error' : statusCode >= 400 ? 'client_error' : 'success',
    ...(domainCode ? { domainCode } : {}),
  };
}

export function createPreRegistrationHttpObservability(
  area: PreRegistrationHttpArea,
  env: PreRegistrationTelemetryEnv = process.env
): RequestHandler {
  return (req, res, next) => {
    if (!isPreRegistrationTelemetryEnabled(env)) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();
    let domainCode: string | undefined;
    const originalJson = res.json;
    res.json = ((body: unknown) => {
      domainCode = extractPreRegistrationDomainCode(body);
      return originalJson.call(res, body);
    }) as typeof res.json;

    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const metric = buildPreRegistrationHttpMetric({
        area,
        method: req.method,
        statusCode: res.statusCode,
        durationMs,
        domainCode,
      });

      // Deliberately exclude path, query string, headers, body, user and tenant.
      // Only a stable allowlisted domain code may be added to the aggregate metric.
      console.info(JSON.stringify(metric));
    });

    next();
  };
}

export function createPreRegistrationRolloutGate(
  env: PreRegistrationRolloutEnv = process.env
): RequestHandler {
  return (_req, res, next) => {
    if (isPreRegistrationEnabled(env)) {
      next();
      return;
    }

    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(503).json({
      error: 'PRE_REGISTRATION_DISABLED',
      message:
        'O pré-cadastro está temporariamente indisponível. Entre em contato com a equipe da academia.',
    });
  };
}
