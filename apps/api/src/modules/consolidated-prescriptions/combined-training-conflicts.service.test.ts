import { createCombinedConflictSourceService, CombinedConflictSourceError } from './combined-training-conflicts.service.js';

const makeDb = () => {
  const aluno = { findFirst: jest.fn().mockResolvedValue({ id: 'student' }) };
  const workoutDay = { findMany: jest.fn().mockResolvedValue([{
    id: 'day', templateId: 'template', workoutDate: new Date('2026-11-05T00:00:00.000Z'),
    execution: { originReleaseId: 'release' },
  }]) };
  const $queryRaw = jest.fn()
    .mockResolvedValueOnce([{ id: 'release', workoutTemplateId: 'template', releasedAssemblyVersion: 1 }])
    .mockResolvedValueOnce([{ workoutDayId: 'day', capacity: 'cyclic' }, { workoutDayId: 'day', capacity: 'resisted' }]);
  const preWorkoutCheckIn = { findMany: jest.fn().mockResolvedValue([{
    id: 'check', workoutDayId: 'day', updatedAt: new Date('2026-11-05T10:00:00.000Z'),
    painLevel: 4, psr: 5, fatigue: null, sleepQuality: null,
  }]) };
  const postWorkoutFeedbackRevision = { findMany: jest.fn().mockResolvedValue([{
    id: 'fb-2', workoutDayId: 'day', scopeKey: 'capacity:cyclic', capacity: 'cyclic',
    revisionNumber: 2, values: { painAfter: 5, dizziness: true }, originReleaseId: 'release',
  }, {
    id: 'fb-1', workoutDayId: 'day', scopeKey: 'capacity:cyclic', capacity: 'cyclic',
    revisionNumber: 1, values: { painAfter: 3 }, originReleaseId: 'release',
  }]) };
  return { aluno, workoutDay, $queryRaw, preWorkoutCheckIn, postWorkoutFeedbackRevision };
};
const args = {
  alunoId: 'student', contractId: 'tenant',
  start: '2026-11-01T00:00:00.000Z', end: '2026-11-10T00:00:00.000Z',
};
const subject = (db: ReturnType<typeof makeDb>) => createCombinedConflictSourceService(db as never);

describe('#403 stage 2: canonical scoped conflict inputs', () => {
  it('reads tenant-scoped released data and newest structured feedback only', async () => {
    const db = makeDb();
    const result = await subject(db).getReport(args);
    expect(result).toMatchObject({ state: 'no_active_rules',
      evaluations: [], changesWorkoutAutomatically: false, coverage: 'partial',
      releasedSessionCount: 1, observationCount: 2 });
    expect(db.aluno.findFirst).toHaveBeenCalledWith({
      where: { id: 'student', contractId: 'tenant' }, select: { id: true },
    });
    expect(db.workoutDay.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        template: { released: true, plan: { alunoId: 'student', aluno: { contractId: 'tenant' } } },
      }),
    }));
    expect(db.postWorkoutFeedbackRevision.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workoutDayId: { in: ['day'] }, alunoId: 'student', contractId: 'tenant' },
    }));
    const cyclic = result!.observations.find((row) => row.capacity === 'cyclic')!;
    const resisted = result!.observations.find((row) => row.capacity === 'resisted')!;
    expect(cyclic.numeric?.painLevel).toMatchObject({
      value: 5, source: { kind: 'feedback', recordId: 'fb-2', version: '2' },
    });
    expect(cyclic.flags?.dizziness?.value).toBe(true);
    expect(resisted.numeric).toEqual({});
  });

  it('rejects student of another contract before reading any training data', async () => {
    const db = makeDb();
    db.aluno.findFirst.mockResolvedValue(null);
    expect(await subject(db).getReport(args)).toBeNull();
    expect(db.workoutDay.findMany).not.toHaveBeenCalled();
  });

  it('never includes a released Builder template without the consolidated release', async () => {
    const db = makeDb();
    db.$queryRaw.mockReset().mockResolvedValue([]);
    const result = await subject(db).getReport(args);
    expect(result!.releasedSessionCount).toBe(0);
    expect(result!.observations).toEqual([]);
    expect(db.preWorkoutCheckIn.findMany).not.toHaveBeenCalled();
    expect(db.postWorkoutFeedbackRevision.findMany).not.toHaveBeenCalled();
  });

  it('does not use feedback from an unrelated release', async () => {
    const db = makeDb();
    db.postWorkoutFeedbackRevision.findMany.mockResolvedValue([{
      id: 'wrong', workoutDayId: 'day', scopeKey: 'capacity:cyclic', capacity: 'cyclic',
      revisionNumber: 3, values: { painAfter: 10 }, originReleaseId: 'foreign',
    }]);
    const result = await subject(db).getReport(args);
    expect(result!.observations[0].numeric?.painLevel).toMatchObject({
      value: 4, source: { kind: 'check_in', recordId: 'check' },
    });
  });

  it('re-evaluates revised feedback from the source on every GET', async () => {
    const db = makeDb();
    const old = await subject(db).getReport(args);
    db.$queryRaw.mockReset()
      .mockResolvedValueOnce([{ id: 'release', workoutTemplateId: 'template', releasedAssemblyVersion: 1 }])
      .mockResolvedValueOnce([{ workoutDayId: 'day', capacity: 'cyclic' }]);
    db.postWorkoutFeedbackRevision.findMany.mockResolvedValue([{
      id: 'fb-3', workoutDayId: 'day', scopeKey: 'capacity:cyclic', capacity: 'cyclic',
      revisionNumber: 3, values: { painAfter: 7 }, originReleaseId: 'release',
    }]);
    const next = await subject(db).getReport(args);
    expect(old!.observations[0].numeric?.painLevel?.value).toBe(5);
    expect(next!.observations[0].numeric?.painLevel?.value).toBe(7);
    expect(db.workoutDay.findMany).toHaveBeenCalledTimes(2);
  });

  it('rejects noncanonical and overlong periods before querying', async () => {
    const db = makeDb();
    await expect(subject(db).getReport({ ...args, end: 'invalid' })).rejects.toThrow(CombinedConflictSourceError);
    await expect(subject(db).getReport({ ...args, end: '2027-01-01T00:00:00.000Z' })).rejects.toThrow('31 dias');
    expect(db.aluno.findFirst).not.toHaveBeenCalled();
  });

  it('fails explicitly rather than silently truncating a large period', async () => {
    const db = makeDb();
    db.workoutDay.findMany.mockResolvedValue(Array.from({ length: 201 }, (_, i) => ({
      id: 'd' + i, templateId: 'template', workoutDate: new Date('2026-11-05T00:00:00.000Z'), execution: null,
    })));
    await expect(subject(db).getReport(args)).rejects.toThrow('excesso');
  });
});
