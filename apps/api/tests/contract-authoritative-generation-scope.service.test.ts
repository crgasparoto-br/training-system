const prisma = {
  $transaction: jest.fn(),
  contractTemplate: { findFirst: jest.fn() },
  companyContract: { findUnique: jest.fn() },
  aluno: { findUnique: jest.fn() },
  serviceOption: { findFirst: jest.fn() },
  professor: { findFirst: jest.fn() },
  contract: { create: jest.fn() },
  studentContract: { create: jest.fn() },
  contractAuditLog: { create: jest.fn() },
};

const mockRenderTemplate = jest.fn();
const mockLoadContractServiceVariableContext = jest.fn();
const mockPrepareOrActivate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prisma),
}));

jest.mock('../src/modules/contracts/contract-document.service', () => ({
  contractDocumentService: {
    generate: jest.fn(),
    renderTemplate: mockRenderTemplate,
  },
}));

jest.mock('../src/modules/contracts/contract-service-context', () => ({
  loadContractServiceVariableContext: mockLoadContractServiceVariableContext,
}));

jest.mock('../src/modules/student-contracts/student-contract-lifecycle-transaction', () => ({
  prepareOrActivateStudentContractInTransaction: mockPrepareOrActivate,
}));

const { contractAuthoritativeGenerationService } = require(
  '../src/modules/contracts/contract-authoritative-generation.service'
);

const professorActor = {
  userId: 'user-1',
  professorId: 'professor-1',
  professorRole: 'professor',
};

describe('authoritative generation actor scope and service semantics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((work: any) => work(prisma));
    prisma.contractTemplate.findFirst.mockResolvedValue({
      id: 'template-1',
      name: 'Modelo',
      version: 1,
      status: 'ACTIVE',
      serviceId: 'template-service',
      headerHtml: '',
      footerHtml: '',
      clauses: [],
    });
    prisma.companyContract.findUnique.mockResolvedValue({
      id: 'company-1',
      name: 'Academia',
      document: '12345678000190',
      cref: null,
    });
    prisma.aluno.findUnique.mockResolvedValue({
      id: 'student-1',
      serviceId: 'interest-service',
      professorId: 'professor-1',
      professor: { contractId: 'company-1' },
      user: {
        email: 'student@example.com',
        profile: { name: 'Aluno', cpf: '12345678901', rg: null },
      },
    });
    prisma.serviceOption.findFirst.mockResolvedValue({
      id: 'template-service',
      name: 'Serviço do Modelo',
      monthlyPrice: 300,
    });
    prisma.professor.findFirst.mockResolvedValue({
      id: 'professor-1',
      user: { profile: { name: 'Professor', cref: null } },
    });
    prisma.contract.create.mockResolvedValue({ id: 'contract-1' });
    prisma.studentContract.create.mockResolvedValue({ id: 'link-1' });
    prisma.contractAuditLog.create.mockResolvedValue({ id: 'audit-1' });
    mockRenderTemplate.mockReturnValue('<p>Contrato</p>');
    mockLoadContractServiceVariableContext.mockResolvedValue({ nome: 'Serviço' });
  });

  it('rejects preview and generation for an aluno of another professor in the same company', async () => {
    prisma.aluno.findUnique.mockResolvedValue({
      id: 'student-2',
      serviceId: null,
      professorId: 'professor-2',
      professor: { contractId: 'company-1' },
      user: {
        email: 'other@example.com',
        profile: { name: 'Outro Aluno' },
      },
    });

    await expect(
      contractAuthoritativeGenerationService.preview(
        'company-1',
        { templateId: 'template-1', alunoId: 'student-2' },
        professorActor
      )
    ).rejects.toThrow('Aluno fora do escopo do professor autenticado');

    await expect(
      contractAuthoritativeGenerationService.generate(
        'company-1',
        { templateId: 'template-1', alunoId: 'student-2' },
        professorActor
      )
    ).rejects.toThrow('Aluno fora do escopo do professor autenticado');

    expect(prisma.contract.create).not.toHaveBeenCalled();
  });

  it('allows a master to operate on any aluno in the company contract', async () => {
    prisma.aluno.findUnique.mockResolvedValue({
      id: 'student-2',
      serviceId: null,
      professorId: 'professor-2',
      professor: { contractId: 'company-1' },
      user: {
        email: 'other@example.com',
        profile: { name: 'Outro Aluno' },
      },
    });
    prisma.professor.findFirst.mockResolvedValue({
      id: 'professor-2',
      user: { profile: { name: 'Professor Dois', cref: null } },
    });

    await expect(
      contractAuthoritativeGenerationService.preview(
        'company-1',
        { templateId: 'template-1', alunoId: 'student-2' },
        { ...professorActor, professorRole: 'master' }
      )
    ).resolves.toEqual(expect.objectContaining({ html: '<p>Contrato</p>' }));
  });

  it('keeps the document service null while applying the persisted aluno service to the link', async () => {
    prisma.contractTemplate.findFirst.mockResolvedValue({
      id: 'template-1',
      name: 'Modelo sem serviço',
      version: 1,
      status: 'ACTIVE',
      serviceId: null,
      headerHtml: '',
      footerHtml: '',
      clauses: [],
    });
    prisma.serviceOption.findFirst.mockResolvedValue({
      id: 'interest-service',
      name: 'Serviço de Interesse',
      monthlyPrice: 200,
    });

    await contractAuthoritativeGenerationService.generate(
      'company-1',
      { templateId: 'template-1', alunoId: 'student-1' },
      professorActor
    );

    expect(prisma.contract.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ serviceId: null }),
    });
    expect(prisma.studentContract.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ serviceId: 'interest-service' }),
    });
  });

  it('rejects assigning another professor when the actor is not master', async () => {
    await expect(
      contractAuthoritativeGenerationService.generate(
        'company-1',
        {
          templateId: 'template-1',
          alunoId: 'student-1',
          professorId: 'professor-2',
        },
        professorActor
      )
    ).rejects.toThrow('Professor responsável fora do escopo do professor autenticado');

    expect(prisma.professor.findFirst).not.toHaveBeenCalled();
    expect(prisma.contract.create).not.toHaveBeenCalled();
  });
});