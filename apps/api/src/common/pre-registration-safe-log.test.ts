import { buildSafePreRegistrationErrorLog } from './pre-registration-safe-log.js';

describe('pre-registration safe error logging', () => {
  it('keeps only correlation id, error name and a bounded technical code', () => {
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
});
