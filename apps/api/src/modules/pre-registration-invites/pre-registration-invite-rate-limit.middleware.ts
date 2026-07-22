import type { NextFunction, Request, Response } from 'express';

// Rate limit dedicado para a resolução pública de token de pré-cadastro
// (issue #269). Implementação em memória, por processo: suficiente para o
// requisito funcional de limitar tentativas de enumeração/força bruta em um
// único endpoint público de baixo tráfego; caso o serviço passe a rodar em
// múltiplas réplicas, este contador deve migrar para um armazenamento
// compartilhado (ex.: Redis) sem mudar o contrato do middleware.

interface WindowState {
  count: number;
  windowStartedAt: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 20;

export function createPreRegistrationInviteRateLimiter(
  options: { windowMs?: number; maxRequests?: number } = {}
) {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const hits = new Map<string, WindowState>();

  return function preRegistrationInviteRateLimit(req: Request, res: Response, next: NextFunction) {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const current = hits.get(key);

    if (!current || now - current.windowStartedAt >= windowMs) {
      hits.set(key, { count: 1, windowStartedAt: now });
      next();
      return;
    }

    current.count += 1;
    if (current.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((windowMs - (now - current.windowStartedAt)) / 1000));
      res.status(429).json({
        success: false,
        error: 'Muitas tentativas. Tente novamente em instantes.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

export const preRegistrationInviteRateLimit = createPreRegistrationInviteRateLimiter();
