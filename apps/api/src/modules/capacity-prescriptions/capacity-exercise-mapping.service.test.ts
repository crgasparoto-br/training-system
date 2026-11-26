import {
  createCapacityExerciseMappingService,
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

  it('resolves the current library revision in the same contract without rewriting the persisted snapshot', async () => {
    const technicalFindFirst = jest.fn().mockResolvedValue({
      id: 'technical-1',
      code: 'SQUAT',
      name: 'Agachamento técnico',
      version: 4,
      metadata: { operationalExerciseMapping: persisted },
    });
    const exerciseFindFirst = jest.fn().mockResolvedValue({
      id: 'library-1',
      curationStatus: 'approved', legacyGrandfathered: false,
      updatedAt: new Date('2026-08-11T15:30:00.000Z'),
    });
    const service = createCapacityExerciseMappingService({
      capacityTechnicalCatalogItem: { findFirst: technicalFindFirst },
      exerciseLibrary: { findFirst: exerciseFindFirst },
    } as never);

    const result = await service.resolveMapping('contract-a', 'technical-1');

    expect(exerciseFindFirst).toHaveBeenCalledWith({
      where: { id: 'library-1', contractId: 'contract-a' },
    });
    expect(result).toMatchObject({
      exerciseLibraryId: 'library-1',
      mappingRevision: 2,
      currentExerciseAvailable: true,
      currentExerciseUpdatedAt: '2026-08-11T15:30:00.000Z',
      operationalExerciseSnapshot: {
        name: 'Agachamento operacional',
        updatedAt: '2026-08-11T10:00:00.000Z',
      },
    });
  });

  it('#394 A-007: historical approved mapping remains inspectable but is not currently reusable', async () => {
    const technicalFindFirst = jest.fn().mockResolvedValue({
      id: 'technical-1', code: 'SQUAT', name: 'Agachamento técnico', version: 4,
      metadata: { operationalExerciseMapping: persisted },
    });
    const exerciseFindFirst = jest.fn().mockResolvedValue({
      id: 'library-1', curationStatus: 'approved', legacyGrandfathered: true,
      updatedAt: new Date('2026-08-11T15:30:00.000Z'),
    });
    const service = createCapacityExerciseMappingService({
      capacityTechnicalCatalogItem: { findFirst: technicalFindFirst },
      exerciseLibrary: { findFirst: exerciseFindFirst },
    } as never);
    const result = await service.resolveMapping('contract-a', 'technical-1');
    expect(result).toMatchObject({ exerciseLibraryId: 'library-1', currentExerciseAvailable: false,
      curationStatus: 'approved' });
    expect(exerciseFindFirst).toHaveBeenCalledWith({
      where: { id: 'library-1', contractId: 'contract-a' },
    });
  });


  it('#394 A-394-018: exposes only licensed snapshot media while preserving raw legacy metadata', async () => {
    const legacyUrl = 'https://example.org/legacy-unlicensed-mapping';
    const legacy = {
      ...persisted,
      exerciseSnapshot: { ...persisted.exerciseSnapshot, videoUrl: legacyUrl },
    };
    const service = createCapacityExerciseMappingService({
      capacityTechnicalCatalogItem: { findFirst: jest.fn().mockResolvedValue({
        id: 'technical-1', code: 'SQUAT', name: 'Agachamento técnico',
        version: 4, metadata: { operationalExerciseMapping: legacy },
      }) },
      exerciseLibrary: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);
    const current = await service.resolveMapping('contract-a', 'technical-1');
    expect(current).toMatchObject({
      exerciseLibraryId: 'library-1',
      currentExerciseAvailable: false,
      operationalExerciseSnapshot: { name: 'Agachamento operacional', videoUrl: null },
    });
    expect(readPersistedExerciseMapping({ operationalExerciseMapping: legacy })?.exerciseSnapshot.videoUrl).toBe(legacyUrl);
  });

  it.each([
    { label: 'absent', marker: {}, license: null, allowed: false },
    { label: 'null', marker: { legacyGrandfathered: null }, license: null, allowed: false },
    { label: 'invalid', marker: { legacyGrandfathered: 'true' }, license: null, allowed: false },
    { label: 'legacy', marker: { legacyGrandfathered: true }, license: 'Archive', allowed: false },
    { label: 'non-legacy', marker: { legacyGrandfathered: false }, license: null, allowed: true },
    { label: 'licensed old snapshot', marker: {}, license: 'Archive', allowed: true },
  ])('#579 A-008 resolves historical mapping media without borrowing live rights: $label', async ({ marker, license, allowed }) => {
    const url = 'https://example.org/historical-mapping';
    const snapshot = { ...persisted.exerciseSnapshot, videoUrl: url, mediaOrigin: 'Própria', mediaLicense: license, ...marker };
    const metadata = { operationalExerciseMapping: { ...persisted, exerciseSnapshot: snapshot } };
    const before = JSON.stringify(metadata);
    const service = createCapacityExerciseMappingService({
      capacityTechnicalCatalogItem: { findFirst: jest.fn().mockResolvedValue({
        id: 'technical-1', code: 'SQUAT', name: 'Agachamento técnico', version: 4, metadata,
      }) },
      exerciseLibrary: { findFirst: jest.fn().mockResolvedValue({
        curationStatus: 'approved', legacyGrandfathered: false, mediaOrigin: 'Própria', mediaLicense: 'Later',
        videoUrl: 'https://example.org/later', updatedAt: new Date('2026-08-11T15:30:00.000Z'),
      }) },
    } as never);
    const result = await service.resolveMapping('contract-a', 'technical-1');
    expect(result?.operationalExerciseSnapshot).toEqual({ ...snapshot, videoUrl: allowed ? url : null });
    expect(JSON.stringify(metadata)).toBe(before);
  });

  it('#394 A-394-018: writes media provenance into new mapping snapshots', async () => {
    const update = jest.fn().mockResolvedValue({});
    const transactionClient = {
      professor: { findFirst: jest.fn().mockResolvedValue({ id: 'professor-1' }) },
      capacityTechnicalCatalogItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'technical-1', code: 'SQUAT', name: 'Agachamento técnico', version: 1, metadata: {},
        }),
        update,
      },
      exerciseLibrary: { findFirst: jest.fn().mockResolvedValue({
        id: 'library-1', name: 'Agachamento operacional',
        videoUrl: 'https://example.org/company-video',
        mediaOrigin: 'company_production', mediaLicense: 'owned',
        legacyGrandfathered: false,
        loadType: null, movementType: null, countingType: null,
        category: 'resisted', muscleGroup: 'Quadríceps', notes: null,
        updatedAt: new Date('2026-08-11T15:30:00.000Z'),
      }) },
    };
    const service = createCapacityExerciseMappingService({
      $transaction: jest.fn(async (fn: (tx: typeof transactionClient) => unknown) => fn(transactionClient)),
    } as never);
    const result = await service.setMapping(
      { contractId: 'contract-a', actorProfessorId: 'professor-1' },
      'technical-1', 'library-1', 0
    );
    expect(result.operationalExerciseSnapshot).toMatchObject({
      videoUrl: 'https://example.org/company-video',
      mediaOrigin: 'company_production',
      mediaLicense: 'owned',
      legacyGrandfathered: false,
    });
    expect(update.mock.calls[0][0].data.metadata.operationalExerciseMapping.exerciseSnapshot)
      .toMatchObject({ mediaOrigin: 'company_production', mediaLicense: 'owned' });
  });

  it('rejects an operational exercise outside the tenant before persisting the mapping', async () => {
    const update = jest.fn();
    const exerciseFindFirst = jest.fn().mockResolvedValue(null);
    const transactionClient = {
      professor: { findFirst: jest.fn().mockResolvedValue({ id: 'professor-1' }) },
      capacityTechnicalCatalogItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'technical-1',
          code: 'SQUAT',
          name: 'Agachamento técnico',
          version: 1,
          metadata: {},
        }),
        update,
      },
      exerciseLibrary: { findFirst: exerciseFindFirst },
    };
    const service = createCapacityExerciseMappingService({
      $transaction: jest.fn(async (operation: (tx: typeof transactionClient) => unknown) =>
        operation(transactionClient)
      ),
    } as never);

    await expect(
      service.setMapping(
        { contractId: 'contract-a', actorProfessorId: 'professor-1' },
        'technical-1',
        'library-from-contract-b',
        0
      )
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Exercício operacional inexistente ou fora do contrato',
    });
    expect(exerciseFindFirst).toHaveBeenCalledWith({
      where: { id: 'library-from-contract-b', contractId: 'contract-a', curationStatus: 'approved', legacyGrandfathered: false },
    });
    expect(update).not.toHaveBeenCalled();
  });
  it('preserves a deactivated mapping snapshot but blocks new operational availability', async () => {
    const technical = jest.fn().mockResolvedValue({
      id: 'technical-1', code: 'SQUAT', name: 'Agachamento técnico',
      version: 4, metadata: { operationalExerciseMapping: persisted },
    });
    const exercise = jest.fn().mockResolvedValue({
      id: 'library-1', curationStatus: 'inactive',
      updatedAt: new Date('2026-08-11T15:30:00.000Z'),
    });
    const service = createCapacityExerciseMappingService({
      capacityTechnicalCatalogItem: { findFirst: technical },
      exerciseLibrary: { findFirst: exercise },
    } as never);
    const result = await service.resolveMapping('contract-a', 'technical-1');
    expect(result).toMatchObject({
      exerciseLibraryId: 'library-1',
      curationStatus: 'inactive',
      currentExerciseAvailable: false,
      operationalExerciseSnapshot: { id: 'library-1' },
    });
  });


});
