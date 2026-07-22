import type { CorsOptions } from 'cors';

interface ApiCorsConfig {
  allowedOrigins: string[];
  allowedVercelPreviewProjects: string[];
}

interface ApiCorsOptionsOverrides {
  preflightContinue?: boolean;
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
    (project) => project.length > 0 && hostname.startsWith(`${project}-`)
  );
}

/**
 * Cria a política CORS da API sem incorporar a origem recebida em erros.
 * Namespaces sensíveis podem optar por continuar o preflight até seus próprios
 * handlers sem alterar o comportamento padrão das demais rotas.
 */
export function createApiCorsOptions(
  config: ApiCorsConfig,
  overrides: ApiCorsOptionsOverrides = {}
): CorsOptions {
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
    preflightContinue: overrides.preflightContinue ?? false,
  };
}
