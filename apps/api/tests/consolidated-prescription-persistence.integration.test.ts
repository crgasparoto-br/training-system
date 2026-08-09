import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
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
const concurrentPrisma = new PrismaClient();
const service = createConsolidatedPrescriptionService(prisma);
const concurrentService = createConsolidatedPrescriptionService(concurrentPrisma);

const PRIMARY_CONTRACT_ID = 'issue-316-primary-contract';
const FOREIGN_CONTRACT_ID = 'issue-316-foreign-contract';
const EMAIL_PREFIX = 'issue-316-';
const CAPACITIES = ['resisted', 'flexibility', 'cyclic', 'balance'] as const;

type TenantFixture = {
  contractId: string;
  professorId: string;
  alunoId: string;
};

type CapacityFixture = {
  prescriptionId: string;
  versionId: string;
  capacity: (typeof CAPACITIES)[number];
  version: number;
  source: {
    sourceType: 'prontuario_goal';
    sourceId: string;
    label: string;
    assessedAt: Date | null;
    origin: string;
    sourceVersion: string;
    responsibleProfessorId: string;
  };
};

function contextFor(fixture: TenantFixture) {
  return {
    contractId: fixture.contractId,
    alunoId: fixture.alunoId,
    actorProfessorId: fixture.professorId,
  };
}

function capacityBlocks(capacities: CapacityFixture[]) {
  return capacities.map((entry, position) => ({
    capacityPrescriptionVersionId: entry.versionId,
    position,
  }));
}

async function cleanupFixtures() {
  await prisma.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS "test_issue316_delay_assembly_update" ON "ConsolidatedPrescription"'
  );
  await prisma.$executeRawUnsafe(
    'DROP FUNCTION IF EXISTS "test_issue316_delay_assembly_update"()'
  );

  await prisma.consolidatedPrescription.deleteMany({
    where: { contractId: { in: [PRIMARY_CONTRACT_ID, FOREIGN_CONTRACT_ID] } },
  });
  await prisma.capacityPrescription.deleteMany({
    where: { contractId: { in: [PRIMARY_CONTRACT_ID, FOREIGN_CONTRACT_ID] } },
  });
  await prisma.prontuarioRecord.deleteMany({
    where: { contractId: { in: [PRIMARY_CONTRACT_ID, FOREIGN_CONTRACT_ID] } },
  });
  await prisma.aluno.deleteMany({
    where: { contractId: { in: [PRIMARY_CONTRACT_ID, FOREIGN_CONTRACT_ID] } },
  });
  await prisma.professor.deleteMany({
    where: { contractId: { in: [PRIMARY_CONTRACT_ID, FOREIGN_CONTRACT_ID] } },
  });
  await prisma.collaboratorFunctionOption.deleteMany({
    where: { contractId: { in: [PRIMARY_CONTRACT_ID, FOREIGN_CONTRACT_ID] } },
  });
  await prisma.companyContract.deleteMany({
    where: { id: { in: [PRIMARY_CONTRACT_ID, FOREIGN_CONTRACT_ID] } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
  });
}

async function seedTenant(
  contractId: string,
  document: string,
  suffix: string
): Promise<TenantFixture> {
  await prisma.companyContract.create({
    data: {
      id: contractId,
      type: ContractType.academy,
      document,
      name: `Issue 316 ${suffix}`,
    },
  });

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Professor',
      code: `issue-316-${suffix}-professor`,
      isActive: true,
    },
  });

  const professorUser = await prisma.user.create({
    data: {
      email: `${EMAIL_PREFIX}${suffix}-professor@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: `Professor ${suffix}` } },
    },
  });

  const professor = await prisma.professor.create({
    data: {
      userId: professorUser.id,
      contractId,
      collaboratorFunctionId: collaboratorFunction.id,
      role: ProfessorRole.master,
    },
  });

  const alunoId = await seedAluno(contractId, professor.id, `${suffix}-primary`);
  return { contractId, professorId: professor.id, alunoId };
}

async function seedAluno(contractId: string, professorId: string, suffix: string) {
  const alunoUser = await prisma.user.create({
    data: {
      email: `${EMAIL_PREFIX}${suffix}-aluno@example.com`,
      passwordHash: 'test-hash',
      type: UserType.aluno,
      profile: { create: { name: `Aluno ${suffix}` } },
    },
  });

  const aluno = await prisma.aluno.create({
    data: {
      userId: alunoUser.id,
      professorId,
      contractId,
      schedulePlan: 'free',
      age: 34,
    },
  });
  return aluno.id;
}

async function seedCapacity(
  fixture: TenantFixture,
  capacity: (typeof CAPACITIES)[number],
  options: { alunoId?: string; sourceSuffix?: string } = {}
): Promise<CapacityFixture> {
  const alunoId = options.alunoId ?? fixture.alunoId;
  const prescription = await prisma.capacityPrescription.create({
    data: {
      contractId: fixture.contractId,
      alunoId,
      capacity,
      status: 'active',
      currentVersion: 1,
      createdByProfessorId: fixture.professorId,
      updatedByProfessorId: fixture.professorId,
    },
  });

  return addCapacityVersion(
    fixture,
    prescription.id,
    capacity,
    1,
    options.sourceSuffix ?? `${capacity}-v1`,
    alunoId
  );
}

async function seedCapacitySet(
  fixture: TenantFixture,
  options: { alunoId?: string; sourcePrefix?: string } = {}
) {
  return Promise.all(
    CAPACITIES.map((capacity) =>
      seedCapacity(fixture, capacity, {
        alunoId: options.alunoId,
        sourceSuffix: `${options.sourcePrefix ?? 'set'}-${capacity}`,
      })
    )
  );
}

async function addCapacityVersion(
  fixture: TenantFixture,
  prescriptionId: string,
  capacity: (typeof CAPACITIES)[number],
  version: number,
  sourceSuffix: string,
  alunoId = fixture.alunoId
): Promise<CapacityFixture> {
  const source = {
    sourceType: 'prontuario_goal' as const,
    sourceId: `issue-316-source-${sourceSuffix}`,
    label: `Fonte ${capacity} v${version}`,
    assessedAt: null,
    origin: 'PRNT-316',
    sourceVersion: String(version),
    responsibleProfessorId: fixture.professorId,
  };

  const persistedVersion = await prisma.capacityPrescriptionVersion.create({
    data: {
      prescriptionId,
      contractId: fixture.contractId,
      alunoId,
      responsibleProfessorId: fixture.professorId,
      capacity,
      status: 'active',
      version,
      technicalJustification: `Prescrição ${capacity} v${version}.`,
      professorSummary: `Resumo ${capacity} v${version}.`,
      studentMessage: `Orientação ${capacity} v${version}.`,
      sources: {
        create: [source],
      },
    },
  });

  return {
    prescriptionId,
    versionId: persistedVersion.id,
    capacity,
    version,
    source,
  };
}

async function seedProntuarioGoal(
  fixture: TenantFixture,
  suffix: string,
  alunoId = fixture.alunoId
) {
  const record = await prisma.prontuarioRecord.create({
    data: {
      contractId: fixture.contractId,
      alunoId,
      professorId: fixture.professorId,
      code: `PRNT-316-${suffix}`,
      recordDate: new Date(),
    },
  });
  const goal = await prisma.prontuarioGoal.create({
    data: {
      recordId: record.id,
      title: `Objetivo ${suffix}`,
      status: 'active',
      priority: 0,
    },
  });
  return goal.id;
}

async function installConcurrentUpdateDelay() {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION "test_issue316_delay_assembly_update"()
    RETURNS trigger AS $$
    BEGIN
      PERFORM pg_sleep(0.25);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "test_issue316_delay_assembly_update"
    BEFORE UPDATE ON "ConsolidatedPrescription"
    FOR EACH ROW EXECUTE FUNCTION "test_issue316_delay_assembly_update"()
  `);
}

function databaseConnection() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL é obrigatória para integração da issue 316');
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
}

function apiRoot() {
  if (existsSync(path.join(process.cwd(), 'prisma', 'schema.prisma'))) {
    return process.cwd();
  }
  return path.join(process.cwd(), 'apps', 'api');
}

function runPsql(args: string[]) {
  const connection = databaseConnection();
  const root = apiRoot();
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--network',
      'host',
      '-e',
      `PGPASSWORD=${connection.password}`,
      '-v',
      `${root}:/workspace/apps/api:ro`,
      'postgres:16-alpine',
      'psql',
      '-h',
      connection.host,
      '-p',
      connection.port,
      '-U',
      connection.user,
      '-d',
      connection.database,
      ...args,
    ],
    { encoding: 'utf8' }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `psql issue 316 falhou (${result.status ?? 'sem status'}):\n${result.stdout}\n${result.stderr}`
    );
  }
  return result.stdout;
}

describeDatabase('consolidated prescription persistence - issue 316', () => {
  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await Promise.all([prisma.$disconnect(), concurrentPrisma.$disconnect()]);
  });

  it('persiste as quatro capacidades, versiona revisão/aprovação e preserva o histórico após a origem avançar', async () => {
    const tenant = await seedTenant(
      PRIMARY_CONTRACT_ID,
      '11224488000339',
      'primary'
    );
    const capacities = await seedCapacitySet(tenant, { sourcePrefix: 'history' });

    const draft = await service.createDraft(contextFor(tenant), {
      capacityBlocks: capacityBlocks(capacities),
      professorJustification: 'Montagem inicial com as quatro capacidades.',
      studentInstruction: 'Aguardar revisão técnica.',
    });

    expect(draft.currentVersion).toBe(1);
    expect(draft.latestVersion.capacityBlocks).toHaveLength(4);
    expect(
      draft.latestVersion.capacityBlocks.map((block) => block.capacity)
    ).toEqual(CAPACITIES);
    expect(draft.latestVersion.traceability.capacityCount).toBe(4);

    const review = await service.sendForReview(
      contextFor(tenant),
      { expectedCurrentVersion: 1 }
    );
    const approved = await service.approve(
      contextFor(tenant),
      { expectedCurrentVersion: review.currentVersion }
    );

    expect(approved.currentVersion).toBe(3);
    expect(approved.currentStatus).toBe('approved');
    expect(approved.latestVersion.canReleaseOperationalWorkout).toBe(true);

    const resistedV1 = capacities.find((entry) => entry.capacity === 'resisted');
    expect(resistedV1).toBeDefined();
    if (!resistedV1) throw new Error('Capacidade resistida não encontrada');

    const resistedV2 = await addCapacityVersion(
      tenant,
      resistedV1.prescriptionId,
      'resisted',
      2,
      'resisted-v2'
    );
    await prisma.capacityPrescription.update({
      where: { id: resistedV1.prescriptionId },
      data: {
        currentVersion: 2,
        status: 'active',
        updatedByProfessorId: tenant.professorId,
      },
    });

    const revision = await service.createRevision(contextFor(tenant), {
      expectedCurrentVersion: approved.currentVersion,
      reason: 'Abrir nova revisão após atualização de capacidade.',
    });
    expect(revision.currentVersion).toBe(4);
    expect(revision.currentStatus).toBe('draft');

    const revised = await service.updateComposition(contextFor(tenant), {
      expectedCurrentVersion: revision.currentVersion,
      capacityBlocks: capacities.map((entry, position) => ({
        capacityPrescriptionVersionId:
          entry.capacity === 'resisted' ? resistedV2.versionId : entry.versionId,
        position,
      })),
      professorJustification: 'Nova revisão após atualização da capacidade resistida.',
      studentInstruction: 'Nova composição em revisão.',
    });

    expect(revised.currentVersion).toBe(5);
    expect(revised.currentStatus).toBe('draft');

    const history = await service.getHistory(contextFor(tenant));
    expect(history).not.toBeNull();
    if (!history) throw new Error('Histórico consolidado não encontrado');
    expect(history.versions.map((version) => version.version)).toEqual([5, 4, 3, 2, 1]);

    const approvedVersion = history.versions.find((version) => version.version === 3);
    const latestVersion = history.versions.find((version) => version.version === 5);
    expect(approvedVersion?.status).toBe('approved');
    expect(latestVersion?.status).toBe('draft');

    expect(
      approvedVersion?.capacityBlocks.find((block) => block.capacity === 'resisted')
    ).toMatchObject({
      capacityPrescriptionVersionId: resistedV1.versionId,
      capacityVersion: 1,
      capacityStatus: 'active',
    });
    expect(
      latestVersion?.capacityBlocks.find((block) => block.capacity === 'resisted')
    ).toMatchObject({
      capacityPrescriptionVersionId: resistedV2.versionId,
      capacityVersion: 2,
      capacityStatus: 'active',
    });
    expect(approvedVersion?.capacityBlocks).toHaveLength(4);
    expect(approvedVersion?.traceability.capacityCount).toBe(4);
  });

  it('rejeita montagem incompleta mesmo quando as três versões informadas são válidas', async () => {
    const tenant = await seedTenant(
      PRIMARY_CONTRACT_ID,
      '11224488000339',
      'primary'
    );
    const capacities = await seedCapacitySet(tenant, { sourcePrefix: 'incomplete' });

    await expect(
      service.createDraft(contextFor(tenant), {
        capacityBlocks: capacityBlocks(capacities).slice(0, 3),
        professorJustification: 'Montagem incompleta não deve ser persistida.',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      details: { missingCapacities: ['balance'] },
    });

    expect(
      await prisma.consolidatedPrescription.count({
        where: { contractId: tenant.contractId, alunoId: tenant.alunoId },
      })
    ).toBe(0);
  });

  it('rejeita em runtime capacity_source forjado e desfaz a transação inteira', async () => {
    const tenant = await seedTenant(
      PRIMARY_CONTRACT_ID,
      '11224488000339',
      'primary'
    );
    const capacities = await seedCapacitySet(tenant, { sourcePrefix: 'forged-runtime' });
    const capacity = capacities.find((entry) => entry.capacity === 'resisted');
    if (!capacity) throw new Error('Capacidade resistida não encontrada');

    let caught: unknown;
    try {
      await service.createDraft(
        contextFor(tenant),
        {
          capacityBlocks: capacityBlocks(capacities),
          professorJustification: 'Tentativa adversarial.',
          dataRefs: [
            {
              role: 'capacity_source',
              sourceType: capacity.source.sourceType,
              sourceId: capacity.source.sourceId,
              label: capacity.source.label,
              assessedAt: null,
              origin: capacity.source.origin,
              sourceVersion: capacity.source.sourceVersion,
              responsibleProfessorId: capacity.source.responsibleProfessorId,
            },
          ],
        } as never
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(String(caught)).toContain(
      'capacity_source references are backend-owned and cannot be duplicated'
    );
    expect(
      await prisma.consolidatedPrescription.count({
        where: { contractId: tenant.contractId, alunoId: tenant.alunoId },
      })
    ).toBe(0);
  });

  it('rejeita referências de capacidade cross-tenant e cross-student antes de persistir a montagem', async () => {
    const primary = await seedTenant(
      PRIMARY_CONTRACT_ID,
      '11224488000339',
      'primary'
    );
    const foreign = await seedTenant(
      FOREIGN_CONTRACT_ID,
      '11224488000410',
      'foreign'
    );
    const siblingAlunoId = await seedAluno(
      primary.contractId,
      primary.professorId,
      'primary-sibling'
    );

    const foreignCapacity = await seedCapacity(foreign, 'resisted');
    const siblingCapacity = await seedCapacity(primary, 'flexibility', {
      alunoId: siblingAlunoId,
      sourceSuffix: 'sibling-flexibility',
    });

    await expect(
      service.createDraft(contextFor(primary), {
        capacityBlocks: [
          { capacityPrescriptionVersionId: foreignCapacity.versionId },
        ],
        professorJustification: 'Não deve aceitar outro contrato.',
      })
    ).rejects.toMatchObject({ code: 'INVALID_CAPACITY_VERSION' });

    await expect(
      service.createDraft(contextFor(primary), {
        capacityBlocks: [
          { capacityPrescriptionVersionId: siblingCapacity.versionId },
        ],
        professorJustification: 'Não deve aceitar outro aluno.',
      })
    ).rejects.toMatchObject({ code: 'INVALID_CAPACITY_VERSION' });

    expect(
      await prisma.consolidatedPrescription.count({
        where: { contractId: primary.contractId, alunoId: primary.alunoId },
      })
    ).toBe(0);
  });

  it('valida dataRefs adicionais no escopo canônico e rejeita cross-tenant/cross-student', async () => {
    const primary = await seedTenant(
      PRIMARY_CONTRACT_ID,
      '11224488000339',
      'primary'
    );
    const foreign = await seedTenant(
      FOREIGN_CONTRACT_ID,
      '11224488000410',
      'foreign'
    );
    const siblingAlunoId = await seedAluno(
      primary.contractId,
      primary.professorId,
      'primary-dataref-sibling'
    );
    const capacities = await seedCapacitySet(primary, { sourcePrefix: 'dataref' });
    const foreignGoalId = await seedProntuarioGoal(foreign, 'foreign-goal');
    const siblingGoalId = await seedProntuarioGoal(
      primary,
      'sibling-goal',
      siblingAlunoId
    );
    const ownGoalId = await seedProntuarioGoal(primary, 'own-goal');

    const createWithGoal = (sourceId: string) =>
      service.createDraft(contextFor(primary), {
        capacityBlocks: capacityBlocks(capacities),
        dataRefs: [
          {
            role: 'assessment',
            sourceType: 'prontuario_goal',
            sourceId,
            label: 'Objetivo complementar rastreável',
          },
        ],
        professorJustification: 'Validação de origem adicional.',
      });

    await expect(createWithGoal(foreignGoalId)).rejects.toMatchObject({
      code: 'INVALID_DATA_REFERENCE',
    });
    await expect(createWithGoal(siblingGoalId)).rejects.toMatchObject({
      code: 'INVALID_DATA_REFERENCE',
    });
    expect(
      await prisma.consolidatedPrescription.count({
        where: { contractId: primary.contractId, alunoId: primary.alunoId },
      })
    ).toBe(0);

    const accepted = await createWithGoal(ownGoalId);
    expect(accepted.currentVersion).toBe(1);
    expect(accepted.latestVersion.dataRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assessment',
          sourceType: 'prontuario_goal',
          sourceId: ownGoalId,
        }),
      ])
    );
  });

  it('bloqueia vínculo direto cross-tenant no trigger e impede excluir CapacityPrescriptionVersion em uso', async () => {
    const primary = await seedTenant(
      PRIMARY_CONTRACT_ID,
      '11224488000339',
      'primary'
    );
    const foreign = await seedTenant(
      FOREIGN_CONTRACT_ID,
      '11224488000410',
      'foreign'
    );
    const ownCapacities = await seedCapacitySet(primary, { sourcePrefix: 'integrity' });
    const ownCapacity = ownCapacities.find((entry) => entry.capacity === 'resisted');
    if (!ownCapacity) throw new Error('Capacidade resistida não encontrada');
    const foreignCapacity = await seedCapacity(foreign, 'flexibility');

    const assembly = await service.createDraft(contextFor(primary), {
      capacityBlocks: capacityBlocks(ownCapacities),
      professorJustification: 'Montagem usada para validar integridade do banco.',
    });

    let scopeError: unknown;
    try {
      await prisma.$executeRaw`
        INSERT INTO "ConsolidatedPrescriptionCapacityBlock" (
          "id", "assemblyVersionId", "contractId", "alunoId",
          "capacityPrescriptionVersionId", "capacity", "capacityVersion",
          "capacityStatus", "position", "createdAt"
        ) VALUES (
          ${randomUUID()}, ${assembly.latestVersion.id}, ${primary.contractId},
          ${primary.alunoId}, ${foreignCapacity.versionId}, 'flexibility', 1,
          'active', 4, ${new Date()}
        )
      `;
    } catch (error) {
      scopeError = error;
    }

    expect(scopeError).toBeDefined();
    expect(String(scopeError)).toContain(
      'capacity version outside consolidated assembly scope'
    );

    await expect(
      prisma.capacityPrescriptionVersion.delete({
        where: { id: ownCapacity.versionId },
      })
    ).rejects.toThrow();

    expect(
      await prisma.capacityPrescriptionVersion.findUnique({
        where: { id: ownCapacity.versionId },
      })
    ).not.toBeNull();

    await prisma.consolidatedPrescription.deleteMany({
      where: { contractId: primary.contractId, alunoId: primary.alunoId },
    });
    await expect(
      prisma.capacityPrescriptionVersion.delete({
        where: { id: ownCapacity.versionId },
      })
    ).resolves.toMatchObject({ id: ownCapacity.versionId });
  });

  it('rejeita uma de duas gravações concorrentes baseadas na mesma versão com conexões PostgreSQL distintas', async () => {
    const tenant = await seedTenant(
      PRIMARY_CONTRACT_ID,
      '11224488000339',
      'primary'
    );
    const capacities = await seedCapacitySet(tenant, { sourcePrefix: 'concurrency' });
    const blocks = capacityBlocks(capacities);

    await service.createDraft(contextFor(tenant), {
      capacityBlocks: blocks,
      professorJustification: 'Versão base da concorrência.',
    });
    await installConcurrentUpdateDelay();

    const writes = await Promise.allSettled([
      service.updateComposition(contextFor(tenant), {
        expectedCurrentVersion: 1,
        capacityBlocks: blocks,
        professorJustification: 'Escrita concorrente A.',
      }),
      concurrentService.updateComposition(contextFor(tenant), {
        expectedCurrentVersion: 1,
        capacityBlocks: blocks,
        professorJustification: 'Escrita concorrente B.',
      }),
    ]);

    const fulfilled = writes.filter((result) => result.status === 'fulfilled');
    const rejected = writes.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status !== 'rejected') {
      throw new Error('A corrida deveria rejeitar exatamente uma escrita');
    }
    expect(rejected[0].reason).toMatchObject({ code: 'CONFLICT' });

    const history = await service.getHistory(contextFor(tenant));
    expect(history?.assembly.currentVersion).toBe(2);
    expect(history?.versions).toHaveLength(2);
  });

  it('aplica as migrations da issue sobre schema PostgreSQL já populado sem destruir dados existentes', () => {
    const schema = `issue316_existing_${process.pid}_${Date.now()}`;
    const setupSql = `
      CREATE SCHEMA "${schema}";
      SET search_path TO "${schema}";

      CREATE TABLE "Contract" (
        "id" TEXT PRIMARY KEY
      );
      CREATE TABLE "Aluno" (
        "id" TEXT PRIMARY KEY,
        "contractId" TEXT NOT NULL
      );
      CREATE TABLE "Professor" (
        "id" TEXT PRIMARY KEY,
        "contractId" TEXT NOT NULL
      );
      CREATE TABLE "CapacityPrescriptionVersion" (
        "id" TEXT PRIMARY KEY,
        "contractId" TEXT NOT NULL,
        "alunoId" TEXT NOT NULL,
        "capacity" TEXT NOT NULL,
        "version" INTEGER NOT NULL,
        "status" TEXT NOT NULL
      );
      CREATE TABLE "CapacityPrescriptionSource" (
        "id" TEXT PRIMARY KEY,
        "versionId" TEXT NOT NULL,
        "sourceType" TEXT NOT NULL,
        "sourceId" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "assessedAt" TIMESTAMP(3),
        "origin" TEXT,
        "sourceVersion" TEXT,
        "responsibleProfessorId" TEXT
      );
      CREATE TABLE "WorkoutTemplate" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL
      );

      INSERT INTO "Contract" ("id") VALUES ('contract-existing');
      INSERT INTO "Aluno" ("id", "contractId") VALUES ('aluno-existing', 'contract-existing');
      INSERT INTO "Professor" ("id", "contractId") VALUES ('professor-existing', 'contract-existing');
      INSERT INTO "CapacityPrescriptionVersion" (
        "id", "contractId", "alunoId", "capacity", "version", "status"
      ) VALUES (
        'capacity-existing', 'contract-existing', 'aluno-existing', 'resisted', 1, 'active'
      );
      INSERT INTO "CapacityPrescriptionSource" (
        "id", "versionId", "sourceType", "sourceId", "label", "sourceVersion",
        "responsibleProfessorId"
      ) VALUES (
        'source-existing', 'capacity-existing', 'prontuario_goal', 'goal-existing',
        'Objetivo existente', '1', 'professor-existing'
      );
      INSERT INTO "WorkoutTemplate" ("id", "name")
      VALUES ('workout-before-316', 'Treino legado preservado');
    `;

    const assertionSql = `
      DO $$
      DECLARE
        consolidated_table_count INTEGER;
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM "${schema}"."WorkoutTemplate"
          WHERE "id" = 'workout-before-316'
            AND "name" = 'Treino legado preservado'
        ) THEN
          RAISE EXCEPTION 'existing WorkoutTemplate was not preserved';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM "${schema}"."CapacityPrescriptionVersion"
          WHERE "id" = 'capacity-existing'
        ) THEN
          RAISE EXCEPTION 'existing CapacityPrescriptionVersion was not preserved';
        END IF;

        SELECT COUNT(*) INTO consolidated_table_count
        FROM information_schema.tables
        WHERE table_schema = '${schema}'
          AND table_name IN (
            'ConsolidatedPrescription',
            'ConsolidatedPrescriptionVersion',
            'ConsolidatedPrescriptionCapacityBlock',
            'ConsolidatedPrescriptionDataRef'
          );

        IF consolidated_table_count <> 4 THEN
          RAISE EXCEPTION 'expected four consolidated prescription tables, found %', consolidated_table_count;
        END IF;
      END;
      $$;

      DROP SCHEMA "${schema}" CASCADE;
    `;

    runPsql([
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      setupSql,
      '-c',
      `SET search_path TO "${schema}"`,
      '-f',
      '/workspace/apps/api/prisma/migrations/20260808165000_issue_316_consolidated_prescription_persistence/migration.sql',
      '-f',
      '/workspace/apps/api/prisma/migrations/20260808220000_issue_316_capacity_source_authority_guard/migration.sql',
      '-c',
      assertionSql,
    ]);
  });
});
