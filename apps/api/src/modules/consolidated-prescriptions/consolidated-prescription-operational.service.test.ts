import type { TechnicalExerciseOperationalMapping } from '@corrida/types';
import { buildOperationalProjectionItems } from './consolidated-prescription-operational.service.js';

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
  curationStatus: 'not_modeled',
  ...overrides,
});

const substitution = (currentExerciseAvailable: boolean) => ({
  originalTechnicalCatalogItemId: 'technical-squat',
  originalExerciseLibraryId: 'library-squat',
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
