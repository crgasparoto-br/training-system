import { ContractType, PrismaClient, StudentLifecycleStatus, UserType } from '@prisma/client';

const prisma = new PrismaClient();
const describeDatabase = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;
const contractId = 'issue-384-health-revision-authors';
const alunoId = 'issue-384-health-student';
const emailA = 'issue-384-health-author-a@example.com';
const emailB = 'issue-384-health-author-b@example.com';

describeDatabase('issue #384: PostgreSQL clinical history actor provenance', () => {
  let firstActor = '';
  let completionActor = '';

  beforeAll(async () => {
    await prisma.companyContract.create({
      data: {
        id: contractId, type: ContractType.academy,
        document: '57365610000384', name: 'Contrato histórico clínico 384',
      },
    });
    const a = await prisma.user.create({
      data: {
        email: emailA, passwordHash: 'test-hash', type: UserType.professor,
        profile: { create: { name: 'Autor A' } },
      },
    });
    const b = await prisma.user.create({
      data: {
        email: emailB, passwordHash: 'test-hash', type: UserType.professor,
        profile: { create: { name: 'Autor B' } },
      },
    });
    firstActor = a.id;
    completionActor = b.id;
    await prisma.aluno.create({
      data: { id: alunoId, contractId, status: StudentLifecycleStatus.ACTIVE_STUDENT },
    });
  });

  afterAll(async () => {
    // Test fixture only: remove immutable revisions inside a restricted SQL
    // transaction with its triggers locally bypassed, never in production.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");
      await tx.studentHealthIntakeRevision.deleteMany({ where: { contractId } });
    });
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await prisma.$disconnect();
  });

  it('attributes the completion to B without rewriting the original response author A', async () => {
    const intake = await prisma.studentHealthIntake.create({
      data: {
        alunoId, contractId, sourceType: 'student',
        sourceReference: 'pre-registration-test',
        recordedByUserId: firstActor, status: 'IN_PROGRESS',
        formVersion: 'health-intake-v1',
        clinicalHistoryData: { mainGoal: 'Reabilitação' },
      },
    });
    const initial = await prisma.studentHealthIntakeRevision.findFirstOrThrow({
      where: { intakeId: intake.id, revision: 1 },
    });
    expect(initial.actorUserId).toBe(firstActor);
    expect((initial.snapshot as Record<string, unknown>).status).toBe('IN_PROGRESS');

    await prisma.studentHealthIntake.update({
      where: { id: intake.id },
      data: {
        status: 'COMPLETED', completedByUserId: completionActor,
        completedAt: new Date('2026-10-13T12:00:00Z'),
        version: { increment: 1 },
      },
    });
    const rows = await prisma.studentHealthIntakeRevision.findMany({
      where: { intakeId: intake.id }, orderBy: { revision: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].actorUserId).toBe(firstActor);
    expect(rows[1].actorUserId).toBe(completionActor);
    expect((rows[1].snapshot as Record<string, unknown>).status).toBe('COMPLETED');
    expect((rows[0].snapshot as Record<string, unknown>).status).toBe('IN_PROGRESS');

    // An actor-only update does not create a fictitious clinical revision.
    await prisma.studentHealthIntake.update({
      where: { id: intake.id }, data: { recordedByUserId: completionActor },
    });
    expect(await prisma.studentHealthIntakeRevision.count({ where: { intakeId: intake.id } })).toBe(2);
  });
});
