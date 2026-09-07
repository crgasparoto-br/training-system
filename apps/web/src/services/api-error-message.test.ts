import type { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { responseErrorMessage } from './api';

describe('responseErrorMessage', () => {
  it('prioriza a mensagem de negócio retornada no campo error', () => {
    const error = {
      response: {
        data: { error: 'Contrato personal não permite cadastrar professores' },
      },
    } as AxiosError;

    expect(responseErrorMessage(error)).toBe(
      'Contrato personal não permite cadastrar professores'
    );
  });

  it('aceita o campo message quando error não estiver presente', () => {
    const error = {
      response: {
        data: { message: 'E-mail já está registrado' },
      },
    } as AxiosError;

    expect(responseErrorMessage(error)).toBe('E-mail já está registrado');
  });

  it('ignora payloads sem mensagem textual', () => {
    const error = {
      response: {
        data: { error: { code: 'INVALID' } },
      },
    } as AxiosError;

    expect(responseErrorMessage(error)).toBeNull();
  });
});
