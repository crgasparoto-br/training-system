import type { RequestHandler } from 'express';
import { createPreRegistrationSafeBoundary as createCorePreRegistrationSafeBoundary } from './pre-registration-safe-log.core.js';

export * from './pre-registration-safe-log.core.js';

const DISABLED_MESSAGE =
  'O pré-cadastro está temporariamente indisponível. Entre em contato com a equipe da academia.';

function isStaticDisabledRolloutResponse(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const payload = body as Record<string, unknown>;
  const keys = Object.keys(payload).sort();
  return (
    keys.length === 2 &&
    keys[0] === 'error' &&
    keys[1] === 'message' &&
    payload.error === 'PRE_REGISTRATION_DISABLED' &&
    payload.message === DISABLED_MESSAGE
  );
}

/**
 * The core boundary sanitizes every 5xx response. The rollout-disabled response
 * is the only expected server-side status and contains a fixed, request-agnostic
 * envelope, so it may pass unchanged. Any extra field or different payload is
 * still delegated to the core sanitizer.
 */
export function createPreRegistrationSafeBoundary(): RequestHandler {
  const coreBoundary = createCorePreRegistrationSafeBoundary();
  return (req, res, next) => {
    const originalJson = res.json;
    coreBoundary(req, res, () => {
      const sanitizedJson = res.json;
      res.json = ((body: unknown) => {
        if (res.statusCode === 503 && isStaticDisabledRolloutResponse(body)) {
          return originalJson.call(res, body);
        }
        return sanitizedJson.call(res, body);
      }) as typeof res.json;
      next();
    });
  };
}
