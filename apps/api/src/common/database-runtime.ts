const DEFAULT_PRODUCTION_CONNECTION_LIMIT = 1;
const DEFAULT_POOL_TIMEOUT_SECONDS = 15;

export const DATABASE_CONNECTION_UNAVAILABLE_MESSAGE =
  'O banco de dados está temporariamente sem conexões disponíveis. Tente novamente em instantes.';

function positiveInteger(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isPostgresUrl(url: URL) {
  return url.protocol === 'postgresql:' || url.protocol === 'postgres:';
}

export function applyPrismaRuntimeConnectionSettings(
  env: NodeJS.ProcessEnv = process.env
) {
  const rawDatabaseUrl = env.DATABASE_URL;
  if (!rawDatabaseUrl) return null;

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(rawDatabaseUrl);
  } catch {
    return rawDatabaseUrl;
  }

  if (!isPostgresUrl(databaseUrl)) return rawDatabaseUrl;

  const configuredConnectionLimit = positiveInteger(env.PRISMA_CONNECTION_LIMIT);
  const configuredPoolTimeout = positiveInteger(env.PRISMA_POOL_TIMEOUT_SECONDS);
  const connectionLimit =
    configuredConnectionLimit ??
    (env.NODE_ENV === 'production' ? DEFAULT_PRODUCTION_CONNECTION_LIMIT : null);
  const poolTimeout =
    configuredPoolTimeout ??
    (env.NODE_ENV === 'production' ? DEFAULT_POOL_TIMEOUT_SECONDS : null);

  if (connectionLimit && !databaseUrl.searchParams.has('connection_limit')) {
    databaseUrl.searchParams.set('connection_limit', String(connectionLimit));
  }
  if (poolTimeout && !databaseUrl.searchParams.has('pool_timeout')) {
    databaseUrl.searchParams.set('pool_timeout', String(poolTimeout));
  }

  env.DATABASE_URL = databaseUrl.toString();
  return env.DATABASE_URL;
}

function errorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

export function isDatabaseConnectionUnavailable(error: unknown): boolean {
  const code = errorCode(error);
  if (code === 'P2037' || code === 'P2024' || code === 'P1001' || code === 'P1002') {
    return true;
  }

  const message = errorMessage(error).toLowerCase();
  if (
    message.includes('too many database connections') ||
    message.includes('too many connections') ||
    message.includes('timed out fetching a new connection from the connection pool') ||
    message.includes('connection pool timeout')
  ) {
    return true;
  }

  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return isDatabaseConnectionUnavailable((error as { cause?: unknown }).cause);
  }

  return false;
}
