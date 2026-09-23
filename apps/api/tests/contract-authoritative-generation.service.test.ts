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
      studentFinancialProfile: null,
      currentStudentContract: null,
      studentContracts: [],
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

  it('resolves preview variables from persisted student data without creating a document', async () => {
    prisma.contractTemplate.findFirst.mockResolvedValue({
      id: 'template-1',
      name: 'Modelo autoritativo',
      version: 3,
      status: 'ACTIVE',
      serviceId: 'template-service',
      headerHtml:
        '<p>{{aluno.cpf}} {{aluno.rg}} {{professor.cref}} {{contrato.valorMensal}} {{contrato.valorMensalExtenso}} {{contrato.diaVencimento}} {{contrato.horarios}} {{contrato.dataInicio}}</p>',
      footerHtml: '',
      clauses: [],
    });
    prisma.aluno.findUnique.mockResolvedValue({
      id: 'student-1',
      serviceId: 'interest-service',
      professorId: 'professor-1',
      contractId: 'company-1',
      professor: { contractId: 'company-1' },
      studentFinancialProfile: {
        contractId: 'company-1',
        monthlyAmount: 321.45,
        paymentDay: 12,
        contractStartDate: new Date('2026-09-01T12:00:00.000Z'),
        notes: null,
      },
      currentStudentContract: null,
      studentContracts: [
        {
          status: 'active',
          amount: 300,
          paymentDay: 10,
          notes: 'Terças e quintas, às 7h',
          startDate: new Date('2026-08-01T12:00:00.000Z'),
        },
      ],
      user: {
        email: 'student@example.com',
        profile: {
          name: 'Aluno Teste',
          cpf: '123.456.789-01',
          rg: '12.345.678-9',
        },
      },
    });
    prisma.professor.findFirst.mockResolvedValue({
      id: 'professor-1',
      user: { profile: { name: 'Professor Teste', cref: '012345-G/SP' } },
    });

    await contractAuthoritativeGenerationService.preview('company-1', {
      templateId: 'template-1',
      alunoId: 'student-1',
    });

    const context = mockRenderTemplate.mock.calls.at(-1)?.[1];
    expect(context.aluno).toEqual(
      expect.objectContaining({
        cpf: '12345678901',
        rg: '12.345.678-9',
      })
    );
    expect(context.professor.cref).toBe('012345-G/SP');
    expect(context.contrato.valorMensal).toContain('321,45');
    expect(context.contrato.valorMensalExtenso).toBe(
      `${context.contrato.valorMensal} reais`
    );
    expect(context.contrato.diaVencimento).toBe(12);
    expect(context.contrato.horarios).toBe('Terças e quintas, às 7h');
    expect(context.contrato.dataInicio).toBe('01/09/2026');
    expect(prisma.contract.create).not.toHaveBeenCalled();
    expect(prisma.studentContract.create).not.toHaveBeenCalled();
    expect(prisma.contractAuditLog.create).not.toHaveBeenCalled();
  });

  it('uses the same persisted financial resolution for real generation', async () => {
    prisma.aluno.findUnique.mockResolvedValue({
      id: 'student-1',
      serviceId: 'interest-service',
      professorId: 'professor-1',
      contractId: 'company-1',
      professor: { contractId: 'company-1' },
      studentFinancialProfile: {
        contractId: 'company-1',
        monthlyAmount: 321.45,
        paymentDay: 12,
        contractStartDate: new Date('2026-09-01T12:00:00.000Z'),
        notes: 'Segundas e quartas, às 18h',
      },
      currentStudentContract: null,
      studentContracts: [],
      user: {
        email: 'student@example.com',
        profile: { name: 'Aluno Teste', cpf: '12345678901', rg: '123456789' },
      },
    });

    await contractAuthoritativeGenerationService.generate(
      'company-1',
      {
        templateId: 'template-1',
        alunoId: 'student-1',
      },
      { userId: 'user-1' }
    );

    expect(prisma.studentContract.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 321.45,
        paymentDay: 12,
        notes: 'Segundas e quartas, às 18h',
        startDate: new Date('2026-09-01T12:00:00.000Z'),
      }),
    });
  });

  it('reports genuinely missing required data with actionable field names', async () => {
    prisma.contractTemplate.findFirst.mockResolvedValue({
      id: 'template-1',
      name: 'Modelo autoritativo',
      version: 3,
      status: 'ACTIVE',
      serviceId: 'template-service',
      headerHtml: '<p>{{aluno.rg}} {{professor.cref}}</p>',
      footerHtml: '',
      clauses: [],
    });

    await expect(
      contractAuthoritativeGenerationService.preview('company-1', {
        templateId: 'template-1',
        alunoId: 'student-1',
      })
    ).rejects.toThrow('RG do aluno ({{aluno.rg}})');

    await expect(
      contractAuthoritativeGenerationService.preview('company-1', {
        templateId: 'template-1',
        alunoId: 'student-1',
      })
    ).rejects.toThrow('CREF do professor ({{professor.cref}})');

    expect(prisma.contract.create).not.toHaveBeenCalled();
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
