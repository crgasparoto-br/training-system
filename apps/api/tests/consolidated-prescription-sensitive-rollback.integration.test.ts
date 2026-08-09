import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { createConsolidatedPrescriptionService } from '../src/modules/consolidated-prescriptions/consolidated-prescription.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
if (runDatabaseIntegrationTests) jest.setTimeout(30_000);

const prisma = new PrismaClient();
const service = createConsolidatedPrescriptionService(prisma);

const CONTRACT_ID = 'issue-317-rollback-contract';
const ALUNO_ID = 'issue-317-rollback-aluno';
const EMAIL_PREFIX = 'issue-317-rollback-';
const CAPACITIES = ['resisted', 'flexibility', 'cyclic', 'balance'] as const;
const FAILURE_TRIGGER = 'test_issue317_fail_approved_version_insert';
const FAILURE_FUNCTION = 'test_issue317_fail_approved_version_insert';

type Fixture = {
  professorId: string;
  capacityVersionIds: string[];
};

function contextFor(fixture: Fixture) {
  return {
    contractId: CONTRACT_ID,
    alunoId: ALUNO_ID,
    actorProfessorId: fixture.professorId,
  };
}

async function dropFailureTrigger() {
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS "${FAILURE_TRIGGER}" ON "ConsolidatedPrescriptionVersion"`
  );
  await prisma.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS "${FAILURE_FUNCTION}"()`
  );
}

async function cleanupFixtures() {
  await dropFailureTrigger();
  await prisma.consolidatedPrescription.deleteMany({
    where: { contractId: CONTRACT_ID },
  });
  await prisma.capacityPrescription.deleteMany({
    where: { contractId: CONTRACT_ID },
  });
  await prisma.aluno.deleteMany({
    where: { contractId: CONTRACT_ID },
  });
  await prisma.professor.deleteMany({
    where: { contractId: CONTRACT_ID },
  });
  await prisma.collaboratorFunctionOption.deleteMany({
    where: { contractId: CONTRACT_ID },
  });
  await prisma.companyContract.deleteMany({ where: { id: CONTRACT_ID } });
  await prisma.user.deleteMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
  });
}

async function seedFixture(): Promise<Fixture> {
  await prisma.companyContract.create({
    data: {
      id: CONTRACT_ID,
      type: ContractType.academy,
      document: '57365610000717',
      name: 'Issue 317 rollback',
    },
  });

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: CONTRACT_ID,
      name: 'Professor',
      code: 'issue-317-rollback-professor',
      isActive: true,
    },
  });

  const professorUser = await prisma.user.create({
    data: {
      email: `${EMAIL_PREFIX}professor@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Professor rollback' } },
    },
  });

  const professor = await prisma.professor.create({
    data: {
      userId: professorUser.id,
      contractId: CONTRACT_ID,
      collaboratorFunctionId: collaboratorFunction.id,
      role: ProfessorRole.master,
    },
  });

  const alunoUser = await prisma.user.create({
    data: {
      email: `${EMAIL_PREFIX}aluno@example.com`,
      passwordHash: 'test-hash',
      type: UserType.aluno,
      profile: { create: { name: 'Aluno rollback' } },
    },
  });

  await prisma.aluno.create({
    data: {
      id: ALUNO_ID,
      userId: alunoUser.id,
      professorId: professor.id,
      contractId: CONTRACT_ID,
      schedulePlan: 'free',
      age: 34,
    },
  });

  const capacityVersionIds: string[] = [];
  for (const capacity of CAPACITIES) {
    const prescription = await prisma.capacityPrescription.create({
      data: {
        contractId: CONTRACT_ID,
        alunoId: ALUNO_ID,
        capacity,
        status: 'active',
        currentVersion: 1,
        createdByProfessorId: professor.id,
        updatedByProfessorId: professor.id,
      },
    });
    const version = await prisma.capacityPrescriptionVersion.create({
      data: {
        prescriptionId: prescription.id,
        contractId: CONTRACT_ID,
        alunoId: ALUNO_ID,
        responsibleProfessorId: professor.id,
        capacity,
        status: 'active',
        version: 1,
        technicalJustification: `Justificativa ${capacity}.`,
        professorSummary: `Resumo ${capacity}.`,
        studentMessage: null,
      },
    });
    capacityVersionIds.push(version.id);
  }

  return { professorId: professor.id, capacityVersionIds };
}

async function installApprovalFailureTrigger() {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION "${FAILURE_FUNCTION}"()
    RETURNS trigger AS $$
    BEGIN
      IF NEW."status" = 'approved' THEN
        RAISE EXCEPTION 'forced issue317 approval persistence failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "${FAILURE_TRIGGER}"
    BEFORE INSERT ON "ConsolidatedPrescriptionVersion"
    FOR EACH ROW EXECUTE FUNCTION "${FAILURE_FUNCTION}"()
  `);
}

describeDatabase('consolidated prescription sensitive rollback - issue 317', () => {
  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('faz rollback integral quando a persistência da aprovação falha após o avanço transacional iniciar', async () => {
    const fixture = await seedFixture();
    const context = contextFor(fixture);
    const capacityBlocks = fixture.capacityVersionIds.map(
      (capacityPrescriptionVersionId, position) => ({
        capacityPrescriptionVersionId,
        position,
      })
    );

    await service.createDraft(context, {
      capacityBlocks,
      professorJustification: 'Montagem para validar rollback transacional.',
      studentInstruction: 'Aguardar revisão.',
    });
    const review = await service.sendForReview(context, {
      expectedCurrentVersion: 1,
    });
    expect(review.currentVersion).toBe(2);
    expect(review.currentStatus).toBe('ready_for_review');

    const aggregateBefore = await prisma.consolidatedPrescription.findFirstOrThrow({
      where: { contractId: CONTRACT_ID, alunoId: ALUNO_ID },
      select: {
        currentVersion: true,
        currentStatus: true,
        updatedByProfessorId: true,
        updatedAt: true,
      },
    });
    const versionCountBefore = await prisma.consolidatedPrescriptionVersion.count({
      where: { contractId: CONTRACT_ID, alunoId: ALUNO_ID },
    });
    const historyBefore = await service.getHistory(context);
    expect(historyBefore).not.toBeNull();
    if (!historyBefore) throw new Error('Histórico esperado antes da falha');

    await installApprovalFailureTrigger();

    await expect(
      service.approve(context, { expectedCurrentVersion: review.currentVersion })
    ).rejects.toThrow('forced issue317 approval persistence failure');

    const aggregateAfter = await prisma.consolidatedPrescription.findFirstOrThrow({
      where: { contractId: CONTRACT_ID, alunoId: ALUNO_ID },
      select: {
        currentVersion: true,
        currentStatus: true,
        updatedByProfessorId: true,
        updatedAt: true,
      },
    });
    const versionCountAfter = await prisma.consolidatedPrescriptionVersion.count({
      where: { contractId: CONTRACT_ID, alunoId: ALUNO_ID },
    });
    const approvedVersionCount = await prisma.consolidatedPrescriptionVersion.count({
      where: {
        contractId: CONTRACT_ID,
        alunoId: ALUNO_ID,
        status: 'approved',
      },
    });
    const historyAfter = await service.getHistory(context);
    expect(historyAfter).not.toBeNull();
    if (!historyAfter) throw new Error('Histórico esperado após a falha');

    expect(aggregateAfter).toEqual(aggregateBefore);
    expect(versionCountAfter).toBe(versionCountBefore);
    expect(approvedVersionCount).toBe(0);
    expect(historyAfter.assembly.currentVersion).toBe(2);
    expect(historyAfter.assembly.currentStatus).toBe('ready_for_review');
    expect(historyAfter.versions.map((version) => version.version)).toEqual(
      historyBefore.versions.map((version) => version.version)
    );
    expect(historyAfter.auditEvents).toEqual(historyBefore.auditEvents);
    expect(
      historyAfter.auditEvents.some((event) => event.action === 'approved')
    ).toBe(false);
  });
});
