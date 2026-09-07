import {
  CapacityPrescriptionDomainError,
  assertCapacityParameters,
  createCapacityPrescriptionService,
  preserveResistedExerciseTechnicalCatalogItemIds,
} from './capacity-prescription.service.js';


function mockedSaveClient(input: {
  previousParameters?: unknown;
  technicalIdsFound?: string[];
}) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const versionCreate = jest.fn().mockImplementation(({ data }) =>
    Promise.resolve({ id: 'version-2', ...data })
  );
  const technicalFindMany = jest.fn().mockResolvedValue(
    (input.technicalIdsFound ?? ['technical-squat']).map((id) => ({ id }))
  );
  const transactionClient = {
    capacityPrescription: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'prescription-1',
        currentVersion: 1,
        status: 'active',
      }),
      updateMany,
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'prescription-1',
        currentVersion: 2,
        status: 'active',
        publishesTodayWorkout: false,
      }),
    },
    capacityPrescriptionVersion: {
      findFirst: jest.fn().mockResolvedValue({ parameters: input.previousParameters ?? null }),
      create: versionCreate,
    },
    capacityTechnicalCatalogItem: { findMany: technicalFindMany },
  };
  const client = {
    aluno: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'aluno-1',
        contractId: 'contract-a',
        maxHeartRate: null,
        restingHeartRate: null,
        vo2Max: null,
        anaerobicThreshold: null,
      }),
    },
    professor: { findFirst: jest.fn().mockResolvedValue({ id: 'professor-1' }) },
    $transaction: jest.fn(async (operation: (tx: typeof transactionClient) => unknown) =>
      operation(transactionClient)
    ),
  };
  return { client, updateMany, versionCreate, technicalFindMany };
}

function savePayload(exerciseTechnicalCatalogItemIds?: string[]) {
  return {
    capacity: 'resisted' as const,
    expectedCurrentVersion: 1,
    sourceRefs: [
      {
        type: 'professor_note' as const,
        id: 'note-1',
        label: 'Nota técnica',
        origin: 'manual',
      },
    ],
    technicalJustification: 'Prescrição resistida validada.',
    professorSummary: 'Manter progressão controlada.',
    parameters: {
      type: 'resisted' as const,
      resisted: {
        sets: 4,
        ...(exerciseTechnicalCatalogItemIds === undefined
          ? {}
          : { exerciseTechnicalCatalogItemIds }),
      },
    },
  };
}

describe('resisted technical exercise references', () => {
  it('preserves persisted technical ids when a normal resisted save omits only that server-backed field', () => {
    const next = preserveResistedExerciseTechnicalCatalogItemIds(
      {
        type: 'resisted',
        resisted: { method: 'circuito', sets: 4, repetitions: '8' },
      },
      {
        type: 'resisted',
        resisted: {
          exerciseTechnicalCatalogItemIds: ['technical-squat'],
          method: 'adaptacao',
          sets: 3,
        },
      }
    );

    expect(next).toMatchObject({
      type: 'resisted',
      resisted: {
        exerciseTechnicalCatalogItemIds: ['technical-squat'],
        method: 'circuito',
        sets: 4,
      },
    });
  });

  it('honors an explicit replacement or clear instead of restoring the previous ids', () => {
    const previous = {
      type: 'resisted',
      resisted: { exerciseTechnicalCatalogItemIds: ['technical-old'] },
    };

    expect(
      preserveResistedExerciseTechnicalCatalogItemIds(
        {
          type: 'resisted',
          resisted: { exerciseTechnicalCatalogItemIds: ['technical-new'] },
        },
        previous
      )
    ).toMatchObject({
      resisted: { exerciseTechnicalCatalogItemIds: ['technical-new'] },
    });
    expect(
      preserveResistedExerciseTechnicalCatalogItemIds(
        {
          type: 'resisted',
          resisted: { exerciseTechnicalCatalogItemIds: [] },
        },
        previous
      )
    ).toMatchObject({ resisted: { exerciseTechnicalCatalogItemIds: [] } });
  });

  it('preserves ids inside the normal save transaction and keeps workout publication disabled', async () => {
    const { client, versionCreate, technicalFindMany } = mockedSaveClient({
      previousParameters: {
        type: 'resisted',
        resisted: { exerciseTechnicalCatalogItemIds: ['technical-squat'], sets: 3 },
      },
    });
    const service = createCapacityPrescriptionService(client as never);

    const saved = await service.saveVersion(
      { contractId: 'contract-a', actorProfessorId: 'professor-1', alunoId: 'aluno-1' },
      savePayload()
    );

    expect(technicalFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['technical-squat'] },
        contractId: 'contract-a',
        category: 'exercise',
        isCurrent: true,
      },
      select: { id: true },
    });
    expect(versionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishesTodayWorkout: false,
          parameters: expect.objectContaining({
            type: 'resisted',
            resisted: expect.objectContaining({
              sets: 4,
              exerciseTechnicalCatalogItemIds: ['technical-squat'],
            }),
          }),
        }),
      })
    );
    expect(saved).toMatchObject({ publishesTodayWorkout: false });
  });

  it('rejects a technical exercise outside the tenant before mutating the prescription root', async () => {
    const { client, updateMany, versionCreate } = mockedSaveClient({ technicalIdsFound: [] });
    const service = createCapacityPrescriptionService(client as never);

    await expect(
      service.saveVersion(
        { contractId: 'contract-a', actorProfessorId: 'professor-1', alunoId: 'aluno-1' },
        savePayload(['technical-from-contract-b'])
      )
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Uma ou mais referências técnicas de exercícios são inválidas para este contrato',
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(versionCreate).not.toHaveBeenCalled();
  });

  it('rejects duplicate or blank ids before persistence', () => {
    for (const ids of [
      ['technical-squat', 'technical-squat'],
      ['technical-squat', '   '],
    ]) {
      expect(() =>
        assertCapacityParameters('resisted', {
          type: 'resisted',
          resisted: { exerciseTechnicalCatalogItemIds: ids },
        })
      ).toThrow(CapacityPrescriptionDomainError);
    }
  });
});
