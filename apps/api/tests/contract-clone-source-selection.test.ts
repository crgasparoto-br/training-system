import {
  selectBestCloneSourceCandidate,
  selectCloneSourceCandidate,
} from '../src/modules/contracts/contract-clone-source-selection';

const candidate = (
  id: string,
  createdAt: string,
  parameters: number,
  exercises: number,
  assessmentTypes: number
) => ({ id, createdAt: new Date(createdAt), parameters, exercises, assessmentTypes });

describe('clone contract source selection', () => {
  it('ignora contrato vazio mesmo quando ele e o mais antigo', () => {
    const selected = selectBestCloneSourceCandidate([
      candidate('empty-oldest', '2025-01-01T00:00:00Z', 0, 0, 0),
      candidate('with-exercises', '2025-02-01T00:00:00Z', 0, 2, 0),
    ]);

    expect(selected?.id).toBe('with-exercises');
  });

  it('prioriza candidato com exercicios antes de volume total sem exercicios', () => {
    const selected = selectBestCloneSourceCandidate([
      candidate('many-parameters', '2025-01-01T00:00:00Z', 100, 0, 10),
      candidate('exercise-source', '2025-03-01T00:00:00Z', 0, 1, 0),
    ]);

    expect(selected?.id).toBe('exercise-source');
  });

  it('desempata por cobertura, total, antiguidade e id de forma deterministica', () => {
    expect(
      selectBestCloneSourceCandidate([
        candidate('one-category', '2025-01-01T00:00:00Z', 0, 5, 0),
        candidate('two-categories', '2025-02-01T00:00:00Z', 1, 1, 0),
      ])?.id
    ).toBe('two-categories');

    expect(
      selectBestCloneSourceCandidate([
        candidate('smaller-total', '2025-01-01T00:00:00Z', 1, 1, 0),
        candidate('larger-total', '2025-02-01T00:00:00Z', 5, 1, 0),
      ])?.id
    ).toBe('larger-total');

    expect(
      selectBestCloneSourceCandidate([
        candidate('older', '2025-01-01T00:00:00Z', 1, 1, 0),
        candidate('newer', '2025-02-01T00:00:00Z', 1, 1, 0),
      ])?.id
    ).toBe('older');

    expect(
      selectBestCloneSourceCandidate([
        candidate('b', '2025-01-01T00:00:00Z', 1, 1, 0),
        candidate('a', '2025-01-01T00:00:00Z', 1, 1, 0),
      ])?.id
    ).toBe('a');
  });

  it('ranqueia candidatos sem exercicios por cobertura, total e antiguidade', () => {
    const selected = selectBestCloneSourceCandidate([
      candidate('parameters-only', '2025-01-01T00:00:00Z', 20, 0, 0),
      candidate('parameters-and-assessments', '2025-02-01T00:00:00Z', 1, 0, 1),
    ]);

    expect(selected?.id).toBe('parameters-and-assessments');
  });

  it('mantem DEFAULT_CONTRACT_ID elegivel acima do ranking automatico', () => {
    const selected = selectCloneSourceCandidate(
      [
        candidate('default', '2025-02-01T00:00:00Z', 1, 0, 0),
        candidate('rank-winner', '2025-01-01T00:00:00Z', 1, 10, 1),
      ],
      'default'
    );

    expect(selected?.id).toBe('default');
  });

  it('ignora default vazio e usa outra origem elegivel', () => {
    const selected = selectCloneSourceCandidate(
      [
        candidate('default-empty', '2025-01-01T00:00:00Z', 0, 0, 0),
        candidate('eligible', '2025-02-01T00:00:00Z', 0, 1, 0),
      ],
      'default-empty'
    );

    expect(selected?.id).toBe('eligible');
  });

  it('retorna null quando nenhuma origem possui dados clonaveis', () => {
    expect(
      selectCloneSourceCandidate([
        candidate('empty-a', '2025-01-01T00:00:00Z', 0, 0, 0),
        candidate('empty-b', '2025-02-01T00:00:00Z', 0, 0, 0),
      ])
    ).toBeNull();
  });
});
