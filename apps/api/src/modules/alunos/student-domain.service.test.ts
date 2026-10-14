const mockFindFirst = jest.fn();
const mockLifecycleFindMany = jest.fn();
const mockListByAluno = jest.fn();

jest.mock('../../common/prisma-runtime-client.js', () => ({
  prismaRuntimeClient: {
    aluno: { findFirst: mockFindFirst },
    studentLifecycleEvent: { findMany: mockLifecycleFindMany },
  },
}));

jest.mock('../student-contracts/student-contract.service.js', () => ({
  studentContractService: { listByAluno: mockListByAluno },
}));

import { studentDomainService, STUDENT_TIMELINE_CURSOR_MAX_LENGTH } from './student-domain.service.js';

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  id: 'aluno-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  schedulePlan: 'free',
  user: { isActive: true, email: 'student@example.test', profile: { name: 'Student' } },
  professor: null,
  service: null,
  intakeForm: null,
  assessments: [],
  contracts: [],
  integrations: [],
  studentProfile: null,
  studentHealthIntake: null,
  parqSubmissions: [],
  studentAssessmentRecords: [],
  studentFinancialProfile: null,
  studentExternalAccounts: [],
  studentExternalActivities: [],
  ...overrides,
});

describe('studentDomainService snapshot reuse', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockFindFirst.mockReset();
    mockLifecycleFindMany.mockReset().mockResolvedValue([]);
    mockListByAluno.mockReset().mockResolvedValue([]);
  });

  it.each(['getSummary', 'getTimeline'] as const)(
    '%s loads the appropriate student snapshot exactly once',
    async (method) => {
      const loadSnapshot = jest
        .spyOn(studentDomainService, method === 'getTimeline' ? 'loadAlunoTimelineSnapshot' : 'loadAlunoDomainSnapshot')
        .mockResolvedValue(snapshot() as never);

      await studentDomainService[method]('aluno-1', { companyContractId: 'contract-a' });

      expect(loadSnapshot).toHaveBeenCalledTimes(1);
      expect(loadSnapshot).toHaveBeenCalledWith('aluno-1', {
        companyContractId: 'contract-a',
      });
      if (method === 'getTimeline') {
        // No finance grant: do not query contract/financial records at all.
        expect(mockListByAluno).not.toHaveBeenCalled();
      } else {
        expect(mockListByAluno).toHaveBeenCalledTimes(1);
        expect(mockListByAluno).toHaveBeenCalledWith('aluno-1', {
          companyContractId: 'contract-a',
        });
      }
    }
  );

  it('queries contracts for the timeline only with an explicit financial grant', async () => {
    jest.spyOn(studentDomainService, 'loadAlunoTimelineSnapshot')
      .mockResolvedValue(snapshot() as never);

    await studentDomainService.getTimeline('aluno-1', {
      companyContractId: 'contract-a',
      timelineAccess: {
        profile: false, health: false, assessments: false, financial: true,
        integrations: false, training: false,
        clinical: { prnt: {}, intake: false, parq: false, anthropometry: false, adipometry: false },
      },
    });
    expect(mockListByAluno).toHaveBeenCalledTimes(1);
    expect(mockListByAluno).toHaveBeenCalledWith('aluno-1', {
      companyContractId: 'contract-a',
    });
  });

  it('does not query any denied relations with Audit-only grants', async () => {
    mockFindFirst.mockImplementation(({ include }: any) => {
      // A broken relation without permission must never affect Audit.
      if (include.studentHealthIntake || include.studentFinancialProfile || include.assessments) {
        throw new Error('denied relation queried');
      }
      return Promise.resolve(snapshot({
        intakeForm: { observations: 'private-medication' },
        studentFinancialProfile: { notes: 'private-finance' },
        studentExternalActivities: [{ id: 'private-external' }],
      }));
    });
    const result = await studentDomainService.getTimeline('aluno-1', {
      companyContractId: 'contract-a',
    });
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    expect(mockFindFirst.mock.calls[0][0]).toEqual(expect.objectContaining({
      where: { id: 'aluno-1', contractId: 'contract-a' },
      include: {},
    }));
    expect(result?.partial).toBe(false);
    expect(result?.items.map((item) => item.type)).toEqual(['student_created']);
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('selects only granted legacy relations and leaves denied clinical tables untouched', async () => {
    mockFindFirst.mockResolvedValue(snapshot());
    const result = await studentDomainService.getTimeline('aluno-1', {
      companyContractId: 'contract-a',
      timelineAccess: {
        profile: true, health: false, assessments: false, financial: true,
        integrations: false, training: false,
        clinical: { prnt: {}, intake: false, parq: false, anthropometry: false, adipometry: false },
      },
    });
    const query = mockFindFirst.mock.calls[0][0];
    expect(Object.keys(query.include).sort()).toEqual([
      'service', 'studentFinancialProfile', 'studentProfile', 'user',
    ]);
    expect(query.where).toEqual({ id: 'aluno-1', contractId: 'contract-a' });
    expect(mockListByAluno).toHaveBeenCalledTimes(1);
    expect(result?.partial).toBe(false);
  });

  it('keeps the global cursor after skipped malformed anthropometry events', async () => {
    jest.spyOn(studentDomainService, 'loadAlunoTimelineSnapshot')
      .mockResolvedValue(snapshot() as never);
    const records = [
      { id: 'bad-correction', createdAt: new Date('2026-10-13T15:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'corrected', assessmentId: 'a', correctionId: null } },
      { id: 'bad-completion', createdAt: new Date('2026-10-13T14:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: null } },
      { id: 'valid-new', createdAt: new Date('2026-10-13T13:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'new' } },
      { id: 'valid-old', createdAt: new Date('2026-10-13T12:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'old' } },
    ].map((record) => ({ ...record, contractId: 'contract-a', actorUserId: null }));
    mockLifecycleFindMany.mockImplementation(({ where, skip = 0, take }: any) => {
      if (where.metadata?.equals !== 'anthropometry') return Promise.resolve([]);
      const earlierThan = where.OR?.[0]?.createdAt?.lt as Date | undefined;
      const eligible = records.filter((record) => !earlierThan || record.createdAt.getTime() < earlierThan.getTime());
      return Promise.resolve(eligible.slice(skip, skip + take));
    });
    const access = {
      profile: false, health: false, assessments: false, financial: false,
      integrations: false, training: false,
      clinical: { prnt: {}, intake: false, parq: false, anthropometry: true, adipometry: false },
    };
    const first = await studentDomainService.getTimeline('aluno-1', {
      companyContractId: 'contract-a', timelineLimit: 1, timelineAccess: access,
    });
    expect(first?.items.map((item) => item.id)).toEqual(['clinical-anthropometry-valid-new']);
    expect(first?.nextCursor).toEqual(expect.any(String));

    const second = await studentDomainService.getTimeline('aluno-1', {
      companyContractId: 'contract-a', timelineLimit: 1, timelineCursor: first?.nextCursor ?? undefined,
      timelineAccess: access,
    });
    expect(second?.items.map((item) => item.id)).toEqual(['clinical-anthropometry-valid-old']);
    expect(second?.nextCursor).toEqual(expect.any(String));

    const third = await studentDomainService.getTimeline('aluno-1', {
      companyContractId: 'contract-a', timelineLimit: 1, timelineCursor: second?.nextCursor ?? undefined,
      timelineAccess: access,
    });
    expect(third?.items.map((item) => item.type)).toEqual(['student_created']);
    expect(third?.nextCursor).toBeNull();
  });

  it('roundtrips a real-length canonical cursor above 256 bytes while bounding input and tenant scope', async () => {
    const alunoId = `aluno-${'a'.repeat(24)}`;
    const contractId = `contract-${'c'.repeat(24)}`;
    jest.spyOn(studentDomainService, 'loadAlunoTimelineSnapshot')
      .mockResolvedValue(snapshot({ id: alunoId }) as never);
    const records = [
      { id: `long-${'r'.repeat(52)}`, createdAt: new Date('2026-10-13T14:00:00.000Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'newest' } },
      { id: 'older', createdAt: new Date('2026-10-13T13:00:00.000Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'older' } },
    ].map((item) => ({ ...item, contractId, actorUserId: null }));
    mockLifecycleFindMany.mockImplementation(({ where, take }: any) =>
      Promise.resolve(where.metadata?.equals === 'anthropometry' ? records.slice(0, take) : []));
    const grants = {
      profile: false, health: false, assessments: false, financial: false,
      integrations: false, training: false,
      clinical: { prnt: {}, intake: false, parq: false, anthropometry: true, adipometry: false },
    };
    const first = await studentDomainService.getTimeline(alunoId, {
      companyContractId: contractId, timelineLimit: 1, timelineAccess: grants,
    });
    const cursor = first?.nextCursor;
    expect(cursor).toEqual(expect.any(String));
    expect(cursor!.length).toBeGreaterThan(256);
    expect(cursor!.length).toBeLessThanOrEqual(STUDENT_TIMELINE_CURSOR_MAX_LENGTH);
    const second = await studentDomainService.getTimeline(alunoId, {
      companyContractId: contractId, timelineLimit: 1, timelineCursor: cursor!, timelineAccess: grants,
    });
    expect(second?.items[0].sourceId).toBe('older');
    await expect(studentDomainService.getTimeline(alunoId, {
      companyContractId: 'other-contract', timelineCursor: cursor!, timelineAccess: grants,
    })).rejects.toThrow('INVALID_TIMELINE_CURSOR');
    await expect(studentDomainService.getTimeline(alunoId, {
      companyContractId: contractId,
      timelineCursor: 'A'.repeat(STUDENT_TIMELINE_CURSOR_MAX_LENGTH + 1), timelineAccess: grants,
    })).rejects.toThrow('INVALID_TIMELINE_CURSOR');
  });

  it('keeps millisecond precision across same-second training cursors', async () => {
    jest.spyOn(studentDomainService, 'loadAlunoTimelineSnapshot')
      .mockResolvedValue(snapshot() as never);
    const records = [
      { id: 'z-newer', createdAt: new Date('2026-10-13T14:00:00.900Z'),
        metadata: { domain: 'workout_session_execution', action: 'started', status: 'in_progress' } },
      { id: 'a-older', createdAt: new Date('2026-10-13T14:00:00.100Z'),
        metadata: { domain: 'workout_session_execution', action: 'completed', status: 'completed' } },
    ].map((record) => ({ ...record, alunoId: 'aluno-1', contractId: 'contract-a', actorUserId: null }));
    mockLifecycleFindMany.mockImplementation(({ where, take }: any) => {
      const filter = where.AND?.[1];
      const before: Date | undefined = filter?.OR?.[0]?.createdAt?.lt;
      const same: Date | undefined = filter?.OR?.[1]?.createdAt;
      const lowerId: string | undefined = filter?.OR?.[1]?.id?.lt;
      return Promise.resolve(records.filter((record) => !before
        || record.createdAt.getTime() < before.getTime()
        || (same && lowerId && record.createdAt.getTime() === same.getTime()
          && record.id < lowerId)).slice(0, take));
    });
    const options = {
      companyContractId: 'contract-a', timelineLimit: 1,
      timelineAccess: {
        profile: false, health: false, assessments: false, financial: false,
        integrations: false, training: true,
        clinical: { prnt: {}, intake: false, parq: false, anthropometry: false, adipometry: false },
      },
    };
    const first = await studentDomainService.getTimeline('aluno-1', options);
    expect(first?.items.map((event) => event.id)).toEqual(['training-execution-z-newer']);
    expect(first?.nextCursor).toEqual(expect.any(String));
    const cursor = JSON.parse(Buffer.from(first!.nextCursor!, 'base64url').toString('utf8')) as { at: string };
    expect(cursor.at).toBe('2026-10-13T14:00:00.900Z');
    const second = await studentDomainService.getTimeline('aluno-1', {
      ...options, timelineCursor: first!.nextCursor!,
    });
    expect(second?.items.map((event) => event.id)).toEqual(['training-execution-a-older']);
  });

  it('paginates distinct canonical anthropometry sources across API cursors', async () => {
    jest.spyOn(studentDomainService, 'loadAlunoTimelineSnapshot')
      .mockResolvedValue(snapshot() as never);
    const records = [
      { id: 'newest', createdAt: new Date('2026-10-13T14:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'assessment-1' } },
      { id: 'older-duplicate', createdAt: new Date('2026-10-13T13:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'assessment-1' } },
      { id: 'distinct', createdAt: new Date('2026-10-13T12:00:00Z'),
        metadata: { domain: 'anthropometry', action: 'completed', assessmentId: 'assessment-2' } },
    ].map((event) => ({ ...event, actorUserId: null, contractId: 'contract-a' }));
    mockLifecycleFindMany.mockImplementation(({ where, skip = 0, take }: any) => {
      if (where.metadata?.equals !== 'anthropometry') return Promise.resolve([]);
      if (where.contractId !== 'contract-a' || where.alunoId !== 'aluno-1') {
        throw new Error('unscoped anthropometry query');
      }
      return Promise.resolve(records.slice(skip, skip + take));
    });
    const options = {
      companyContractId: 'contract-a', timelineLimit: 1,
      timelineAccess: {
        profile: false, health: false, assessments: false, financial: false,
        integrations: false, training: false,
        clinical: { prnt: {}, intake: false, parq: false, anthropometry: true, adipometry: false },
      },
    };
    const first = await studentDomainService.getTimeline('aluno-1', options);
    const second = await studentDomainService.getTimeline('aluno-1', {
      ...options, timelineCursor: first?.nextCursor ?? undefined,
    });
    const third = await studentDomainService.getTimeline('aluno-1', {
      ...options, timelineCursor: second?.nextCursor ?? undefined,
    });
    expect([first?.items[0]?.id, second?.items[0]?.id, third?.items[0]?.id]).toEqual([
      'clinical-anthropometry-newest',
      'clinical-anthropometry-distinct',
      'student-created-aluno-1',
    ]);
    expect(second?.items[0]?.sourceId).toBe('assessment-2');
    expect(third?.nextCursor).toBeNull();
    expect(new Set([first?.items[0]?.id, second?.items[0]?.id, third?.items[0]?.id]).size).toBe(3);
  });

  it('keeps the query and reused relations isolated to the requested contract', async () => {
    mockFindFirst.mockResolvedValue(
      snapshot({
        contracts: [
          { id: 'a', companyContractId: 'contract-a' },
          { id: 'b', companyContractId: 'contract-b' },
        ],
        studentExternalActivities: [
          { id: 'activity-a', contractId: 'contract-a' },
          { id: 'activity-b', contractId: 'contract-b' },
        ],
      })
    );

    const result = await studentDomainService.loadAlunoDomainSnapshot('aluno-1', {
      companyContractId: 'contract-a',
    });

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'aluno-1', contractId: 'contract-a' } })
    );
    expect(result?.contracts).toEqual([{ id: 'a', companyContractId: 'contract-a' }]);
    expect(result?.studentExternalActivities).toEqual([
      { id: 'activity-a', contractId: 'contract-a' },
    ]);
  });
});
