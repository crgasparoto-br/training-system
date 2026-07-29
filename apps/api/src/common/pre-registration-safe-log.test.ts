import {
  buildSafePreRegistrationErrorLog,
  createPreRegistrationSafeBoundary,
  createPreRegistrationUnexpectedErrorHandler,
  isPreRegistrationRequestPath,
} from './pre-registration-safe-log.js';

describe('pre-registration safe error logging', () => {
  it('keeps only correlation id, error name and an allowlisted technical code', () => {
    const error = Object.assign(
      new Error('CPF 123.456.789-00 token secret-token e-mail pessoa@example.com'),
      {
        code: 'P2002',
        meta: { target: ['cpf'], value: '123.456.789-00' },
      }
    );

    const safe = buildSafePreRegistrationErrorLog('correlation-1', error);

    expect(safe).toEqual({
      correlationId: 'correlation-1',
      errorName: 'Error',
      errorCode: 'P2002',
    });
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain('123.456.789-00');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('pessoa@example.com');
    expect(serialized).not.toContain('meta');
    expect(serialized).not.toContain('stack');
  });

  it('does not serialize arbitrary thrown values', () => {
    expect(
      buildSafePreRegistrationErrorLog('correlation-2', {
        message: 'phone +55 11 99999-9999',
        payload: { clinicalAnswer: 'sim' },
      })
    ).toEqual({
      correlationId: 'correlation-2',
      errorName: 'UnknownError',
    });
  });

  it('rejects free-text names and codes that could contain personal data', () => {
    const safe = buildSafePreRegistrationErrorLog('correlation-3', {
      name: 'CPF 123.456.789-00',
      code: 'pessoa@example.com',
      message: 'secret-token',
    });

    expect(safe).toEqual({
      correlationId: 'correlation-3',
      errorName: 'UnknownError',
    });
    expect(JSON.stringify(safe)).not.toMatch(/123|@|secret-token/);
  });

  it('drops token-shaped identifiers that are not explicitly allowlisted', () => {
    const safe = buildSafePreRegistrationErrorLog('correlation-4', {
      name: 'secret-token',
      code: 'eyJhbGciOiJIUzI1NiJ9',
    });

    expect(safe).toEqual({
      correlationId: 'correlation-4',
      errorName: 'UnknownError',
    });
    expect(JSON.stringify(safe)).not.toContain('secret-token');
    expect(JSON.stringify(safe)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('recognizes every pre-registration HTTP namespace without matching adjacent paths', () => {
    expect(isPreRegistrationRequestPath('/api/v1/pre-cadastro/token')).toBe(true);
    expect(isPreRegistrationRequestPath('/api/v1/pre-registration/processes/1')).toBe(true);
    expect(isPreRegistrationRequestPath('/api/v1/pre-registration-admin/leads')).toBe(true);
    expect(
      isPreRegistrationRequestPath('/api/v1/alunos/aluno-1/pre-registration-invites')
    ).toBe(true);
    expect(isPreRegistrationRequestPath('/api/v1/pre-registration-other')).toBe(false);
    expect(isPreRegistrationRequestPath('/api/v1/alunos/aluno-1')).toBe(false);
  });

  it('replaces a route-local 500 payload before serialization', () => {
    const serialized = jest.fn();
    const response = {
      statusCode: 500,
      json: serialized,
    };
    const boundary = createPreRegistrationSafeBoundary();

    boundary(
      {} as never,
      response as never,
      () => response.json({
        error: 'Falha com CPF 123.456.789-00 e secret-token',
        details: { email: 'pessoa@example.com', clinicalAnswer: 'sim' },
      })
    );

    expect(serialized).toHaveBeenCalledWith({
      error: 'PRE_REGISTRATION_INTERNAL_ERROR',
      message: 'Não foi possível continuar.',
      correlationId: expect.any(String),
    });
    const payload = JSON.stringify(serialized.mock.calls);
    expect(payload).not.toMatch(/123\.456|secret-token|pessoa@example|clinicalAnswer/);
  });

  it('preserves allowlisted domain responses below 500', () => {
    const serialized = jest.fn();
    const response = {
      statusCode: 409,
      json: serialized,
    };
    const boundary = createPreRegistrationSafeBoundary();
    const domainPayload = {
      error: 'CONCURRENT_MODIFICATION',
      details: { currentVersion: 3 },
    };

    boundary({} as never, response as never, () => response.json(domainPayload));

    expect(serialized).toHaveBeenCalledWith(domainPayload);
  });

  it('sanitizes parser and middleware errors before they reach the global handler', () => {
    const handler = createPreRegistrationUnexpectedErrorHandler();
    const next = jest.fn();
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = Object.assign(
      new SyntaxError('Unexpected token near CPF 123.456.789-00 and secret-token'),
      {
        status: 400,
        type: 'entity.parse.failed',
        body: '{"cpf":"123.456.789-00","token":"secret-token"}',
      }
    );

    handler(
      error,
      { originalUrl: '/api/v1/pre-registration/processes/1', path: '' } as never,
      { status } as never,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: 'PRE_REGISTRATION_REQUEST_REJECTED',
      message: 'Não foi possível processar os dados enviados. Revise as informações e tente novamente.',
    });
    const logged = JSON.stringify(consoleError.mock.calls);
    const response = JSON.stringify(json.mock.calls);
    expect(`${logged}${response}`).not.toContain('123.456.789-00');
    expect(`${logged}${response}`).not.toContain('secret-token');
    expect(`${logged}${response}`).not.toContain('body');
    consoleError.mockRestore();
  });

  it('passes non-pre-registration errors to the global handler', () => {
    const handler = createPreRegistrationUnexpectedErrorHandler();
    const next = jest.fn();
    const error = new Error('ordinary route error');

    handler(
      error,
      { originalUrl: '/api/v1/plans', path: '/api/v1/plans' } as never,
      {} as never,
      next
    );

    expect(next).toHaveBeenCalledWith(error);
  });
});
