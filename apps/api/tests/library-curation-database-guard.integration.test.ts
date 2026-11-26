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

  it('#582 preserves the active publication, rejects unrelated duplicates and atomically switches versions', async () => {
    const root = await prisma.exerciseLibrary.create({ data: approvedData(contractId!, 'Mobilidade de Quadril - Iliopsoas') });
    const candidateData = {
      ...approvedData(contractId!, root.name), versionRootId: root.id,
      curationStatus: 'draft' as const, reviewedAt: null, reviewedByUserId: null,
      createdByUserId: 'reviewer-394', lastCurationAction: 'create_version',
    };
    const draft = await prisma.exerciseLibrary.create({ data: candidateData });
    expect(draft.contentVersion).toBe(root.contentVersion);
    expect(await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: root.id } })).toMatchObject({ curationStatus: 'approved' });
    await expect(prisma.exerciseLibrary.create({ data: candidateData })).rejects.toThrow();
    await expect(prisma.exerciseLibrary.create({ data: { contractId: contractId!, name: root.name } })).rejects.toThrow();
    await expect(prisma.exerciseLibrary.update({ where: { id: draft.id }, data: { name: 'Outra identidade' } })).rejects.toThrow();
    const edited = await prisma.exerciseLibrary.update({ where: { id: draft.id }, data: { notes: 'Revisão editorial' } });
    expect(edited.contentVersion).toBe(root.contentVersion + 1);
    const submitted = await prisma.exerciseLibrary.update({ where: { id: draft.id }, data: { curationStatus: 'in_review', lastCurationAction: 'submit' } });
    expect(submitted.contentVersion).toBe(edited.contentVersion);
    await expect(prisma.exerciseLibrary.update({ where: { id: draft.id }, data: {
      curationStatus: 'approved', lastCurationAction: 'approve', reviewedByUserId: 'reviewer-394', reviewedAt: new Date(),
    } })).rejects.toThrow();
    await prisma.$transaction(async tx => {
      await tx.exerciseLibrary.update({ where: { id: root.id }, data: {
        curationStatus: 'inactive', supersededAt: new Date(), lastCurationAction: 'supersede',
      } });
      await tx.exerciseLibrary.update({ where: { id: draft.id }, data: {
        curationStatus: 'approved', lastCurationAction: 'approve', reviewedByUserId: 'reviewer-394', reviewedAt: new Date(),
      } });
    });
    const previous = await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: root.id } });
    expect(previous).toMatchObject({ curationStatus: 'inactive', notes: root.notes, contentVersion: root.contentVersion });
    expect(previous.supersededAt).not.toBeNull();
    expect(await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: draft.id } }))
      .toMatchObject({ curationStatus: 'approved', contentVersion: edited.contentVersion, versionRootId: root.id });
    await expect(prisma.exerciseLibrary.update({ where: { id: root.id }, data: { notes: 'Não pode' } })).rejects.toThrow();
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

  it('#579 accepts own media without license but rejects unlicensed third-party media and SQL bypasses', async () => {
    const owned = await prisma.exerciseLibrary.create({
      data: {
        ...approvedData(contractId!, 'Vídeo próprio aprovado'),
        videoUrl: 'https://example.org/owned',
        mediaOrigin: 'Própria', mediaLicense: null,
      },
    });
    expect(owned).toMatchObject({ curationStatus: 'approved', mediaOrigin: 'Própria', mediaLicense: null });

    await expect(prisma.exerciseLibrary.create({
      data: {
        ...approvedData(contractId!, 'Terceiro sem autorização'),
        videoUrl: 'https://example.org/third-party',
        mediaOrigin: 'Licenciada', mediaLicense: null,
      },
    })).rejects.toThrow();

    await expect(prisma.$executeRaw`UPDATE "ExerciseLibrary"
      SET "mediaOrigin" = 'Licenciada' WHERE "id" = ${owned.id}`).rejects.toThrow();
    await expect(prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: owned.id } }))
      .resolves.toMatchObject({ mediaOrigin: 'Própria', mediaLicense: null });
  });

  it.each([' Própria', 'Própria ', ' Própria ', '\tPrópria', 'Própria\u00a0', 'Própria\u2003', 'própria'])(
    '#579 A-001 rejects noncanonical origin %j on insert and direct SQL update',
    async (mediaOrigin) => {
      const data = {
        ...approvedData(contractId!, 'Vídeo em revisão'),
        videoUrl: 'https://example.org/video',
        mediaOrigin: 'Própria', mediaLicense: null,
      };
      await expect(prisma.exerciseLibrary.create({
        data: { ...data, mediaOrigin },
      })).rejects.toThrow();
      const owned = await prisma.exerciseLibrary.create({ data });
      await expect(prisma.$executeRaw`UPDATE "ExerciseLibrary"
        SET "mediaOrigin" = ${mediaOrigin} WHERE "id" = ${owned.id}`).rejects.toThrow();
      await expect(prisma.$executeRaw`UPDATE "ExerciseLibrary"
        SET "mediaOrigin" = ${mediaOrigin}, "mediaLicense" = ${' \t\u00a0'}
        WHERE "id" = ${owned.id}`).rejects.toThrow();
      await expect(prisma.$executeRaw`UPDATE "ExerciseLibrary"
        SET "mediaOrigin" = ${mediaOrigin}, "mediaLicense" = 'Autorização'
        WHERE "id" = ${owned.id}`).resolves.toBe(1);
      await expect(prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: owned.id } }))
        .resolves.toMatchObject({ mediaOrigin, mediaLicense: 'Autorização' });
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
