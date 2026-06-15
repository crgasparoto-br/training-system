const JWT_PLACEHOLDER_VALUES = new Set([
  'dev-secret',
  'your-super-secret-jwt-key-change-in-production',
]);

const LOCAL_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8081',
  'exp://localhost:8081',
];

type RuntimeEnv = Partial<
  Pick<
    NodeJS.ProcessEnv,
    'NODE_ENV' | 'JWT_SECRET' | 'CORS_ORIGINS' | 'FRONTEND_URL' | 'MOBILE_URL' | 'CORS_VERCEL_PREVIEW_PROJECTS'
  >
>;

export function isProductionEnvironment(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv === 'production';
}

export function parseCorsOrigins(value?: string) {
  return (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isPlaceholderJwtSecret(value?: string) {
  const normalized = value?.trim();
  return !normalized || JWT_PLACEHOLDER_VALUES.has(normalized);
}

export function getJwtSecret(env: RuntimeEnv = process.env) {
  const secret = env.JWT_SECRET?.trim();

  if (isProductionEnvironment(env.NODE_ENV)) {
    if (isPlaceholderJwtSecret(secret)) {
      throw new Error('JWT_SECRET real e obrigatorio em producao');
    }

    return secret as string;
  }

  return secret || 'dev-secret';
}

export function resolveCorsConfig(env: RuntimeEnv = process.env) {
  const configuredOrigins = parseCorsOrigins(env.CORS_ORIGINS);
  const production = isProductionEnvironment(env.NODE_ENV);

  if (production && configuredOrigins.length === 0) {
    throw new Error('CORS_ORIGINS deve ser configurado em producao');
  }

  const allowedOrigins = Array.from(
    new Set([
      ...configuredOrigins,
      env.FRONTEND_URL,
      env.MOBILE_URL,
      ...(production ? [] : LOCAL_CORS_ORIGINS),
    ].filter(Boolean) as string[])
  );

  return {
    allowedOrigins,
    allowedVercelPreviewProjects: production
      ? parseCorsOrigins(env.CORS_VERCEL_PREVIEW_PROJECTS)
      : ['training-system-web', ...parseCorsOrigins(env.CORS_VERCEL_PREVIEW_PROJECTS)],
  };
}
