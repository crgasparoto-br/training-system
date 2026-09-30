import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('./api', () => ({
  default: { get: mocks.get },
  api: { get: mocks.get },
}));

import { studentWorkoutService } from './student-workout.service';

describe('studentWorkoutService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ data: { data: [] } });
  });

  it('usa o namespace student/me e preserva x-contract-id na listagem', async () => {
    await studentWorkoutService.list('contract-1');

    expect(mocks.get).toHaveBeenCalledWith('/student/me/workouts', {
      headers: { 'x-contract-id': 'contract-1' },
    });
  });

  it('preserva o contexto contratual ao abrir o detalhe', async () => {
    mocks.get.mockResolvedValue({ data: { data: { id: 'template-1' } } });

    await studentWorkoutService.getDetail('template-1', 'contract-1');

    expect(mocks.get).toHaveBeenCalledWith('/student/me/workouts/template-1', {
      headers: { 'x-contract-id': 'contract-1' },
    });
  });
});
