import { getJwtSecret, resolveCorsConfig } from './runtime-config.js';

describe('runtime config hardening', () => {
  it('rejects missing or placeholder JWT_SECRET in production', () => {
    expect(() => getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: undefined })).toThrow(
      'JWT_SECRET real e obrigatorio em producao'
    );
    expect(() => getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'dev-secret' })).toThrow(
      'JWT_SECRET real e obrigatorio em producao'
    );
    expect(() =>
      getJwtSecret({
        NODE_ENV: 'production',
        JWT_SECRET: 'your-super-secret-jwt-key-change-in-production',
      })
    ).toThrow('JWT_SECRET real e obrigatorio em producao');
  });

  it('keeps dev fallback only outside production', () => {
    expect(getJwtSecret({ NODE_ENV: 'development', JWT_SECRET: undefined })).toBe('dev-secret');
    expect(getJwtSecret({ NODE_ENV: 'test', JWT_SECRET: 'test-secret' })).toBe('test-secret');
  });

  it('does not include localhost origins by default in production', () => {
    const config = resolveCorsConfig({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.com',
      FRONTEND_URL: 'https://app.example.com',
      MOBILE_URL: undefined,
    });

    expect(config.allowedOrigins).toEqual(['https://app.example.com']);
    expect(config.allowedOrigins).not.toContain('http://localhost:5173');
  });

  it('requires explicit CORS_ORIGINS in production', () => {
    expect(() =>
      resolveCorsConfig({
        NODE_ENV: 'production',
        CORS_ORIGINS: '',
        FRONTEND_URL: 'https://app.example.com',
      })
    ).toThrow('CORS_ORIGINS deve ser configurado em producao');
  });
});
