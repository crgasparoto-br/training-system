import crypto from 'crypto';
import {
  ContractStatus,
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { contractPublicAccessService } from '../src/modules/contracts/contract-public-access.service.js';
import { studentContractLifecycleService } from '../src/modules/student-contracts/student-contract-lifecycle.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const companyContractId = 'contract-public-open-race-company';
const emailPrefix = 'contract-public-open-race-';
const tokenHash = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

async function seedFixture() {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: companyContractId,
      name: 'Professor',
      code: 'contract-public-open-race-professor',
      isActive: true,
    },
  });
  const professorUser = await prisma.user.create({
    data: {
      email: `${emailPrefix}professor@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Professor Consulta Concorrente' } },
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: professorUser.id,
      contractId: companyContractId,
      collaboratorFunctionId: collaboratorFunction.id,
      role: ProfessorRole.master,
    },
  });
  const alunoUser = await prisma.user.create({
    data: {
      email: `${emailPrefix}aluno@example.com`,
      passwordHash: 'test-hash',
      type: UserType.aluno,
      profile: { create: { name: 'Aluno Consulta Concorrente' } },
    },
  });
  const aluno = await prisma.aluno.create({
    data: {
      userId: alunoUser.id,
      professorId: professor.id,
      contractId: professor.contractId,
      schedulePlan: 'free',
      age: 35,
    },
  });
  const template = await prisma.contractTemplate.create({
    data: {
      contractId: companyContractId,
      name: 'Modelo Consulta Concorrente',
      version: 1,
      status: 'ACTIVE',
      headerHtml: '',
      footerHtml: '',
    },
  });

  const oldSignedAt = new Date('2026-01-10T10:00:00.000Z');
  const oldDocument = await prisma.contract.create({
    data: {
      companyContractId,
      templateId: template.id,
      templateVersion: 1,
      alunoId: aluno.id,
      professorId: professor.id,
      status: ContractStatus.SIGNED,
      title: 'Contrato vigente',
      renderedHtml: '<p>Contrato vigente</p>',
      dataSnapshot: {},
      signedAt: oldSignedAt,
    },
  });
  const oldLink = await prisma.studentContract.create({
    data: {
      alunoId: aluno.id,
      contractId: oldDocument.id,
      status: 'active',
      startDate: oldSignedAt,
      signedAt: oldSignedAt,
    },
  });
  await prisma.aluno.update({
    where: { id: aluno.id },
    data: { currentStudentContractId: oldLink.id },
  });

  const token = 'contract-public-open-race-token';
  const candidateDocument = await prisma.contract.create({
    data: {
      companyContractId,
      templateId: template.id,
      templateVersion: 1,
      alunoId: aluno.id,
      professorId: professor.id,
      status: ContractStatus.SENT,
      title: 'Contrato substituto',
      renderedHtml: '<p>Contrato substituto</p>',
      dataSnapshot: {},
      publicTokenHash: tokenHash(token),
      publicTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const candidateLink = await prisma.studentContract.create({
    data: {
      alunoId: aluno.id,
      contractId: candidateDocument.id,
      status: 'draft',
    },
  });

  return { aluno, oldLink, candidateDocument, candidateLink, token };
}

async function installSignatureDelay(contractId: string) {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION "test_delay_public_open_signature_update"()
    RETURNS trigger AS $$
    BEGIN
      IF NEW."id" = '${contractId}' AND NEW."status" = 'SIGNED' THEN
        PERFORM pg_sleep(0.4);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "test_delay_public_open_signature"
    BEFORE UPDATE ON "Contract"
    FOR EACH ROW EXECUTE FUNCTION "test_delay_public_open_signature_update"()
  `);
}

async function signAndOpen(token: string, openAt?: Date) {
  const signing = studentContractLifecycleService.signPublicContract(token, {
    signerName: 'Aluno Consulta Concorrente',
    signerCpf: '12345678901',
  });

  await new Promise((resolve) => setTimeout(resolve, 100));
  const opening = contractPublicAccessService.open(
    token,
    {},
    prisma,
    openAt ?? new Date()
  );

  return Promise.allSettled([signing, opening]);
}

function expectOpeningOutcomeAfterSignatureRace(
  openingOutcome: PromiseSettledResult<
    Awaited<ReturnType<typeof contractPublicAccessService.open>>
  >
) {
  if (openingOutcome.status === 'fulfilled') {
    expect([ContractStatus.VIEWED, ContractStatus.SIGNED]).toContain(
      openingOutcome.value.status
    );
    return;
  }

  expect(openingOutcome.reason).toEqual(
    expect.objectContaining({ message: 'Contrato não encontrado' })
  );
}

describeDatabase('concurrent public contract opening and signature', () => {
  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '11224488000177',
        name: 'Contrato Consulta Concorrente',
      },
    });
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "test_delay_public_open_signature" ON "Contract"'
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS "test_delay_public_open_signature_update"()'
    );
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('never leaves a signed document downgraded to VIEWED after the race settles', async () => {
    const fixture = await seedFixture();
    await installSignatureDelay(fixture.candidateDocument.id);

    const [signatureOutcome, openingOutcome] = await signAndOpen(fixture.token);
    const [document, links, aluno, signatures] = await Promise.all([
      prisma.contract.findUniqueOrThrow({
        where: { id: fixture.candidateDocument.id },
      }),
      prisma.studentContract.findMany({
        where: { alunoId: fixture.aluno.id },
      }),
      prisma.aluno.findUniqueOrThrow({ where: { id: fixture.aluno.id } }),
      prisma.contractSignature.findMany({
        where: { contractId: fixture.candidateDocument.id },
      }),
    ]);

    expect(signatureOutcome.status).toBe('fulfilled');
    if (signatureOutcome.status === 'fulfilled') {
      expect(signatureOutcome.value.activation.scheduled).toBe(false);
    }
    expectOpeningOutcomeAfterSignatureRace(openingOutcome);
    expect(document.status).toBe(ContractStatus.SIGNED);
    expect(document.publicTokenHash).toBeNull();
    expect(signatures).toHaveLength(1);
    expect(links.find((link) => link.id === fixture.oldLink.id)?.status).toBe(
      'terminated'
    );
    expect(
      links.find((link) => link.id === fixture.candidateLink.id)?.status
    ).toBe('active');
    expect(aluno.currentStudentContractId).toBe(fixture.candidateLink.id);
    expect(links.filter((link) => link.status === 'active')).toHaveLength(1);
  });

  it('keeps document, signature and link consistent when expiration races with signing', async () => {
    const fixture = await seedFixture();
    await installSignatureDelay(fixture.candidateDocument.id);

    const forcedExpirationAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const [signatureOutcome, openingOutcome] = await signAndOpen(
      fixture.token,
      forcedExpirationAt
    );
    const [document, oldLink, candidateLink, aluno, signatures] =
      await Promise.all([
        prisma.contract.findUniqueOrThrow({
          where: { id: fixture.candidateDocument.id },
        }),
        prisma.studentContract.findUniqueOrThrow({
          where: { id: fixture.oldLink.id },
        }),
        prisma.studentContract.findUniqueOrThrow({
          where: { id: fixture.candidateLink.id },
        }),
        prisma.aluno.findUniqueOrThrow({ where: { id: fixture.aluno.id } }),
        prisma.contractSignature.findMany({
          where: { contractId: fixture.candidateDocument.id },
        }),
      ]);

    if (document.status === ContractStatus.SIGNED) {
      expect(signatureOutcome.status).toBe('fulfilled');
      expectOpeningOutcomeAfterSignatureRace(openingOutcome);
      expect(signatures).toHaveLength(1);
      expect(document.publicTokenHash).toBeNull();
      expect(candidateLink.status).toBe('active');
      expect(oldLink.status).toBe('terminated');
      expect(aluno.currentStudentContractId).toBe(candidateLink.id);
      return;
    }

    expect(document.status).toBe(ContractStatus.EXPIRED);
    expect(signatureOutcome.status).toBe('rejected');
    expect(openingOutcome.status).toBe('rejected');
    if (openingOutcome.status === 'rejected') {
      expect(openingOutcome.reason).toEqual(
        expect.objectContaining({ message: 'Link expirado' })
      );
    }
    expect(signatures).toHaveLength(0);
    expect(document.publicTokenHash).toBeNull();
    expect(candidateLink.status).toBe('expired');
    expect(oldLink.status).toBe('active');
    expect(aluno.currentStudentContractId).toBe(oldLink.id);
  });

  it('commits expiration before returning the expired-link error', async () => {
    const fixture = await seedFixture();
    const forcedExpirationAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await expect(
      contractPublicAccessService.open(
        fixture.token,
        {},
        prisma,
        forcedExpirationAt
      )
    ).rejects.toThrow('Link expirado');

    const [document, candidateLink] = await Promise.all([
      prisma.contract.findUniqueOrThrow({
        where: { id: fixture.candidateDocument.id },
      }),
      prisma.studentContract.findUniqueOrThrow({
        where: { id: fixture.candidateLink.id },
      }),
    ]);

    expect(document.status).toBe(ContractStatus.EXPIRED);
    expect(document.publicTokenHash).toBeNull();
    expect(document.publicTokenExpiresAt).toBeNull();
    expect(candidateLink.status).toBe('expired');
    expect(candidateLink.endDate?.toISOString()).toBe(
      forcedExpirationAt.toISOString()
    );
  });
});
