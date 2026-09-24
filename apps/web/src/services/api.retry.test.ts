import { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyApiFailure,
  requestWithTransientRetry,
  type ApiResilienceEvent,
} from './api';

const withResponse = (status: number) => {
  const error = new AxiosError(`HTTP ${status}`, 'ERR_BAD_RESPONSE');
  Object.defineProperty(error, 'response', { value: { status } });
  return error;
};

describe('resiliência do cliente HTTP', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('repete timeout de forma limitada e conclui quando a API acorda', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new AxiosError('timeout', 'ECONNABORTED'))
      .mockRejectedValueOnce(new AxiosError('network', 'ERR_NETWORK'))
      .mockResolvedValue('aluno carregado');
    const events: ApiResilienceEvent[] = [];

    const resultPromise = requestWithTransientRetry(request, {
      operation: 'aluno.read',
      delayMs: 10,
      onRetry: (event) => events.push({ ...event, phase: 'retry' }),
      onTerminal: (event) => events.push({ ...event, phase: 'terminal' }),
    });

    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toBe('aluno carregado');
    expect(request).toHaveBeenCalledTimes(3);
    expect(events).toEqual([
      { operation: 'aluno.read', phase: 'retry', failureKind: 'timeout', attempt: 1 },
      { operation: 'aluno.read', phase: 'retry', failureKind: 'network', attempt: 2 },
    ]);
  });

  it('não repete respostas HTTP reais e mantém a categoria observável', async () => {
    const request = vi.fn<[], Promise<string>>().mockRejectedValue(withResponse(500));
    const terminal = vi.fn();

    await expect(
      requestWithTransientRetry(request, {
        operation: 'aluno.read',
        onTerminal: terminal,
      })
    ).rejects.toMatchObject({ code: 'ERR_BAD_RESPONSE' });

    expect(request).toHaveBeenCalledTimes(1);
    expect(classifyApiFailure(withResponse(500))).toBe('http');
    expect(terminal).toHaveBeenCalledWith({
      operation: 'aluno.read',
      failureKind: 'http',
      attempt: 1,
      status: 500,
    });
  });
});
