import {
  applyPrismaRuntimeConnectionSettings,
  isDatabaseConnectionUnavailable,
} from './database-runtime.js';

describe('database runtime settings', () => {
  it('adds a conservative Prisma pool budget in production', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:password@database.example.com:5432/app?schema=public',
    };

    const result = applyPrismaRuntimeConnectionSettings(env);
    const url = new URL(result!);

    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.searchParams.get('connection_limit')).toBe('1');
    expect(url.searchParams.get('pool_timeout')).toBe('15');
    expect(env.DATABASE_URL).toBe(result);
  });

  it('respects explicit limits and existing URL parameters', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      PRISMA_CONNECTION_LIMIT: '4',
      PRISMA_POOL_TIMEOUT_SECONDS: '20',
      DATABASE_URL:
        'postgresql://user:password@database.example.com:5432/app?connection_limit=2&pool_timeout=8',
    };

    const url = new URL(applyPrismaRuntimeConnectionSettings(env)!);

    expect(url.searchParams.get('connection_limit')).toBe('2');
    expect(url.searchParams.get('pool_timeout')).toBe('8');
  });

  it('uses configured limits when the URL does not define them', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      PRISMA_CONNECTION_LIMIT: '3',
      PRISMA_POOL_TIMEOUT_SECONDS: '25',
      DATABASE_URL: 'postgresql://user:password@database.example.com:5432/app',
    };

    const url = new URL(applyPrismaRuntimeConnectionSettings(env)!);

    expect(url.searchParams.get('connection_limit')).toBe('3');
    expect(url.searchParams.get('pool_timeout')).toBe('25');
  });

  it('does not add production defaults in development', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://user:password@localhost:5432/app',
    };

    const url = new URL(applyPrismaRuntimeConnectionSettings(env)!);

    expect(url.searchParams.has('connection_limit')).toBe(false);
    expect(url.searchParams.has('pool_timeout')).toBe(false);
  });
});

describe('database connection error detection', () => {
  it.each(['P2037', 'P2024', 'P1001', 'P1002'])(
    'recognizes Prisma connection error %s',
    (code) => {
      expect(isDatabaseConnectionUnavailable({ code })).toBe(true);
    }
  );

  it('recognizes the PostgreSQL connection limit message without exposing it', () => {
    expect(
      isDatabaseConnectionUnavailable(
        new Error('FATAL: too many connections for role "prisma_migration"')
      )
    ).toBe(true);
  });

  it('recognizes a nested connection failure', () => {
    expect(
      isDatabaseConnectionUnavailable({
        cause: new Error('Timed out fetching a new connection from the connection pool'),
      })
    ).toBe(true);
  });

  it('does not classify business errors as connection failures', () => {
    expect(isDatabaseConnectionUnavailable(new Error('Serviço não encontrado'))).toBe(false);
  });
});
