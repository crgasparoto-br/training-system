import {
  CapacityPrescriptionDomainError,
  createCapacityPrescriptionService,
} from './capacity-prescription.service.js';
import { createCapacityResistedTechnicalExerciseVersionService } from './capacity-resisted-technical-exercise-version.service.js';

const context = {
  contractId: 'contract-a',
  actorProfessorId: 'professor-1',
  alunoId: 'aluno-1',
};

function parameterSetBackedPreviousVersion() {
  return {
    id: 'capacity-version-1',
    prescriptionId: 'prescription-1',
    contractId: 'contract-a',
    alunoId: 'aluno-1',
    responsibleProfessorId: 'professor-1',
    capacity: 'resisted',
    status: 'active',
    version: 1,
    technicalJustification: 'Prescrição resistida baseada no conjunto canônico.',
    professorSummary: 'Manter progressão controlada.',
    studentMessage: 'Executar conforme orientação.',
    methodologyVersion: 'method-v1',
    parameterSetIds: ['set-resisted-v1'],
    parameters: {
      type: 'resisted',
      resisted: {
        method: 'adaptacao_anatomica',
        split: 'full_body',
        sets: 3,
        repetitions: '8-12',
      },
    },
    publishesTodayWorkout: false,
    sources: [
      {
        sourceType: 'professor_note',
        sourceId: 'note-1',
        label: 'Nota técnica',
        assessedAt: null,
        origin: 'manual',
        sourceVersion: null,
        responsibleProfessorId: 'professor-1',
      },
    ],
    alerts: [
      {
        code: 'CONTROL',
        message: 'Progressão controlada.',
        severity: 'info',
        sourceRefId: null,
      },
    ],
    goals: [{ goalId: 'goal-1' }],
  };
}

function mockedVersionClient(input?: { currentVersion?: number; technicalIdsFound?: string[] }) {
  const previous = parameterSetBackedPreviousVersion();
  const currentVersion = input?.currentVersion ?? 1;
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const versionCreate = jest.fn().mockImplementation(({ data }) =>
    Promise.resolve({ id: 'capacity-version-2', ...data })
  );
  const transactionClient = {
    professor: { findFirst: jest.fn().mockResolvedValue({ id: 'professor-1' }) },
    capacityPrescription: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'prescription-1',
        contractId: 'contract-a',
        alunoId: 'aluno-1',
        capacity: 'resisted',
        status: 'active',
        currentVersion,
        publishesTodayWorkout: false,
      }),
      updateMany,
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'prescription-1',
        contractId: 'contract-a',
        alunoId: 'aluno-1',
        capacity: 'resisted',
        status: 'active',
        currentVersion: currentVersion + 1,
        publishesTodayWorkout: false,
      }),
    },
    capacityPrescriptionVersion: {
      findFirst: jest.fn().mockResolvedValue(previous),
      create: versionCreate,
    },
    capacityTechnicalCatalogItem: {
      findMany: jest.fn().mockResolvedValue(
        (input?.technicalIdsFound ?? ['technical-squat']).map((id) => ({ id }))
      ),
    },
  };
  const client = {
    $transaction: jest.fn(async (operation: (tx: typeof transactionClient) => unknown) =>
      operation(transactionClient)
    ),
  };
  return { client, transactionClient, updateMany, versionCreate, previous };
}

describe('resisted technical exercise versioning', () => {
  it('overlays technical ids on a parameter-set snapshot without converting it to manual parameters', async () => {
    const { client, versionCreate, previous } = mockedVersionClient();
    const previousSnapshot = JSON.parse(JSON.stringify(previous.parameters));
    const service = createCapacityResistedTechnicalExerciseVersionService(client as never);

    const saved = await service.versionTechnicalExercises(
      context,
      'prescription-1',
      1,
      ['technical-squat'],
      new Date('2026-08-12T11:30:00.000Z')
    );

    expect(versionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 2,
          methodologyVersion: 'method-v1',
          parameterSetIds: ['set-resisted-v1'],
          publishesTodayWorkout: false,
          parameters: {
            type: 'resisted',
            resisted: {
              method: 'adaptacao_anatomica',
              split: 'full_body',
              sets: 3,
              repetitions: '8-12',
              exerciseTechnicalCatalogItemIds: ['technical-squat'],
            },
          },
          sources: {
            create: [
              expect.objectContaining({ sourceType: 'professor_note', sourceId: 'note-1' }),
            ],
          },
          goals: { create: [{ goalId: 'goal-1' }] },
        }),
      })
    );
    expect(previous.parameters).toEqual(previousSnapshot);
    expect(saved).toMatchObject({
      currentVersion: 2,
      publishesTodayWorkout: false,
      latestVersion: {
        version: 2,
        methodologyVersion: 'method-v1',
        parameterSetIds: ['set-resisted-v1'],
      },
    });
  });

  it('keeps the public save guard that rejects mixed parameter-set and manual payloads', async () => {
    const publicClient = {
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
      capacityPrescriptionParameterSet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'set-resisted-v1',
            contractId: 'contract-a',
            capacity: 'resisted',
            methodologyVersion: 'method-v1',
            parameters: {
              type: 'resisted',
              resisted: { method: 'adaptacao_anatomica', sets: 3 },
            },
          },
        ]),
      },
    };
    const publicService = createCapacityPrescriptionService(publicClient as never);

    await expect(
      publicService.saveVersion(context, {
        capacity: 'resisted',
        expectedCurrentVersion: 1,
        sourceRefs: [
          { type: 'professor_note', id: 'note-1', label: 'Nota técnica', origin: 'manual' },
        ],
        technicalJustification: 'Prescrição resistida.',
        professorSummary: 'Manter progressão.',
        parameterSetIds: ['set-resisted-v1'],
        methodologyVersion: 'method-v1',
        parameters: {
          type: 'resisted',
          resisted: { exerciseTechnicalCatalogItemIds: ['technical-squat'] },
        },
      })
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Conjunto versionado e parâmetros manuais não podem ser enviados na mesma versão',
    });
  });

  it('rejects a stale expected version before creating a new immutable version', async () => {
    const { client, transactionClient, updateMany, versionCreate } = mockedVersionClient({
      currentVersion: 2,
    });
    const service = createCapacityResistedTechnicalExerciseVersionService(client as never);

    await expect(
      service.versionTechnicalExercises(context, 'prescription-1', 1, ['technical-squat'])
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('recarregue'),
    });
    expect(transactionClient.capacityPrescriptionVersion.findFirst).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(versionCreate).not.toHaveBeenCalled();
  });

  it('rejects a technical exercise outside the contract before mutating the prescription root', async () => {
    const { client, updateMany, versionCreate } = mockedVersionClient({ technicalIdsFound: [] });
    const service = createCapacityResistedTechnicalExerciseVersionService(client as never);

    await expect(
      service.versionTechnicalExercises(context, 'prescription-1', 1, [
        'technical-from-contract-b',
      ])
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Uma ou mais referências técnicas de exercícios são inválidas para este contrato',
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(versionCreate).not.toHaveBeenCalled();
  });

  it('keeps domain errors typed for route-level conflict handling', () => {
    expect(new CapacityPrescriptionDomainError('CONFLICT', 'x')).toBeInstanceOf(
      CapacityPrescriptionDomainError
    );
  });
});
