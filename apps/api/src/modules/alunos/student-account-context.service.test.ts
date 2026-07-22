import { PrismaClient } from '@prisma/client';
import {
  resolveActiveStudentMembership,
  StudentAccountContextError,
} from './student-account-context.service.js';

const RUN_DB_TESTS = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDb = RUN_DB_TESTS ? describe : describe.skip;
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describeDb('student account contract context', () => {
  const prisma = new PrismaClient();
  const contractIds: string[] = [];
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `context-${unique()}@example.com`,
        passwordHash: 'x',
        type: 'aluno',
        profile: { create: { name: 'Aluno Contexto' } },
      },
    });
    userId = user.id;

    for (let index = 0; index < 2; index += 1) {
      const contract = await prisma.companyContract.create({
        data: {
          type: 'academy',
          document: `context-contract-${unique()}`,
        },
      });
      contractIds.push(contract.id);
      await prisma.aluno.create({
        data: {
          userId,
          contractId: contract.id,
          status: 'ACTIVE_STUDENT',
          activatedAt: new Date(),
          age: 30,
        },
      });
    }
  });

  afterAll(async () => {
    for (const contractId of contractIds.reverse()) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('não escolhe silenciosamente um tenant quando a conta possui múltiplos vínculos', async () => {
    await expect(resolveActiveStudentMembership(userId)).rejects.toMatchObject({
      code: 'STUDENT_CONTRACT_CONTEXT_REQUIRED',
    } satisfies Partial<StudentAccountContextError>);
  });

  it('resolve somente o vínculo do contrato explicitamente informado', async () => {
    const membership = await resolveActiveStudentMembership(userId, contractIds[1]);
    expect(membership.contractId).toBe(contractIds[1]);
    expect(membership.userId).toBe(userId);
  });

  it('responde como não encontrado para contrato externo', async () => {
    await expect(resolveActiveStudentMembership(userId, 'external-contract')).rejects.toMatchObject({
      code: 'STUDENT_NOT_FOUND',
    } satisfies Partial<StudentAccountContextError>);
  });
});
