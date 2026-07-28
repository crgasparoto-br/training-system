import type { RequestHandler } from 'express';

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);

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
}

function parseBooleanFlag(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (ENABLED_VALUES.has(normalized)) return true;
  if (DISABLED_VALUES.has(normalized)) return false;
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
}): PreRegistrationHttpMetric {
  const statusCode = Number.isFinite(input.statusCode) ? Math.trunc(input.statusCode) : 500;
  const durationMs = Number.isFinite(input.durationMs)
    ? Math.max(0, Math.round(input.durationMs))
    : 0;

  return {
    event: 'pre_registration_http',
    area: input.area,
    method: input.method.toUpperCase(),
    statusCode,
    durationMs,
    outcome:
      statusCode >= 500 ? 'server_error' : statusCode >= 400 ? 'client_error' : 'success',
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
    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const metric = buildPreRegistrationHttpMetric({
        area,
        method: req.method,
        statusCode: res.statusCode,
        durationMs,
      });

      // Deliberately exclude path, query string, headers, body, user and tenant.
      // Runtime log collectors may aggregate this structured event safely.
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
