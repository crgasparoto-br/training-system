import type { TechnicalExerciseOperationalMapping } from '@corrida/types';
import {
  buildOperationalProjectionItems,
  createConsolidatedPrescriptionOperationalService,
  isPreparedOperationalSnapshotItemStale,
} from './consolidated-prescription-operational.service.js';

const mapping = (overrides: Partial<TechnicalExerciseOperationalMapping> = {}): TechnicalExerciseOperationalMapping => ({
  technicalCatalogItemId: 'technical-squat',
  technicalSnapshot: {
    id: 'technical-squat',
    code: 'AGACHAMENTO',
    name: 'Agachamento técnico',
    version: 2,
  },
  exerciseLibraryId: 'library-squat',
  operationalExerciseSnapshot: {
    id: 'library-squat',
    name: 'Agachamento operacional antigo',
    videoUrl: null,
    loadType: null,
    movementType: null,
    countingType: null,
    category: 'resisted',
    muscleGroup: 'Quadríceps',
    notes: null,
    updatedAt: '2026-08-10T12:00:00.000Z',
  },
  mappingRevision: 3,
  mappedAt: '2026-08-10T12:00:00.000Z',
  mappedByProfessorId: 'professor-1',
  currentExerciseAvailable: true,
  currentExerciseUpdatedAt: '2026-08-10T12:00:00.000Z',
  curationStatus: 'not_modeled',
  ...overrides,
});

const substitution = (currentExerciseAvailable: boolean) => ({
  originalTechnicalCatalogItemId: 'technical-squat',
  originalExerciseLibraryId: 'library-squat',
  originalMappingRevision: 3,
  substituteExerciseLibraryId: 'library-leg-press',
  substituteExerciseSnapshot: {
    id: 'library-leg-press',
    name: 'Leg press',
    videoUrl: null,
    loadType: null,
    movementType: null,
    countingType: null,
    category: 'resisted',
    muscleGroup: 'Quadríceps',
    notes: null,
    updatedAt: '2026-08-11T10:00:00.000Z',
  },
  recordedAt: '2026-08-11T10:00:00.000Z',
  recordedByProfessorId: 'professor-1',
  currentExerciseAvailable,
  currentExerciseUpdatedAt: currentExerciseAvailable ? '2026-08-11T10:00:00.000Z' : null,
});

describe('buildOperationalProjectionItems', () => {
  it('maps resisted capacity only through the explicit technical id', () => {
    const items = buildOperationalProjectionItems(
      [
        {
          id: 'capacity-resisted-v1',
          capacity: 'resisted',
          parameters: {
            type: 'resisted',
            resisted: {
              exerciseTechnicalCatalogItemIds: ['technical-squat'],
              sets: 3,
              repetitions: '10',
              method: 'circuito',
            },
          },
        },
      ],
      new Map([['technical-squat', mapping()]])
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      compatibility: 'mapped',
      technicalCatalogItemId: 'technical-squat',
      mappedExerciseLibraryId: 'library-squat',
      effectiveExerciseLibraryId: 'library-squat',
      proposedFields: {
        WorkoutTemplate: { trainingMethod: 'circuito' },
        WorkoutExercise: { sets: 3, reps: 10 },
      },
    });
    expect(items[0].operationalExerciseSnapshot?.name).toBe('Agachamento operacional antigo');
  });


  it('#394 A-394-018: an unavailable legacy mapping stays identifiable but its video is not exposed', () => {
    const legacyUrl = 'https://example.org/legacy-unlicensed-video';
    const mapped = mapping({
      currentExerciseAvailable: false,
      operationalExerciseSnapshot: {
        ...mapping().operationalExerciseSnapshot!,
        videoUrl: legacyUrl,
      },
    });
    const [item] = buildOperationalProjectionItems(
      [{
        id: 'capacity-resisted-v1',
        capacity: 'resisted',
        parameters: { type: 'resisted', resisted: { exerciseTechnicalCatalogItemIds: ['technical-squat'] } },
      }],
      new Map([['technical-squat', mapped]])
    );
    expect(item).toMatchObject({
      compatibility: 'incompatible',
      incompatibilityCode: 'operational_exercise_unavailable',
      mappedExerciseLibraryId: 'library-squat',
      operationalExerciseSnapshot: { id: 'library-squat', videoUrl: null },
    });
    expect(mapped.operationalExerciseSnapshot?.videoUrl).toBe(legacyUrl);
  });

  it('#394 A-394-018: a licensed current mapping keeps its own snapshot rights', () => {
    const url = 'https://example.org/licensed-video';
    const [item] = buildOperationalProjectionItems(
      [{
        id: 'capacity-resisted-v1',
        capacity: 'resisted',
        parameters: { type: 'resisted', resisted: { exerciseTechnicalCatalogItemIds: ['technical-squat'] } },
      }],
      new Map([['technical-squat', mapping({
        curationStatus: 'approved',
        operationalExerciseSnapshot: {
          ...mapping().operationalExerciseSnapshot!,
          videoUrl: url,
          mediaOrigin: 'production_owned',
          mediaLicense: 'company_owned',
          legacyGrandfathered: false,
        },
      })]])
    );
    expect(item.compatibility).toBe('mapped');
    expect(item.operationalExerciseSnapshot?.videoUrl).toBe(url);
  });

  it('#394 A-394-018: substitute snapshots cannot borrow rights from other catalog revisions', () => {
    const oldUrl = 'https://example.org/old-unlicensed-substitution';
    const original = substitution(true);
    const recorded = {
      ...original,
      substituteExerciseSnapshot: { ...original.substituteExerciseSnapshot, videoUrl: oldUrl },
    };
    const [item] = buildOperationalProjectionItems(
      [{
        id: 'capacity-resisted-v1',
        capacity: 'resisted',
        parameters: { type: 'resisted', resisted: { exerciseTechnicalCatalogItemIds: ['technical-squat'] } },
      }],
      new Map([['technical-squat', mapping()]]),
      new Map([['technical-squat', recorded]]) as never
    );
    expect(item).toMatchObject({
      compatibility: 'mapped',
      substituted: true,
      operationalExerciseSnapshot: { id: 'library-leg-press', videoUrl: null },
    });
    expect(recorded.substituteExerciseSnapshot.videoUrl).toBe(oldUrl);
  });

  it('does not associate same-name exercises without an id mapping', () => {
    const items = buildOperationalProjectionItems(
      [
        {
          id: 'capacity-resisted-v1',
          capacity: 'resisted',
          parameters: {
            type: 'resisted',
            resisted: { exerciseTechnicalCatalogItemIds: ['technical-unmapped'] },
          },
        },
      ],
      new Map([['technical-squat', mapping()]])
    );

    expect(items[0]).toMatchObject({
      compatibility: 'incompatible',
      incompatibilityCode: 'technical_exercise_unavailable',
      mappedExerciseLibraryId: null,
    });
  });

  it('keeps a missing operational exercise as a traceable incompatibility', () => {
    const items = buildOperationalProjectionItems(
      [
        {
          id: 'capacity-resisted-v1',
          capacity: 'resisted',
          parameters: {
            type: 'resisted',
            resisted: { exerciseTechnicalCatalogItemIds: ['technical-squat'] },
          },
        },
      ],
      new Map([['technical-squat', mapping({ currentExerciseAvailable: false })]])
    );

    expect(items[0]).toMatchObject({
      compatibility: 'incompatible',
      incompatibilityCode: 'operational_exercise_unavailable',
      mappedExerciseLibraryId: 'library-squat',
    });
  });

  it('maps only explicit cyclic fields and reports unsupported parameters', () => {
    const items = buildOperationalProjectionItems(
      [
        {
          id: 'capacity-cyclic-v1',
          capacity: 'cyclic',
          parameters: {
            type: 'cyclic',
            cyclic: {
              category: 'continuo',
              vo2MaxPercentage: 65,
              time: '30 min',
              distance: '5 km',
              zones: [{ name: 'Z2', minPercent: 60, maxPercent: 70 }],
            },
          },
        },
      ],
      new Map()
    );

    expect(items[0]).toMatchObject({
      capacity: 'cyclic',
      compatibility: 'mapped',
      target: 'WorkoutDay',
      proposedFields: {
        WorkoutTemplate: { totalVolumeKm: 5 },
        WorkoutDay: { method: 'continuo', vo2maxPct: 65, stimulusDurationMin: 30 },
      },
    });
    expect(items[0].unsupportedParameters).toContain('zones');
  });

  it('does not round a fractional duration that the operational model cannot represent exactly', () => {
    const items = buildOperationalProjectionItems(
      [
        {
          id: 'capacity-cyclic-fractional',
          capacity: 'cyclic',
          parameters: {
            type: 'cyclic',
            cyclic: { category: 'continuo', time: '30.4 min' },
          },
        },
      ],
      new Map()
    );

    expect(items[0]).toMatchObject({
      compatibility: 'mapped',
      proposedFields: { WorkoutDay: { method: 'continuo' } },
    });
    expect(items[0].proposedFields).not.toMatchObject({
      WorkoutDay: { stimulusDurationMin: expect.any(Number) },
    });
    expect(items[0].unsupportedParameters).toContain('time');
    expect(items[0].sourceParameters).toMatchObject({ time: '30.4 min' });
  });

  it('marks a prepared snapshot stale when the library changes without a mapping revision change', () => {
    const [item] = buildOperationalProjectionItems(
      [
        {
          id: 'capacity-resisted-v1',
          capacity: 'resisted',
          parameters: {
            type: 'resisted',
            resisted: { exerciseTechnicalCatalogItemIds: ['technical-squat'] },
          },
        },
      ],
      new Map([
        [
          'technical-squat',
          mapping({ currentExerciseUpdatedAt: '2026-08-11T15:00:00.000Z' }),
        ],
      ])
    );

    expect(item.mappingRevision).toBe(3);
    expect(item.operationalExerciseSnapshot?.updatedAt).toBe('2026-08-10T12:00:00.000Z');
    expect(item.operationalExerciseUpdatedAt).toBe('2026-08-11T15:00:00.000Z');
    expect(
      isPreparedOperationalSnapshotItemStale(item, {
        key: item.key,
        mappingRevision: 3,
        operationalExerciseUpdatedAt: '2026-08-10T12:00:00.000Z',
      })
    ).toBe(true);
    expect(
      isPreparedOperationalSnapshotItemStale(item, {
        key: item.key,
        mappingRevision: 3,
        operationalExerciseUpdatedAt: '2026-08-11T15:00:00.000Z',
      })
    ).toBe(false);
  });

  it.each(['flexibility', 'balance'] as const)(
    'keeps %s traceable when no operational representation exists',
    (capacity) => {
      const parameters =
        capacity === 'flexibility'
          ? { type: 'flexibility', flexibility: { articulations: [{ name: 'Ombro' }] } }
          : { type: 'balance', balance: { focus: 'estabilidade' } };
      const items = buildOperationalProjectionItems(
        [{ id: `capacity-${capacity}-v1`, capacity, parameters }],
        new Map()
      );
      expect(items[0]).toMatchObject({
        capacity,
        compatibility: 'incompatible',
        incompatibilityCode: 'operational_representation_unavailable',
        target: 'none',
      });
    }
  );

  it('applies only an explicitly recorded substitute id', () => {
    const substitutions = new Map([['technical-squat', substitution(true)]]);
    const items = buildOperationalProjectionItems(
      [
        {
          id: 'capacity-resisted-v1',
          capacity: 'resisted',
          parameters: {
            type: 'resisted',
            resisted: { exerciseTechnicalCatalogItemIds: ['technical-squat'] },
          },
        },
      ],
      new Map([['technical-squat', mapping()]]),
      substitutions as never
    );

    expect(items[0]).toMatchObject({
      compatibility: 'mapped',
      substituted: true,
      effectiveExerciseLibraryId: 'library-leg-press',
      mappedExerciseLibraryId: 'library-squat',
    });
    expect(items[0].operationalExerciseSnapshot?.name).toBe('Leg press');
  });

  it('invalidates a recorded substitution after the technical item is remapped', () => {
    const substitutions = new Map([['technical-squat', substitution(true)]]);
    const remapped = mapping({
      exerciseLibraryId: 'library-front-squat',
      mappingRevision: 4,
      operationalExerciseSnapshot: {
        id: 'library-front-squat',
        name: 'Agachamento frontal',
        videoUrl: null,
        loadType: null,
        movementType: null,
        countingType: null,
        category: 'resisted',
        muscleGroup: 'Quadríceps',
        notes: null,
        updatedAt: '2026-08-10T12:00:00.000Z',
      },
      currentExerciseUpdatedAt: '2026-08-10T12:00:00.000Z',
    });
    const items = buildOperationalProjectionItems(
      [
        {
          id: 'capacity-resisted-v1',
          capacity: 'resisted',
          parameters: {
            type: 'resisted',
            resisted: { exerciseTechnicalCatalogItemIds: ['technical-squat'] },
          },
        },
      ],
      new Map([['technical-squat', remapped]]),
      substitutions as never
    );

    expect(items[0]).toMatchObject({
      compatibility: 'incompatible',
      incompatibilityCode: 'exercise_substitution_stale',
      substituted: false,
      mappedExerciseLibraryId: 'library-front-squat',
      effectiveExerciseLibraryId: 'library-front-squat',
      mappingRevision: 4,
    });
  });

  it('marks a removed recorded substitute as operationally unavailable', () => {
    const substitutions = new Map([['technical-squat', substitution(false)]]);
    const items = buildOperationalProjectionItems(
      [
        {
          id: 'capacity-resisted-v1',
          capacity: 'resisted',
          parameters: {
            type: 'resisted',
            resisted: { exerciseTechnicalCatalogItemIds: ['technical-squat'] },
          },
        },
      ],
      new Map([['technical-squat', mapping()]]),
      substitutions as never
    );

    expect(items[0]).toMatchObject({
      compatibility: 'incompatible',
      incompatibilityCode: 'operational_exercise_unavailable',
      substituted: true,
      effectiveExerciseLibraryId: 'library-leg-press',
    });
  });
});


describe('issue #394: operational catalog search and exact muscle filters', () => {
  const context = {
    contractId: 'contract-a',
    alunoId: 'aluno-1',
    actorProfessorId: 'professor-1',
  };

  function searchClient() {
    return {
      aluno: { findFirst: jest.fn().mockResolvedValue({ id: context.alunoId }) },
      exerciseLibrary: { findMany: jest.fn().mockResolvedValue([{ id: 'secondary-match' }]) },
      $queryRaw: jest.fn(),
    };
  }

  it('reuses tenant-scoped secondary muscles in partial search and exact case-insensitive filter', async () => {
    const client = searchClient();
    client.$queryRaw
      .mockResolvedValueOnce([{ id: 'alias-match' }])
      .mockResolvedValueOnce([{ id: 'secondary-match' }])
      .mockResolvedValueOnce([{ id: 'secondary-match' }]);
    const service = createConsolidatedPrescriptionOperationalService(client as never);

    const results = await service.listOperationalExercises(context, {
      search: 'GLÚTEOS',
      muscleGroup: 'glúteos',
      category: 'resisted',
    });

    expect(results).toEqual([{ id: 'secondary-match' }]);
    expect(client.aluno.findFirst).toHaveBeenCalledWith({
      where: { id: 'aluno-1', contractId: 'contract-a' },
      select: { id: true },
    });
    expect(client.$queryRaw).toHaveBeenCalledTimes(3);
    const aliasQuery = client.$queryRaw.mock.calls[0];
    const muscleQuery = client.$queryRaw.mock.calls[1];
    const filterQuery = client.$queryRaw.mock.calls[2];
    expect(aliasQuery[0].join('')).toContain('unnest(e."aliases")');
    expect(muscleQuery[0].join('')).toContain('e."primaryMuscleGroups" || e."secondaryMuscleGroups"');
    expect(muscleQuery[0].join('')).toContain('strpos(lower(m.value), lower(');
    expect(filterQuery[0].join('')).toContain('lower(btrim(m.value)) = lower(');
    for (const query of [aliasQuery, muscleQuery, filterQuery]) {
      expect(query).toContain('contract-a');
    }
    expect(muscleQuery).toContain(false);
    expect(filterQuery).toContain(true);
    expect(muscleQuery).toContain('GLÚTEOS');
    expect(filterQuery).toContain('glúteos');

    expect(client.exerciseLibrary.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        contractId: 'contract-a',
        curationStatus: 'approved',
        legacyGrandfathered: false,
        category: 'resisted',
        AND: [{
          OR: [
            { muscleGroup: { equals: 'glúteos', mode: 'insensitive' } },
            { id: { in: ['secondary-match'] } },
          ],
        }],
        OR: expect.arrayContaining([
          { id: { in: ['alias-match', 'secondary-match'] } },
        ]),
      }),
      take: 50,
    }));
  });

  it('filters by secondary muscle without search, preserving approved-only and tenant boundaries', async () => {
    const client = searchClient();
    client.$queryRaw.mockResolvedValueOnce([{ id: 'secondary-match' }]);
    const service = createConsolidatedPrescriptionOperationalService(client as never);

    await service.listOperationalExercises(context, { muscleGroup: ' DELTOIDE ' });

    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(client.$queryRaw.mock.calls[0]).toContain('DELTOIDE');
    expect(client.$queryRaw.mock.calls[0]).toContain(true);
    expect(client.$queryRaw.mock.calls[0]).toContain('contract-a');
    expect(client.exerciseLibrary.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        contractId: 'contract-a',
        curationStatus: 'approved',
        legacyGrandfathered: false,
        AND: [{
          OR: [
            { muscleGroup: { equals: 'DELTOIDE', mode: 'insensitive' } },
            { id: { in: ['secondary-match'] } },
          ],
        }],
      },
    }));
  });

  it('does not query catalog or cross-tenant muscle IDs when student is not in this contract', async () => {
    const client = searchClient();
    client.aluno.findFirst.mockResolvedValueOnce(null);
    const service = createConsolidatedPrescriptionOperationalService(client as never);

    await expect(service.listOperationalExercises(context, {
      search: 'glúteos',
      muscleGroup: 'glúteos',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(client.$queryRaw).not.toHaveBeenCalled();
    expect(client.exerciseLibrary.findMany).not.toHaveBeenCalled();
  });
});
