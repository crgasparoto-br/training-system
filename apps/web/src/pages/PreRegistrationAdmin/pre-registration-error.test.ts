import { describe, expect, it } from 'vitest';
import { preRegistrationErrorMessage } from './pre-registration-error';

describe('preRegistrationErrorMessage', () => {
  it('does not expose the internal technical code to the user', () => {
    const message = preRegistrationErrorMessage(
      {
        response: {
          data: {
            error: 'PRE_REGISTRATION_INTERNAL_ERROR',
            message: 'Não foi possível continuar.',
            correlationId: 'correlation-123',
          },
        },
      },
      'Não foi possível criar o lead.'
    );

    expect(message).not.toContain('PRE_REGISTRATION_INTERNAL_ERROR');
    expect(message).toContain('Não foi possível criar o lead.');
    expect(message).toContain('correlation-123');
  });

  it('preserves controlled domain messages', () => {
    expect(
      preRegistrationErrorMessage(
        { response: { data: { error: 'Informe um CPF válido.', code: 'INVALID_INPUT' } } },
        'Falha ao salvar.'
      )
    ).toBe('Informe um CPF válido.');
  });
});
