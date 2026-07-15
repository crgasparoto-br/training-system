import { PrismaClient } from '@prisma/client';
import { contractDocumentService } from './contract-document.service.js';

const prisma = new PrismaClient();

type ContractGenerationInput = Parameters<typeof contractDocumentService.generate>[1];

type ResolvedGenerationInput = ContractGenerationInput & {
  templateId: string;
  alunoId: string;
  serviceId?: string;
  professorId: string;
};

async function resolveAuthoritativeGenerationInput(
  companyContractId: string,
  input: ContractGenerationInput
): Promise<ResolvedGenerationInput> {
  const templateId = String(input.templateId || '').trim();
  const alunoId = String(input.alunoId || '').trim();

  if (!templateId) throw new Error('Informe o modelo de contrato');
  if (!alunoId) throw new Error('Informe o aluno do contrato');

  const [template, aluno] = await Promise.all([
    prisma.contractTemplate.findFirst({
      where: { id: templateId, contractId: companyContractId },
      select: { id: true, serviceId: true },
    }),
    prisma.aluno.findUnique({
      where: { id: alunoId },
      select: {
        id: true,
        serviceId: true,
        professorId: true,
        professor: { select: { contractId: true } },
      },
    }),
  ]);

  if (!template) throw new Error('Modelo de contrato não encontrado para o contrato autenticado');
  if (!aluno || aluno.professor.contractId !== companyContractId) {
    throw new Error('Aluno não pertence ao contrato autenticado');
  }

  const authoritativeServiceId = template.serviceId ?? aluno.serviceId ?? null;
  if (authoritativeServiceId) {
    const service = await prisma.serviceOption.findFirst({
      where: { id: authoritativeServiceId, contractId: companyContractId },
      select: { id: true },
    });
    if (!service) {
      throw new Error('Serviço financeiro do contrato não pertence ao contrato autenticado');
    }
  }

  let professorId = aluno.professorId;
  const requestedProfessorId =
    typeof input.professorId === 'string' ? input.professorId.trim() : '';
  if (requestedProfessorId) {
    const professor = await prisma.professor.findFirst({
      where: { id: requestedProfessorId, contractId: companyContractId },
      select: { id: true },
    });
    if (!professor) {
      throw new Error('Professor responsável não pertence ao contrato autenticado');
    }
    professorId = professor.id;
  }

  return {
    ...input,
    templateId,
    alunoId,
    professorId,
    serviceId: authoritativeServiceId ?? undefined,
  };
}

export const contractAuthoritativeGenerationService = {
  async preview(companyContractId: string, input: ContractGenerationInput) {
    const authoritativeInput = await resolveAuthoritativeGenerationInput(
      companyContractId,
      input
    );
    return contractDocumentService.preview(companyContractId, authoritativeInput);
  },

  async generate(
    companyContractId: string,
    input: ContractGenerationInput,
    actor?: Parameters<typeof contractDocumentService.generate>[2]
  ) {
    const authoritativeInput = await resolveAuthoritativeGenerationInput(
      companyContractId,
      input
    );
    return contractDocumentService.generate(companyContractId, authoritativeInput, actor);
  },
};
