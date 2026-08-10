import {
  buildPreRegistrationHttpMetric,
  createPreRegistrationRolloutGate,
  extractPreRegistrationDomainCode,
  isPreRegistrationEnabled,
  isPreRegistrationTelemetryEnabled,
} from './pre-registration-rollout.js';

describe('pre-registration rollout', () => {
  it('fails closed in production when the flag is absent or invalid', () => {
    expect(isPreRegistrationEnabled({ NODE_ENV: 'production', PRE_REGISTRATION_ENABLED: undefined })).toBe(false);
    expect(isPreRegistrationEnabled({ NODE_ENV: 'production', PRE_REGISTRATION_ENABLED: 'maybe' })).toBe(false);
  });

  it('keeps development and test available unless explicitly disabled', () => {
    expect(isPreRegistrationEnabled({ NODE_ENV: 'development', PRE_REGISTRATION_ENABLED: undefined })).toBe(true);
    expect(isPreRegistrationEnabled({ NODE_ENV: 'test', PRE_REGISTRATION_ENABLED: undefined })).toBe(true);
    expect(isPreRegistrationEnabled({ NODE_ENV: 'test', PRE_REGISTRATION_ENABLED: 'false' })).toBe(false);
  });

  it('accepts explicit rollout values', () => {
    expect(isPreRegistrationEnabled({ NODE_ENV: 'production', PRE_REGISTRATION_ENABLED: 'true' })).toBe(true);
    expect(isPreRegistrationEnabled({ NODE_ENV: 'production', PRE_REGISTRATION_ENABLED: '1' })).toBe(true);
    expect(isPreRegistrationEnabled({ NODE_ENV: 'development', PRE_REGISTRATION_ENABLED: 'off' })).toBe(false);
  });

  it('returns an operational response without reflecting request data when disabled', () => {
    const next = jest.fn();
    const setHeader = jest.fn();
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const gate = createPreRegistrationRolloutGate({
      NODE_ENV: 'production',
      PRE_REGISTRATION_ENABLED: 'false',
    });

    gate(
      { originalUrl: '/api/v1/pre-cadastro/secret-token?cpf=123' } as never,
      { setHeader, status } as never,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
    expect(setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
    expect(json).toHaveBeenCalledWith({
      error: 'PRE_REGISTRATION_DISABLED',
      message:
        'O pré-cadastro está temporariamente indisponível. Entre em contato com a equipe da academia.',
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('secret-token');
    expect(JSON.stringify(json.mock.calls)).not.toContain('123');
  });

  it('continues the request when enabled', () => {
    const next = jest.fn();
    const gate = createPreRegistrationRolloutGate({
      NODE_ENV: 'production',
      PRE_REGISTRATION_ENABLED: 'true',
    });

    gate({} as never, {} as never, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('pre-registration technical telemetry', () => {
  it('is enabled by default and can be disabled explicitly', () => {
    expect(isPreRegistrationTelemetryEnabled({ PRE_REGISTRATION_TELEMETRY_ENABLED: undefined })).toBe(true);
    expect(isPreRegistrationTelemetryEnabled({ PRE_REGISTRATION_TELEMETRY_ENABLED: 'false' })).toBe(false);
  });

  it('contains aggregate HTTP dimensions and an optional allowlisted domain code', () => {
    const metric = buildPreRegistrationHttpMetric({
      area: 'public-invite',
      method: 'get',
      statusCode: 404,
      durationMs: 12.6,
      domainCode: 'INVALID_INVITE',
    });

    expect(metric).toEqual({
      event: 'pre_registration_http',
      area: 'public-invite',
      method: 'GET',
      statusCode: 404,
      durationMs: 13,
      outcome: 'client_error',
      domainCode: 'INVALID_INVITE',
    });
    expect(Object.keys(metric).sort()).toEqual(
      ['area', 'domainCode', 'durationMs', 'event', 'method', 'outcome', 'statusCode'].sort()
    );
    expect(JSON.stringify(metric)).not.toContain('cpf');
    expect(JSON.stringify(metric)).not.toContain('email');
    expect(JSON.stringify(metric)).not.toContain('contractId');
  });

  it('extracts only stable allowlisted codes and rejects token-shaped values', () => {
    expect(extractPreRegistrationDomainCode({ code: 'CONCURRENT_MODIFICATION' })).toBe(
      'CONCURRENT_MODIFICATION'
    );
    expect(
      extractPreRegistrationDomainCode({ details: { code: 'DUPLICATE_REVIEW_REQUIRED' } })
    ).toBe('DUPLICATE_REVIEW_REQUIRED');
    expect(extractPreRegistrationDomainCode({ code: 'secret-token' })).toBeUndefined();
    expect(
      buildPreRegistrationHttpMetric({
        area: 'public-invite',
        method: 'get',
        statusCode: 400,
        durationMs: 1,
        domainCode: 'secret-token',
      })
    ).not.toHaveProperty('domainCode');
  });
});
