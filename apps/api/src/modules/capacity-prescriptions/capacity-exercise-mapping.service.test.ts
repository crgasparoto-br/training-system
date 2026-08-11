import {
  mergePersistedExerciseMapping,
  readPersistedExerciseMapping,
} from './capacity-exercise-mapping.service.js';

const persisted = {
  exerciseLibraryId: 'library-1',
  exerciseSnapshot: {
    id: 'library-1',
    name: 'Agachamento operacional',
    videoUrl: null,
    loadType: null,
    movementType: null,
    countingType: null,
    category: 'resisted',
    muscleGroup: 'Quadríceps',
    notes: null,
    updatedAt: '2026-08-11T10:00:00.000Z',
  },
  mappingRevision: 2,
  mappedAt: '2026-08-11T10:00:00.000Z',
  mappedByProfessorId: 'professor-1',
  origin: 'capacity_technical_catalog' as const,
};

describe('capacity exercise operational mapping metadata', () => {
  it('persists the operational relation without replacing unrelated technical metadata', () => {
    const metadata = mergePersistedExerciseMapping(
      { source: 'seed', difficultyNote: 'legacy metadata stays untouched' },
      persisted
    );

    expect(metadata.source).toBe('seed');
    expect(readPersistedExerciseMapping(metadata)).toMatchObject({
      exerciseLibraryId: 'library-1',
      mappingRevision: 2,
      exerciseSnapshot: { id: 'library-1', name: 'Agachamento operacional' },
    });
  });

  it('requires explicit persisted ids instead of deriving mapping from names', () => {
    expect(
      readPersistedExerciseMapping({
        name: 'Agachamento operacional',
        operationalExerciseMapping: { exerciseSnapshot: { name: 'Agachamento operacional' } },
      })
    ).toBeNull();
  });
});
