import {
  selectBestCloneSourceContract,
  type CloneSourceCandidate,
} from './contract.service.js';

const candidate = (
  id: string,
  createdAt: string,
  counts: Partial<CloneSourceCandidate['_count']> = {}
): CloneSourceCandidate => ({
  id,
  createdAt: new Date(createdAt),
  _count: {
    trainingParameters: counts.trainingParameters ?? 0,
    exerciseLibrary: counts.exerciseLibrary ?? 0,
    assessmentTypes: counts.assessmentTypes ?? 0,
  },
});

describe('selectBestCloneSourceContract', () => {
  it('ignora o contrato mais antigo quando ele nao possui dados clonaveis', () => {
    const selected = selectBestCloneSourceContract([
      candidate('empty-oldest', '2026-01-01T00:00:00.000Z'),
      candidate('with-library', '2026-02-01T00:00:00.000Z', { exerciseLibrary: 120 }),
    ]);

    expect(selected?.id).toBe('with-library');
  });

  it('prioriza uma origem com biblioteca de exercicios quando houver uma disponivel', () => {
    const selected = selectBestCloneSourceContract([
      candidate('parameters-only', '2026-01-01T00:00:00.000Z', { trainingParameters: 200 }),
      candidate('with-library', '2026-02-01T00:00:00.000Z', { exerciseLibrary: 10 }),
    ]);

    expect(selected?.id).toBe('with-library');
  });

  it('entre origens com exercicios prefere a que cobre mais categorias clonaveis', () => {
    const selected = selectBestCloneSourceContract([
      candidate('exercise-only', '2026-01-01T00:00:00.000Z', { exerciseLibrary: 500 }),
      candidate('complete', '2026-02-01T00:00:00.000Z', {
        trainingParameters: 26,
        exerciseLibrary: 80,
        assessmentTypes: 4,
      }),
    ]);

    expect(selected?.id).toBe('complete');
  });

  it('retorna null quando nenhum contrato possui dados clonaveis', () => {
    const selected = selectBestCloneSourceContract([
      candidate('empty-a', '2026-01-01T00:00:00.000Z'),
      candidate('empty-b', '2026-02-01T00:00:00.000Z'),
    ]);

    expect(selected).toBeNull();
  });
});
