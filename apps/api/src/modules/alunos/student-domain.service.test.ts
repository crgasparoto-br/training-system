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

import { studentDomainService } from './student-domain.service.js';

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
