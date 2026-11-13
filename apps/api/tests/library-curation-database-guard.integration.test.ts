import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const describeDatabase = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;
const prisma = new PrismaClient();

describeDatabase('#394 A-394-011: PostgreSQL approval guard is NULL-safe', () => {
  let contractId: string | null = null;

  beforeEach(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `issue394-guard-${randomUUID()}`,
        name: 'Curadoria - SQL approval guard',
      },
    });
    contractId = contract.id;
  });

  afterEach(async () => {
    if (contractId) await prisma.companyContract.deleteMany({ where: { id: contractId } });
    contractId = null;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const approvedData = (tenant: string, name: string) => ({
    contractId: tenant,
    name,
    category: 'RESISTIDO',
    capacity: 'resisted',
    instructions: ['Preparar a posicao'],
    curationStatus: 'approved' as const,
    legacyGrandfathered: false,
    reviewedByUserId: 'reviewer-394',
    reviewedAt: new Date('2026-11-10T12:00:00.000Z'),
    lastCurationAction: 'approve',
  });

  it.each(['capacity', 'lastCurationAction'] as const)(
    'rejects direct SQL removal of mandatory %s from a previously approved exercise',
    async (column) => {
      const approved = await prisma.exerciseLibrary.create({
        data: approvedData(contractId!, `Aprovado ${column}`),
      });
      const revisions = await prisma.exerciseLibraryRevision.count({
        where: { exerciseId: approved.id },
      });

      const update = column === 'capacity'
        ? prisma.$executeRaw`UPDATE "ExerciseLibrary" SET "capacity" = NULL WHERE "id" = ${approved.id}`
        : prisma.$executeRaw`UPDATE "ExerciseLibrary" SET "lastCurationAction" = NULL WHERE "id" = ${approved.id}`;

      await expect(update).rejects.toThrow();
      await expect(prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: approved.id } }))
        .resolves.toMatchObject({
          capacity: 'resisted', lastCurationAction: 'approve', curationStatus: 'approved',
        });
      expect(await prisma.exerciseLibraryRevision.count({
        where: { exerciseId: approved.id },
      })).toBe(revisions);
    },
  );

  it.each(['capacity', 'lastCurationAction'] as const)(
    'rejects Prisma insertion of a non-legacy approval with NULL %s',
    async (column) => {
      await expect(prisma.exerciseLibrary.create({
        data: { ...approvedData(contractId!, `Invalido ${column}`), [column]: null },
      })).rejects.toThrow();
      expect(await prisma.exerciseLibrary.count({ where: { contractId: contractId! } }))
        .toBe(0);
    },
  );

  it('allows a fully reviewed approval, a draft, and a grandfathered historical row', async () => {
    const approved = await prisma.exerciseLibrary.create({
      data: approvedData(contractId!, 'Valido e revisado'),
    });
    const draft = await prisma.exerciseLibrary.create({
      data: {
        contractId: contractId!, name: 'Rascunho nao revisado',
        capacity: null, lastCurationAction: null,
      },
    });
    const historical = await prisma.exerciseLibrary.create({
      data: {
        contractId: contractId!, name: 'Historico legado',
        curationStatus: 'approved', legacyGrandfathered: true,
        capacity: null, lastCurationAction: null,
      },
    });

    expect(approved).toMatchObject({
      curationStatus: 'approved', capacity: 'resisted', legacyGrandfathered: false,
    });
    expect(draft).toMatchObject({ curationStatus: 'draft', capacity: null });
    expect(historical).toMatchObject({
      curationStatus: 'approved', legacyGrandfathered: true, capacity: null,
    });
  });
});
