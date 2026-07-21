import fs from 'fs';
import path from 'path';
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';

const migrationRelativePath = path.join(
  'prisma',
  'migrations',
  '20260720213000_issue_263_generalize_contract_parties',
  'migration.sql'
);

const resolveMigrationPath = () => {
  const packagePath = path.resolve(process.cwd(), migrationRelativePath);
  if (fs.existsSync(packagePath)) return packagePath;
  return path.resolve(process.cwd(), 'apps', 'api', migrationRelativePath);
};

const migration = fs.readFileSync(resolveMigrationPath(), 'utf8');
const backfillStart = migration.indexOf('INSERT INTO "CollaboratorContract" (');
const backfillEnd = migration.indexOf(
  'CREATE OR REPLACE FUNCTION validate_generated_contract_party()',
  backfillStart
);
const legacyBackfillSql = migration.slice(backfillStart, backfillEnd).trim();

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();
const companyContractId = 'issue-263-legacy-backfill-company';
const emailPrefix = 'issue-263-legacy-backfill-';

async function cleanupLegacyFixtures() {
  const collaborators = await prisma.professor.findMany({
    where: { contractId: companyContractId },
    select: { id: true },
  });
  const collaboratorIds = collaborators.map((item) => item.id);
  if (collaboratorIds.length > 0) {
    await prisma.professor.updateMany({
      where: { id: { in: collaboratorIds } },
      data: { currentCollaboratorContractId: null },
    });
    await prisma.collaboratorContract.deleteMany({
      where: { collaboratorId: { in: collaboratorIds } },
    });
  }
  await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
}

async function seedLegacyProfessor(input: {
  suffix: string;
  cpf: string;
  hasSignedContract: boolean;
  signedContractDocumentUrl: string | null;
  collaboratorFunctionId: string;
}) {
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}${input.suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: {
        create: {
          name: `Colaborador legado ${input.suffix}`,
          cpf: input.cpf,
        },
      },
    },
  });

  return prisma.professor.create({
    data: {
      userId: user.id,
      contractId: companyContractId,
      collaboratorFunctionId: input.collaboratorFunctionId,
      role: ProfessorRole.master,
      hasSignedContract: input.hasSignedContract,
      signedContractDocumentUrl: input.signedContractDocumentUrl,
    },
  });
}

describe('issue 263 collaborator contract migration', () => {
  it('represents exactly one typed party on generated documents', () => {
    expect(migration).toContain('"GeneratedContract_exactly_one_party_check"');
    expect(migration).toContain('"partyType" = \'STUDENT\'');
    expect(migration).toContain('"partyType" = \'COLLABORATOR\'');
    expect(migration).toContain('"collaboratorId" IS NOT NULL');
  });

  it('enforces one active contract per student and per collaborator', () => {
    expect(migration).toContain('"StudentContract_one_active_per_aluno_key"');
    expect(migration).toContain('"CollaboratorContract_one_active_per_collaborator_key"');
    expect(migration.match(/WHERE "status" = 'active'/gu)).toHaveLength(2);
  });

  it('protects tenant, template and party combinations in the database', () => {
    expect(migration).toContain('validate_generated_contract_party');
    expect(migration).toContain('Template and generated contract must belong to the same tenant');
    expect(migration).toContain('Student and generated contract must belong to the same tenant');
    expect(migration).toContain('Collaborator and generated contract must belong to the same tenant');
    expect(migration).toContain('validate_student_contract_document_party');
    expect(migration).toContain('validate_collaborator_contract_document_party');
  });

  it('keeps legacy records outside the electronic lifecycle', () => {
    expect(migration).toContain('"CollaboratorContract_origin_shape_check"');
    expect(migration).toContain('"origin" = \'ELECTRONIC\' AND "contractId" IS NOT NULL');
    expect(migration).toContain('"status" = \'legacy\'');
  });
});

describeDatabase('issue 263 legacy collaborator backfill with previous data', () => {
  beforeEach(async () => {
    await cleanupLegacyFixtures();
  });

  afterEach(async () => {
    await cleanupLegacyFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('backfills previous collaborator data idempotently without fabricating electronic evidence', async () => {
    expect(backfillStart).toBeGreaterThanOrEqual(0);
    expect(backfillEnd).toBeGreaterThan(backfillStart);

    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '57365610000701',
        name: 'Contrato teste legado issue 263',
      },
    });
    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId: companyContractId,
        name: 'Professor',
        code: 'issue-263-legacy-professor',
        isActive: true,
      },
    });

    const legacyPdf = await seedLegacyProfessor({
      suffix: 'pdf',
      cpf: '26300000001',
      hasSignedContract: true,
      signedContractDocumentUrl: 'https://example.com/contrato-legado.pdf',
      collaboratorFunctionId: collaboratorFunction.id,
    });
    const legacyDeclaration = await seedLegacyProfessor({
      suffix: 'declaration',
      cpf: '26300000002',
      hasSignedContract: true,
      signedContractDocumentUrl: null,
      collaboratorFunctionId: collaboratorFunction.id,
    });
    const legacyUrlOnly = await seedLegacyProfessor({
      suffix: 'url-only',
      cpf: '26300000003',
      hasSignedContract: false,
      signedContractDocumentUrl: 'https://example.com/contrato-url-only.pdf',
      collaboratorFunctionId: collaboratorFunction.id,
    });
    const collaboratorIds = [legacyPdf.id, legacyDeclaration.id, legacyUrlOnly.id];

    await prisma.$executeRawUnsafe(legacyBackfillSql);
    const firstExecution = await prisma.collaboratorContract.findMany({
      where: { collaboratorId: { in: collaboratorIds } },
      orderBy: { collaboratorId: 'asc' },
    });
    await prisma.$executeRawUnsafe(legacyBackfillSql);
    const secondExecution = await prisma.collaboratorContract.findMany({
      where: { collaboratorId: { in: collaboratorIds } },
      orderBy: { collaboratorId: 'asc' },
    });

    expect(firstExecution).toHaveLength(3);
    expect(secondExecution).toHaveLength(3);
    expect(secondExecution.map((item) => item.id)).toEqual(firstExecution.map((item) => item.id));
    expect(secondExecution.every((item) => (
      item.status === 'legacy'
      && item.contractId === null
      && item.startDate === null
      && item.endDate === null
      && item.signedAt === null
      && item.canceledAt === null
    ))).toBe(true);

    const byCollaborator = new Map(secondExecution.map((item) => [item.collaboratorId, item]));
    expect(byCollaborator.get(legacyPdf.id)).toMatchObject({
      origin: 'LEGACY_PDF',
      legacyDocumentUrl: 'https://example.com/contrato-legado.pdf',
      legacySourceKey: `professor:${legacyPdf.id}`,
    });
    expect(byCollaborator.get(legacyDeclaration.id)).toMatchObject({
      origin: 'LEGACY_DECLARATION',
      legacyDocumentUrl: null,
      legacySourceKey: `professor:${legacyDeclaration.id}`,
    });
    expect(byCollaborator.get(legacyUrlOnly.id)).toMatchObject({
      origin: 'LEGACY_PDF',
      legacyDocumentUrl: 'https://example.com/contrato-url-only.pdf',
      legacySourceKey: `professor:${legacyUrlOnly.id}`,
    });

    expect(await prisma.contract.count({ where: { companyContractId } })).toBe(0);
    expect(await prisma.contractSignature.count({
      where: { contract: { companyContractId } },
    })).toBe(0);
    expect(await prisma.contractAuditLog.count({
      where: { contract: { companyContractId } },
    })).toBe(0);
  });
});
