import type { CorsOptions } from 'cors';

interface ApiCorsConfig {
  allowedOrigins: string[];
  allowedVercelPreviewProjects: string[];
}

const CORS_REJECTED_MESSAGE = 'CORS origin not allowed';

function isAllowedVercelPreviewOrigin(origin: string, allowedProjects: Set<string>) {
  let hostname: string;

  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  if (!hostname.endsWith('.vercel.app')) {
    return false;
  }

  return Array.from(allowedProjects).some(
    (project) => project && hostname.startsWith(`${project}-`)
  );
}

/**
 * Cria a política CORS da API sem incorporar a origem recebida em erros.
 * O preflight continua até os handlers de domínio para que namespaces
 * sensíveis possam aplicar headers, rate limit e resposta segura próprios.
 */
export function createApiCorsOptions(config: ApiCorsConfig): CorsOptions {
  const allowedProjects = new Set(config.allowedVercelPreviewProjects);

  return {
    origin: (origin, callback) => {
      if (
        !origin ||
        config.allowedOrigins.includes(origin) ||
        isAllowedVercelPreviewOrigin(origin, allowedProjects)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error(CORS_REJECTED_MESSAGE));
    },
    credentials: true,
    preflightContinue: true,
  };
}
