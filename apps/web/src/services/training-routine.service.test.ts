import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));

vi.mock('./api', () => ({
  default: { get: mocks.get, post: mocks.post, put: mocks.put },
  api: { get: mocks.get, post: mocks.post, put: mocks.put },
}));

import { getTrainingRoutineErrorKind, shiftDateOnly, trainingRoutineService } from './training-routine.service';

describe('trainingRoutineService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const response = { data: { data: { alunoId: 'aluno-1' } } };
    mocks.get.mockResolvedValue(response);
    mocks.post.mockResolvedValue(response);
    mocks.put.mockResolvedValue(response);
  });

  it('usa student/me e preserva x-contract-id sem enviar alunoId', async () => {
    await trainingRoutineService.getForStudent({ date: '2026-10-01', contractId: 'contract-1' });

    expect(mocks.get).toHaveBeenCalledWith('/student/me/training-routine', {
      params: { date: '2026-10-01' },
      headers: { 'x-contract-id': 'contract-1' },
    });
  });

  it('consulta a rotina do aluno selecionado na Central', async () => {
    await trainingRoutineService.getForAluno('aluno-1', { date: '2026-10-05' });
    expect(mocks.get).toHaveBeenCalledWith('/alunos/aluno-1/training-routine', { params: { date: '2026-10-05' } });
  });

  it('expõe leitura e mutações canônicas de execução', async () => {
    expect(Object.keys(trainingRoutineService).sort()).toEqual([
      'getForAluno',
      'getForStudent',
      'saveExecutionValuesForStudent',
      'transitionForStudent',
    ]);

    await trainingRoutineService.transitionForStudent(
      'day-1',
      {
        operationKey: 'operation-123',
        expectedVersion: 0,
        targetStatus: 'in_progress',
      },
      { contractId: 'contract-1' }
    );

    expect(mocks.post).toHaveBeenCalledWith(
      '/student/me/training-sessions/day-1/execution/transition',
      {
        operationKey: 'operation-123',
        expectedVersion: 0,
        targetStatus: 'in_progress',
      },
      { headers: { 'x-contract-id': 'contract-1' } }
    );

    await trainingRoutineService.saveExecutionValuesForStudent(
      'day-1',
      {
        operationKey: 'operation-456',
        expectedVersion: 1,
        sessionValues: { distanceKm: 5 },
      },
      { contractId: 'contract-1' }
    );

    expect(mocks.put).toHaveBeenCalledWith(
      '/student/me/training-sessions/day-1/execution/values',
      {
        operationKey: 'operation-456',
        expectedVersion: 1,
        sessionValues: { distanceKm: 5 },
      },
      { headers: { 'x-contract-id': 'contract-1' } }
    );
  });

  it('classifica permissão, contexto contratual e falha temporária', () => {
    expect(getTrainingRoutineErrorKind({ response: { status: 403 } })).toBe('access-denied');
    expect(getTrainingRoutineErrorKind({ response: { status: 404 } })).toBe('access-denied');
    expect(getTrainingRoutineErrorKind({ response: { status: 409 } })).toBe('contract-required');
    expect(getTrainingRoutineErrorKind({ response: { status: 503 } })).toBe('error');
    expect(getTrainingRoutineErrorKind(new Error('Network Error'))).toBe('error');
  });

  it('desloca datas civis sem depender do fuso do navegador', () => {
    expect(shiftDateOnly('2026-09-28', 7)).toBe('2026-10-05');
    expect(shiftDateOnly('2026-03-02', -7)).toBe('2026-02-23');
  });
});
