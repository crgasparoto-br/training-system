import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
type DbClient = Prisma.TransactionClient | PrismaClient;

export class StudentAccountContextError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'STUDENT_NOT_FOUND'
      | 'STUDENT_CONTRACT_CONTEXT_REQUIRED'
  ) {
    super(message);
    this.name = 'StudentAccountContextError';
  }
}

export const normalizeRequestedStudentContractId = (
  rawValue?: string | string[] | null
): string | undefined => {
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

/**
 * Resolve a associação operacional ativa da conta global dentro de um tenant.
 *
 * Uma conta pode participar de vários contratos. Quando houver mais de uma
 * associação ativa, o chamador precisa fornecer explicitamente o contractId;
 * nunca escolhemos silenciosamente um tenant.
 */
export async function resolveActiveStudentMembership(
  userId: string,
  requestedContractId?: string,
  client: DbClient = prisma
) {
  if (requestedContractId) {
    const aluno = await client.aluno.findFirst({
      where: {
        userId,
        contractId: requestedContractId,
        status: 'ACTIVE_STUDENT',
      },
    });
    if (!aluno) {
      throw new StudentAccountContextError('Aluno não encontrado.', 'STUDENT_NOT_FOUND');
    }
    return aluno;
  }

  const memberships = await client.aluno.findMany({
    where: { userId, status: 'ACTIVE_STUDENT' },
    orderBy: { createdAt: 'asc' },
    take: 2,
  });

  if (memberships.length === 0) {
    throw new StudentAccountContextError('Aluno não encontrado.', 'STUDENT_NOT_FOUND');
  }
  if (memberships.length > 1) {
    throw new StudentAccountContextError(
      'Informe o contrato ativo para continuar.',
      'STUDENT_CONTRACT_CONTEXT_REQUIRED'
    );
  }
  return memberships[0];
}
