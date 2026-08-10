import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

type PublicErrorDescriptor = {
  code: string;
  message: string;
  correlationId?: string;
};

function describePublicError(statusCode: number): PublicErrorDescriptor {
  if (statusCode === 401) {
    return {
      code: 'ADIPOMETRY_AUTHENTICATION_REQUIRED',
      message: 'Autenticação necessária para acessar a adipometria.',
    };
  }
  if (statusCode === 403) {
    return {
      code: 'ADIPOMETRY_ACCESS_DENIED',
      message: 'Você não possui acesso a este recurso de adipometria.',
    };
  }
  if (statusCode === 404) {
    return {
      code: 'ADIPOMETRY_RESOURCE_NOT_FOUND',
      message: 'Avaliação não encontrada.',
    };
  }
  if (statusCode === 409) {
    return {
      code: 'ADIPOMETRY_CONFLICT',
      message: 'A operação conflita com o estado atual da adipometria.',
    };
  }
  if (statusCode >= 500) {
    return {
      code: 'ADIPOMETRY_UNEXPECTED_ERROR',
      message: 'Não foi possível processar a adipometria.',
      correlationId: randomUUID(),
    };
  }
  return {
    code: 'ADIPOMETRY_INVALID_INPUT',
    message: 'Dados inválidos.',
  };
}

export const adipometryPublicBoundaryMiddleware: RequestHandler = (_req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = ((body: unknown) => {
    if (res.statusCode < 400) return originalJson(body);

    const record = body && typeof body === 'object'
      ? body as Record<string, any>
      : {};
    if (record.details?.code) return originalJson(body);

    const descriptor = describePublicError(res.statusCode);
    const details: Record<string, string> = { code: descriptor.code };
    if (descriptor.correlationId) details.correlationId = descriptor.correlationId;

    // Preserve only the established, non-sensitive 404 alias used by existing
    // consumers. A missing direct professional membership is intentionally
    // indistinguishable from an unavailable Professor at this public boundary.
    const compatibleLegacyError = res.statusCode === 404
      && [
        'Professor não encontrado',
        'Vínculo profissional não encontrado',
      ].includes(record.error)
      ? 'Professor não encontrado'
      : undefined;

    return originalJson({
      success: false,
      message: descriptor.message,
      details,
      ...(compatibleLegacyError ? { error: compatibleLegacyError } : {}),
    });
  }) as typeof res.json;

  next();
};
