import { createCombinedConflictSourceService, CombinedConflictSourceError } from './combined-training-conflicts.service.js';

const released = {
  id: 'release', workoutTemplateId: 'template', trainingPlanId: 'plan',
  releasedAssemblyVersionId: 'released-version', releasedAssemblyVersion: 2,
};
const snapshot = (capacity: string) => ({
  assemblyVersionId: 'released-version', capacity,
  capacityPrescriptionVersionId: 'prescription-' + capacity, capacityVersion: 3,
});
const check = {
  id: 'check', workoutDayId: 'day', updatedAt: new Date('2026-11-05T10:00:00.000Z'),
  painLevel: 4, psr: 5, fatigue: null, sleepQuality: null,
};
const feedback = (overrides: Record<string, unknown> = {}) => ({
  id: 'fb-2', workoutDayId: 'day', scopeKey: 'capacity:cyclic', capacity: 'cyclic',
  revisionNumber: 2, values: { painAfter: 5, dizziness: true },
  executionId: 'execution', originReleaseId: 'release',
  originWorkoutTemplateId: 'template', originTrainingPlanId: 'plan',
  ...overrides,
});
const makeDb = () => {
  const aluno = { findFirst: jest.fn().mockResolvedValue({ id: 'student' }) };
  const workoutDay = { findMany: jest.fn().mockResolvedValue([{
    id: 'day', templateId: 'template', workoutDate: new Date('2026-11-05T00:00:00.000Z'),
    method: 'continuous', vo2maxPct: null, stimulusDurationMin: 30, cyclicTimeMin: null,
    resistanceTimeMin: null, cyclicStages: [], exercises: [{ id: 'exercise' }],
    resistanceGroups: [],
    execution: { id: 'execution', originReleaseId: 'release' },
  }]) };
  const $queryRaw = jest.fn()
    .mockResolvedValueOnce([released])
    .mockResolvedValueOnce([
      { id: 'flex-block', workoutDayId: 'day', capacity: 'flexibility', capacityPrescriptionVersionId: 'prescription-flexibility' },
      { id: 'balance-block', workoutDayId: 'day', capacity: 'balance', capacityPrescriptionVersionId: 'prescription-balance' },
    ]);
  const consolidatedPrescriptionCapacityBlock = {
    findMany: jest.fn().mockResolvedValue([
      snapshot('cyclic'), snapshot('resisted'), snapshot('flexibility'), snapshot('balance'),
    ]),
  };
  const preWorkoutCheckIn = { findMany: jest.fn().mockResolvedValue([check]) };
  const postWorkoutFeedbackRevision = { findMany: jest.fn().mockResolvedValue([
    feedback(), feedback({ id: 'fb-1', revisionNumber: 1, values: { painAfter: 3 } }),
  ]) };
  return {
    aluno, workoutDay, $queryRaw, consolidatedPrescriptionCapacityBlock,
    preWorkoutCheckIn, postWorkoutFeedbackRevision,
  };
};
const args = {
  alunoId: 'student', contractId: 'tenant',
  start: '2026-11-01T00:00:00.000Z', end: '2026-11-10T00:00:00.000Z',
};
const subject = (db: ReturnType<typeof makeDb>) => createCombinedConflictSourceService(db as never);

describe('#403 canonical conflict input remediation A-001..003', () => {
  it('uses the real four-capacity source split and preserves release and prescription provenance', async () => {
    const db = makeDb();
    const result = await subject(db).getReport(args);
    expect(result).toMatchObject({
      state: 'no_active_rules', evaluations: [], changesWorkoutAutomatically: false,
      coverage: 'partial', releasedSessionCount: 1, observationCount: 4,
    });
    expect(db.aluno.findFirst).toHaveBeenCalledWith({
      where: { id: 'student', contractId: 'tenant' }, select: { id: true },
    });
    expect(db.workoutDay.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        template: { released: true, plan: { alunoId: 'student', aluno: { contractId: 'tenant' } } },
      }),
      select: expect.objectContaining({
        method: true, stimulusDurationMin: true,
        exercises: expect.any(Object), cyclicStages: expect.any(Object),
      }),
    }));
    expect(db.consolidatedPrescriptionCapacityBlock.findMany).toHaveBeenCalledWith({
      where: { assemblyVersionId: { in: ['released-version'] }, alunoId: 'student', contractId: 'tenant' },
      select: {
        assemblyVersionId: true, capacity: true,
        capacityPrescriptionVersionId: true, capacityVersion: true,
      },
    });
    const byCapacity = new Map(result!.observations.map((row) => [row.capacity, row]));
    expect([...byCapacity.keys()]).toEqual(['balance', 'cyclic', 'flexibility', 'resisted']);
    expect(byCapacity.get('cyclic')).toMatchObject({
      numeric: { painLevel: { value: 5, source: { kind: 'feedback', recordId: 'fb-2', version: '2' } } },
      provenance: {
        release: { recordId: 'release', version: '2', assemblyVersionId: 'released-version' },
        capacityPrescription: { recordId: 'prescription-cyclic', version: '3' },
        operational: { kind: 'workout_day', recordId: 'day' },
      },
    });
    expect(byCapacity.get('resisted')).toMatchObject({
      provenance: {
        capacityPrescription: { recordId: 'prescription-resisted', version: '3' },
        operational: { kind: 'workout_exercise', recordId: 'exercise' },
      },
      numeric: {},
    });
    expect(byCapacity.get('flexibility')!.numeric).toEqual({});
    expect(byCapacity.get('balance')).toMatchObject({
      provenance: { operational: { kind: 'workout_capacity_block', recordId: 'balance-block' } },
    });
    expect(result!.sessionSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scopeKey: 'session', source: { kind: 'check_in', recordId: 'check', version: check.updatedAt.toISOString() },
      }),
    ]));
  });

  it('does not infer cyclic or resisted from text, or fabricate missing operational capacity', async () => {
    const db = makeDb();
    db.workoutDay.findMany.mockResolvedValue([{
      id: 'day', templateId: 'template', workoutDate: new Date('2026-11-05T00:00:00.000Z'),
      method: null, vo2maxPct: null, stimulusDurationMin: null, cyclicTimeMin: null,
      resistanceTimeMin: null, cyclicStages: [], exercises: [], resistanceGroups: [],
      detailNotes: 'longão, treino pesado', execution: null,
    }]);
    const result = await subject(db).getReport(args);
    expect(result!.observations.map((row) => row.capacity)).toEqual(['balance', 'flexibility']);
    expect(result!.observations.every((row) => Object.keys(row.flags ?? {}).length === 0)).toBe(true);
  });

  it('keeps the latest session-level feedback separate from capacity signals', async () => {
    const db = makeDb();
    db.postWorkoutFeedbackRevision.findMany.mockResolvedValue([
      feedback({
        id: 'session-3', scopeKey: 'session', capacity: null, revisionNumber: 3,
        values: { painAfter: 8, dizziness: true, fatigueLevel: 'high', sleepQuality: 'poor' },
      }),
      feedback({
        id: 'session-2', scopeKey: 'session', capacity: null, revisionNumber: 2,
        values: { painAfter: 1, dizziness: false },
      }),
      feedback(),
    ]);
    const result = await subject(db).getReport(args);
    expect(result!.sessionSignalCount).toBe(2);
    expect(result!.sessionSignals.find((signal) => signal.source.kind === 'feedback')).toMatchObject({
      source: { kind: 'feedback', recordId: 'session-3', version: '3' },
      numeric: { painLevel: { value: 8 } },
      flags: { dizziness: { value: true } },
      categorical: { fatigueLevel: { value: 'high' }, sleepQuality: { value: 'poor' } },
      release: { recordId: 'release', version: '2' },
    });
    expect(result!.observations.find((row) => row.capacity === 'resisted')!.numeric).toEqual({});
    expect(result!.observations.find((row) => row.capacity === 'cyclic')!.numeric?.painLevel?.value).toBe(5);
    expect(JSON.stringify(result)).not.toContain('session-2');
  });

  it('does not consume feedback from a foreign release, execution or training plan', async () => {
    for (const override of [
      { originReleaseId: 'foreign' },
      { executionId: 'another-execution' },
      { originWorkoutTemplateId: 'foreign-template' },
      { originTrainingPlanId: 'foreign-plan' },
    ]) {
      const db = makeDb();
      db.postWorkoutFeedbackRevision.findMany.mockResolvedValue([feedback(override)]);
      const result = await subject(db).getReport(args);
      expect(result!.observations.find((row) => row.capacity === 'cyclic')!.numeric?.painLevel).toMatchObject({
        value: 4, source: { kind: 'check_in', recordId: 'check' },
      });
      expect(result!.sessionSignalCount).toBe(1);
    }
  });

  it('re-reads changed feedback revisions from canonical storage on every GET', async () => {
    const db = makeDb();
    const old = await subject(db).getReport(args);
    db.$queryRaw.mockReset().mockResolvedValueOnce([released]).mockResolvedValueOnce([
      { id: 'flex-block', workoutDayId: 'day', capacity: 'flexibility', capacityPrescriptionVersionId: 'prescription-flexibility' },
      { id: 'balance-block', workoutDayId: 'day', capacity: 'balance', capacityPrescriptionVersionId: 'prescription-balance' },
    ]);
    db.postWorkoutFeedbackRevision.findMany.mockResolvedValue([feedback({
      id: 'fb-3', revisionNumber: 3, values: { painAfter: 7, dizziness: false },
    })]);
    const next = await subject(db).getReport(args);
    expect(old!.observations.find((row) => row.capacity === 'cyclic')!.numeric?.painLevel?.value).toBe(5);
    expect(next!.observations.find((row) => row.capacity === 'cyclic')!.numeric?.painLevel?.value).toBe(7);
    expect(db.workoutDay.findMany).toHaveBeenCalledTimes(2);
  });

  it('uses deterministic, accurately typed operational origins across alternative structures', async () => {
    const db = makeDb();
    db.workoutDay.findMany.mockResolvedValue([{
      id: 'day', templateId: 'template', workoutDate: new Date('2026-11-05T00:00:00.000Z'),
      method: null, vo2maxPct: null, stimulusDurationMin: null, cyclicTimeMin: null,
      resistanceTimeMin: null, cyclicStages: [{ id: 'stage' }], exercises: [],
      resistanceGroups: [{ id: 'group' }], execution: null,
    }]);
    const result = await subject(db).getReport(args);
    expect(result!.observations.find((row) => row.capacity === 'cyclic')!.provenance.operational)
      .toEqual({ kind: 'workout_cyclic_stage', recordId: 'stage' });
    expect(result!.observations.find((row) => row.capacity === 'resisted')!.provenance.operational)
      .toEqual({ kind: 'workout_resistance_group', recordId: 'group' });
    expect(db.workoutDay.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        cyclicStages: expect.objectContaining({ orderBy: expect.any(Array) }),
        exercises: expect.objectContaining({ orderBy: expect.any(Array) }),
        resistanceGroups: expect.objectContaining({ orderBy: expect.any(Array) }),
      }),
    }));
  });

  it('retains canonically accepted nonnegative check-in pain without inventing severity', async () => {
    const db = makeDb();
    db.preWorkoutCheckIn.findMany.mockResolvedValue([{ ...check, painLevel: 11 }]);
    const report = await subject(db).getReport(args);
    expect(report!.sessionSignals.find((row) => row.source.kind === 'check_in')!.numeric.painLevel?.value)
      .toBe(11);
    expect(report!.observations.find((row) => row.capacity === 'cyclic')!.numeric?.painLevel?.value)
      .toBe(5);
    expect(report!.evaluations).toEqual([]);
  });

  it('fails closed for a mismatched flex/balance version instead of mislabelling evidence', async () => {
    const db = makeDb();
    db.consolidatedPrescriptionCapacityBlock.findMany.mockResolvedValue([
      snapshot('cyclic'), snapshot('resisted'), snapshot('balance'),
      { ...snapshot('flexibility'), capacityPrescriptionVersionId: 'foreign-prescription' },
    ]);
    await expect(subject(db).getReport(args)).rejects.toThrow('diverge');
  });

  it('rejects foreign students before reading sessions', async () => {
    const db = makeDb();
    db.aluno.findFirst.mockResolvedValue(null);
    expect(await subject(db).getReport(args)).toBeNull();
    expect(db.workoutDay.findMany).not.toHaveBeenCalled();
    expect(db.consolidatedPrescriptionCapacityBlock.findMany).not.toHaveBeenCalled();
  });

  it('never counts a released builder template without a consolidated release', async () => {
    const db = makeDb();
    db.$queryRaw.mockReset().mockResolvedValue([]);
    const result = await subject(db).getReport(args);
    expect(result!.releasedSessionCount).toBe(0);
    expect(result!.observations).toEqual([]);
    expect(db.preWorkoutCheckIn.findMany).not.toHaveBeenCalled();
    expect(db.postWorkoutFeedbackRevision.findMany).not.toHaveBeenCalled();
  });

  it('rejects noncanonical and overlong periods before any database read', async () => {
    const db = makeDb();
    await expect(subject(db).getReport({ ...args, end: 'invalid' })).rejects.toThrow(CombinedConflictSourceError);
    await expect(subject(db).getReport({ ...args, end: '2027-01-01T00:00:00.000Z' })).rejects.toThrow('31 dias');
    expect(db.aluno.findFirst).not.toHaveBeenCalled();
  });

  it('fails instead of silently truncating the session window', async () => {
    const db = makeDb();
    db.workoutDay.findMany.mockResolvedValue(Array.from({ length: 201 }, (_, i) => ({
      id: 'd' + i, templateId: 'template', workoutDate: new Date('2026-11-05T00:00:00.000Z'),
      method: null, vo2maxPct: null, stimulusDurationMin: null, cyclicTimeMin: null,
      resistanceTimeMin: null, cyclicStages: [], exercises: [], resistanceGroups: [], execution: null,
    })));
    await expect(subject(db).getReport(args)).rejects.toThrow('excesso');
  });
});
