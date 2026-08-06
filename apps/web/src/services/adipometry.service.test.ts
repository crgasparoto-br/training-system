import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adipometryService } from './adipometry.service';
import api from './api';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const getMock = vi.mocked(api.get);

function comparisonResponse() {
  return {
    data: {
      data: {
        previous: null,
        current: { assessment: { id: 'assessment-current' } },
        deltas: {},
      },
    },
  };
}

describe('adipometryService.compare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue(comparisonResponse() as never);
  });

  it('omite assessmentIds para usar a comparação padrão da API', async () => {
    await adipometryService.compare('aluno-1');

    expect(getMock).toHaveBeenCalledWith('/adipometry/alunos/aluno-1/compare');
  });

  it.each([
    [['assessment-1'], 'assessment-1'],
    [['assessment-1', 'assessment-2'], 'assessment-1,assessment-2'],
  ])('envia uma ou duas avaliações como parâmetro CSV', async (assessmentIds, expected) => {
    await adipometryService.compare('aluno-1', assessmentIds);

    expect(getMock).toHaveBeenCalledWith('/adipometry/alunos/aluno-1/compare', {
      params: { assessmentIds: expected },
    });
  });

  it.each([[], ['assessment-1', 'assessment-2', 'assessment-3']])(
    'rejeita cardinalidade inválida antes da chamada HTTP',
    async (assessmentIds) => {
      await expect(adipometryService.compare('aluno-1', assessmentIds)).rejects.toThrow(
        'Informe uma ou duas avaliações para comparação.'
      );
      expect(getMock).not.toHaveBeenCalled();
    }
  );
});
