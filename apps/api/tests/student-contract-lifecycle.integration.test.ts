import crypto from 'crypto';
import express from 'express';
import {
  ContractStatus,
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { studentContractLifecycleService } from '../src/modules/student-contracts/student-contract-lifecycle.service.js';

const request = require('supertest');
const contractRejectionRouter = require('../src/modules/contracts/contract-rejection.routes').default;

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const companyContractId = 'contract-lifecycle-integration-company';
const emailPrefix = 'contract-lifecycle-test-';
let sequence = 0;

const tokenHash = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

async function seedBase() {
  sequence += 1;
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: companyContractId,
      name: 'Professor',
      code: `contract-lifecycle-professor-${sequence}`,
      isActive: true,
    },
  });
  const professorUser = await prisma.user.create({
    data: {
      email: `${emailPrefix}professor-${sequence}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Professor Ciclo Contratual' } },
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
      email: `${emailPrefix}aluno-${sequence}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.aluno,
      profile: { create: { name: 'Aluno Ciclo Contratual' } },
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
      name: 'Modelo de Teste',
      version: 1,
      status: 'ACTIVE',
      headerHtml: '',
      footerHtml: '',
    },
  });

  return { professor, aluno, template };
}

async function createGeneratedContract(input: {
  alunoId: string;
  professorId: string;
  templateId: string;
  status: ContractStatus;
  token?: string;
  tokenExpiresAt?: Date;
  signedAt?: Date;
  title: string;
}) {
  return prisma.contract.create({
    data: {
      companyContractId,
      templateId: input.templateId,
      templateVersion: 1,
      alunoId: input.alunoId,
      professorId: input.professorId,
      status: input.status,
      title: input.title,
      renderedHtml: `<p>${input.title}</p>`,
      dataSnapshot: {},
      publicTokenHash: input.token ? tokenHash(input.token) : null,
      publicTokenExpiresAt: input.tokenExpiresAt,
      signedAt: input.signedAt,
    },
  });
}

async function createFixture(options: {
  candidateStatus?: ContractStatus;
  candidateStartDate?: Date | null;
  tokenExpiresAt?: Date;
} = {}) {
  sequence += 1;
  const { professor, aluno, template } = await seedBase();
  const oldSignedAt = new Date('2026-01-10T10:00:00.000Z');
  const oldDocument = await createGeneratedContract({
    alunoId: aluno.id,
    professorId: professor.id,
    templateId: template.id,
    status: ContractStatus.SIGNED,
    signedAt: oldSignedAt,
    title: 'Contrato vigente',
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

  const token = `candidate-token-${sequence}`;
  const candidateDocument = await createGeneratedContract({
    alunoId: aluno.id,
    professorId: professor.id,
    templateId: template.id,
    status: options.candidateStatus ?? ContractStatus.SENT,
    token,
    tokenExpiresAt:
      options.tokenExpiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
    title: 'Contrato substituto',
  });
  const candidateLink = await prisma.studentContract.create({
    data: {
      alunoId: aluno.id,
      contractId: candidateDocument.id,
      status: 'draft',
      startDate: options.candidateStartDate ?? null,
    },
  });

  return {
    aluno,
    oldLink,
    candidateDocument,
    candidateLink,
    token,
  };
}

async function readLifecycle(alunoId: string) {
  const [aluno, links] = await Promise.all([
    prisma.aluno.findUniqueOrThrow({ where: { id: alunoId } }),
    prisma.studentContract.findMany({
      where: { alunoId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return { aluno, links };
}

describeDatabase('student contract lifecycle with PostgreSQL', () => {
  const app = express();
  app.use(express.json());
  app.use('/contracts', contractRejectionRouter);

  beforeEach(async () => {
    sequence = 0;
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '57365610000301',
        name: 'Contrato Ciclo de Vida',
      },
    });
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "test_fail_contract_activation" ON "StudentContract"'
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS "test_fail_contract_activation_update"()'
    );
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each([
    [ContractStatus.DRAFT, 'draft'],
    [ContractStatus.SENT, 'pending_signature'],
    [ContractStatus.VIEWED, 'pending_signature'],
  ])(
    'keeps the current contract active while candidate document is %s',
    async (documentStatus, expectedCandidateStatus) => {
      const fixture = await createFixture({ candidateStatus: documentStatus });

      const result = await studentContractLifecycleService.prepareOrActivateStudentContract(
        fixture.candidateLink.id
      );
      const lifecycle = await readLifecycle(fixture.aluno.id);

      expect(result.reason).toBe('awaiting_signature');
      expect(result.studentContract.status).toBe(expectedCandidateStatus);
      expect(lifecycle.links.filter((link) => link.status === 'active')).toHaveLength(1);
      expect(lifecycle.aluno.currentStudentContractId).toBe(fixture.oldLink.id);
    }
  );

  it('records rejection, invalidates the token and preserves the current contract', async () => {
    const fixture = await createFixture();

    const response = await request(app)
      .post(`/contracts/public/${fixture.token}/reject`)
      .send({ reason: 'Não concordo com as condições' });

    expect(response.status).toBe(200);
    const [candidateDocument, candidateLink, audit, lifecycle] = await Promise.all([
      prisma.contract.findUniqueOrThrow({ where: { id: fixture.candidateDocument.id } }),
      prisma.studentContract.findUniqueOrThrow({ where: { id: fixture.candidateLink.id } }),
      prisma.contractAuditLog.findFirstOrThrow({
        where: { contractId: fixture.candidateDocument.id, action: 'UPDATED' },
        orderBy: { createdAt: 'desc' },
      }),
      readLifecycle(fixture.aluno.id),
    ]);

    expect(candidateDocument.publicTokenHash).toBeNull();
    expect(candidateLink.status).toBe('canceled');
    expect(audit.details).toEqual(
      expect.objectContaining({ rejectionReason: 'Não concordo com as condições' })
    );
    expect(lifecycle.aluno.currentStudentContractId).toBe(fixture.oldLink.id);
    expect(lifecycle.links.filter((link) => link.status === 'active')).toHaveLength(1);
    await expect(
      studentContractLifecycleService.signPublicContract(fixture.token, {
        signerName: 'Aluno Teste',
        signerCpf: '12345678901',
      })
    ).rejects.toThrow('Link inválido ou já utilizado');
  });

  it('expires the candidate without changing the current contract', async () => {
    const fixture = await createFixture({
      tokenExpiresAt: new Date(Date.now() - 60_000),
    });

    await expect(
      studentContractLifecycleService.signPublicContract(fixture.token, {
        signerName: 'Aluno Teste',
        signerCpf: '12345678901',
      })
    ).rejects.toThrow('Link expirado');

    const lifecycle = await readLifecycle(fixture.aluno.id);
    const candidate = lifecycle.links.find((link) => link.id === fixture.candidateLink.id);
    expect(candidate?.status).toBe('expired');
    expect(lifecycle.aluno.currentStudentContractId).toBe(fixture.oldLink.id);
    expect(lifecycle.links.filter((link) => link.status === 'active')).toHaveLength(1);
  });

  it('does not reactivate a canceled candidate', async () => {
    const fixture = await createFixture();
    await prisma.$transaction([
      prisma.contract.update({
        where: { id: fixture.candidateDocument.id },
        data: { status: ContractStatus.CANCELLED },
      }),
      prisma.studentContract.update({
        where: { id: fixture.candidateLink.id },
        data: { status: 'canceled', canceledAt: new Date() },
      }),
    ]);

    await expect(
      studentContractLifecycleService.prepareOrActivateStudentContract(
        fixture.candidateLink.id
      )
    ).rejects.toThrow('não está disponível para ativação');

    const lifecycle = await readLifecycle(fixture.aluno.id);
    expect(lifecycle.aluno.currentStudentContractId).toBe(fixture.oldLink.id);
    expect(lifecycle.links.filter((link) => link.status === 'active')).toHaveLength(1);
  });

  it('activates immediately and updates the current pointer in the same transaction', async () => {
    const fixture = await createFixture({ candidateStartDate: null });

    const result = await studentContractLifecycleService.signPublicContract(
      fixture.token,
      {
        signerName: 'Aluno Teste',
        signerCpf: '12345678901',
        signerEmail: 'aluno@example.com',
      }
    );
    const lifecycle = await readLifecycle(fixture.aluno.id);
    const oldLink = lifecycle.links.find((link) => link.id === fixture.oldLink.id)!;
    const candidate = lifecycle.links.find(
      (link) => link.id === fixture.candidateLink.id
    )!;

    expect(result.activation.scheduled).toBe(false);
    expect(candidate.status).toBe('active');
    expect(oldLink.status).toBe('terminated');
    expect(oldLink.endDate?.toISOString()).toBe(candidate.startDate?.toISOString());
    expect(lifecycle.aluno.currentStudentContractId).toBe(candidate.id);
    expect(lifecycle.links.filter((link) => link.status === 'active')).toHaveLength(1);
  });

  it('keeps the current contract until the future effective date and scheduler activation', async () => {
    const effectiveAt = new Date(Date.now() + 60 * 60 * 1000);
    const fixture = await createFixture({ candidateStartDate: effectiveAt });

    const signed = await studentContractLifecycleService.signPublicContract(
      fixture.token,
      {
        signerName: 'Aluno Teste',
        signerCpf: '12345678901',
      }
    );
    const beforeDue = await readLifecycle(fixture.aluno.id);

    expect(signed.activation.scheduled).toBe(true);
    expect(beforeDue.aluno.currentStudentContractId).toBe(fixture.oldLink.id);
    expect(
      beforeDue.links.find((link) => link.id === fixture.candidateLink.id)?.status
    ).toBe('pending_signature');

    expect(
      (
        await studentContractLifecycleService.activateDueSignedContracts(
          new Date(effectiveAt.getTime() - 1)
        )
      ).activated
    ).toBe(0);

    const dueRun = await studentContractLifecycleService.activateDueSignedContracts(
      effectiveAt
    );
    const afterDue = await readLifecycle(fixture.aluno.id);
    const oldLink = afterDue.links.find((link) => link.id === fixture.oldLink.id)!;
    const candidate = afterDue.links.find(
      (link) => link.id === fixture.candidateLink.id
    )!;

    expect(dueRun.activated).toBe(1);
    expect(candidate.status).toBe('active');
    expect(candidate.startDate?.toISOString()).toBe(effectiveAt.toISOString());
    expect(oldLink.status).toBe('terminated');
    expect(oldLink.endDate?.toISOString()).toBe(effectiveAt.toISOString());
    expect(afterDue.aluno.currentStudentContractId).toBe(candidate.id);
  });

  it('claims a public token once under concurrent signature attempts', async () => {
    const fixture = await createFixture();

    const results = await Promise.allSettled([
      studentContractLifecycleService.signPublicContract(fixture.token, {
        signerName: 'Aluno Teste',
        signerCpf: '12345678901',
      }),
      studentContractLifecycleService.signPublicContract(fixture.token, {
        signerName: 'Aluno Teste',
        signerCpf: '12345678901',
      }),
    ]);
    const lifecycle = await readLifecycle(fixture.aluno.id);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(
      await prisma.contractSignature.count({
        where: { contractId: fixture.candidateDocument.id },
      })
    ).toBe(1);
    expect(lifecycle.links.filter((link) => link.status === 'active')).toHaveLength(1);
  });

  it('keeps a single active contract under concurrent scheduler runs', async () => {
    const effectiveAt = new Date(Date.now() + 60 * 60 * 1000);
    const fixture = await createFixture({ candidateStartDate: effectiveAt });
    await studentContractLifecycleService.signPublicContract(fixture.token, {
      signerName: 'Aluno Teste',
      signerCpf: '12345678901',
    });

    await Promise.all([
      studentContractLifecycleService.activateDueSignedContracts(effectiveAt),
      studentContractLifecycleService.activateDueSignedContracts(effectiveAt),
    ]);

    const lifecycle = await readLifecycle(fixture.aluno.id);
    expect(lifecycle.links.filter((link) => link.status === 'active')).toHaveLength(1);
    expect(lifecycle.aluno.currentStudentContractId).toBe(fixture.candidateLink.id);
  });

  it('rolls back signature, token claim and activation when the transaction fails', async () => {
    const fixture = await createFixture();
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "test_fail_contract_activation_update"()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."id" = '${fixture.candidateLink.id}' AND NEW."status" = 'active' THEN
          RAISE EXCEPTION 'injected activation failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "test_fail_contract_activation"
      BEFORE UPDATE ON "StudentContract"
      FOR EACH ROW EXECUTE FUNCTION "test_fail_contract_activation_update"()
    `);

    await expect(
      studentContractLifecycleService.signPublicContract(fixture.token, {
        signerName: 'Aluno Teste',
        signerCpf: '12345678901',
      })
    ).rejects.toThrow();

    const [candidateDocument, candidateLink, lifecycle, signatures] =
      await Promise.all([
        prisma.contract.findUniqueOrThrow({
          where: { id: fixture.candidateDocument.id },
        }),
        prisma.studentContract.findUniqueOrThrow({
          where: { id: fixture.candidateLink.id },
        }),
        readLifecycle(fixture.aluno.id),
        prisma.contractSignature.count({
          where: { contractId: fixture.candidateDocument.id },
        }),
      ]);

    expect(candidateDocument.status).toBe(ContractStatus.SENT);
    expect(candidateDocument.publicTokenHash).toBe(tokenHash(fixture.token));
    expect(candidateLink.status).toBe('draft');
    expect(signatures).toBe(0);
    expect(lifecycle.aluno.currentStudentContractId).toBe(fixture.oldLink.id);
    expect(lifecycle.links.filter((link) => link.status === 'active')).toHaveLength(1);
  });

  it('activates the remaining valid candidates when one candidate fails within the same scheduler batch', async () => {
    // Regressao: activateDueSignedContracts roda todos os candidatos do lote
    // dentro de UMA unica transacao externa (necessaria para o advisory lock
    // que serializa execucoes concorrentes do scheduler). Em Postgres, um erro
    // real (nao apenas um throw de JS) aborta a transacao inteira ate um
    // ROLLBACK/ROLLBACK TO SAVEPOINT. Sem SAVEPOINT por candidato, a falha de
    // um candidato derrubava silenciosamente os demais candidatos validos do
    // mesmo lote. Usa-se um trigger real de Postgres (mesma tecnica do teste
    // acima) para injetar uma falha genuina de SQL em um unico candidato.
    const effectiveAt = new Date(Date.now() + 60 * 60 * 1000);
    const healthyFixture = await createFixture({ candidateStartDate: effectiveAt });
    const failingFixture = await createFixture({ candidateStartDate: effectiveAt });

    await studentContractLifecycleService.signPublicContract(healthyFixture.token, {
      signerName: 'Aluno Saudavel',
      signerCpf: '12345678901',
    });
    await studentContractLifecycleService.signPublicContract(failingFixture.token, {
      signerName: 'Aluno Com Falha',
      signerCpf: '12345678901',
    });

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "test_fail_contract_activation_update"()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."id" = '${failingFixture.candidateLink.id}' AND NEW."status" = 'active' THEN
          RAISE EXCEPTION 'injected activation failure for batch isolation test';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "test_fail_contract_activation"
      BEFORE UPDATE ON "StudentContract"
      FOR EACH ROW EXECUTE FUNCTION "test_fail_contract_activation_update"()
    `);

    const result = await studentContractLifecycleService.activateDueSignedContracts(
      effectiveAt
    );

    expect(result.activated).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      partyType: 'STUDENT',
      linkId: failingFixture.candidateLink.id,
    });
    expect(result.failures[0].error).toContain('injected activation failure');

    const [healthyLifecycle, failingLifecycle] = await Promise.all([
      readLifecycle(healthyFixture.aluno.id),
      readLifecycle(failingFixture.aluno.id),
    ]);

    const healthyCandidate = healthyLifecycle.links.find(
      (link) => link.id === healthyFixture.candidateLink.id
    )!;
    expect(healthyCandidate.status).toBe('active');
    expect(healthyLifecycle.aluno.currentStudentContractId).toBe(
      healthyFixture.candidateLink.id
    );
    expect(healthyLifecycle.links.filter((link) => link.status === 'active')).toHaveLength(1);

    const failingCandidate = failingLifecycle.links.find(
      (link) => link.id === failingFixture.candidateLink.id
    )!;
    expect(failingCandidate.status).not.toBe('active');
    expect(failingLifecycle.aluno.currentStudentContractId).toBe(
      failingFixture.oldLink.id
    );
    expect(failingLifecycle.links.filter((link) => link.status === 'active')).toHaveLength(1);
  });
});
