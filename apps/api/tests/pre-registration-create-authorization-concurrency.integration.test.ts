import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { syncAccessPermissionsForFunction } from '../src/modules/access-control/access-control.service.js';
import { preRegistrationEnrollmentCreateService } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();
const revokerPrisma = new PrismaClient();

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describeDatabase('pre-registration create authorization concurrency', () => {
  const suffix = `issue-274-create-auth-${Date.now()}`;
  const contractId = `${suffix}-contract`;
  let userId: string;
  let professorId: string;
  let collaboratorFunctionId: string;

  beforeAll(async () => {
    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: `${Date.now()}274auth`,
        name: 'Contrato Issue 274 Authorization',
      },
    });
    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId,
        name: 'Atendimento comercial',
        code: `${suffix}-commercial`,
        isActive: true,
      },
    });
    collaboratorFunctionId = collaboratorFunction.id;
    const user = await prisma.user.create({
      data: {
        email: `${suffix}@example.com`,
        passwordHash: 'integration-test-hash',
        type: UserType.professor,
        profile: { create: { name: 'Ator concorrente' } },
      },
    });
    userId = user.id;
    const professor = await prisma.professor.create({
      data: {
        userId,
        contractId,
        collaboratorFunctionId,
        role: ProfessorRole.professor,
      },
    });
    professorId = professor.id;

    await syncAccessPermissionsForFunction(
      collaboratorFunctionId,
      collaboratorFunction.code
    );
    await prisma.accessPermission.updateMany({
      where: {
        collaboratorFunctionId,
        screenKey: 'students.preRegistration',
        blockKey: '',
      },
      data: { canView: true, dataScope: 'contract' },
    });
    await prisma.accessPermission.updateMany({
      where: {
        collaboratorFunctionId,
        blockKey: 'students.preRegistration.create',
      },
      data: { canView: true },
    });
  });

  afterAll(async () => {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await Promise.all([prisma.$disconnect(), revokerPrisma.$disconnect()]);
  });

  it('rolls back creation when a permission revocation wins the row lock', async () => {
    const changed = deferred();
    const release = deferred();
    const revocation = revokerPrisma.$transaction(
      async (tx) => {
        const updated = await tx.accessPermission.updateMany({
          where: {
            collaboratorFunctionId,
            blockKey: 'students.preRegistration.create',
            canView: true,
          },
          data: { canView: false },
        });
        expect(updated.count).toBe(1);
        changed.resolve();
        await release.promise;
      },
      { timeout: 10_000 }
    );
    await changed.promise;

    let settled = false;
    const createPromise = preRegistrationEnrollmentCreateService.create(
      { userId, professorId, contractId },
      {
        name: 'Lead não autorizado',
        phone: '+55 15 96666-0274',
        email: `${suffix}-blocked@example.com`,
        origin: 'teste-revogacao-concorrente',
        responsibleProfessorId: professorId,
      }
    ).finally(() => {
      settled = true;
    });

    await delay(100);
    expect(settled).toBe(false);

    release.resolve();
    await revocation;
    await expect(createPromise).rejects.toMatchObject({
      code: expect.stringMatching(/FORBIDDEN|CONCURRENT_MODIFICATION/),
    });
    expect(
      await prisma.aluno.count({
        where: { contractId, leadEmail: `${suffix}-blocked@example.com` },
      })
    ).toBe(0);

    await expect(
      preRegistrationEnrollmentCreateService.create(
        { userId, professorId, contractId },
        {
          name: 'Lead ainda não autorizado',
          phone: '+55 15 96666-0275',
          email: `${suffix}-still-blocked@example.com`,
          origin: 'teste-revogacao-confirmada',
          responsibleProfessorId: professorId,
        }
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
