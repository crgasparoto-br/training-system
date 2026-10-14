const mockPrntHistory = jest.fn();
const mockIntakeHistory = jest.fn();
const mockParq = jest.fn();
const mockLifecycle = jest.fn();
const mockAdipometry = jest.fn();
const mockAdipometryAudit = jest.fn();

jest.mock('../../common/prisma-runtime-client.js', () => ({
  prismaRuntimeClient: {
    prontuarioHistoryEvent: { findMany: mockPrntHistory },
    studentHealthIntakeRevision: { findMany: mockIntakeHistory },
    studentParqSubmission: { findMany: mockParq },
    studentLifecycleEvent: { findMany: mockLifecycle },
    adipometryAssessment: { findMany: mockAdipometry },
    adipometryAuditEvent: { findMany: mockAdipometryAudit },
  },
}));

import { readClinicalTimeline, type TimelineClinicalAccess } from './student-clinical-timeline.service.js';

const denied: TimelineClinicalAccess = {
  prnt: {}, intake: false, parq: false, anthropometry: false, adipometry: false,
};
const at = new Date('2026-10-13T12:00:00.000Z');

describe('canonical clinical timeline (#385)', () => {
  beforeEach(() => {
    for (const mock of [mockPrntHistory, mockIntakeHistory, mockParq, mockLifecycle, mockAdipometry, mockAdipometryAudit]) {
      mock.mockReset().mockResolvedValue([]);
    }
  });

  it('never touches denied clinical tables even when Audit is available', async () => {
    const result = await readClinicalTimeline('aluno-a', 'contract-a', denied, 10);
    expect(result).toEqual({ items: [], unavailableDomains: [] });
    for (const mock of [mockPrntHistory, mockIntakeHistory, mockParq, mockLifecycle, mockAdipometry, mockAdipometryAudit]) {
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

  it('preserves a SUPERSEDED R1 and attributes each completion to its own finalizer', async () => {
    mockAdipometry.mockResolvedValue([
      { id: 'revision-2', contractId: 'contract-a', code: 'ADPT-01', rootAssessmentId: 'root-1',
        revisionNumber: 2, revisionStatus: 'FINALIZED', correctsAssessmentId: 'revision-1',
        correctionAuthorUserId: 'correction-creator', completedAt: at },
      { id: 'revision-1', contractId: 'contract-a', code: 'ADPT-01', rootAssessmentId: 'root-1',
        revisionNumber: 1, revisionStatus: 'SUPERSEDED', correctsAssessmentId: null,
        correctionAuthorUserId: null, completedAt: at },
    ]);
    mockAdipometryAudit.mockResolvedValue([
      { assessmentId: 'revision-1', action: 'COMPLETED', actorUserId: 'original-finalizer' },
      { assessmentId: 'revision-1', action: 'COMPLETED', actorUserId: 'incorrect-later-actor' },
      { assessmentId: 'revision-1', action: 'CORRECTION_FINALIZED', actorUserId: 'superseding-actor' },
      { assessmentId: 'revision-2', action: 'CORRECTION_FINALIZED', actorUserId: 'r2-finalizer' },
    ]);
    const result = await readClinicalTimeline('aluno-a', 'contract-a',
      { ...denied, adipometry: true }, 10);
    expect(mockAdipometry).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        contractId: 'contract-a', alunoId: 'aluno-a',
        status: 'COMPLETED', revisionStatus: { in: ['FINALIZED', 'SUPERSEDED'] },
        completedAt: { not: null },
      }),
    }));
    expect(mockAdipometryAudit).toHaveBeenCalledWith({
      where: { contractId: 'contract-a', assessmentId: { in: ['revision-2', 'revision-1'] },
        action: { in: ['COMPLETED', 'CORRECTION_FINALIZED'] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { assessmentId: true, action: true, actorUserId: true },
    });
    expect(result.items.map((item) => item.type)).toEqual([
      'adipometry_corrected', 'adipometry_completed',
    ]);
    expect(result.items.map((item) => item.actorUserId)).toEqual([
      'r2-finalizer', 'original-finalizer',
    ]);
    expect(result.items[1]).toEqual(expect.objectContaining({
      id: 'clinical-adipometry-revision-1',
      sourceId: 'revision-1', sourceType: 'adipometry-assessment',
      source: { type: 'professional', reference: 'revision-1', recordedByUserId: 'original-finalizer' },
    }));
    expect(result.items[0].metadata).toEqual(expect.objectContaining({
      revisionNumber: 2, correctsAssessmentId: 'revision-1',
    }));
    expect(JSON.stringify(result)).not.toContain('incorrect-later-actor');
    expect(JSON.stringify(result)).not.toContain('superseding-actor');
  });

  it('does not misattribute original completion when its historical audit actor is unavailable', async () => {
    mockAdipometry.mockResolvedValue([
      { id: 'revision-1', contractId: 'contract-a', code: 'ADPT-01', rootAssessmentId: 'root-1',
        revisionNumber: 1, correctsAssessmentId: null, correctionAuthorUserId: null, completedAt: at },
    ]);
    const result = await readClinicalTimeline('aluno-a', 'contract-a',
      { ...denied, adipometry: true }, 10);
    expect(result.items[0].actorUserId).toBeNull();
    expect(result.items[0].source.recordedByUserId).toBeNull();
    expect(mockAdipometryAudit).toHaveBeenCalledTimes(1);
  });

  it('uses the canonical correction author for legacy R2 only when no finalization audit exists', async () => {
    mockAdipometry.mockResolvedValue([
      { id: 'revision-2', contractId: 'contract-a', code: 'ADPT-01', rootAssessmentId: 'root-1',
        revisionNumber: 2, correctsAssessmentId: 'revision-1',
        correctionAuthorUserId: 'legacy-correction-author', completedAt: at },
    ]);
    const result = await readClinicalTimeline('aluno-a', 'contract-a',
      { ...denied, adipometry: true }, 10);
    expect(result.items[0].actorUserId).toBe('legacy-correction-author');
  });

  it('localizes an ADPT audit read failure and preserves other permitted domains', async () => {
    mockAdipometry.mockResolvedValue([
      { id: 'revision-1', contractId: 'contract-a', code: 'ADPT-01', rootAssessmentId: 'root-1',
        revisionNumber: 1, correctsAssessmentId: null, completedAt: at },
    ]);
    mockAdipometryAudit.mockRejectedValue(new Error('private SQL details'));
    mockParq.mockResolvedValue([{
      id: 'parq-1', contractId: 'contract-a', submittedAt: at,
      submittedByUserId: 'student-a', catalogVersion: '2',
    }]);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await readClinicalTimeline('aluno-a', 'contract-a',
        { ...denied, adipometry: true, parq: true }, 10);
      expect(result.items.map((item) => item.type)).toEqual(['prnt_parq_submitted']);
      expect(result.unavailableDomains).toEqual(['Adipometria']);
      expect(JSON.stringify(result)).not.toContain('private SQL details');
    } finally {
      spy.mockRestore();
    }
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

  it('scans beyond malformed anthropometry rows before deciding a page has no more events', async () => {
    const rows = [
      { id: 'invalid-correction', contractId: 'contract-a', actorUserId: null,
        createdAt: new Date('2026-10-13T15:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'corrected', assessmentId: 'anth-a', correctionId: null } },
      { id: 'invalid-completion', contractId: 'contract-a', actorUserId: null,
        createdAt: new Date('2026-10-13T14:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: null } },
      { id: 'valid-new', contractId: 'contract-a', actorUserId: 'professor-a',
        createdAt: new Date('2026-10-13T13:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'anth-new' } },
      { id: 'valid-old', contractId: 'contract-a', actorUserId: 'professor-b',
        createdAt: new Date('2026-10-13T12:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'anth-old' } },
    ];
    mockLifecycle.mockImplementation(({ skip = 0, take }: { skip?: number; take: number }) =>
      Promise.resolve(rows.slice(skip, skip + take)));

    const result = await readClinicalTimeline('aluno-a', 'contract-a',
      { ...denied, anthropometry: true }, 1);

    expect(result.items.map((item) => item.sourceId)).toEqual(['anth-new', 'anth-old']);
    expect(mockLifecycle).toHaveBeenCalledTimes(2);
    expect(mockLifecycle).toHaveBeenNthCalledWith(2, expect.objectContaining({
      skip: 2, take: 2,
      where: expect.objectContaining({ alunoId: 'aluno-a', contractId: 'contract-a' }),
    }));
  });

  it('deduplicates a full raw batch before deciding whether another valid event exists', async () => {
    const rows = [
      { id: 'newest', contractId: 'contract-a', actorUserId: null,
        createdAt: new Date('2026-10-13T14:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'anth-1' } },
      { id: 'duplicate', contractId: 'contract-a', actorUserId: null,
        createdAt: new Date('2026-10-13T13:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'anth-1' } },
      { id: 'older', contractId: 'contract-a', actorUserId: null,
        createdAt: new Date('2026-10-13T12:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'anth-2' } },
    ];
    mockLifecycle.mockImplementation(({ skip = 0, take }: { skip?: number; take: number }) =>
      Promise.resolve(rows.slice(skip, skip + take)));

    const result = await readClinicalTimeline('aluno-a', 'contract-a',
      { ...denied, anthropometry: true }, 1);

    expect(result.items.map((item) => item.sourceId)).toEqual(['anth-1', 'anth-2']);
    expect(result.items[0].id).toBe('clinical-anthropometry-newest');
    expect(mockLifecycle).toHaveBeenCalledTimes(2);
    expect(mockLifecycle).toHaveBeenNthCalledWith(2, expect.objectContaining({ skip: 2, take: 2 }));
  });

  it('does not reintroduce an older duplicate after its winner is paginated', async () => {
    const rows = [
      { id: 'canonical-new', contractId: 'contract-a', actorUserId: null,
        createdAt: new Date('2026-10-13T14:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'anth-1' } },
      { id: 'duplicate-older', contractId: 'contract-a', actorUserId: null,
        createdAt: new Date('2026-10-13T13:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'anth-1' } },
      { id: 'other-assessment', contractId: 'contract-a', actorUserId: null,
        createdAt: new Date('2026-10-13T12:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'anth-2' } },
    ];
    mockLifecycle.mockImplementation(({ skip = 0, take }: { skip?: number; take: number }) =>
      Promise.resolve(rows.slice(skip, skip + take)));
    const page = await readClinicalTimeline('aluno-a', 'contract-a',
      { ...denied, anthropometry: true }, 1, {
        kind: 'clinical', at: rows[0].createdAt.toISOString(),
        id: 'clinical-anthropometry-canonical-new',
      });
    expect(page.items.map((item) => item.sourceId)).toEqual(['anth-2']);
    expect(page.items[0].id).toBe('clinical-anthropometry-other-assessment');
    expect(mockLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        contractId: 'contract-a', alunoId: 'aluno-a',
      }),
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
