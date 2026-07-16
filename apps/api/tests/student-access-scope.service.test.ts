export {};

const mockPrisma = {
  aluno: { findUnique: jest.fn() },
  contract: { findFirst: jest.fn() },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

const { studentAccessScopeService } = require(
  '../src/modules/alunos/student-access-scope.service'
);

const professorContext = {
  professorId: 'professor-1',
  professorRole: 'professor',
  companyContractId: 'company-1',
};

describe('studentAccessScopeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.aluno.findUnique.mockResolvedValue({
      id: 'student-1',
      professorId: 'professor-1',
      professor: { contractId: 'company-1' },
    });
    mockPrisma.contract.findFirst.mockResolvedValue({
      id: 'document-1',
      alunoId: 'student-1',
    });
  });

  it('allows a professor to access their own aluno', async () => {
    await expect(
      studentAccessScopeService.assertAlunoAccess(
        'student-1',
        professorContext,
        mockPrisma
      )
    ).resolves.toEqual(expect.objectContaining({ id: 'student-1' }));
  });

  it('denies another professor aluno within the same company contract', async () => {
    mockPrisma.aluno.findUnique.mockResolvedValue({
      id: 'student-2',
      professorId: 'professor-2',
      professor: { contractId: 'company-1' },
    });

    await expect(
      studentAccessScopeService.assertAlunoAccess(
        'student-2',
        professorContext,
        mockPrisma
      )
    ).rejects.toThrow('Aluno fora do escopo do professor autenticado');
  });

  it('allows a master to access any aluno in the company contract', async () => {
    mockPrisma.aluno.findUnique.mockResolvedValue({
      id: 'student-2',
      professorId: 'professor-2',
      professor: { contractId: 'company-1' },
    });

    await expect(
      studentAccessScopeService.assertAlunoAccess(
        'student-2',
        { ...professorContext, professorRole: 'master' },
        mockPrisma
      )
    ).resolves.toEqual(expect.objectContaining({ id: 'student-2' }));
  });

  it('checks the aluno scope behind a contract document', async () => {
    await studentAccessScopeService.assertContractDocumentAccess(
      'document-1',
      professorContext,
      mockPrisma
    );

    expect(mockPrisma.contract.findFirst).toHaveBeenCalledWith({
      where: { id: 'document-1', companyContractId: 'company-1' },
      select: { id: true, alunoId: true },
    });
    expect(mockPrisma.aluno.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'student-1' } })
    );
  });

  it('prevents a non-master from assigning another professor', () => {
    expect(() =>
      studentAccessScopeService.assertRequestedProfessorAccess(
        'professor-2',
        professorContext
      )
    ).toThrow('Professor responsável fora do escopo do professor autenticado');
  });
});