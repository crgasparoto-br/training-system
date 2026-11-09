import { prismaRuntimeClient } from '../src/common/prisma-runtime-client';
import { libraryService } from '../src/modules/library/library.service';

jest.mock('../src/common/prisma-runtime-client', () => {
  const exerciseLibrary = {
    create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(), updateMany: jest.fn(), count: jest.fn(),
  };
  const exerciseLibraryRevision = { findMany: jest.fn() };
  const workoutExercise = { count: jest.fn() };
  return {
    prismaRuntimeClient: {
      exerciseLibrary, exerciseLibraryRevision, workoutExercise, $queryRaw: jest.fn(),
      $transaction: jest.fn(async (callback) => callback({ exerciseLibrary, exerciseLibraryRevision, workoutExercise })),
    },
  };
});

const db = prismaRuntimeClient as unknown as {
  exerciseLibrary: Record<string, jest.Mock>;
  exerciseLibraryRevision: Record<string, jest.Mock>;
  workoutExercise: Record<string, jest.Mock>;
  $queryRaw: jest.Mock;
};
const sample = {
  id: 'exercise-1', contractId: 'contract-1', name: 'Agachamento',
  version: 2, curationStatus: 'in_review', category: 'RESISTIDO',
  capacity: 'resistance', instructions: ['Ajustar postura'],
  videoUrl: null, mediaOrigin: null, mediaLicense: null,
};

describe('issue #394: persistence and tenant-aware curation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.workoutExercise.count.mockResolvedValue(0);
    db.$queryRaw.mockResolvedValue([]);
  });

  it('creates API exercises as unpublished drafts with an explicit author', async () => {
    db.exerciseLibrary.create.mockResolvedValue({ id: 'exercise-1' });
    await libraryService.createExercise('contract-1', { name: 'Agachamento' }, 'actor-1');
    expect(db.exerciseLibrary.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contractId: 'contract-1', curationStatus: 'draft', version: 1,
        legacyGrandfathered: false, createdByUserId: 'actor-1',
      }),
    });
  });

  it('defaults selection to approved within the contract', async () => {
    db.exerciseLibrary.findMany.mockResolvedValue([]);
    await libraryService.listExercises('contract-1', { search: 'Agachamento' });
    expect(db.exerciseLibrary.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ contractId: 'contract-1', curationStatus: 'approved' }),
    }));
  });

  it('searches aliases with tenant and approved-only filters', async () => {
    db.exerciseLibrary.findMany.mockResolvedValue([]);
    db.$queryRaw.mockResolvedValue([{ id: 'alias-match' }]);
    await libraryService.listExercises('contract-1', { search: 'RotAÇÃO' });
    const args = db.$queryRaw.mock.calls[0];
    expect(args[0].join('')).toContain('strpos(lower(a.value), lower(');
    expect(args).toContain('contract-1');
    expect(args).toContain('RotAÇÃO');
    expect(db.exerciseLibrary.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        contractId: 'contract-1', curationStatus: 'approved',
        OR: expect.arrayContaining([{ id: { in: ['alias-match'] } }]),
      }),
    }));
  });

  it('allows an explicitly requested administrative list across curation statuses in one tenant', async () => {
    db.exerciseLibrary.findMany.mockResolvedValue([]);
    await libraryService.listExercises('contract-1', { scope: 'all', curationStatus: 'draft' as never });
    expect(db.exerciseLibrary.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ contractId: 'contract-1', curationStatus: 'draft' }),
    }));
  });

  it('rejects foreign records without attempting any transition', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue(null);
    await expect(
      libraryService.reviewExercise('contract-1', 'cross-tenant-id', 2, 'approve', 'actor-1'),
    ).rejects.toMatchObject({ kind: 'not_found' });
    expect(db.exerciseLibrary.updateMany).not.toHaveBeenCalled();
  });

  it('rejects stale versions atomically', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue({ ...sample, version: 3 });
    await expect(
      libraryService.reviewExercise('contract-1', sample.id, 2, 'approve', 'actor-1'),
    ).rejects.toMatchObject({ kind: 'conflict' });
    expect(db.exerciseLibrary.updateMany).not.toHaveBeenCalled();
  });

  it('approves only a reviewed exercise and records the reviewer', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue(sample);
    db.exerciseLibrary.updateMany.mockResolvedValue({ count: 1 });
    db.exerciseLibrary.findFirstOrThrow.mockResolvedValue({ ...sample, curationStatus: 'approved', version: 3 });
    await libraryService.reviewExercise('contract-1', sample.id, 2, 'approve', 'actor-1');
    expect(db.exerciseLibrary.updateMany).toHaveBeenCalledWith({
      where: { id: sample.id, contractId: 'contract-1', version: 2 },
      data: expect.objectContaining({
        curationStatus: 'approved', reviewedByUserId: 'actor-1',
        lastCurationAction: 'approve', legacyGrandfathered: false,
        version: { increment: 1 },
      }),
    });
  });

  it('rejects a concurrency race that loses the compare-and-swap update', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue(sample);
    db.exerciseLibrary.updateMany.mockResolvedValue({ count: 0 });
    await expect(libraryService.reviewExercise('contract-1', sample.id, 2, 'approve', 'actor-1'))
      .rejects.toMatchObject({ kind: 'conflict' });
  });

  it('never mutates an exercise linked to historical sessions', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue({ ...sample, curationStatus: 'approved' });
    db.workoutExercise.count.mockResolvedValue(1);
    await expect(libraryService.updateExercise(
      'contract-1', sample.id, { name: 'Novo nome' }, 2, 'actor-1',
    )).rejects.toMatchObject({ kind: 'conflict' });
    expect(db.exerciseLibrary.updateMany).not.toHaveBeenCalled();
  });

  it('rechecks workout linkage in the atomic edit predicate', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue({ ...sample, curationStatus: 'draft' });
    db.workoutExercise.count.mockResolvedValue(0);
    db.exerciseLibrary.updateMany.mockResolvedValue({ count: 0 });
    await expect(libraryService.updateExercise(
      'contract-1', sample.id, { name: 'Nome revisado' }, 2, 'actor-1',
    )).rejects.toMatchObject({ kind: 'conflict' });
    expect(db.exerciseLibrary.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: sample.id, contractId: 'contract-1', version: 2,
        workoutExercises: { none: {} },
      },
    }));
  });

  it('does not physically delete an exercise when deactivating it', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue({ ...sample, curationStatus: 'approved' });
    db.exerciseLibrary.updateMany.mockResolvedValue({ count: 1 });
    db.exerciseLibrary.findFirstOrThrow.mockResolvedValue({ ...sample, curationStatus: 'inactive' });
    await libraryService.deleteExercise('contract-1', sample.id, 2, 'actor-1');
    expect(db.exerciseLibrary.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ curationStatus: 'inactive' }),
    }));
  });

  it('resolves revision history only after validating the exercise tenant', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue({ id: sample.id });
    db.exerciseLibraryRevision.findMany.mockResolvedValue([{ version: 1 }, { version: 2 }]);
    await libraryService.listExerciseRevisions('contract-1', sample.id);
    expect(db.exerciseLibraryRevision.findMany).toHaveBeenCalledWith({
      where: { contractId: 'contract-1', exerciseId: sample.id },
      orderBy: { version: 'desc' },
    });
  });
});
