import type { Prisma } from '@prisma/client';
import { assertApprovedWorkoutExerciseIds, assertDayContract } from '../src/modules/workout/workout-planning.helpers';

describe('#394 RISK-394-001: atomic catalog eligibility', () => {
  const mockTransaction = (ids: string[] = []) => {
    const queryRaw = jest.fn().mockResolvedValue(ids.map(id => ({ id })));
    const dayFindFirst = jest.fn().mockResolvedValue({ id: 'day-1' });
    const tx = { $queryRaw: queryRaw, workoutDay: { findFirst: dayFindFirst } } as unknown as Prisma.TransactionClient;
    return { tx, queryRaw, dayFindFirst };
  };

  it('locks the approved catalog in stable order and refuses a mixed approved/unapproved set', async () => {
    const { tx, queryRaw } = mockTransaction(['approved-1']);
    await expect(assertApprovedWorkoutExerciseIds(tx, ['approved-1', 'unapproved-2'], 'tenant-394'))
      .rejects.toThrow('Exercício indisponível para aplicação.');
    const sql = queryRaw.mock.calls[0][0];
    expect(sql.sql).toMatch(/ORDER BY "id" FOR SHARE/);
    expect(sql.sql).toMatch(/"curationStatus" = 'approved'/);
    expect(sql.sql).toMatch(/"legacyGrandfathered" = FALSE/);
    expect(sql.values).toEqual(expect.arrayContaining(['approved-1', 'unapproved-2', 'tenant-394']));
  });

  it('accepts the whole eligible set in the right tenant while removing duplicate IDs', async () => {
    const { tx, queryRaw } = mockTransaction(['approved-1']);
    await expect(assertApprovedWorkoutExerciseIds(tx, ['approved-1', 'approved-1'], 'tenant-394'))
      .resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0][0].values).toEqual(['approved-1', 'tenant-394']);
  });

  it('also locks a direct workout-day addition after confirming day ownership', async () => {
    const { tx, queryRaw, dayFindFirst } = mockTransaction(['approved-1']);
    await assertDayContract(tx, 'day-1', 'tenant-394', 'approved-1');
    expect(dayFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'day-1', template: { plan: { aluno: { contractId: 'tenant-394' } } } },
    }));
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0][0].sql).toMatch(/FOR SHARE/);
  });

  it('denies a deactivated, grandfathered or out-of-tenant ID without writing', async () => {
    const { tx, dayFindFirst } = mockTransaction([]);
    await expect(assertDayContract(tx, 'day-1', 'tenant-394', 'unapproved'))
      .rejects.toThrow('Exercício indisponível para aplicação.');
    expect(dayFindFirst).toHaveBeenCalledTimes(1);
  });
});
