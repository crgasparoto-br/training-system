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

const {
  contractAuthoritativeGenerationService,
} = require('../src/modules/contracts/contract-authoritative-generation.service');

describe('authoritative contract generation service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((work: any) => work(prisma));
    prisma.contractTemplate.findFirst.mockResolvedValue({
      id: 'template-1',
      name: 'Modelo autoritativo',
      version: 3,
      status: 'ACTIVE',
      serviceId: 'template-service',
      headerHtml: '',
      footerHtml: '',
      clauses: [],
    });
    prisma.companyContract.findUnique.mockResolvedValue({
      id: 'company-1',
      name: 'Academia Teste',
      document: '12345678000190',
      cref: null,
    });
    prisma.aluno.findUnique.mockResolvedValue({
      id: 'student-1',
      serviceId: 'interest-service',
      professorId: 'professor-1',
      contractId: 'company-1',
      professor: { contractId: 'company-1' },
      user: {
        email: 'student@example.com',
        profile: { name: 'Aluno Teste', cpf: '12345678901', rg: null },
      },
    });
    prisma.serviceOption.findFirst.mockResolvedValue({
      id: 'template-service',
      name: 'Serviço do Modelo',
      monthlyPrice: 250,
    });
    prisma.professor.findFirst.mockResolvedValue({
      id: 'professor-1',
      user: { profile: { name: 'Professor Teste', cref: null } },
    });
    prisma.contract.create.mockResolvedValue({ id: 'contract-1' });
    prisma.studentContract.create.mockResolvedValue({ id: 'link-1' });
    prisma.contractAuditLog.create.mockResolvedValue({ id: 'audit-1' });
    mockLoadContractServiceVariableContext.mockResolvedValue({ nome: 'Serviço do Modelo' });
    mockRenderTemplate.mockReturnValue('<p>Contrato renderizado</p>');
  });

  it('ignores the payload service and persists document, link and audit in one transaction', async () => {
    const result = await contractAuthoritativeGenerationService.generate(
      'company-1',
      {
        templateId: 'template-1',
        alunoId: 'student-1',
        serviceId: 'untrusted-payload-service',
      },
      { userId: 'user-1' }
    );

    expect(result).toEqual({ id: 'contract-1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.serviceOption.findFirst).toHaveBeenCalledWith({
      where: { id: 'template-service', contractId: 'company-1' },
    });
    expect(prisma.contract.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyContractId: 'company-1',
        serviceId: 'template-service',
        professorId: 'professor-1',
      }),
    });
    expect(prisma.studentContract.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contractId: 'contract-1',
        serviceId: 'template-service',
        status: 'draft',
      }),
    });
    expect(prisma.contractAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contractId: 'contract-1',
        actorUserId: 'user-1',
        action: 'GENERATED',
      }),
    });
    expect(JSON.stringify(prisma.contract.create.mock.calls)).not.toContain(
      'untrusted-payload-service'
    );
  });

  it('uses only the persisted aluno service when the template has no service', async () => {
    prisma.contractTemplate.findFirst.mockResolvedValue({
      id: 'template-1',
      name: 'Modelo autoritativo',
      version: 3,
      status: 'ACTIVE',
      serviceId: null,
      headerHtml: '',
      footerHtml: '',
      clauses: [],
    });
    prisma.serviceOption.findFirst.mockResolvedValue({
      id: 'interest-service',
      name: 'Serviço Persistido',
      monthlyPrice: 200,
    });

    await contractAuthoritativeGenerationService.preview('company-1', {
      templateId: 'template-1',
      alunoId: 'student-1',
      serviceId: 'untrusted-payload-service',
    });

    expect(prisma.serviceOption.findFirst).toHaveBeenCalledWith({
      where: { id: 'interest-service', contractId: 'company-1' },
    });
    expect(mockRenderTemplate).toHaveBeenCalled();
  });

  it('rejects an aluno from another company before generation', async () => {
    prisma.aluno.findUnique.mockResolvedValue({
      id: 'student-1',
      serviceId: null,
      professorId: 'professor-other',
      contractId: 'company-other',
      professor: { contractId: 'company-other' },
      user: { email: 'student@example.com', profile: { name: 'Aluno Teste' } },
    });

    await expect(
      contractAuthoritativeGenerationService.generate('company-1', {
        templateId: 'template-1',
        alunoId: 'student-1',
      })
    ).rejects.toThrow('Aluno não pertence ao contrato autenticado');

    expect(prisma.contract.create).not.toHaveBeenCalled();
  });

  it('rejects an authoritative service that is outside the authenticated company', async () => {
    prisma.serviceOption.findFirst.mockResolvedValue(null);

    await expect(
      contractAuthoritativeGenerationService.generate('company-1', {
        templateId: 'template-1',
        alunoId: 'student-1',
      })
    ).rejects.toThrow(
      'Serviço financeiro do contrato não pertence ao contrato autenticado'
    );

    expect(prisma.contract.create).not.toHaveBeenCalled();
  });

  it('rejects a requested professor from another company', async () => {
    prisma.professor.findFirst.mockResolvedValue(null);

    await expect(
      contractAuthoritativeGenerationService.generate('company-1', {
        templateId: 'template-1',
        alunoId: 'student-1',
        professorId: 'foreign-professor',
      })
    ).rejects.toThrow(
      'Professor responsável não pertence ao contrato autenticado'
    );

    expect(prisma.contract.create).not.toHaveBeenCalled();
  });
});
