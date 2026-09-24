const mockFindFirst = jest.fn();
const mockListByAluno = jest.fn();

jest.mock('../../common/prisma-runtime-client.js', () => ({
  prismaRuntimeClient: { aluno: { findFirst: mockFindFirst } },
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
    mockListByAluno.mockReset().mockResolvedValue([]);
  });

  it.each(['getSummary', 'getTimeline'] as const)(
    '%s loads the broad student snapshot exactly once',
    async (method) => {
      const loadSnapshot = jest
        .spyOn(studentDomainService, 'loadAlunoDomainSnapshot')
        .mockResolvedValue(snapshot() as never);

      await studentDomainService[method]('aluno-1', { companyContractId: 'contract-a' });

      expect(loadSnapshot).toHaveBeenCalledTimes(1);
      expect(loadSnapshot).toHaveBeenCalledWith('aluno-1', {
        companyContractId: 'contract-a',
      });
      expect(mockListByAluno).toHaveBeenCalledTimes(1);
      expect(mockListByAluno).toHaveBeenCalledWith('aluno-1', {
        companyContractId: 'contract-a',
      });
    }
  );

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
