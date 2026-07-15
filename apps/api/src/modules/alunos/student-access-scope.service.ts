import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

type DbClient = PrismaClient | Prisma.TransactionClient;

export type StudentAccessContext = {
  professorId?: string;
  professorRole?: string;
  companyContractId?: string;
};

const requireContext = (context: StudentAccessContext) => {
  const professorId = context.professorId?.trim();
  const companyContractId = context.companyContractId?.trim();
  if (!professorId || !companyContractId) {
    throw new Error('Professor ou contrato autenticado não encontrado');
  }
  return { professorId, companyContractId };
};

export const studentAccessScopeService = {
  async assertAlunoAccess(
    alunoId: string,
    context: StudentAccessContext,
    client: DbClient = prisma
  ) {
    const { professorId, companyContractId } = requireContext(context);
    const aluno = await client.aluno.findUnique({
      where: { id: alunoId },
      select: {
        id: true,
        professorId: true,
        professor: { select: { contractId: true } },
      },
    });

    if (!aluno || aluno.professor.contractId !== companyContractId) {
      throw new Error('Aluno não encontrado ou fora do contrato autenticado');
    }

    if (context.professorRole !== 'master' && aluno.professorId !== professorId) {
      throw new Error('Aluno fora do escopo do professor autenticado');
    }

    return aluno;
  },

  async assertContractDocumentAccess(
    contractDocumentId: string,
    context: StudentAccessContext,
    client: DbClient = prisma
  ) {
    const { companyContractId } = requireContext(context);
    const contract = await client.contract.findFirst({
      where: {
        id: contractDocumentId,
        companyContractId,
      },
      select: {
        id: true,
        alunoId: true,
      },
    });

    if (!contract) {
      throw new Error('Contrato não encontrado');
    }

    await this.assertAlunoAccess(contract.alunoId, context, client);
    return contract;
  },

  assertRequestedProfessorAccess(
    requestedProfessorId: string | null | undefined,
    context: StudentAccessContext
  ) {
    const { professorId } = requireContext(context);
    const normalized = requestedProfessorId?.trim();
    if (!normalized || context.professorRole === 'master') return;
    if (normalized !== professorId) {
      throw new Error('Professor responsável fora do escopo do professor autenticado');
    }
  },
};