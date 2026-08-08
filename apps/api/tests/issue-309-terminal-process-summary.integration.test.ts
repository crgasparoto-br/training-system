import { PrismaClient } from '@prisma/client';
import { preRegistrationProcessSummaryService } from '../src/modules/pre-registration-public/pre-registration-process-summary.service.js';
import { preRegistrationPublicAtomicService } from '../src/modules/pre-registration-public/pre-registration-public-atomic.service.js';
import { preRegistrationPublicService } from '../src/modules/pre-registration-public/pre-registration-public.service.js';

const prisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('issue 309 - estados terminais no resumo autenticado', () => {
  const suffix = `issue309-terminal-${Date.now()}`;
  let contractId: string;
  let userId: string;
  let alunoId: string;

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}9309`,
        name: 'Academia Issue 309 Terminal',
      },
    });
    contractId = contract.id;

    const user = await prisma.user.create({
      data: {
        email: `${suffix}@example.com`,
        passwordHash: 'integration-test-hash',
        type: 'aluno',
        profile: { create: { name: 'Lead Issue 309 Terminal' } },
      },
    });
    userId = user.id;

    const aluno = await prisma.aluno.create({
      data: {
        contractId,
        userId,
        status: 'PRE_REGISTRATION_IN_PROGRESS',
        leadName: 'Lead Issue 309 Terminal',
        onboarding: {
          create: {
            contractId,
            claimedByUserId: userId,
            claimRole: 'STUDENT',
            currentStep: 'CONTACT',
            version: 2,
          },
        },
      },
    });
    alunoId = aluno.id;
  });

  afterAll(async () => {
    if (contractId) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('reavalia o vínculo quando o processo muda de vigente para DISCARDED sem liberar o onboarding', async () => {
    await expect(preRegistrationProcessSummaryService.listProcesses(userId)).resolves.toEqual([
      expect.objectContaining({
        alunoId,
        status: 'PRE_REGISTRATION_IN_PROGRESS',
      }),
    ]);

    await prisma.aluno.update({
      where: { id: alunoId },
      data: { status: 'DISCARDED' },
    });

    expect(await preRegistrationPublicService.listProcesses(userId)).toEqual([]);
    await expect(preRegistrationProcessSummaryService.listProcesses(userId)).resolves.toEqual([
      expect.objectContaining({
        alunoId,
        status: 'DISCARDED',
      }),
    ]);
    await expect(preRegistrationPublicAtomicService.getSession(userId, alunoId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('também projeta ACTIVE_STUDENT como estado terminal sem reabrir o pré-cadastro', async () => {
    await prisma.aluno.update({
      where: { id: alunoId },
      data: { status: 'ACTIVE_STUDENT' },
    });

    await expect(preRegistrationProcessSummaryService.listProcesses(userId)).resolves.toEqual([
      expect.objectContaining({
        alunoId,
        status: 'ACTIVE_STUDENT',
      }),
    ]);
    await expect(preRegistrationPublicAtomicService.getSession(userId, alunoId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
