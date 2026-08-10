import type { NextFunction, Request, Response } from 'express';

// Rate limit dedicado para a resolução pública de token de pré-cadastro
// (issue #269). A implementação é local ao processo, mas mantém memória
// limitada e remove janelas expiradas para não crescer indefinidamente.
//
// LIMITAÇÃO CONHECIDA: em uma implantação com múltiplas réplicas da API,
// cada réplica aplica seu próprio limite. Quando houver escala horizontal,
// o armazenamento deve migrar para um contador compartilhado (ex.: Redis)
// sem alterar o contrato HTTP deste middleware.

interface WindowState {
  count: number;
  windowStartedAt: number;
}

interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  maxTrackedKeys?: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 20;
const DEFAULT_MAX_TRACKED_KEYS = 10_000;
const CLEANUP_INTERVAL_REQUESTS = 100;

function sendRateLimitResponse(res: Response, retryAfterSeconds: number) {
  res.setHeader('Retry-After', Math.max(1, retryAfterSeconds));
  res.status(429).json({
    success: false,
    error: 'Muitas tentativas. Tente novamente em instantes.',
    timestamp: new Date().toISOString(),
  });
}

export function createPreRegistrationInviteRateLimiter(options: RateLimiterOptions = {}) {
  const windowMs = Math.max(1, options.windowMs ?? DEFAULT_WINDOW_MS);
  const maxRequests = Math.max(1, options.maxRequests ?? DEFAULT_MAX_REQUESTS);
  const maxTrackedKeys = Math.max(1, options.maxTrackedKeys ?? DEFAULT_MAX_TRACKED_KEYS);
  const hits = new Map<string, WindowState>();
  let requestsSinceCleanup = 0;

  const pruneExpiredWindows = (now: number) => {
    for (const [key, state] of hits) {
      if (now - state.windowStartedAt >= windowMs) {
        hits.delete(key);
      }
    }
  };

  return function preRegistrationInviteRateLimit(req: Request, res: Response, next: NextFunction) {
    const key = req.ip || 'unknown';
    const now = Date.now();

    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= CLEANUP_INTERVAL_REQUESTS || hits.size >= maxTrackedKeys) {
      pruneExpiredWindows(now);
      requestsSinceCleanup = 0;
    }

    const current = hits.get(key);
    if (!current) {
      // Falha fechada quando o limite de chaves distintas é atingido. Isso
      // impede que IPs rotativos provoquem crescimento ilimitado do processo.
      if (hits.size >= maxTrackedKeys) {
        sendRateLimitResponse(res, Math.ceil(windowMs / 1000));
        return;
      }

      hits.set(key, { count: 1, windowStartedAt: now });
      next();
      return;
    }

    if (now - current.windowStartedAt >= windowMs) {
      hits.set(key, { count: 1, windowStartedAt: now });
      next();
      return;
    }

    current.count += 1;
    if (current.count > maxRequests) {
      sendRateLimitResponse(
        res,
        Math.ceil((windowMs - (now - current.windowStartedAt)) / 1000)
      );
      return;
    }

    next();
  };
}

export const preRegistrationInviteRateLimit = createPreRegistrationInviteRateLimiter();
