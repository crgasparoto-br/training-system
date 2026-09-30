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

  it('não usa releasedAt como autoridade de visibilidade', async () => {
    await service.listReleasedForStudent('aluno-1', 'contract-1');

    const call = findMany.mock.calls[0][0];
    expect(call.where.released).toBe(true);
    expect(call.where.releasedAt).toBeUndefined();
  });
});
