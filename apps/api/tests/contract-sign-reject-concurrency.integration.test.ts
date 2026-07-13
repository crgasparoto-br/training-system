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

const companyContractId = 'contract-sign-reject-race-company';
const emailPrefix = 'contract-sign-reject-race-';

const tokenHash = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

async function seedFixture() {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: companyContractId,
      name: 'Professor',
      code: 'contract-sign-reject-race-professor',
      isActive: true,
    },
  });

  const professorUser = await prisma.user.create({
    data: {
      email: `${emailPrefix}professor@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Professor Concorrência' } },
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
      profile: { create: { name: 'Aluno Concorrência' } },
    },
  });

  const aluno = await prisma.aluno.create({
    data: {
      userId: alunoUser.id,
      professorId: professor.id,
      schedulePlan: 'free',
      age: 35,
    },
  });

  const template = await prisma.contractTemplate.create({
    data: {
      contractId: companyContractId,
      name: 'Modelo Concorrência',
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

  const token = 'contract-sign-reject-race-token';
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

  return {
    aluno,
    oldLink,
    candidateDocument,
    candidateLink,
    token,
  };
}

describeDatabase('concurrent public contract signature and rejection', () => {
  const app = express();
  app.use(express.json());
  app.use('/contracts', contractRejectionRouter);

  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '57365610000501',
        name: 'Contrato Concorrência',
      },
    });
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "test_delay_signature_claim" ON "Contract"'
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS "test_delay_signature_claim_update"()'
    );
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows only the signature to win against a concurrent rejection', async () => {
    const fixture = await seedFixture();

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "test_delay_signature_claim_update"()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."id" = '${fixture.candidateDocument.id}' AND NEW."status" = 'SIGNED' THEN
          PERFORM pg_sleep(0.4);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "test_delay_signature_claim"
      BEFORE UPDATE ON "Contract"
      FOR EACH ROW EXECUTE FUNCTION "test_delay_signature_claim_update"()
    `);

    const signing = studentContractLifecycleService.signPublicContract(
      fixture.token,
      {
        signerName: 'Aluno Concorrência',
        signerCpf: '12345678901',
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    const rejecting = request(app)
      .post(`/contracts/public/${fixture.token}/reject`)
      .send({ reason: 'Recusa concorrente' });

    const [signatureResult, rejectionResponse] = await Promise.all([
      signing,
      rejecting,
    ]);

    const [document, links, aluno, rejectionAuditCount] = await Promise.all([
      prisma.contract.findUniqueOrThrow({
        where: { id: fixture.candidateDocument.id },
      }),
      prisma.studentContract.findMany({
        where: { alunoId: fixture.aluno.id },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.aluno.findUniqueOrThrow({ where: { id: fixture.aluno.id } }),
      prisma.contractAuditLog.count({
        where: {
          contractId: fixture.candidateDocument.id,
          action: 'UPDATED',
          details: {
            path: ['kind'],
            equals: 'STUDENT_REJECTION',
          },
        },
      }),
    ]);

    const oldLink = links.find((link) => link.id === fixture.oldLink.id);
    const candidateLink = links.find(
      (link) => link.id === fixture.candidateLink.id
    );

    expect(signatureResult.activation.scheduled).toBe(false);
    expect([400, 404]).toContain(rejectionResponse.status);
    expect(rejectionResponse.body.error).toBe('Link inválido ou já utilizado');
    expect(document.status).toBe(ContractStatus.SIGNED);
    expect(document.publicTokenHash).toBeNull();
    expect(oldLink?.status).toBe('terminated');
    expect(candidateLink?.status).toBe('active');
    expect(aluno.currentStudentContractId).toBe(fixture.candidateLink.id);
    expect(links.filter((link) => link.status === 'active')).toHaveLength(1);
    expect(rejectionAuditCount).toBe(0);
  });
});