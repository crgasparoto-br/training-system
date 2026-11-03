import type { PrismaClient } from '@prisma/client';
import { createStudentWorkoutService } from '../src/modules/workout/student-workout.service.js';

describe('student released workout service', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const client = {
    workoutTemplate: {
      findMany,
      findFirst,
    },
  } as unknown as PrismaClient;
  const service = createStudentWorkoutService(client);

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([]);
    findFirst.mockResolvedValue(null);
  });

  it('lista apenas templates liberados do aluno e contrato autenticados em ordem determinística', async () => {
    await service.listReleasedForStudent('aluno-1', 'contract-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          released: true,
          plan: {
            alunoId: 'aluno-1',
            aluno: {
              contractId: 'contract-1',
            },
          },
        },
        orderBy: [{ weekStartDate: 'asc' }, { id: 'asc' }],
      })
    );
  });

  it('protege o detalhe com o mesmo filtro de liberação, aluno e contrato', async () => {
    await service.getReleasedForStudent('template-1', 'aluno-1', 'contract-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'template-1',
          released: true,
          plan: {
            alunoId: 'aluno-1',
            aluno: {
              contractId: 'contract-1',
            },
          },
        },
      })
    );
  });

  it('projects the immutable release name while hiding snapshot fields from the student', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'template-1',
      workoutDays: [{
        id: 'day-1',
        exercises: [
          { id: 'ex-a', exercise: { name: 'Novo nome do catálogo' },
            releasedCatalog: { catalog: { name: 'Nome prescrito na liberação' } } },
          { id: 'ex-b', exercise: { name: 'Registro antigo sem snapshot' }, releasedCatalog: null },
        ],
      }],
    });
    const released = await service.getReleasedForStudent('template-1', 'aluno-1', 'contract-1');
    expect(released?.workoutDays[0].exercises.map((exercise) => exercise.exercise.name))
      .toEqual(['Nome prescrito na liberação', 'Registro antigo sem snapshot']);
    expect(JSON.stringify(released)).not.toContain('releasedCatalog');
  });

  it('não usa releasedAt como autoridade de visibilidade', async () => {
    await service.listReleasedForStudent('aluno-1', 'contract-1');

    const call = findMany.mock.calls[0][0];
    expect(call.where.released).toBe(true);
    expect(call.where.releasedAt).toBeUndefined();
  });

  it('não expõe campos internos do Workout Builder no detalhe do aluno', async () => {
    await service.getReleasedForStudent('template-1', 'aluno-1', 'contract-1');

    const call = findFirst.mock.calls[0][0];
    const exerciseSelect = call.select.workoutDays.select.exercises.select;
    const daySelect = call.select.workoutDays.select;

    expect(exerciseSelect.exerciseOrder).toBeUndefined();
    expect(exerciseSelect.groupBreakBefore).toBeUndefined();
    expect(exerciseSelect.cParam).toBeUndefined();
    expect(exerciseSelect.eParam).toBeUndefined();
    expect(exerciseSelect.exerciseId).toBeUndefined();
    expect(exerciseSelect.exercise).toEqual({ select: { name: true } });
    expect(exerciseSelect.releasedCatalog).toEqual({ select: { catalog: true } });

    expect(daySelect.stimulusDurationMin).toBeUndefined();
    expect(daySelect.intensity1).toBeUndefined();
    expect(daySelect.intensity2).toBeUndefined();
    expect(daySelect.numSessions).toBeUndefined();
    expect(daySelect.numSets).toBeUndefined();
    expect(daySelect.sessionTime).toBeUndefined();
    expect(daySelect.cyclicTimeMin).toBeUndefined();
    expect(daySelect.resistanceTimeMin).toBeUndefined();
    expect(daySelect.paceMax).toBeUndefined();
    expect(daySelect.paceMin).toBeUndefined();
    expect(daySelect.startedAt).toBeUndefined();
    expect(daySelect.finishedAt).toBeUndefined();
  });
});
