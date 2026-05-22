const findUniqueMock = jest.fn();
const mockPrisma = {
  aluno: {
    findUnique: findUniqueMock,
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock('../src/modules/student-contracts/student-contract.service', () => ({
  studentContractService: {
    listByAluno: jest.fn(),
  },
}));

import { studentDomainService } from '../src/modules/alunos/student-domain.service';
import { studentContractService } from '../src/modules/student-contracts/student-contract.service';

describe('studentDomainService', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    (studentContractService.listByAluno as jest.Mock).mockReset();
  });

  it('passes companyContractId when loading the segmented financial profile', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'aluno-1',
      studentFinancialProfile: null,
      intakeForm: null,
      service: null,
      updatedAt: '2026-05-22T00:00:00.000Z',
      createdAt: '2026-05-20T00:00:00.000Z',
    });
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([]);

    await studentDomainService.getFinancialProfile('aluno-1', {
      companyContractId: 'contract-1',
    });

    expect(studentContractService.listByAluno).toHaveBeenCalledWith('aluno-1', {
      companyContractId: 'contract-1',
    });
  });

  it('keeps legacy and segmented assessments together during the additive rollout', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'aluno-1',
      studentAssessmentRecords: [
        {
          id: 'seg-1',
          assessmentCategory: 'anthropometry',
          assessmentCode: 'anthro',
          title: 'Avaliação segmentada',
          performedAt: '2026-05-22T10:00:00.000Z',
          status: 'completed',
          summaryData: null,
          notes: null,
          measurements: [],
          createdAt: '2026-05-22T10:00:00.000Z',
          updatedAt: '2026-05-22T10:00:00.000Z',
        },
      ],
      assessments: [
        {
          id: 'legacy-1',
          assessmentDate: '2026-05-01T10:00:00.000Z',
          filePath: '/files/legacy.pdf',
          originalFileName: 'legacy.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          extractedData: null,
          createdAt: '2026-05-01T10:00:00.000Z',
          updatedAt: '2026-05-01T10:00:00.000Z',
          type: {
            code: 'legacy_complete',
            name: 'Avaliação completa legada',
          },
        },
      ],
    });

    const result = await studentDomainService.listAssessmentRecords('aluno-1');

    expect(result).not.toBeNull();
    expect(result?.hasSegmentedRecords).toBe(true);
    expect(result?.hasLegacyRecords).toBe(true);
    expect(result?.items).toHaveLength(2);
    expect(result?.items.map((item) => item.id)).toEqual(['seg-1', 'legacy-legacy-1']);
  });
});
