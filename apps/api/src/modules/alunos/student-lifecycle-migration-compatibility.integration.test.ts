import { PrismaClient } from '@prisma/client';

const RUN_DB_TESTS = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDb = RUN_DB_TESTS ? describe : describe.skip;
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describeDb('student lifecycle migration compatibility', () => {
  const prisma = new PrismaClient();
  let contractId: string;
  let professorId: string;
  let collaboratorFunctionId: string;
  let professorUserId: string;
  let studentUserId: string;
  let alunoId: string;

  beforeAll(async () => {
    const suffix = unique();
    const contract = await prisma.companyContract.create({
      data: { type: 'academy', document: `rollback-${suffix}` },
    });
    contractId = contract.id;
    const functionOption = await prisma.collaboratorFunctionOption.create({
      data: { contractId, name: 'Professor', code: `ROLLBACK-${suffix}` },
    });
    collaboratorFunctionId = functionOption.id;
    const professorUser = await prisma.user.create({
      data: {
        email: `rollback-prof-${suffix}@example.com`,
        passwordHash: 'x',
        type: 'professor',
        profile: { create: { name: 'Professor Rollback' } },
      },
    });
    professorUserId = professorUser.id;
    const professor = await prisma.professor.create({
      data: {
        userId: professorUserId,
        contractId,
        collaboratorFunctionId,
      },
    });
    professorId = professor.id;
    const studentUser = await prisma.user.create({
      data: {
        email: `rollback-student-${suffix}@example.com`,
        passwordHash: 'x',
        type: 'aluno',
        profile: { create: { name: 'Aluno Rollback' } },
      },
    });
    studentUserId = studentUser.id;
    alunoId = `legacy-${suffix}`;
  });

  afterAll(async () => {
    if (alunoId) await prisma.aluno.delete({ where: { id: alunoId } }).catch(() => undefined);
    if (professorId) await prisma.professor.delete({ where: { id: professorId } }).catch(() => undefined);
    if (studentUserId) await prisma.user.delete({ where: { id: studentUserId } }).catch(() => undefined);
    if (professorUserId) await prisma.user.delete({ where: { id: professorUserId } }).catch(() => undefined);
    if (collaboratorFunctionId) {
      await prisma.collaboratorFunctionOption
        .delete({ where: { id: collaboratorFunctionId } })
        .catch(() => undefined);
    }
    if (contractId) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('aceita insert da aplicação anterior sem contractId/status e o converte em aluno ativo', async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Aluno" (
        "id", "userId", "professorId", "age", "schedulePlan", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, 'free', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      alunoId,
      studentUserId,
      professorId,
      32
    );

    const aluno = await prisma.aluno.findUniqueOrThrow({ where: { id: alunoId } });
    expect(aluno.contractId).toBe(contractId);
    expect(aluno.status).toBe('ACTIVE_STUDENT');
    expect(aluno.activatedAt).not.toBeNull();
  });
});
