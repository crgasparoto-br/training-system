import type { PrismaClient } from '@prisma/client';
import { createConsolidatedCombinedConflictService } from './consolidated-combined-conflicts.service.js';
import type { ConflictRule } from '../workout/combined-training-conflicts.domain.js';

const ctx = { contractId: 'contract-1', alunoId: 'student-1', actorProfessorId: 'coach-1' };
const week = '2026-11-02';
const readOptions = {
  date: week,
  includePreWorkoutCheckIn: true,
  includePostWorkoutFeedback: true,
};
const baseSession = () => ({
  id: 'day-1',
  templateId: 'template-1',
  workoutDate: new Date('2026-11-02T00:00:00.000Z'),
  cyclicTimeMin: 40,
  resistanceTimeMin: 25,
  exercises: [{ id: 'exercise-1' }],
  cyclicStages: [{ id: 'stage-1' }],
  execution: {
    id: 'execution-1',
    status: 'completed',
    originReleaseId: 'release-1',
    originWorkoutTemplateId: 'template-1',
    version: 2,
    startedAt: new Date('2026-11-02T09:00:00.000Z'),
  },
});
const baseCheckIn = (psr = 3) => ({
  id: 'checkin-1',
  workoutDayId: 'day-1',
  alunoId: ctx.alunoId,
  contractId: ctx.contractId,
  psr,
  fatigue: 6,
  sleepQuality: 2,
  painLevel: 4,
  updatedAt: new Date('2026-11-02T08:40:00.000Z'),
});
const baseFeedback = (revision = 2, dizziness = true) => ({
  id: 'feedback-' + revision,
  workoutDayId: 'day-1',
  alunoId: ctx.alunoId,
  contractId: ctx.contractId,
  executionId: 'execution-1',
  originReleaseId: 'release-1',
  scopeKey: 'capacity:cyclic',
  capacity: 'cyclic',
  revisionNumber: revision,
  values: { dizziness },
});

function fixture({
  sessions = [baseSession()],
  releases = [{
    id: 'release-1', assemblyId: 'assembly-1', contractId: ctx.contractId,
    alunoId: ctx.alunoId, workoutTemplateId: 'template-1', releasedAssemblyVersion: 2,
  }],
  blocks = [{
    workoutDayId: 'day-1', capacity: 'balance',
    capacityPrescriptionVersionId: 'capacity-v1', contractVersion: 1,
  }],
  checkIns = [baseCheckIn()],
  feedback = [baseFeedback(2), baseFeedback(1, false)],
  actorExists = true,
  currentVersion = 2,
} = {}) {
  const raw = jest.fn().mockImplementation(async (query: { strings?: string[] }) => {
    const sql = query.strings?.join('') ?? '';
    if (sql.includes('ConsolidatedPrescriptionOperationalRelease')) return releases;
    if (sql.includes('WorkoutDayCapacityOperationalBlock')) return blocks;
    throw new Error('SQL não esperado no teste');
  });
  const client = {
    aluno: { findFirst: jest.fn().mockResolvedValue(actorExists ? { id: ctx.alunoId } : null) },
    professor: { findFirst: jest.fn().mockResolvedValue(actorExists ? { id: ctx.actorProfessorId } : null) },
    consolidatedPrescription: {
      findFirst: jest.fn().mockResolvedValue({ id: 'assembly-1', currentVersion }),
    },
    consolidatedPrescriptionVersion: {
      findFirst: jest.fn().mockResolvedValue({
        capacityBlocks: [
          { capacity: 'cyclic', capacityVersion: 1, capacityPrescriptionVersionId: 'cyclic-v1' },
          { capacity: 'resisted', capacityVersion: 2, capacityPrescriptionVersionId: 'resisted-v2' },
          { capacity: 'flexibility', capacityVersion: 3, capacityPrescriptionVersionId: 'flex-v3' },
          { capacity: 'balance', capacityVersion: 4, capacityPrescriptionVersionId: 'balance-v4' },
        ],
      }),
    },
    workoutDay: { findMany: jest.fn().mockResolvedValue(sessions) },
    preWorkoutCheckIn: { findMany: jest.fn().mockResolvedValue(checkIns) },
    postWorkoutFeedbackRevision: { findMany: jest.fn().mockResolvedValue(feedback) },
    $queryRaw: raw,
    // No write-capable Prisma methods are supplied: any side-effect would throw.
  };
  return {
    client: client as unknown as PrismaClient,
    calls: client,
  };
}

const exampleRule = (): ConflictRule => ({
  code: 'TEST_ONLY_CYCLIC_PSR',
  version: 'test-1',
  sourceDocument: 'fixture-only',
  status: 'active',
  severity: 'warning',
  professorGuidance: 'Revisão profissional necessária.',
  approval: {
    professionalId: 'TEST-ONLY',
    credential: 'TEST-ONLY',
    approvedAt: '2026-11-01T12:00:00.000Z',
  },
  expression: {
    kind: 'single',
    term: {
      capacity: 'cyclic',
      conditions: [{ kind: 'numeric', metric: 'psr', op: 'lte', value: 4 }],
    },
  },
});

describe('#403 integration: canonical Montagem Consolidada read-only conflict review', () => {
  it('collects real released capacity/plan/execution/check-in/latest feedback provenance, without activating clinical rules', async () => {
    const db = fixture();
    const result = await createConsolidatedCombinedConflictService(db.client)
      .getWeeklyReview(ctx, 2, readOptions);
    expect(result).toMatchObject({
      protocolVersion: 'combined-conflict-v1',
      status: 'no_active_rules',
      riskConclusion: 'not_cleared',
      coverage: 'partial',
      week: { startDate: week, endDate: '2026-11-08' },
      sourceCounts: {
        releasedSessions: 1,
        capacityObservations: 3,
        executions: 3,
        checkIns: 3,
        feedbackRevisions: 1,
      },
      evaluations: [],
      changesWorkoutAutomatically: false,
    });
    expect(result.planningCapacities.map((x) => x.capacity)).toEqual([
      'cyclic', 'resisted', 'flexibility', 'balance',
    ]);
    expect(result.sourceSnapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sessionId: 'day-1', capacity: 'cyclic',
        release: { id: 'release-1', version: '2' },
        execution: { id: 'execution-1', version: '2' },
        feedback: { id: 'feedback-2', version: '2' },
      }),
      expect.objectContaining({
        sessionId: 'day-1', capacity: 'balance',
        capacityVersion: { id: 'capacity-v1', version: '1' },
      }),
    ]));
    const sqls = db.calls.$queryRaw.mock.calls.map(([q]) => q.strings.join(''));
    expect(sqls[0]).toContain('rel."contractId"');
    expect(sqls[0]).toContain('rel."assemblyId"');
    expect(sqls[1]).toContain('cpv."contractId"');
    expect(db.calls.workoutDay.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        templateId: { in: ['template-1'] },
        template: { released: true, plan: { alunoId: ctx.alunoId, aluno: { contractId: ctx.contractId } } },
      }),
    }));
  });

  it('does not even query clinical tables without the explicit per-block grants', async () => {
    const db = fixture();
    const result = await createConsolidatedCombinedConflictService(db.client)
      .getWeeklyReview(ctx, 2, {
        ...readOptions, includePreWorkoutCheckIn: false, includePostWorkoutFeedback: false,
      });
    expect(db.calls.preWorkoutCheckIn.findMany).not.toHaveBeenCalled();
    expect(db.calls.postWorkoutFeedbackRevision.findMany).not.toHaveBeenCalled();
    expect(result.unavailableReasons).toEqual(expect.arrayContaining([
      'check_in_access_not_granted', 'feedback_access_not_granted',
    ]));
    expect(result.sourceSnapshots.every((x) => !x.checkIn && !x.feedback)).toBe(true);
    expect(result.sourceCounts.checkIns).toBe(0);
    expect(result.sourceCounts.feedbackRevisions).toBe(0);
  });

  it('requires exact student, contract and assembly version before reading any releases', async () => {
    const wrongActor = fixture({ actorExists: false });
    await expect(createConsolidatedCombinedConflictService(wrongActor.client)
      .getWeeklyReview(ctx, 2, readOptions)).rejects.toThrow('Recurso não encontrado');
    expect(wrongActor.calls.$queryRaw).not.toHaveBeenCalled();

    const changed = fixture({ currentVersion: 3 });
    await expect(createConsolidatedCombinedConflictService(changed.client)
      .getWeeklyReview(ctx, 2, readOptions)).rejects.toThrow('montagem foi alterada');
    expect(changed.calls.$queryRaw).not.toHaveBeenCalled();
  });

  it('refuses foreign-tenant releases, check-ins and feedback even if a future adapter is wrong', async () => {
    const badRelease = fixture({ releases: [{
      id: 'release-1', assemblyId: 'assembly-1',
      contractId: 'tenant-B', alunoId: ctx.alunoId,
      workoutTemplateId: 'template-1', releasedAssemblyVersion: 2,
    }] });
    await expect(createConsolidatedCombinedConflictService(badRelease.client)
      .getWeeklyReview(ctx, 2, readOptions)).rejects.toThrow('fora do contrato');

    const badCheckIn = fixture({ checkIns: [{ ...baseCheckIn(), alunoId: 'foreign-student' }] });
    await expect(createConsolidatedCombinedConflictService(badCheckIn.client)
      .getWeeklyReview(ctx, 2, readOptions)).rejects.toThrow('Evidência clínica fora do contrato');

    const badFeedback = fixture({ feedback: [{ ...baseFeedback(), contractId: 'tenant-B' }] });
    await expect(createConsolidatedCombinedConflictService(badFeedback.client)
      .getWeeklyReview(ctx, 2, readOptions)).rejects.toThrow('Evidência clínica fora do contrato');
  });

  it('re-evaluates amended canonical check-in and latest feedback on every GET, with discriminate rule fixture', async () => {
    const db = fixture();
    const service = createConsolidatedCombinedConflictService(db.client, [exampleRule()]);
    const first = await service.getWeeklyReview(ctx, 2, readOptions);
    expect(first.evaluations[0]).toMatchObject({
      status: 'triggered', severity: 'warning',
      evidence: [expect.objectContaining({
        source: { kind: 'check_in', recordId: 'checkin-1', version: '2026-11-02T08:40:00.000Z' },
        value: 3,
      })],
    });
    db.calls.preWorkoutCheckIn.findMany.mockResolvedValue([{ ...baseCheckIn(7),
      updatedAt: new Date('2026-11-02T10:10:00.000Z') }]);
    db.calls.postWorkoutFeedbackRevision.findMany.mockResolvedValue([baseFeedback(3, false), baseFeedback(2, true)]);
    const revised = await service.getWeeklyReview(ctx, 2, readOptions);
    expect(revised.evaluations[0].status).toBe('not_triggered');
    expect(revised.sourceSnapshots.find((x) => x.capacity === 'cyclic')?.feedback)
      .toEqual({ id: 'feedback-3', version: '3' });
    expect(db.calls.preWorkoutCheckIn.findMany).toHaveBeenCalledTimes(2);
    expect(db.calls.postWorkoutFeedbackRevision.findMany).toHaveBeenCalledTimes(2);
  });

  it('does not fabricate missing release, capacity, timestamp or unscoped execution', async () => {
    const noRelease = fixture({ releases: [], sessions: [], blocks: [], checkIns: [], feedback: [] });
    const noData = await createConsolidatedCombinedConflictService(noRelease.client)
      .getWeeklyReview(ctx, 2, readOptions);
    expect(noData).toMatchObject({
      status: 'no_active_rules', riskConclusion: 'not_cleared',
      sourceCounts: { releasedSessions: 0, capacityObservations: 0 },
      evaluations: [],
    });
    expect(noData.unavailableReasons).toContain('no_canonical_release_for_week');

    const stale = fixture({ sessions: [{ ...baseSession(), execution: {
      ...baseSession().execution, originReleaseId: 'release-from-other-assembly',
    } }] });
    const result = await createConsolidatedCombinedConflictService(stale.client)
      .getWeeklyReview(ctx, 2, readOptions);
    expect(result.unavailableReasons).toContain('execution_origin_mismatch');
    expect(result.unavailableReasons).toContain('session_time_precision_date_only');
    expect(result.sourceSnapshots.every((x) => x.execution === null)).toBe(true);
    expect(result.sourceSnapshots.every((x) => x.feedback === null)).toBe(true);
  });

  it('enforces a civil date rather than interpreting free text or invalid dates', async () => {
    const db = fixture();
    const service = createConsolidatedCombinedConflictService(db.client);
    await expect(service.getWeeklyReview(ctx, 2, { ...readOptions, date: '2026-02-30' }))
      .rejects.toThrow('Data inválida');
    await expect(service.getWeeklyReview(ctx, 2, { ...readOptions, date: 'longão forte' }))
      .rejects.toThrow('Data inválida');
    expect(db.calls.$queryRaw).not.toHaveBeenCalled();
  });
});
