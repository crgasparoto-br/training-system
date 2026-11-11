import type { Prisma } from '@prisma/client';
import { assertApprovedWorkoutExerciseIds, assertDayContract, assertTemplateReleaseCatalogEligibility } from '../src/modules/workout/workout-planning.helpers';

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

describe('#394 A-394-016: definitive legacy template release eligibility', () => {
  function transaction({
    approved = ['approved-1'],
    linked = ['approved-1'],
    owned = true,
  }: { approved?: string[]; linked?: string[]; owned?: boolean } = {}) {
    const findFirst = jest.fn().mockResolvedValue(owned
      ? { plan: { aluno: { contractId: 'tenant-394' } } }
      : null);
    const findMany = jest.fn().mockResolvedValue(linked.map(exerciseId => ({ exerciseId })));
    const queryRaw = jest.fn().mockResolvedValue(approved.map(id => ({ id })));
    const tx = {
      workoutTemplate: { findFirst },
      workoutExercise: { findMany },
      $queryRaw: queryRaw,
    } as unknown as Prisma.TransactionClient;
    return { tx, findFirst, findMany, queryRaw };
  }

  it('derives the tenant from the owned template and locks every live exercise', async () => {
    const { tx, findFirst, findMany, queryRaw } = transaction({
      linked: ['approved-1', 'approved-1'], approved: ['approved-1'],
    });
    await assertTemplateReleaseCatalogEligibility(tx, 'template-394', 'tenant-394');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'template-394', plan: { aluno: { contractId: 'tenant-394' } } },
      select: { plan: { select: { aluno: { select: { contractId: true } } } } },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { workoutDay: { templateId: 'template-394' } },
      select: { exerciseId: true },
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0][0].sql).toMatch(/ORDER BY "id" FOR SHARE/);
    expect(queryRaw.mock.calls[0][0].values).toEqual(['approved-1', 'tenant-394']);
  });

  it('rejects a mixed set containing any deactivated, draft or legacy link', async () => {
    const { tx, queryRaw } = transaction({
      linked: ['approved-1', 'unapproved-2'], approved: ['approved-1'],
    });
    await expect(assertTemplateReleaseCatalogEligibility(tx, 'template-394', 'tenant-394'))
      .rejects.toThrow('Exercício indisponível para aplicação.');
    expect(queryRaw.mock.calls[0][0].values)
      .toEqual(expect.arrayContaining(['unapproved-2', 'tenant-394']));
  });

  it('rejects foreign templates before reading or locking any linked exercise', async () => {
    const { tx, findMany, queryRaw } = transaction({ owned: false });
    await expect(assertTemplateReleaseCatalogEligibility(tx, 'foreign', 'tenant-394'))
      .rejects.toMatchObject({ code: 'RESISTANCE_DAY_NOT_FOUND' });
    expect(findMany).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('permits a cyclic-only template without catalog rows under the same ownership guard', async () => {
    const { tx, findFirst, queryRaw } = transaction({ linked: [], approved: [] });
    await expect(assertTemplateReleaseCatalogEligibility(tx, 'cyclic-template', 'tenant-394'))
      .resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
