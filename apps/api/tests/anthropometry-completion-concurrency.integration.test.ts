import {
  ContractType,
  Prisma,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import {
  AnthropometryCorrectionAccessError,
  correctCompletedAnthropometry,
} from '../src/modules/anthropometry/anthropometry-correction.service.js';
import { anthropometryService } from '../src/modules/anthropometry/anthropometry.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;

const prisma = new PrismaClient();
const writerPrisma = new PrismaClient();
const completionPrisma = new PrismaClient();
const prefix = 'issue-382-atomic-';

type TenantFixture = Awaited<ReturnType<typeof seedTenant>>;

type CorrectionAuditRow = {
  id: string;
  assessmentId: string;
  contractId: string;
  alunoId: string;
  actorUserId: string | null;
  actorProfessorId: string | null;
  reason: string;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  createdAt: Date;
};

async function cleanupFixture() {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT set_config('app.anthropometry_correction', 'true', true)
    `);
    await tx.companyContract.deleteMany({
      where: { id: { startsWith: prefix } },
    });
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: prefix } },
  });
}

async function seedTenant(suffix: string) {
  const contractId = `${prefix}contract-${suffix}`;
  await prisma.companyContract.create({
    data: {
      id: contractId,
      type: ContractType.academy,
      document: `382${suffix.padStart(11, '0')}`.slice(0, 14),
      name: `Academia Issue 382 ${suffix}`,
    },
  });

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Professor',
      code: `${prefix}professor-${suffix}`,
      isActive: true,
    },
  });
  const professorUser = await prisma.user.create({
    data: {
      email: `${prefix}professor-${suffix}@example.com`,
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
  const studentUser = await prisma.user.create({
    data: {
      email: `${prefix}student-${suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.aluno,
      profile: { create: { name: `Aluno ${suffix}` } },
    },
  });
  const aluno = await prisma.aluno.create({
    data: {
      userId: studentUser.id,
      professorId: professor.id,
      contractId,
      schedulePlan: 'free',
      age: 30,
    },
  });
  const segment = await prisma.anthropometrySegment.create({
    data: {
      contractId,
      name: `Cintura ${suffix}`,
      type: 'principal',
      order: 10,
    },
  });

  return { contractId, collaboratorFunction, professorUser, professor, aluno, segment };
}

async function seedAssessment(fixture: TenantFixture, value: string | null = '80') {
  const assessment = await prisma.anthropometryAssessment.create({
    data: {
      contractId: fixture.contractId,
      alunoId: fixture.aluno.id,
      professorId: fixture.professor.id,
      code: 'ANTR-001',
      assessmentDate: new Date('2026-09-02T12:00:00.000Z'),
      notes: 'rascunho inicial',
    },
  });

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "AnthropometryAssessmentLifecycle"
      ("assessmentId", "contractId", "alunoId", "status")
    VALUES (${assessment.id}, ${fixture.contractId}, ${fixture.aluno.id}, 'DRAFT')
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "AnthropometrySegmentCompletionRequirement"
      ("segmentId", "contractId", "isRequired", "version")
    VALUES (${fixture.segment.id}, ${fixture.contractId}, true, 1)
    ON CONFLICT ("segmentId") DO UPDATE
    SET "isRequired" = true, "version" = 1
  `);

  const measurement = await prisma.anthropometryAssessmentValue.create({
    data: {
      assessmentId: assessment.id,
      segmentId: fixture.segment.id,
      value,
      unit: 'cm',
    },
  });
  const observation = await prisma.anthropometryObservation.create({
    data: {
      assessmentId: assessment.id,
      segmentId: fixture.segment.id,
      text: 'observação inicial',
    },
  });

  return { assessment, measurement, observation };
}

async function markCompleted(assessmentId: string, contractId: string) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "AnthropometryAssessmentLifecycle"
    SET "status" = 'COMPLETED',
        "completedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "assessmentId" = ${assessmentId}
      AND "contractId" = ${contractId}
  `);
}

async function listCorrectionAudits(assessmentId: string, contractId: string) {
  return prisma.$queryRaw<CorrectionAuditRow[]>(Prisma.sql`
    SELECT "id", "assessmentId", "contractId", "alunoId", "actorUserId", "actorProfessorId",
           "reason", "beforeSnapshot", "afterSnapshot", "createdAt"
    FROM "AnthropometryAssessmentCorrection"
    WHERE "assessmentId" = ${assessmentId}
      AND "contractId" = ${contractId}
    ORDER BY "createdAt" ASC
  `);
}

async function listCorrectionTimelineEvents(alunoId: string, contractId: string, assessmentId: string) {
  const events = await prisma.studentLifecycleEvent.findMany({
    where: {
      alunoId,
      contractId,
      eventType: 'STATUS_CHANGED',
    },
    select: { id: true, metadata: true },
  });

  return events.filter((event) => {
    const metadata = event.metadata as {
      domain?: string;
      action?: string;
      assessmentId?: string;
      correctionId?: string;
    } | null;
    return metadata?.domain === 'anthropometry' &&
      metadata.action === 'corrected' &&
      metadata.assessmentId === assessmentId;
  });
}

describeDatabase('Issue 382 completed Anthropometry atomic immutability', () => {
  beforeEach(cleanupFixture);
  afterEach(cleanupFixture);

  afterAll(async () => {
    await Promise.all([
      prisma.$disconnect(),
      writerPrisma.$disconnect(),
      completionPrisma.$disconnect(),
    ]);
  });

  it('blocks ordinary header, value and observation mutations after completion', async () => {
    const fixture = await seedTenant('a');
    const seeded = await seedAssessment(fixture);
    await markCompleted(seeded.assessment.id, fixture.contractId);

    await expect(
      prisma.anthropometryAssessment.update({
        where: { id: seeded.assessment.id },
        data: { notes: 'edição comum indevida' },
      })
    ).rejects.toThrow(/concluída é imutável/i);

    await expect(
      prisma.anthropometryAssessmentValue.update({
        where: { id: seeded.measurement.id },
        data: { value: '99' },
      })
    ).rejects.toThrow(/concluída é imutável/i);

    await expect(
      prisma.anthropometryObservation.delete({
        where: { id: seeded.observation.id },
      })
    ).rejects.toThrow(/concluída é imutável/i);

    await expect(
      prisma.anthropometryAssessment.findUniqueOrThrow({
        where: { id: seeded.assessment.id },
        include: { values: true, observations: true },
      })
    ).resolves.toMatchObject({
      notes: 'rascunho inicial',
      values: [expect.objectContaining({ value: '80' })],
      observations: [expect.objectContaining({ text: 'observação inicial' })],
    });
  });

  it('allows the audited correction marker only inside its transaction', async () => {
    const fixture = await seedTenant('b');
    const seeded = await seedAssessment(fixture);
    await markCompleted(seeded.assessment.id, fixture.contractId);

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "status"
        FROM "AnthropometryAssessmentLifecycle"
        WHERE "assessmentId" = ${seeded.assessment.id}
          AND "contractId" = ${fixture.contractId}
        FOR UPDATE
      `);
      await tx.$queryRaw(Prisma.sql`
        SELECT set_config('app.anthropometry_correction', 'true', true)
      `);
      await tx.anthropometryAssessment.update({
        where: { id: seeded.assessment.id },
        data: { notes: 'correção auditada' },
      });
      await tx.anthropometryAssessmentValue.update({
        where: { id: seeded.measurement.id },
        data: { value: '81' },
      });
      await tx.anthropometryObservation.update({
        where: { id: seeded.observation.id },
        data: { text: 'observação corrigida' },
      });
    });

    await expect(
      prisma.anthropometryAssessment.update({
        where: { id: seeded.assessment.id },
        data: { notes: 'bypass vazou' },
      })
    ).rejects.toThrow(/concluída é imutável/i);

    const persisted = await prisma.anthropometryAssessment.findUniqueOrThrow({
      where: { id: seeded.assessment.id },
      include: { values: true, observations: true },
    });
    expect(persisted.notes).toBe('correção auditada');
    expect(persisted.values[0]?.value).toBe('81');
    expect(persisted.observations[0]?.text).toBe('observação corrigida');
  });

  it('executes an authorized correction through the official service and records one auditable timeline event', async () => {
    const fixture = await seedTenant('f');
    const seeded = await seedAssessment(fixture);
    await markCompleted(seeded.assessment.id, fixture.contractId);

    const correction = {
      reason: 'Ajuste técnico conferido',
      notes: 'avaliação corrigida',
      values: [
        {
          segmentId: fixture.segment.id,
          value: '81',
          unit: 'cm',
          observation: 'valor conferido',
        },
      ],
      observations: [
        {
          segmentId: fixture.segment.id,
          text: 'observação corrigida',
          importable: true,
        },
      ],
    };

    await expect(
      correctCompletedAnthropometry(
        fixture.contractId,
        seeded.assessment.id,
        { userId: fixture.professorUser.id, professorId: fixture.professor.id },
        correction
      )
    ).resolves.toBeTruthy();

    const persisted = await prisma.anthropometryAssessment.findUniqueOrThrow({
      where: { id: seeded.assessment.id },
      include: { values: true, observations: true },
    });
    expect(persisted.notes).toBe('avaliação corrigida');
    expect(persisted.values).toEqual([
      expect.objectContaining({
        segmentId: fixture.segment.id,
        value: '81',
        unit: 'cm',
        observation: 'valor conferido',
      }),
    ]);
    expect(persisted.observations).toEqual([
      expect.objectContaining({
        segmentId: fixture.segment.id,
        text: 'observação corrigida',
        importable: true,
      }),
    ]);

    const audits = await listCorrectionAudits(seeded.assessment.id, fixture.contractId);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      assessmentId: seeded.assessment.id,
      contractId: fixture.contractId,
      alunoId: fixture.aluno.id,
      actorUserId: fixture.professorUser.id,
      actorProfessorId: fixture.professor.id,
      reason: 'Ajuste técnico conferido',
    });
    expect(audits[0]?.createdAt).toBeInstanceOf(Date);
    expect(audits[0]?.beforeSnapshot).toMatchObject({
      notes: 'rascunho inicial',
      values: [expect.objectContaining({ segmentId: fixture.segment.id, value: '80' })],
      observations: [
        expect.objectContaining({ segmentId: fixture.segment.id, text: 'observação inicial' }),
      ],
    });
    expect(audits[0]?.afterSnapshot).toMatchObject({
      notes: 'avaliação corrigida',
      values: [expect.objectContaining({ segmentId: fixture.segment.id, value: '81' })],
      observations: [
        expect.objectContaining({ segmentId: fixture.segment.id, text: 'observação corrigida' }),
      ],
    });

    const timelineEvents = await listCorrectionTimelineEvents(
      fixture.aluno.id,
      fixture.contractId,
      seeded.assessment.id
    );
    expect(timelineEvents).toHaveLength(1);
    expect(timelineEvents[0]?.metadata).toMatchObject({
      eventKey: `anthropometry:${seeded.assessment.id}:correction:${audits[0]?.id}`,
      domain: 'anthropometry',
      action: 'corrected',
      assessmentId: seeded.assessment.id,
      correctionId: audits[0]?.id,
    });

    await expect(
      correctCompletedAnthropometry(
        fixture.contractId,
        seeded.assessment.id,
        { userId: fixture.professorUser.id, professorId: fixture.professor.id },
        correction
      )
    ).rejects.toEqual(expect.objectContaining({ code: 'CORRECTION_WITHOUT_CHANGES' }));

    await expect(listCorrectionAudits(seeded.assessment.id, fixture.contractId)).resolves.toHaveLength(1);
    await expect(
      listCorrectionTimelineEvents(fixture.aluno.id, fixture.contractId, seeded.assessment.id)
    ).resolves.toHaveLength(1);
  });

  it('rejects correction without manage-assessments permission and leaves history untouched', async () => {
    const fixture = await seedTenant('g');
    const seeded = await seedAssessment(fixture);
    await markCompleted(seeded.assessment.id, fixture.contractId);

    await prisma.professor.update({
      where: { id: fixture.professor.id },
      data: { role: ProfessorRole.professor },
    });
    await prisma.accessPermission.createMany({
      data: [
        {
          collaboratorFunctionId: fixture.collaboratorFunction.id,
          screenKey: 'students.details',
          blockKey: '',
          canView: true,
        },
        {
          collaboratorFunctionId: fixture.collaboratorFunction.id,
          screenKey: 'students.details',
          blockKey: 'students.actions.manageAssessments',
          canView: false,
        },
      ],
      skipDuplicates: true,
    });

    await expect(
      correctCompletedAnthropometry(
        fixture.contractId,
        seeded.assessment.id,
        { userId: fixture.professorUser.id, professorId: fixture.professor.id },
        {
          reason: 'tentativa sem permissão',
          notes: 'não deve persistir',
          values: [{ segmentId: fixture.segment.id, value: '99', unit: 'cm' }],
        }
      )
    ).rejects.toBeInstanceOf(AnthropometryCorrectionAccessError);

    const persisted = await prisma.anthropometryAssessment.findUniqueOrThrow({
      where: { id: seeded.assessment.id },
      include: { values: true, observations: true },
    });
    expect(persisted.notes).toBe('rascunho inicial');
    expect(persisted.values).toEqual([
      expect.objectContaining({ segmentId: fixture.segment.id, value: '80' }),
    ]);
    expect(persisted.observations).toEqual([
      expect.objectContaining({ segmentId: fixture.segment.id, text: 'observação inicial' }),
    ]);

    await expect(listCorrectionAudits(seeded.assessment.id, fixture.contractId)).resolves.toHaveLength(0);
    await expect(
      listCorrectionTimelineEvents(fixture.aluno.id, fixture.contractId, seeded.assessment.id)
    ).resolves.toHaveLength(0);
  });

  it('serializes a draft value write before completion reads the required measurement', async () => {
    const fixture = await seedTenant('c');
    const seeded = await seedAssessment(fixture, null);

    let writerLocked!: () => void;
    let releaseWriter!: () => void;
    const writerHasLifecycleLock = new Promise<void>((resolve) => { writerLocked = resolve; });
    const writerMayCommit = new Promise<void>((resolve) => { releaseWriter = resolve; });

    const writer = writerPrisma.$transaction(async (tx) => {
      await tx.anthropometryAssessmentValue.update({
        where: { id: seeded.measurement.id },
        data: { value: '82' },
      });
      writerLocked();
      await writerMayCommit;
    });

    await writerHasLifecycleLock;

    let completionQueryStarted!: () => void;
    const completionStarted = new Promise<void>((resolve) => { completionQueryStarted = resolve; });
    const completion = completionPrisma.$transaction(async (tx) => {
      completionQueryStarted();
      const lifecycle = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`
        SELECT "status"
        FROM "AnthropometryAssessmentLifecycle"
        WHERE "assessmentId" = ${seeded.assessment.id}
          AND "contractId" = ${fixture.contractId}
        FOR UPDATE
      `);
      expect(lifecycle[0]?.status).toBe('DRAFT');
      const persistedValue = await tx.anthropometryAssessmentValue.findUniqueOrThrow({
        where: { id: seeded.measurement.id },
      });
      expect(persistedValue.value).toBe('82');
      await tx.$executeRaw(Prisma.sql`
        UPDATE "AnthropometryAssessmentLifecycle"
        SET "status" = 'COMPLETED', "completedAt" = CURRENT_TIMESTAMP
        WHERE "assessmentId" = ${seeded.assessment.id}
          AND "contractId" = ${fixture.contractId}
          AND "status" = 'DRAFT'
      `);
    });

    await completionStarted;
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseWriter();

    await expect(writer).resolves.toBeUndefined();
    await expect(completion).resolves.toBeUndefined();

    await expect(
      prisma.anthropometryAssessmentValue.update({
        where: { id: seeded.measurement.id },
        data: { value: '83' },
      })
    ).rejects.toThrow(/concluída é imutável/i);
  });

  it('keeps assessment mutations and segment references isolated by contractId', async () => {
    const tenantA = await seedTenant('d');
    const tenantB = await seedTenant('e');
    const seeded = await seedAssessment(tenantA);

    await expect(
      anthropometryService.saveValues(tenantA.contractId, seeded.assessment.id, [
        { segmentId: tenantB.segment.id, value: '91', unit: 'cm' },
      ])
    ).rejects.toEqual(expect.objectContaining({ code: 'INVALID_SEGMENT' }));

    await expect(
      anthropometryService.getAssessment(tenantB.contractId, seeded.assessment.id)
    ).resolves.toBeNull();

    await expect(
      prisma.anthropometryAssessmentValue.count({
        where: {
          assessmentId: seeded.assessment.id,
          segmentId: tenantB.segment.id,
        },
      })
    ).resolves.toBe(0);
  });
});
