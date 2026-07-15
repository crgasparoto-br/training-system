const prisma = {
  contractTemplate: { findFirst: jest.fn() },
  aluno: { findUnique: jest.fn() },
  serviceOption: { findFirst: jest.fn() },
  professor: { findFirst: jest.fn() },
};

const mockPreview = jest.fn();
const mockGenerate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prisma),
}));

jest.mock('../src/modules/contracts/contract-document.service', () => ({
  contractDocumentService: {
    preview: mockPreview,
    generate: mockGenerate,
  },
}));

const {
  contractAuthoritativeGenerationService,
} = require('../src/modules/contracts/contract-authoritative-generation.service');

describe('authoritative contract generation service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.contractTemplate.findFirst.mockResolvedValue({
      id: 'template-1',
      serviceId: 'template-service',
    });
    prisma.aluno.findUnique.mockResolvedValue({
      id: 'student-1',
      serviceId: 'interest-service',
      professorId: 'professor-1',
      professor: { contractId: 'company-1' },
    });
    prisma.serviceOption.findFirst.mockResolvedValue({ id: 'template-service' });
    mockGenerate.mockResolvedValue({ id: 'contract-1' });
    mockPreview.mockResolvedValue({ html: '<p>Prévia</p>', context: {} });
  });

  it('ignores the payload service and prioritizes the template service', async () => {
    await contractAuthoritativeGenerationService.generate(
      'company-1',
      {
        templateId: 'template-1',
        alunoId: 'student-1',
        serviceId: 'untrusted-payload-service',
      },
      { userId: 'user-1' }
    );

    expect(prisma.serviceOption.findFirst).toHaveBeenCalledWith({
      where: { id: 'template-service', contractId: 'company-1' },
      select: { id: true },
    });
    expect(mockGenerate).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({
        templateId: 'template-1',
        alunoId: 'student-1',
        serviceId: 'template-service',
        professorId: 'professor-1',
      }),
      { userId: 'user-1' }
    );
    expect(mockGenerate).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ serviceId: 'untrusted-payload-service' }),
      expect.anything()
    );
  });

  it('uses only the persisted aluno service when the template has no service', async () => {
    prisma.contractTemplate.findFirst.mockResolvedValue({
      id: 'template-1',
      serviceId: null,
    });
    prisma.serviceOption.findFirst.mockResolvedValue({ id: 'interest-service' });

    await contractAuthoritativeGenerationService.preview('company-1', {
      templateId: 'template-1',
      alunoId: 'student-1',
      serviceId: 'untrusted-payload-service',
    });

    expect(mockPreview).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ serviceId: 'interest-service' })
    );
  });

  it('rejects an aluno from another company before generation', async () => {
    prisma.aluno.findUnique.mockResolvedValue({
      id: 'student-1',
      serviceId: null,
      professorId: 'professor-other',
      professor: { contractId: 'company-other' },
    });

    await expect(
      contractAuthoritativeGenerationService.generate('company-1', {
        templateId: 'template-1',
        alunoId: 'student-1',
      })
    ).rejects.toThrow('Aluno não pertence ao contrato autenticado');

    expect(mockGenerate).not.toHaveBeenCalled();
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

    expect(mockGenerate).not.toHaveBeenCalled();
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

    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
