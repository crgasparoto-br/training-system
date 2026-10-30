import type { Prisma } from '@prisma/client';
import { persistWorkoutSessionValues, WorkoutSessionExecutionInputError } from './workout-session-execution-values.js';

type Draft = { id: string; plannedUnitId: string; plannedSetId: string | null; setNumber: number; completedAt: Date | null };
const planned = [
  { id: 'set-1', position: 1, block: { position: 1, workoutExerciseId: 'exercise-1' } },
  { id: 'set-2', position: 2, block: { position: 1, workoutExerciseId: 'exercise-1' } },
];
function fakeTransaction(existing: Draft[]) {
  const update = jest.fn(async (args: { where: { id: string }; data: { setNumber: number } }) => args);
  const upsert = jest.fn(async (args: unknown) => args);
  const client = {
    workoutExercise: { findMany: jest.fn(async () => [
      { id: 'exercise-1', _count: { resistanceBlocks: 1 } },
    ]) },
    workoutExercisePlannedSet: { findMany: jest.fn(async () => planned) },
    workoutSessionExecutionItem: {
      findMany: jest.fn(async () => existing),
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      update, upsert,
    },
  };
  return { tx: client as unknown as Prisma.TransactionClient, update, upsert };
}

describe('A-487-API-001: historic draft ordinal recovery', () => {
  it('relocates only collision-free drafts and preserves the actual input', async () => {
    const fixture = fakeTransaction([{
      id: 'historic-draft', plannedUnitId: 'exercise-1', plannedSetId: 'set-2',
      setNumber: 1, completedAt: null,
    }]);
    await persistWorkoutSessionValues(fixture.tx, 'execution-1', 'day-1', undefined, [{
      plannedUnitId: 'exercise-1', plannedSetId: 'set-1',
      setNumber: 1, loadKg: 32, repetitions: 9,
    }]);
    expect(fixture.update).toHaveBeenCalledTimes(1);
    expect(fixture.update).toHaveBeenCalledWith({
      where: { id: 'historic-draft' }, data: { setNumber: 2 },
    });
    expect(fixture.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ plannedSetId: 'set-1', setNumber: 1, loadKg: 32, repetitions: 9 }),
    }));
  });

  it('rejects an occupied destination without rewriting any draft', async () => {
    const fixture = fakeTransaction([
      { id: 'old-wrong', plannedUnitId: 'exercise-1', plannedSetId: 'set-2', setNumber: 1, completedAt: null },
      { id: 'occupied', plannedUnitId: 'exercise-1', plannedSetId: null, setNumber: 2, completedAt: null },
    ]);
    await expect(persistWorkoutSessionValues(fixture.tx, 'execution-1', 'day-1', undefined, [{
      plannedUnitId: 'exercise-1', plannedSetId: 'set-1', setNumber: 1, repetitions: 12,
    }])).rejects.toBeInstanceOf(WorkoutSessionExecutionInputError);
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it('rejects completed historic rows without changing them', async () => {
    const fixture = fakeTransaction([{
      id: 'old-completed', plannedUnitId: 'exercise-1',
      plannedSetId: 'set-2', setNumber: 1, completedAt: new Date(),
    }]);
    await expect(persistWorkoutSessionValues(fixture.tx, 'execution-1', 'day-1', undefined, [{
      plannedUnitId: 'exercise-1', plannedSetId: 'set-1', setNumber: 1, repetitions: 12,
    }])).rejects.toBeInstanceOf(WorkoutSessionExecutionInputError);
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.upsert).not.toHaveBeenCalled();
  });
});
