import crypto from 'crypto';
import express from 'express';
import {
  ContractType,
  Prisma,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { studentContractLifecycleService } from '../src/modules/student-contracts/student-contract-lifecycle.service.js';
import { collaboratorContractService } from '../src/modules/contracts/collaborator-contract.service.js';

const request = require('supertest');
const contractRejectionRouter = require('../src/modules/contracts/contract-rejection.routes').default;

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const companyContractId = 'collaborator-contract-lifecycle-company';
const otherCompanyContractId = 'collaborator-contract-lifecycle-other-company';
const emailPrefix = 'collaborator-contract-lifecycle-';
let sequence = 0;

const tokenHash = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

async function insertGeneratedContract(input: {
  id: string;
  companyContractId: string;
  templateId: string;
  collaboratorId: string;
  status: 'GENERATED' | 'SENT' | 'VIEWED' | 'SIGNED' | 'CANCELLED' | 'EXPIRED';
  title: string;
  token?: string;
  tokenExpiresAt?: Date | null;
  signedAt?: Date | null;
}) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "GeneratedContract" (
      "id", "companyContractId", "templateId", "templateVersion",
      "alunoId", "collaboratorId", "partyType", "origin",
      "status", "title", "renderedHtml", "dataSnapshot",
      "publicTokenHash", "publicTokenExpiresAt", "signedAt",
      "createdAt", "updatedAt"
    ) VALUES (
      ${input.id}, ${input.companyContractId}, ${input.templateId}, 1,
      NULL, ${input.collaboratorId}, 'COLLABORATOR'::"ContractPartyType",
      'ELECTRONIC'::"ContractLinkOrigin",
      ${input.status}::"ContractStatus", ${input.title}, ${`<p>${input.title}</p>`},
      ${JSON.stringify({ party: { type: 'COLLABORATOR', id: input.collaboratorId } })}::jsonb,
      ${input.token ? tokenHash(input.token) : null}, ${input.tokenExpiresAt ?? null},
      ${input.signedAt ?? null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `);
}

async function insertCollaboratorLink(input: {
  id: string;
  collaboratorId: string;
  documentId: string;
  status: 'draft' | 'pending_signature' | 'active';
  startDate?: Date | null;
  signedAt?: Date | null;
}) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "CollaboratorContract" (
      "id", "collaboratorId", "contractId", "status", "origin",
      "startDate", "signedAt", "createdAt", "updatedAt"
    ) VALUES (
      ${input.id}, ${input.collaboratorId}, ${input.documentId},
      ${input.status}::"CollaboratorContractStatus", 'ELECTRONIC'::"ContractLinkOrigin",
      ${input.startDate ?? null}, ${input.signedAt ?? null},
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `);
}

async function seedCompany(id: string, suffix: string) {
  await prisma.companyContract.create({
    data: {
      id,
      type: ContractType.academy,
      document: `57365610${suffix.padStart(6, '0')}`,
      name: `Contrato ${suffix}`,
    },
  });

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: id,
      name: 'Professor',
      code: `contract-lifecycle-${suffix}`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}${suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: {
        create: {
          name: `Colaborador ${suffix}`,
          cpf: `${suffix.replace(/\D/gu, '').padStart(11, '0').slice(-11)}`,
        },
      },
    },
  });
  const collaborator = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId: id,
      collaboratorFunctionId: collaboratorFunction.id,
      role: ProfessorRole.master,
      currentStatus: 'Ativo',
    },
  });
  const template = await prisma.contractTemplate.create({
    data: {
      contractId: id,
      name: `Modelo ${suffix}`,
      version: 1,
      status: 'ACTIVE',
      headerHtml: '',
      footerHtml: '',
    },
  });
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "ContractTemplate"
    SET "applicability" = 'COLLABORATOR'::"ContractTemplateApplicability"
    WHERE "id" = ${template.id}
  `);
  return { collaborator, template };
}

async function createFixture(options: {
  candidateStatus?: 'SENT' | 'SIGNED';
  candidateStartDate?: Date | null;
  tokenExpiresAt?: Date | null;
} = {}) {
  sequence += 1;
  const { collaborator, template } = await seedCompany(
    companyContractId,
    `primary-${sequence}`
  );
  const oldSignedAt = new Date('2026-01-10T10:00:00.000Z');
  const oldDocumentId = `collaborator-old-document-${sequence}`;
  const oldLinkId = `collaborator-old-link-${sequence}`;
  await insertGeneratedContract({
    id: oldDocumentId,
    companyContractId,
    templateId: template.id,
    collaboratorId: collaborator.id,
    status: 'SIGNED',
    signedAt: oldSignedAt,
    title: 'Contrato vigente do colaborador',
  });
  await insertCollaboratorLink({
    id: oldLinkId,
    collaboratorId: collaborator.id,
    documentId: oldDocumentId,
    status: 'active',
    startDate: oldSignedAt,
    signedAt: oldSignedAt,
  });
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Professor"
    SET "currentCollaboratorContractId" = ${oldLinkId}
    WHERE "id" = ${collaborator.id}
  `);

  const token = `collaborator-candidate-token-${sequence}`;
  const candidateDocumentId = `collaborator-candidate-document-${sequence}`;
  const candidateLinkId = `collaborator-candidate-link-${sequence}`;
  await insertGeneratedContract({
    id: candidateDocumentId,
    companyContractId,
    templateId: template.id,
    collaboratorId: collaborator.id,
    status: options.candidateStatus ?? 'SENT',
    token: options.candidateStatus === 'SIGNED' ? undefined : token,
    tokenExpiresAt:
      options.candidateStatus === 'SIGNED'
        ? null
        : options.tokenExpiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
    signedAt: options.candidateStatus === 'SIGNED' ? new Date() : null,
    title: 'Contrato candidato do colaborador',
  });
  await insertCollaboratorLink({
    id: candidateLinkId,
    collaboratorId: collaborator.id,
    documentId: candidateDocumentId,
    status: 'draft',
    startDate: options.candidateStartDate ?? null,
  });

  return {
    collaborator,
    template,
    oldLinkId,
    candidateDocumentId,
    candidateLinkId,
    token,
  };
}

async function readLifecycle(collaboratorId: string) {
  const [professors, links] = await Promise.all([
    prisma.$queryRaw<Array<{ currentCollaboratorContractId: string | null }>>(Prisma.sql`
      SELECT "currentCollaboratorContractId"
      FROM "Professor"
      WHERE "id" = ${collaboratorId}
    `),
    prisma.$queryRaw<Array<{
      id: string;
      status: string;
      startDate: Date | null;
      endDate: Date | null;
    }>>(Prisma.sql`
      SELECT "id", "status"::text AS "status", "startDate", "endDate"
      FROM "CollaboratorContract"
      WHERE "collaboratorId" = ${collaboratorId}
      ORDER BY "createdAt" ASC
    `),
  ]);
  return { professor: professors[0], links };
}

async function cleanupFixtures() {
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "CollaboratorContract"
    WHERE "collaboratorId" IN (
      SELECT "id" FROM "Professor"
      WHERE "contractId" IN (${companyContractId}, ${otherCompanyContractId})
    )
  `);
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "GeneratedContract"
    WHERE "companyContractId" IN (${companyContractId}, ${otherCompanyContractId})
  `);
  await prisma.companyContract.deleteMany({
    where: { id: { in: [companyContractId, otherCompanyContractId] } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: emailPrefix } },
  });
}

describeDatabase('collaborator contract lifecycle with PostgreSQL', () => {
  const app = express();
  app.use(express.json());
  app.use('/contracts', contractRejectionRouter);

  beforeEach(async () => {
    sequence = 0;
    await cleanupFixtures();
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "test_delay_collaborator_signature_claim" ON "GeneratedContract"'
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS "test_delay_collaborator_signature_claim_update"()'
    );
    await cleanupFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('signs and replaces the active collaborator contract atomically', async () => {
    const fixture = await createFixture();

    const signed = await studentContractLifecycleService.signPublicContract(
      fixture.token,
      {
        signerName: 'Colaborador Teste',
        signerCpf: '12345678901',
        signerEmail: 'colaborador@example.com',
      }
    );
    const lifecycle = await readLifecycle(fixture.collaborator.id);
    const oldLink = lifecycle.links.find((item) => item.id === fixture.oldLinkId)!;
    const candidate = lifecycle.links.find((item) => item.id === fixture.candidateLinkId)!;

    expect(signed.activation.partyType).toBe('COLLABORATOR');
    expect(signed.activation.scheduled).toBe(false);
    expect(oldLink.status).toBe('terminated');
    expect(candidate.status).toBe('active');
    expect(oldLink.endDate?.toISOString()).toBe(candidate.startDate?.toISOString());
    expect(lifecycle.professor?.currentCollaboratorContractId).toBe(candidate.id);
    expect(lifecycle.links.filter((item) => item.status === 'active')).toHaveLength(1);
  });

  it('keeps the current contract until the planned start date', async () => {
    const effectiveAt = new Date(Date.now() + 60 * 60 * 1000);
    const fixture = await createFixture({ candidateStartDate: effectiveAt });

    const signed = await studentContractLifecycleService.signPublicContract(
      fixture.token,
      {
        signerName: 'Colaborador Teste',
        signerCpf: '12345678901',
      }
    );
    const beforeDue = await readLifecycle(fixture.collaborator.id);

    expect(signed.activation.scheduled).toBe(true);
    expect(beforeDue.professor?.currentCollaboratorContractId).toBe(fixture.oldLinkId);
    expect(beforeDue.links.find((item) => item.id === fixture.candidateLinkId)?.status)
      .toBe('pending_signature');

    expect((await studentContractLifecycleService.activateDueSignedContracts(
      new Date(effectiveAt.getTime() - 1)
    )).activated).toBe(0);

    expect((await studentContractLifecycleService.activateDueSignedContracts(effectiveAt)).activated)
      .toBe(1);
    const afterDue = await readLifecycle(fixture.collaborator.id);
    expect(afterDue.professor?.currentCollaboratorContractId).toBe(fixture.candidateLinkId);
    expect(afterDue.links.filter((item) => item.status === 'active')).toHaveLength(1);
  });

  it('rejects and expires candidates without changing the current contract', async () => {
    const rejectedFixture = await createFixture();
    const rejection = await request(app)
      .post(`/contracts/public/${rejectedFixture.token}/reject`)
      .send({ reason: 'Não concordo com as condições' });

    expect(rejection.status).toBe(200);
    const rejectedLifecycle = await readLifecycle(rejectedFixture.collaborator.id);
    expect(rejectedLifecycle.professor?.currentCollaboratorContractId)
      .toBe(rejectedFixture.oldLinkId);
    expect(rejectedLifecycle.links.find((item) => item.id === rejectedFixture.candidateLinkId)?.status)
      .toBe('canceled');
    expect(rejectedLifecycle.links.filter((item) => item.status === 'active')).toHaveLength(1);
    const rejectedSummary = await collaboratorContractService.summary(
      companyContractId,
      rejectedFixture.collaborator.id
    );
    const rejectedCandidate = rejectedSummary.history.find(
      (item) => item.id === rejectedFixture.candidateLinkId
    );
    expect(rejectedCandidate?.rejectedAt).toBeInstanceOf(Date);
    expect(rejectedCandidate?.rejectionReason).toBe('Não concordo com as condições');

    await cleanupFixtures();

    const expiredFixture = await createFixture({
      tokenExpiresAt: new Date(Date.now() - 60_000),
    });
    await expect(
      studentContractLifecycleService.signPublicContract(expiredFixture.token, {
        signerName: 'Colaborador Teste',
        signerCpf: '12345678901',
      })
    ).rejects.toThrow('Link expirado');

    const expiredLifecycle = await readLifecycle(expiredFixture.collaborator.id);
    expect(expiredLifecycle.professor?.currentCollaboratorContractId)
      .toBe(expiredFixture.oldLinkId);
    expect(expiredLifecycle.links.find((item) => item.id === expiredFixture.candidateLinkId)?.status)
      .toBe('expired');
    expect(expiredLifecycle.links.filter((item) => item.status === 'active')).toHaveLength(1);
  });

  it('serializes concurrent collaborator activations and leaves one active link', async () => {
    const fixture = await createFixture({ candidateStatus: 'SIGNED' });
    const secondDocumentId = 'collaborator-second-candidate-document';
    const secondLinkId = 'collaborator-second-candidate-link';
    await insertGeneratedContract({
      id: secondDocumentId,
      companyContractId,
      templateId: fixture.template.id,
      collaboratorId: fixture.collaborator.id,
      status: 'SIGNED',
      signedAt: new Date(),
      title: 'Segundo candidato concorrente',
    });
    await insertCollaboratorLink({
      id: secondLinkId,
      collaboratorId: fixture.collaborator.id,
      documentId: secondDocumentId,
      status: 'draft',
    });

    const results = await Promise.allSettled([
      studentContractLifecycleService.prepareOrActivateCollaboratorContract(
        fixture.candidateLinkId
      ),
      studentContractLifecycleService.prepareOrActivateCollaboratorContract(secondLinkId),
    ]);
    const lifecycle = await readLifecycle(fixture.collaborator.id);

    expect(results.filter((result) => result.status === 'fulfilled').length).toBeGreaterThan(0);
    expect(lifecycle.links.filter((item) => item.status === 'active')).toHaveLength(1);
    expect(lifecycle.professor?.currentCollaboratorContractId)
      .toBe(lifecycle.links.find((item) => item.status === 'active')?.id);
  });


  it('allows only the signature to win against a concurrent collaborator rejection', async () => {
    const fixture = await createFixture();

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "test_delay_collaborator_signature_claim_update"()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."id" = '${fixture.candidateDocumentId}' AND NEW."status" = 'SIGNED' THEN
          PERFORM pg_sleep(0.4);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "test_delay_collaborator_signature_claim"
      BEFORE UPDATE ON "GeneratedContract"
      FOR EACH ROW EXECUTE FUNCTION "test_delay_collaborator_signature_claim_update"()
    `);

    const signing = studentContractLifecycleService.signPublicContract(
      fixture.token,
      { signerName: 'Colaborador Teste', signerCpf: '12345678901' }
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const rejecting = request(app)
      .post(`/contracts/public/${fixture.token}/reject`)
      .send({ reason: 'Recusa concorrente' });

    const [signatureResult, rejectionResponse] = await Promise.all([signing, rejecting]);
    const [document, lifecycle, rejectionAuditCount] = await Promise.all([
      prisma.contract.findUniqueOrThrow({ where: { id: fixture.candidateDocumentId } }),
      readLifecycle(fixture.collaborator.id),
      prisma.contractAuditLog.count({
        where: {
          contractId: fixture.candidateDocumentId,
          action: 'UPDATED',
          details: { path: ['kind'], equals: 'STUDENT_REJECTION' },
        },
      }),
    ]);

    expect(signatureResult.activation.partyType).toBe('COLLABORATOR');
    expect([400, 404]).toContain(rejectionResponse.status);
    expect(rejectionResponse.body.error).toBe('Link inválido ou já utilizado');
    expect(document.status).toBe('SIGNED');
    expect(document.publicTokenHash).toBeNull();
    expect(lifecycle.professor?.currentCollaboratorContractId).toBe(fixture.candidateLinkId);
    expect(lifecycle.links.filter((item) => item.status === 'active')).toHaveLength(1);
    expect(rejectionAuditCount).toBe(0);
  });

  it('rejects template and collaborator combinations from different tenants', async () => {
    const first = await seedCompany(companyContractId, 'tenant-a');
    const second = await seedCompany(otherCompanyContractId, 'tenant-b');

    await expect(insertGeneratedContract({
      id: 'cross-tenant-collaborator-document',
      companyContractId,
      templateId: first.template.id,
      collaboratorId: second.collaborator.id,
      status: 'GENERATED',
      title: 'Contrato inválido entre tenants',
    })).rejects.toThrow('Collaborator and generated contract must belong to the same tenant');
  });
});
