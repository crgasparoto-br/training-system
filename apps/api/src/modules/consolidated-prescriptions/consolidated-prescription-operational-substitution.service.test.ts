import { capacityExerciseMappingService } from '../capacity-prescriptions/capacity-exercise-mapping.service.js';
import {
  CONSOLIDATED_EXERCISE_SUBSTITUTION_ORIGIN,
  createConsolidatedPrescriptionOperationalService,
} from './consolidated-prescription-operational.service.js';
import { consolidatedPrescriptionService } from './consolidated-prescription.service.js';

const context = {
  contractId: 'contract-a',
  actorProfessorId: 'professor-1',
  alunoId: 'aluno-1',
};

const assembly = () => ({
  id: 'assembly-1',
  currentVersion: 1,
  currentStatus: 'draft',
  latestVersion: {
    responsibleProfessorId: 'professor-1',
    capacityBlocks: [{ capacityPrescriptionVersionId: 'capacity-v1', position: 0 }],
    dataRefs: [],
    conflicts: [],
    technicalObservation: null,
    professorJustification: 'Integração operacional validada.',
    studentInstruction: null,
  },
});

const originalMapping = () => ({
  technicalCatalogItemId: 'technical-squat',
  technicalSnapshot: {
    id: 'technical-squat',
    code: 'SQUAT',
    name: 'Agachamento técnico',
    version: 2,
  },
  exerciseLibraryId: 'library-squat',
  operationalExerciseSnapshot: {
    id: 'library-squat',
    name: 'Agachamento operacional',
    videoUrl: null,
    loadType: 'plates',
    movementType: 'compound',
    countingType: 'repetitions',
    category: 'resisted',
    muscleGroup: 'Quadríceps',
    notes: null,
    updatedAt: '2026-08-11T10:00:00.000Z',
  },
  mappingRevision: 3,
  mappedAt: '2026-08-11T10:00:00.000Z',
  mappedByProfessorId: 'professor-1',
  currentExerciseAvailable: true,
  currentExerciseUpdatedAt: '2026-08-11T10:00:00.000Z',
  curationStatus: 'not_modeled' as const,
});

function clientFor(substitute: Record<string, unknown> | null) {
  return {
    capacityPrescriptionVersion: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'capacity-v1',
          capacity: 'resisted',
          parameters: {
            type: 'resisted',
            resisted: {
              exerciseTechnicalCatalogItemIds: ['technical-squat'],
              sets: 3,
              repetitions: '10',
            },
          },
        },
      ]),
    },
    exerciseLibrary: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(substitute),
    },
  };
}

describe('consolidated operational exercise substitution persistence', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists an immutable substitution snapshot in a new assembly version without publishing workout data', async () => {
    const currentAssembly = assembly();
    const substitute = {
      id: 'library-leg-press',
      name: 'Leg press',
      videoUrl: null,
      loadType: 'plates',
      movementType: 'compound',
      countingType: 'repetitions',
      category: 'resisted',
      muscleGroup: 'Quadríceps',
      notes: 'Ajuste de amplitude pelo professor.',
      updatedAt: new Date('2026-08-11T12:00:00.000Z'),
    };
    jest.spyOn(consolidatedPrescriptionService, 'getCurrent').mockResolvedValue(currentAssembly as never);
    const updateComposition = jest
      .spyOn(consolidatedPrescriptionService, 'updateComposition')
      .mockResolvedValue({ ...currentAssembly, currentVersion: 2 } as never);
    jest.spyOn(capacityExerciseMappingService, 'resolveMapping').mockResolvedValue(originalMapping());
    const service = createConsolidatedPrescriptionOperationalService(clientFor(substitute) as never);

    const result = await service.createExerciseSubstitution(
      context,
      {
        expectedCurrentVersion: 1,
        originalTechnicalCatalogItemId: 'technical-squat',
        substituteExerciseLibraryId: 'library-leg-press',
        reason: 'Dor no joelho no padrão original',
        origin: 'ajuste_professor',
      },
      new Date('2026-08-11T13:00:00.000Z')
    );

    expect(updateComposition).toHaveBeenCalledTimes(1);
    const [, payload] = updateComposition.mock.calls[0];
    const persistedRef = (payload.dataRefs ?? []).find(
      (ref) => ref.origin === CONSOLIDATED_EXERCISE_SUBSTITUTION_ORIGIN
    );
    expect(persistedRef).toMatchObject({
      sourceId: 'technical-squat:library-leg-press',
      sourceVersion: 2,
      responsibleProfessorId: 'professor-1',
      context: {
        kind: 'exercise_substitution_v1',
        assemblyId: 'assembly-1',
        baseAssemblyVersion: 1,
        recordedForAssemblyVersion: 2,
        capacityPrescriptionVersionId: 'capacity-v1',
        originalTechnicalCatalogItemId: 'technical-squat',
        originalExerciseLibraryId: 'library-squat',
        substituteExerciseLibraryId: 'library-leg-press',
        reason: 'Dor no joelho no padrão original',
        origin: 'ajuste_professor',
        recordedAt: '2026-08-11T13:00:00.000Z',
        recordedByProfessorId: 'professor-1',
        textMatchingUsed: false,
        writesOperationalWorkout: false,
        originalExerciseSnapshot: {
          id: 'library-squat',
          name: 'Agachamento operacional',
          loadType: 'plates',
          movementType: 'compound',
          countingType: 'repetitions',
        },
        substituteExerciseSnapshot: {
          id: 'library-leg-press',
          name: 'Leg press',
          updatedAt: '2026-08-11T12:00:00.000Z',
        },
      },
    });
    expect(currentAssembly.latestVersion.dataRefs).toEqual([]);
    substitute.name = 'Leg press renomeado depois';
    substitute.updatedAt = new Date('2026-08-12T12:00:00.000Z');
    expect(persistedRef?.context).toMatchObject({
      substituteExerciseSnapshot: {
        name: 'Leg press',
        updatedAt: '2026-08-11T12:00:00.000Z',
      },
    });
    expect(result).toMatchObject({
      assembly: { currentVersion: 2 },
      originalTechnicalCatalogItemId: 'technical-squat',
      originalExerciseLibraryId: 'library-squat',
      substituteExerciseLibraryId: 'library-leg-press',
      writesOperationalWorkout: false,
    });
  });

  it('rejects a same-tenant substitute that conflicts with modeled structural attributes', async () => {
    const currentAssembly = assembly();
    const substitute = {
      id: 'library-treadmill',
      name: 'Esteira',
      videoUrl: null,
      loadType: 'bodyweight',
      movementType: 'cyclic',
      countingType: 'time',
      category: 'cyclic',
      muscleGroup: 'Cardiorrespiratório',
      notes: null,
      updatedAt: new Date('2026-08-11T12:00:00.000Z'),
    };
    jest.spyOn(consolidatedPrescriptionService, 'getCurrent').mockResolvedValue(currentAssembly as never);
    const updateComposition = jest.spyOn(consolidatedPrescriptionService, 'updateComposition');
    jest.spyOn(capacityExerciseMappingService, 'resolveMapping').mockResolvedValue(originalMapping());
    const service = createConsolidatedPrescriptionOperationalService(clientFor(substitute) as never);

    await expect(
      service.createExerciseSubstitution(context, {
        expectedCurrentVersion: 1,
        originalTechnicalCatalogItemId: 'technical-squat',
        substituteExerciseLibraryId: 'library-treadmill',
        reason: 'Substituição manual',
        origin: 'ajuste_professor',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining('tipo de carga'),
    });
    expect(updateComposition).not.toHaveBeenCalled();
  });

  it('rejects a substitution when the original snapshot has no structured compatibility attributes', async () => {
    const currentAssembly = assembly();
    const substitute = {
      id: 'library-leg-press',
      name: 'Leg press',
      videoUrl: null,
      loadType: 'plates',
      movementType: 'compound',
      countingType: 'repetitions',
      category: 'resisted',
      muscleGroup: 'Quadríceps',
      notes: null,
      updatedAt: new Date('2026-08-11T12:00:00.000Z'),
    };
    jest.spyOn(consolidatedPrescriptionService, 'getCurrent').mockResolvedValue(currentAssembly as never);
    const updateComposition = jest.spyOn(consolidatedPrescriptionService, 'updateComposition');
    jest.spyOn(capacityExerciseMappingService, 'resolveMapping').mockResolvedValue({
      ...originalMapping(),
      operationalExerciseSnapshot: {
        ...originalMapping().operationalExerciseSnapshot,
        loadType: null,
        movementType: null,
        countingType: null,
      },
    });
    const service = createConsolidatedPrescriptionOperationalService(clientFor(substitute) as never);

    await expect(
      service.createExerciseSubstitution(context, {
        expectedCurrentVersion: 1,
        originalTechnicalCatalogItemId: 'technical-squat',
        substituteExerciseLibraryId: 'library-leg-press',
        reason: 'Substituição manual',
        origin: 'ajuste_professor',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining('atributos estruturais suficientes'),
    });
    expect(updateComposition).not.toHaveBeenCalled();
  });

  it('rejects a cross-tenant substitute before creating a new assembly version', async () => {
    const currentAssembly = assembly();
    jest.spyOn(consolidatedPrescriptionService, 'getCurrent').mockResolvedValue(currentAssembly as never);
    const updateComposition = jest.spyOn(consolidatedPrescriptionService, 'updateComposition');
    jest.spyOn(capacityExerciseMappingService, 'resolveMapping').mockResolvedValue(originalMapping());
    const client = clientFor(null);
    const service = createConsolidatedPrescriptionOperationalService(client as never);

    await expect(
      service.createExerciseSubstitution(context, {
        expectedCurrentVersion: 1,
        originalTechnicalCatalogItemId: 'technical-squat',
        substituteExerciseLibraryId: 'library-from-contract-b',
        reason: 'Substituição manual',
        origin: 'ajuste_professor',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Exercício substituto inexistente ou fora do contrato',
    });
    expect(client.exerciseLibrary.findFirst).toHaveBeenCalledWith({
      where: { id: 'library-from-contract-b', contractId: 'contract-a' },
    });
    expect(updateComposition).not.toHaveBeenCalled();
  });
});
