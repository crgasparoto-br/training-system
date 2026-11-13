import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { assertApprovedWorkoutExerciseIds } from '../src/modules/workout/workout-planning.helpers';

const describeDatabase = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;
const prisma = new PrismaClient();

describeDatabase('#394 RISK-394-001: curator updates versus new application on PostgreSQL', () => {
  let contractId: string | null = null;

  beforeEach(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `issue394-lock-${randomUUID()}`,
        name: 'Curadoria - lock de elegibilidade',
      },
    });
    contractId = contract.id;
  });

  afterEach(async () => {
    if (contractId) await prisma.companyContract.deleteMany({ where: { id: contractId } });
    contractId = null;
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('serializes a new application with deactivation and then denies the inactive record', async () => {
    const exercise = await prisma.exerciseLibrary.create({
      data: {
        contractId: contractId!, name: 'Exercício protegido por lock',
        category: 'RESISTIDO', capacity: 'resisted', instructions: ['Preparar postura'],
        curationStatus: 'approved', legacyGrandfathered: false,
        reviewedByUserId: 'reviewer-394', reviewedAt: new Date(),
        lastCurationAction: 'approve',
      },
    });

    let release!: () => void;
    let signalReady!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { signalReady = resolve; });

    // Use a second pool: connection_limit=1 on the CI URL must not hide the
    // PostgreSQL row-lock behavior behind a Prisma pool acquisition timeout.
    const curator = new PrismaClient();
    await curator.$connect();
    const applying = prisma.$transaction(async tx => {
      await assertApprovedWorkoutExerciseIds(tx, [exercise.id], contractId!);
      signalReady();
      await held;
    }, { maxWait: 10_000, timeout: 20_000 });

    let reachedCuratorUpdate = false;
    try {
      await ready;
      await expect(curator.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '500ms'`;
        reachedCuratorUpdate = true;
        await tx.exerciseLibrary.update({
          where: { id: exercise.id }, data: { curationStatus: 'inactive' },
        });
      }, { maxWait: 10_000, timeout: 10_000 })).rejects.toThrow(/lock timeout/i);
      expect(reachedCuratorUpdate).toBe(true);
      expect((await curator.exerciseLibrary.findUniqueOrThrow({ where: { id: exercise.id } })).curationStatus)
        .toBe('approved');
    } finally {
      release();
      try {
        await applying;
      } finally {
        await curator.$disconnect();
      }
    }

    // If deactivation commits first, no new application receives authorization.
    await prisma.exerciseLibrary.update({
      where: { id: exercise.id }, data: { curationStatus: 'inactive' },
    });
    await expect(prisma.$transaction(tx =>
      assertApprovedWorkoutExerciseIds(tx, [exercise.id], contractId!),
    )).rejects.toThrow('Exercício indisponível para aplicação.');
  }, 30_000);
});
