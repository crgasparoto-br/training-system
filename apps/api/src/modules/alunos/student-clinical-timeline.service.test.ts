const mockPrntHistory = jest.fn();
const mockIntakeHistory = jest.fn();
const mockParq = jest.fn();
const mockLifecycle = jest.fn();
const mockAdipometry = jest.fn();

jest.mock('../../common/prisma-runtime-client.js', () => ({
  prismaRuntimeClient: {
    prontuarioHistoryEvent: { findMany: mockPrntHistory },
    studentHealthIntakeRevision: { findMany: mockIntakeHistory },
    studentParqSubmission: { findMany: mockParq },
    studentLifecycleEvent: { findMany: mockLifecycle },
    adipometryAssessment: { findMany: mockAdipometry },
  },
}));

import { readClinicalTimeline, type TimelineClinicalAccess } from './student-clinical-timeline.service.js';

const denied: TimelineClinicalAccess = {
  prnt: {}, intake: false, parq: false, anthropometry: false, adipometry: false,
};
const at = new Date('2026-10-13T12:00:00.000Z');

describe('canonical clinical timeline (#385)', () => {
  beforeEach(() => {
    for (const mock of [mockPrntHistory, mockIntakeHistory, mockParq, mockLifecycle, mockAdipometry]) {
      mock.mockReset().mockResolvedValue([]);
    }
  });

  it('never touches denied clinical tables even when Audit is available', async () => {
    const result = await readClinicalTimeline('aluno-a', 'contract-a', denied, 10);
    expect(result).toEqual({ items: [], unavailableDomains: [] });
    for (const mock of [mockPrntHistory, mockIntakeHistory, mockParq, mockLifecycle, mockAdipometry]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it('filters PRNT entity types by individual permission and tenant; never projects snapshots', async () => {
    mockPrntHistory.mockResolvedValue([{
      id: 'revision-1', contractId: 'contract-a', recordId: 'record-a',
      entityType: 'goal', entityId: 'goal-a', version: 2, action: 'updated',
      actorUserId: 'professor-user', source: 'prnt-api', createdAt: at,
      snapshot: { privateMedication: 'never exposed' },
    }]);
    const result = await readClinicalTimeline('aluno-a', 'contract-a', {
      ...denied, prnt: { goal: true },
    }, 10);
    expect(mockPrntHistory).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        alunoId: 'aluno-a', contractId: 'contract-a', entityType: { in: ['goal'] },
      }),
      select: expect.not.objectContaining({ snapshot: true }),
    }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(expect.objectContaining({
      id: 'clinical-prnt-revision-1', type: 'prnt_goal_updated',
      sourceType: 'prontuario-history-event', sourceId: 'revision-1',
      contractId: 'contract-a', actorUserId: 'professor-user',
      metadata: expect.objectContaining({ recordId: 'record-a', version: 2 }),
    }));
    expect(JSON.stringify(result)).not.toContain('privateMedication');
    expect(mockParq).not.toHaveBeenCalled();
    expect(mockIntakeHistory).not.toHaveBeenCalled();
  });

  it('keeps corrected ADPT revisions instead of replacing original completion', async () => {
    mockAdipometry.mockResolvedValue([
      { id: 'revision-2', contractId: 'contract-a', code: 'ADPT-01', rootAssessmentId: 'root-1',
        revisionNumber: 2, correctsAssessmentId: 'revision-1', correctionAuthorUserId: 'user-2', completedAt: at },
      { id: 'revision-1', contractId: 'contract-a', code: 'ADPT-01', rootAssessmentId: 'root-1',
        revisionNumber: 1, correctsAssessmentId: null, correctionAuthorUserId: null, completedAt: at },
    ]);
    const result = await readClinicalTimeline('aluno-a', 'contract-a',
      { ...denied, adipometry: true }, 10);
    expect(mockAdipometry).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        contractId: 'contract-a', alunoId: 'aluno-a',
        status: 'COMPLETED', revisionStatus: 'FINALIZED', completedAt: { not: null },
      }),
    }));
    expect(result.items.map((event) => event.type)).toEqual([
      'adipometry_corrected', 'adipometry_completed',
    ]);
    expect(result.items[0].metadata).toEqual(expect.objectContaining({
      revisionNumber: 2, correctsAssessmentId: 'revision-1',
    }));
  });

  it('uses existing immutable anthropometry lifecycle events, without reproducing measures', async () => {
    mockLifecycle.mockResolvedValue([{
      id: 'anth-evt', contractId: 'contract-a', actorUserId: 'user-c',
      createdAt: at, metadata: { domain: 'anthropometry', action: 'corrected',
        assessmentId: 'anth-a', assessmentCode: 'ANTR-1', correctionId: 'fix-a' },
    }, {
      id: 'malformed', contractId: 'contract-a', actorUserId: null, createdAt: at,
      metadata: { domain: 'anthropometry', action: 'unknown', assessmentId: 'anth-x' },
    }]);
    const result = await readClinicalTimeline('aluno-a', 'contract-a',
      { ...denied, anthropometry: true }, 10);
    expect(mockLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ contractId: 'contract-a', alunoId: 'aluno-a',
        metadata: { path: ['domain'], equals: 'anthropometry' } }),
    }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(expect.objectContaining({
      type: 'anthropometry_corrected',
      sourceType: 'anthropometry-correction', sourceId: 'fix-a',
      metadata: expect.objectContaining({ assessmentId: 'anth-a' }),
    }));
  });

  it('keeps available domains and reports a localized source failure', async () => {
    mockPrntHistory.mockRejectedValue(new Error('internal DB error with private data'));
    mockParq.mockResolvedValue([{
      id: 'parq-1', contractId: 'contract-a', submittedAt: at,
      submittedByUserId: 'student-a', catalogVersion: '2',
      responses: { restricted: true },
    }]);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await readClinicalTimeline('aluno-a', 'contract-a', {
        ...denied, prnt: { goal: true }, parq: true,
      }, 10);
      expect(result.unavailableDomains).toEqual(['PRNT']);
      expect(result.items.map((item) => item.type)).toEqual(['prnt_parq_submitted']);
      expect(JSON.stringify(result)).not.toContain('restricted');
      expect(JSON.stringify(result)).not.toContain('internal DB error');
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('deduplicates projections by canonical origin and constrains same-instant cursors', async () => {
    const revision = { id: 'revision-0', contractId: 'contract-a', recordId: 'record-a',
      entityType: 'goal', entityId: 'goal-1', version: 1, action: 'created',
      actorUserId: null, source: 'prnt-api', createdAt: at };
    mockPrntHistory.mockResolvedValue([revision, revision]);
    const result = await readClinicalTimeline('aluno-a', 'contract-a', {
      ...denied, prnt: { goal: true },
    }, 10, { kind: 'clinical', at: at.toISOString(), id: 'clinical-prnt-revision-1' });
    expect(result.items).toHaveLength(1);
    expect(mockPrntHistory).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: 'revision-1' } }],
      }),
    }));
  });
});
