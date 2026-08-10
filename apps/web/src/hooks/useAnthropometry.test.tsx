import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listActiveSegments: vi.fn(),
  listAssessments: vi.fn(),
}));

vi.mock('../services/anthropometry.service', () => ({
  anthropometryService: {
    listActiveSegments: mocks.listActiveSegments,
    listAssessments: mocks.listAssessments,
  },
}));

import { useAnthropometry } from './useAnthropometry';

describe('useAnthropometry requested assessment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(
      {},
      '',
      '/protocolo-avaliacao-fisica/antropometria?alunoId=aluno-1&assessmentId=antr-origin'
    );
    mocks.listActiveSegments.mockResolvedValue([]);
    mocks.listAssessments.mockResolvedValue([
      { id: 'antr-latest' },
      { id: 'antr-origin' },
    ]);
  });

  it('abre a avaliação de origem solicitada em vez de selecionar silenciosamente a mais recente', async () => {
    const { result } = renderHook(() => useAnthropometry('aluno-1', 'female'));

    await waitFor(() => {
      expect(result.current.selectedAssessmentId).toBe('antr-origin');
    });
    expect(result.current.selectedAssessment?.id).toBe('antr-origin');
  });
});
